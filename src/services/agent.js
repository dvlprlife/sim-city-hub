// The agent-spawn pipeline — the only "clever" part. Public surface:
// spawnAgent, cancelAgent, retryRun. See CLAUDE.md for the load-bearing spawn rules.
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFileSync, unlink, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import db from '../db/database.js';
import { broadcast } from '../broadcast.js';
import { getConfig, getPerson, getCity, getBuilding } from './projects.js';
import { MODEL_IDS, resolveModelKey, pickAutoModel, resolveEffort } from './agent/model.js';
import { buildSystemPrompt } from './agent/prompts.js';
import { buildMcpConfig } from './agent/mcp.js';
import { buildSpawnCommand, buildSpawnEnv } from './agent/runtime.js';
import { createStreamParser } from './agent/stream.js';
import { summarizeForHandoff, summarizeWithHaiku, shouldUseHaikuSummary } from './agent/handoff.js';
import { runQueued } from './queue.js';

// runId -> { child, tmpFiles, seq, cancelled, queued, release, forkSpec }
// A run is registered here the moment it is accepted (status 'queued'), before
// the CLI child is forked — so cancellation works even while a run waits for a
// free concurrency slot. `release` frees that slot when the run finalizes.
const running = new Map();

function persistEvent(runId, kind, payload) {
  const state = running.get(runId);
  const seq = state ? state.seq++ : 0;
  db.prepare('INSERT INTO agent_run_events (run_id, seq, kind, payload) VALUES (?, ?, ?, ?)').run(
    runId,
    seq,
    kind,
    payload ? JSON.stringify(payload) : null,
  );
}

function safeCwd(cwd) {
  return cwd && existsSync(cwd) ? cwd : process.cwd();
}

export function spawnAgent(opts) {
  const {
    runId = randomUUID(),
    personId,
    cityId,
    buildingId,
    prompt = '',
    model: requestedModel,
    effort: requestedEffort,
    sessionId,
    parentRunId,
  } = opts;

  const person = getPerson(personId);
  if (!person) throw new Error(`Unknown person: ${personId}`);

  const city = cityId ? getCity(cityId) : null;
  const building = buildingId ? getBuilding(cityId, buildingId) : null;
  const { rootPath, port } = getConfig();
  const cwd = building?.absolutePath || rootPath || process.cwd();

  // Reject non-existent workspaces up front. Without this, a placeholder
  // building (e.g. REPLACE_WITH/... in cities.json) would slip past safeCwd,
  // which silently falls back to process.cwd() (the hub root) — running the
  // agent in the wrong directory with no warning. Throwing here (before the
  // 'queued' INSERT below) leaves no orphan row; routes/agents.js turns it
  // into a 400 and the UI shows '⚠ spawn failed: <message>'.
  if (!existsSync(cwd)) {
    throw new Error(`Workspace path does not exist: ${cwd}. Set the building's absolutePath in cities.json.`);
  }

  // 1. resolve model (person default -> request override -> auto heuristic)
  let modelKey = resolveModelKey(requestedModel || person.defaultModel);
  if (modelKey === 'auto') modelKey = pickAutoModel(prompt);
  const modelIdStr = MODEL_IDS[modelKey];
  // Effort (person default -> request override). Resolved against the chosen model:
  // null when 'auto' or unsupported for that model, so --effort is only passed when
  // it's a valid combo (an unsupported level would error at spawn).
  const effort = resolveEffort(modelKey, requestedEffort || person.effort);

  // Reject a runId that's already in flight before writing anything keyed on it
  // (the temp-file names and the run row are both derived from runId). Without
  // this, a resubmitted in-flight runId would clobber the live run's temp files
  // and its failure-cleanup below would delete the live run's row.
  if (running.has(runId)) throw new Error(`Run already in progress: ${runId}`);

  // 2–5. Build the temp files, persist the queued row, and build the spawn
  //    command. Everything sits inside one cleanup scope: if any step throws
  //    (a bad mcps shape in a hand-edited manifest, a full temp disk, or most
  //    plausibly a duplicate client-supplied runId colliding on the PK) the
  //    run is never registered, so finalize() can't reach it to clean up —
  //    unlink whatever temp files were created and undo a half-inserted row
  //    here before rethrowing. tmpFiles gains each path as it's written so
  //    the catch only ever removes files this call produced.
  const tmpFiles = [];
  let command;
  let args;
  let shell;
  let inserted = false;
  try {
    // 2. build system prompt -> temp file (file path avoids Windows cmdline limits)
    const systemPrompt = buildSystemPrompt({ personId, city, building, cwd, port });
    const systemPromptFile = path.join(os.tmpdir(), `hub-sys-${runId}.md`);
    tmpFiles.push(systemPromptFile);
    writeFileSync(systemPromptFile, systemPrompt, 'utf8');

    // 3. build merged MCP config -> temp file (or null when there are no MCPs)
    const mcpConfigFile = buildMcpConfig({ runId, person, city });
    if (mcpConfigFile) tmpFiles.push(mcpConfigFile);

    // 4. persist the queued row. It flips to 'running' the instant the CLI
    // child forks (see startChild). The concurrency limiter may hold it here
    // when HUB_MAX_CONCURRENT children are already busy.
    db.prepare(
      `INSERT INTO agent_runs (run_id, person_id, city_id, building_id, cwd, prompt, model, status, session_id, parent_run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    ).run(
      runId,
      personId,
      cityId ?? null,
      buildingId ?? null,
      cwd,
      prompt,
      modelKey,
      sessionId ?? null,
      parentRunId ?? null,
    );
    inserted = true;

    // 5. build the spawn command. File-path flags dodge Windows cmdline limits.
    ({ command, args, shell } = buildSpawnCommand({
      modelId: modelIdStr,
      effort,
      systemPromptFile,
      mcpConfigFile,
      sessionId,
    }));
  } catch (err) {
    // The temp-file names are derived from runId and (per the in-flight guard
    // above) belong to this call, so they're safe to remove. Sync removal so
    // the caller's error response never races a pending unlink (this path is
    // cold). Only delete the run row if WE inserted it — a thrown INSERT means
    // the row is someone else's (an existing/finished run that collided on the
    // PK), so leave it.
    for (const f of tmpFiles) {
      try { rmSync(f, { force: true }); } catch { /* best effort */ }
    }
    if (inserted) db.prepare('DELETE FROM agent_runs WHERE run_id = ?').run(runId);
    throw err;
  }

  // Register the run BEFORE queuing so cancelAgent can reach it while it waits.
  // forkSpec carries everything startChild needs to launch the child later.
  const state = {
    child: null,
    tmpFiles,
    seq: 0,
    cancelled: false,
    queued: true,
    release: null,
    forkSpec: { command, args, shell, cwd, modelIdStr, prompt },
  };
  running.set(runId, state);

  // 6. hand the fork to the concurrency limiter. startChild resolves the queued
  //    promise on finalize, freeing the slot for the next waiting run. The
  //    fire-and-forget catch is a backstop — startChild itself never rejects.
  runQueued(() => startChild(runId)).catch(() => {});

  return { runId, model: modelKey };
}

// Fork the CLI child for an already-registered, queued run. Returns a promise
// that resolves when the run finalizes (success, error, or cancellation) so the
// concurrency limiter can release the slot. Never rejects.
function startChild(runId) {
  return new Promise((resolve) => {
    const state = running.get(runId);
    // Cancelled (or already finalized) while waiting in the queue — never spawn.
    if (!state || state.cancelled) {
      if (state) finalize(runId, { status: 'cancelled', exitCode: null });
      resolve();
      return;
    }

    state.queued = false;
    state.release = resolve;

    try {
      const { command, args, shell, cwd, modelIdStr, prompt } = state.forkSpec;
      db.prepare("UPDATE agent_runs SET status = 'running' WHERE run_id = ?").run(runId);

      const child = spawn(command, args, {
        cwd: safeCwd(cwd),
        env: buildSpawnEnv(),
        shell,
        windowsHide: true,
      });
      state.child = child;

      // announce the planned model immediately (stream may confirm a different one)
      broadcast({ type: 'agent:model', runId, model: modelIdStr, source: 'planned' });
      persistEvent(runId, 'agent:model', { model: modelIdStr, source: 'planned' });

      const parser = createStreamParser({
        onEvent: (event) => {
          if (event.type === 'agent:session') {
            db.prepare('UPDATE agent_runs SET session_id = ? WHERE run_id = ?').run(event.sessionId, runId);
          } else if (event.type === 'usage' && event.usage) {
            db.prepare('UPDATE agent_runs SET input_tokens = ?, output_tokens = ? WHERE run_id = ?').run(
              event.usage.input_tokens ?? 0,
              event.usage.output_tokens ?? 0,
              runId,
            );
          }

          broadcast({ ...event, runId });

          // Persist finals only — partial deltas and bookkeeping events are skipped
          // so replayed history isn't fragmented.
          if (!event.partial && event.type !== 'usage' && event.type !== 'result') {
            const { type, ...payload } = event;
            persistEvent(runId, type, payload);
          }
        },
      });

      child.stdout.on('data', (d) => parser.feed(d.toString('utf8')));
      child.stderr.on('data', (d) => {
        broadcast({ type: 'agent:activity', runId, activity: { type: 'stderr', text: d.toString('utf8') } });
      });

      // Pipe the user prompt via stdin, then close it. A child that dies early
      // (rejects a flag, crashes on startup) makes the write emit an async
      // 'error' (EPIPE / ERR_STREAM_WRITE_AFTER_END) on the stdin stream — with
      // no listener that becomes an uncaughtException and takes the whole hub
      // down. Swallow it; the dead child is handled by the close/error handlers.
      child.stdin.on('error', () => {});
      try {
        if (prompt) child.stdin.write(prompt);
        child.stdin.end();
      } catch {
        /* stdin may already be closed if spawn failed */
      }

      child.on('error', (err) => {
        finalize(runId, { status: 'error', error: err.message, exitCode: null });
      });

      child.on('close', (code) => {
        parser.end();
        const status = code === 0 ? 'done' : state.cancelled ? 'cancelled' : 'error';
        finalize(runId, { status, exitCode: code });
      });
    } catch (err) {
      // Synchronous spawn failure (e.g. bad arguments) — finalize so the row
      // doesn't hang in 'running' and the slot is released via finalize.
      finalize(runId, { status: 'error', error: err.message, exitCode: null });
    }
  });
}

function finalize(runId, { status, exitCode = null, error = null }) {
  const state = running.get(runId);
  if (!state) return; // already finalized (e.g. error then close)

  // Optional one-line handoff blurb from the last output chunk. Write the cheap
  // extractive summary now (instant, always works); a haiku upgrade may replace
  // it below.
  let lastText = '';
  try {
    const last = db
      .prepare("SELECT payload FROM agent_run_events WHERE run_id = ? AND kind = 'agent:output' ORDER BY seq DESC LIMIT 1")
      .get(runId);
    if (last?.payload) lastText = JSON.parse(last.payload).text || '';
  } catch {
    /* summary is best-effort */
  }
  const summary = summarizeForHandoff(lastText) || null;

  db.prepare(
    "UPDATE agent_runs SET status = ?, exit_code = ?, error = ?, summary = ?, ended_at = datetime('now') WHERE run_id = ?",
  ).run(status, exitCode, error, summary, runId);

  persistEvent(runId, 'agent:done', { status, exitCode, error });
  broadcast({ type: 'agent:done', runId, status, exitCode, error });

  for (const f of state.tmpFiles) unlink(f, () => {});
  running.delete(runId);

  // Release the concurrency slot so the next queued run can start. No-op for a
  // run cancelled before it ever forked (release was never assigned).
  state.release?.();

  // Best-effort: upgrade the blurb to a haiku-generated summary for substantial
  // outputs. Routed through the limiter so a burst of completions can't spawn
  // unbounded summary children; failures keep the extractive summary.
  if (status === 'done' && shouldUseHaikuSummary(lastText)) {
    runQueued(() => summarizeWithHaiku(lastText))
      .then((better) => {
        if (better) db.prepare('UPDATE agent_runs SET summary = ? WHERE run_id = ?').run(better, runId);
      })
      .catch(() => {});
  }
}

// Kill the CLI child. The preferred launchers (native exe / node cli.js) run
// shell:false and die cleanly on SIGTERM. The npx fallback runs shell:true,
// which on Windows is cmd.exe -> npx -> node: SIGTERM hits only cmd.exe and
// orphans the real worker (it keeps burning a session and holding the cwd), so
// tree-kill the whole process group with taskkill /T.
function killChild(child, usedShell) {
  if (usedShell && process.platform === 'win32' && child.pid) {
    try {
      const tk = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      // taskkill missing/blocked emits an async 'error' — without a listener that
      // would crash the hub; fall back to SIGTERM instead.
      tk.on('error', () => {
        try {
          child.kill('SIGTERM');
        } catch {
          /* already exited */
        }
      });
      return;
    } catch {
      /* fall through to SIGTERM below */
    }
  }
  try {
    child.kill('SIGTERM');
  } catch {
    /* already exited */
  }
}

export function cancelAgent(runId) {
  const state = running.get(runId);
  if (!state) return { cancelled: false, reason: 'not running' };
  state.cancelled = true;
  if (state.child) {
    killChild(state.child, state.forkSpec?.shell);
  } else {
    // Still waiting in the queue — no child to signal. Finalize now; the queued
    // thunk sees the missing state when its slot frees and skips the spawn.
    finalize(runId, { status: 'cancelled', exitCode: null });
  }
  return { cancelled: true };
}

export function retryRun(runId) {
  const run = db.prepare('SELECT * FROM agent_runs WHERE run_id = ?').get(runId);
  if (!run) throw new Error(`Unknown run: ${runId}`);
  return spawnAgent({
    personId: run.person_id,
    cityId: run.city_id,
    buildingId: run.building_id,
    prompt: run.prompt,
    model: run.model,
    parentRunId: runId,
  });
}

export function activeRunIds() {
  return [...running.keys()];
}
