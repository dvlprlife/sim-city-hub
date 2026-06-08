// Tests for clearHistory() — deletes finished runs + their events, never an
// in-flight run. Uses the (isolated) DB; inserts uniquely-prefixed rows and
// cleans up any it deliberately leaves behind. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/db/database.js';
import { clearHistory } from '../src/services/agent/history.js';

test('clearHistory removes finished runs + their events, keeps running/queued', () => {
  const ins = db.prepare("INSERT INTO agent_runs (run_id, person_id, city_id, status) VALUES (?, 'clerk', 'downtown', ?)");
  ins.run('t-done', 'done');
  ins.run('t-err', 'error');
  ins.run('t-run', 'running');
  ins.run('t-queued', 'queued');
  db.prepare("INSERT INTO agent_run_events (run_id, seq, kind, payload) VALUES ('t-done', 0, 'agent:output', '{}')").run();

  try {
    const { deleted } = clearHistory();
    assert.ok(deleted >= 2, `expected >= 2 deleted, got ${deleted}`);

    const count = (rid) => db.prepare('SELECT COUNT(*) AS c FROM agent_runs WHERE run_id = ?').get(rid).c;
    assert.equal(count('t-done'), 0, 'done run deleted');
    assert.equal(count('t-err'), 0, 'error run deleted');
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM agent_run_events WHERE run_id = 't-done'").get().c, 0, 'events deleted');
    assert.equal(count('t-run'), 1, 'running run kept');
    assert.equal(count('t-queued'), 1, 'queued run kept');
  } finally {
    db.prepare("DELETE FROM agent_runs WHERE run_id IN ('t-done','t-err','t-run','t-queued')").run();
    db.prepare("DELETE FROM agent_run_events WHERE run_id = 't-done'").run();
  }
});
