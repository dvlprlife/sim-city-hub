// Run-history queries against agent_runs / agent_run_events.
import db from '../../db/database.js';
import { modelFamily } from './model.js';

export function getActiveRuns() {
  // 'queued' runs are accepted but waiting for a free concurrency slot — they're
  // active from the user's perspective, so surface them alongside 'running'.
  return db
    .prepare("SELECT * FROM agent_runs WHERE status IN ('running', 'queued') ORDER BY created_at DESC")
    .all();
}

// Delete finished runs (and their events + todos) from the history. NEVER touches
// an in-flight run ('running'/'queued'). agent_run_events and agent_todos have no
// FK cascade, so their rows are deleted explicitly; all deletes run in one
// transaction. Returns the number of runs removed.
const FINISHED = "status NOT IN ('running', 'queued')";
export function clearHistory() {
  db.exec('BEGIN');
  try {
    const finishedIds = `SELECT run_id FROM agent_runs WHERE ${FINISHED}`;
    db.prepare(`DELETE FROM agent_run_events WHERE run_id IN (${finishedIds})`).run();
    db.prepare(`DELETE FROM agent_todos WHERE run_id IN (${finishedIds})`).run();
    const res = db.prepare(`DELETE FROM agent_runs WHERE ${FINISHED}`).run();
    db.exec('COMMIT');
    return { deleted: Number(res.changes) };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Filterable run history. All params optional; no params → the default recent
// list (unchanged from before). `q` LIKE-matches prompt + summary (agent_runs
// has no `output` column). personId/cityId/status are equality filters.
export function getHistory({ q, personId, cityId, status, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (q) {
    where.push('(prompt LIKE ? OR summary LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like);
  }
  if (personId) (where.push('person_id = ?'), params.push(personId));
  if (cityId) (where.push('city_id = ?'), params.push(cityId));
  if (status) (where.push('status = ?'), params.push(status));

  const sql = `SELECT * FROM agent_runs ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  // Clamp like the tasks list route: a negative limit is truthy and SQLite reads
  // LIMIT -1 as "no limit", so ?limit=-1 would dump the whole table; cap it.
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  params.push(lim, off);
  return db.prepare(sql).all(...params);
}

// Approximate per-family rates in USD per 1M tokens [input, output]. Rough
// published-tier estimates for a soft cost signal — NOT billing-accurate; edit
// to taste. Keyed by family, so every pinned version (e.g. opus-4-7) and alias
// (opus) priced via modelFamily() share the family rate.
const RATES_PER_MTOK = { haiku: [1, 5], sonnet: [3, 15], opus: [5, 25] };

function approxCost(rows) {
  return rows.reduce((sum, r) => {
    const [ri, ro] = RATES_PER_MTOK[modelFamily(r.model)] || [0, 0];
    return sum + (r.input_tokens * ri + r.output_tokens * ro) / 1e6;
  }, 0);
}

// Aggregate token usage over agent_runs. All params optional; no params =
// all-time. `since` is a 'YYYY-MM-DD HH:MM:SS' lower bound on created_at.
export function getUsage({ cityId, personId, since } = {}) {
  const where = [];
  const params = [];
  if (cityId) (where.push('city_id = ?'), params.push(cityId));
  if (personId) (where.push('person_id = ?'), params.push(personId));
  if (since) (where.push('created_at >= ?'), params.push(since));
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const cols = 'COUNT(*) AS runs, COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens';
  const order = 'ORDER BY (COALESCE(SUM(input_tokens),0) + COALESCE(SUM(output_tokens),0)) DESC';
  const totals = db.prepare(`SELECT ${cols} FROM agent_runs ${w}`).get(...params);
  const byModel = db.prepare(`SELECT model, ${cols} FROM agent_runs ${w} GROUP BY model ${order}`).all(...params);
  const byPerson = db.prepare(`SELECT person_id, ${cols} FROM agent_runs ${w} GROUP BY person_id ${order}`).all(...params);

  return { totals: { ...totals, approxCostUsd: approxCost(byModel) }, byModel, byPerson };
}

// Gamified "city treasury" stats, DERIVED from real run history (not the cosmetic
// treasury table) so they're consistent and populated from day one. Gold is
// earned per COMPLETED run (a base reward + a small bonus per 1k output tokens);
// tools is the count of tool-use activity events. The leaderboard ranks citizens
// by gold. Theme-neutral: the frontend themes these numbers as gold/tools.
const GOLD_PER_RUN = 10;
const GOLD_PER_KTOK = 1; // per 1,000 output tokens

export function getTreasury() {
  // tool_use activity events are persisted as kind 'agent:activity' with
  // "type":"tool_use" inside the JSON payload (stderr activity isn't persisted).
  const tools = db
    .prepare(`SELECT COUNT(*) AS n FROM agent_run_events WHERE kind = 'agent:activity' AND payload LIKE '%"type":"tool_use"%'`)
    .get().n;

  const rows = db
    .prepare("SELECT person_id, COUNT(*) AS runs, COALESCE(SUM(output_tokens),0) AS output_tokens FROM agent_runs WHERE status = 'done' GROUP BY person_id")
    .all();
  const goldFor = (r) => r.runs * GOLD_PER_RUN + Math.floor(r.output_tokens / 1000) * GOLD_PER_KTOK;
  const leaderboard = rows
    .map((r) => ({ person_id: r.person_id, runs: r.runs, output_tokens: r.output_tokens, gold: goldFor(r) }))
    .sort((a, b) => b.gold - a.gold);

  return {
    gold: leaderboard.reduce((s, r) => s + r.gold, 0),
    tools,
    runs: leaderboard.reduce((s, r) => s + r.runs, 0),
    personCount: leaderboard.length,
    leaderboard,
  };
}

export function getRun(runId) {
  return db.prepare('SELECT * FROM agent_runs WHERE run_id = ?').get(runId);
}

export function getRunEvents(runId) {
  const rows = db
    .prepare('SELECT seq, kind, payload, ts FROM agent_run_events WHERE run_id = ? ORDER BY seq')
    .all(runId);
  return rows.map((r) => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : null }));
}
