// Handoff summarizer.
//
// The handoff PROTOCOL ([HANDOFF:id] tokens) is parsed in the frontend — the
// receiving Person gets a fully self-contained prompt and ZERO conversation
// history. This module produces the optional one-line "handoff blurb" shown on
// a completed run.
//
// Two tiers:
//  - summarizeForHandoff  — cheap extractive one-liner (no model call). Instant,
//    always works; used as the immediate value and the fallback.
//  - summarizeWithHaiku   — a one-shot `claude --print --model <haiku>` call that
//    produces a better summary. Async, best-effort, never throws.
// The caller writes the extractive summary first, then upgrades to the haiku one
// when (and if) it returns. See agent.js → finalize.
import { spawn } from 'node:child_process';
import { buildSummaryCommand, buildSpawnEnv } from './runtime.js';
import { MODEL_IDS } from './model.js';

// Matches a [HANDOFF:id] token at the start of a line (per the protocol: "on its
// own line") and captures the REST of the message as the prompt — [\s\S]* (not
// `.`) so a multi-line handoff prompt isn't truncated at the first newline. Like
// the frontend parser (HandoffMenu.jsx) it now keeps the full multi-line prompt;
// the backend additionally anchors the token to a line start (`^`/`m`), which the
// frontend doesn't — a deliberately stricter reading of the "own line" rule.
const HANDOFF_RE = /^\[HANDOFF:([a-z0-9-]+)\]\s*([\s\S]*)/im;

// Outputs shorter than this are already one-liner-sized — the extractive summary
// is as good as a model call, so don't spend a haiku run on them.
const HAIKU_MIN_CHARS = 200;
const SUMMARY_MAX_CHARS = 240;
const SUMMARY_TIMEOUT_MS = 20_000;
// A one-line summary is tiny; cap buffered stdout so a misbehaving model that
// streams a flood can't grow memory unbounded before close/timeout fires.
const SUMMARY_STDOUT_CAP = 16_384;
const SUMMARY_INSTRUCTION =
  'Summarize the agent message below in ONE plain-text sentence (about 30 words ' +
  'or fewer) for a handoff blurb. No preamble, no quotes, no markdown — just the ' +
  'sentence.\n\n---\n\n';

export function parseHandoff(text = '') {
  const m = String(text).match(HANDOFF_RE);
  if (!m) return null;
  return { targetPersonId: m[1], prompt: m[2].trim() };
}

export function summarizeForHandoff(text = '') {
  const clean = String(text).replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  const summary = firstSentence.length > SUMMARY_MAX_CHARS ? `${firstSentence.slice(0, SUMMARY_MAX_CHARS)}…` : firstSentence;
  return summary;
}

// True when it's worth spending a haiku call: the feature isn't disabled and the
// text is long enough that condensing beats taking the first sentence.
export function shouldUseHaikuSummary(text = '') {
  return process.env.HUB_HAIKU_SUMMARY !== '0' && String(text).trim().length >= HAIKU_MIN_CHARS;
}

// Spawn a one-shot haiku CLI call to summarize `text`. Resolves to the one-line
// summary, or `null` on any failure/timeout (the caller keeps the extractive
// fallback). Never rejects.
export function summarizeWithHaiku(text = '') {
  return new Promise((resolve) => {
    const clean = String(text).trim();
    if (!clean) return resolve(null);

    let command;
    let args;
    let shell;
    try {
      ({ command, args, shell } = buildSummaryCommand({ modelId: MODEL_IDS.haiku }));
    } catch {
      return resolve(null);
    }

    let child;
    try {
      child = spawn(command, args, { env: buildSpawnEnv(), shell, windowsHide: true });
    } catch {
      return resolve(null);
    }

    let out = '';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        /* already exited */
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), SUMMARY_TIMEOUT_MS);

    child.stdout?.on('data', (d) => {
      if (out.length < SUMMARY_STDOUT_CAP) out += d.toString('utf8');
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => {
      if (code !== 0) return finish(null);
      const line = out.replace(/\s+/g, ' ').trim();
      if (!line) return finish(null);
      finish(line.length > SUMMARY_MAX_CHARS ? `${line.slice(0, SUMMARY_MAX_CHARS)}…` : line);
    });

    // An async stdin 'error' (EPIPE) from a child that exited early would crash
    // the hub if unhandled — swallow it; finish() already handles the dead child.
    child.stdin.on('error', () => {});
    try {
      child.stdin.write(SUMMARY_INSTRUCTION + clean);
      child.stdin.end();
    } catch {
      /* stdin may already be closed if spawn failed */
    }
  });
}
