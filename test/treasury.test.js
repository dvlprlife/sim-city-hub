// Tests for getTreasury() — the gamified gold/tools/leaderboard derived from run
// history. Aggregates globally, so we assert on a unique person + a relative tool
// delta to stay robust against any other rows in the test DB. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/db/database.js';
import { getTreasury } from '../src/services/agent/history.js';

test('getTreasury: gold per done run + token bonus, tools counted, non-done excluded', () => {
  const P = 'treasury-test';
  const insRun = db.prepare("INSERT INTO agent_runs (run_id, person_id, city_id, status, output_tokens) VALUES (?, ?, 'downtown', ?, ?)");
  const insEvt = db.prepare("INSERT INTO agent_run_events (run_id, seq, kind, payload) VALUES (?, ?, 'agent:activity', ?)");
  const before = getTreasury();
  try {
    insRun.run('treas-1', P, 'done', 2500);
    insRun.run('treas-2', P, 'done', 0);
    insRun.run('treas-3', P, 'error', 9999); // not 'done' → earns nothing
    insEvt.run('treas-1', 1, JSON.stringify({ activity: { type: 'tool_use', name: 'Edit' } }));
    insEvt.run('treas-1', 2, JSON.stringify({ activity: { type: 'tool_use', name: 'Read' } }));
    insEvt.run('treas-1', 3, JSON.stringify({ activity: { type: 'stderr', text: 'noise' } })); // not a tool

    const t = getTreasury();
    const me = t.leaderboard.find((r) => r.person_id === P);
    assert.ok(me, 'person appears on the leaderboard');
    assert.equal(me.runs, 2, 'only the 2 done runs count');
    assert.equal(me.output_tokens, 2500);
    assert.equal(me.gold, 2 * 10 + Math.floor(2500 / 1000), 'gold = runs*10 + floor(outputTokens/1000)');
    assert.equal(t.tools - before.tools, 2, 'two tool_use events counted; stderr ignored');

    // Leaderboard is sorted by gold descending.
    for (let i = 1; i < t.leaderboard.length; i += 1) {
      assert.ok(t.leaderboard[i - 1].gold >= t.leaderboard[i].gold, 'leaderboard sorted by gold desc');
    }
  } finally {
    db.prepare("DELETE FROM agent_run_events WHERE run_id IN ('treas-1','treas-2','treas-3')").run();
    db.prepare('DELETE FROM agent_runs WHERE person_id = ?').run(P);
  }
});
