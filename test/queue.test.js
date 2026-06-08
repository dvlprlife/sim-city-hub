// Smoke tests for the concurrency limiter wired into the spawn path. Run with
// `npm test` (node:test, built in — no test-framework dependency).
//
// HUB_MAX_CONCURRENT is read at module load, so set it BEFORE importing queue.js
// (dynamic import below) to make the cap deterministic regardless of the host env.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.HUB_MAX_CONCURRENT = '2';
const { runQueued, queueStats } = await import('../src/services/queue.js');

// Flush pending microtasks + the timer queue so the limiter's pump() can run.
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('queueStats reports the configured max', () => {
  assert.equal(queueStats().max, 2);
});

test('runQueued never runs more than HUB_MAX_CONCURRENT tasks at once', async () => {
  let active = 0;
  let peak = 0;
  const gates = []; // each entry releases one in-flight task

  const makeTask = () => () =>
    new Promise((resolve) => {
      active += 1;
      peak = Math.max(peak, active);
      gates.push(() => {
        active -= 1;
        resolve();
      });
    });

  const N = 6;
  const all = Promise.all(Array.from({ length: N }, makeTask).map(runQueued));

  await tick();
  // Two running, four waiting for a slot.
  assert.equal(queueStats().active, 2, 'two tasks should be in flight');
  assert.equal(queueStats().waiting, 4, 'the rest should be queued');

  // Release tasks one at a time; each completion frees a slot for the next.
  while (gates.length) {
    gates.shift()();
    await tick();
  }

  await all;
  assert.equal(peak, 2, 'concurrency never exceeded the cap');
  assert.equal(queueStats().active, 0, 'queue fully drained');
  assert.equal(queueStats().waiting, 0);
});

test('a rejected task frees its slot and does not wedge the queue', async () => {
  await assert.rejects(
    runQueued(() => Promise.reject(new Error('boom'))),
    /boom/,
  );
  // The queue still accepts and runs work after a failure.
  const result = await runQueued(() => Promise.resolve('ok'));
  assert.equal(result, 'ok');
  // The slot is released a microtask after the task settles — flush before asserting.
  await tick();
  assert.equal(queueStats().active, 0);
});
