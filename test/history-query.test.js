// Tests for getHistory() pagination clamping. A negative ?limit is truthy and
// SQLite reads LIMIT -1 as "no limit", so without clamping it would dump the
// whole agent_runs table. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/db/database.js';
import { getHistory } from '../src/services/agent/history.js';

test('getHistory clamps a negative limit (no unbounded dump)', () => {
  const ins = db.prepare("INSERT INTO agent_runs (run_id, person_id, city_id, status) VALUES (?, 'clamp-test', 'downtown', 'done')");
  const ids = ['clamp-1', 'clamp-2', 'clamp-3'];
  ids.forEach((id) => ins.run(id));
  try {
    // limit=-1 would return all 3 matching rows without the clamp; clamped to 1.
    const rows = getHistory({ personId: 'clamp-test', limit: -1 });
    assert.equal(rows.length, 1, 'negative limit must be clamped, not treated as "no limit"');
  } finally {
    db.prepare("DELETE FROM agent_runs WHERE person_id = 'clamp-test'").run();
  }
});

test('getHistory default limit returns up to 50', () => {
  // Sanity: a normal call still uses the default cap.
  const rows = getHistory({});
  assert.ok(rows.length <= 50, 'default limit caps at 50');
});
