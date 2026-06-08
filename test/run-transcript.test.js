// Tests for the pure run-event -> transcript-item mapper (the core of the
// "open a run's transcript" feature). Run with `npm test` (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsToItems } from '../client/src/lib/runTranscript.js';

const events = [
  { seq: 0, kind: 'agent:model', payload: { model: 'claude-sonnet-4-6' } },
  { seq: 1, kind: 'agent:session', payload: { sessionId: 'abc' } },
  { seq: 2, kind: 'agent:thinking', payload: { text: 'pondering' } },
  { seq: 3, kind: 'agent:activity', payload: { activity: { type: 'tool_use', name: 'Read' } } },
  { seq: 4, kind: 'agent:activity', payload: { activity: { type: 'stderr', text: 'noise' } } },
  { seq: 5, kind: 'agent:output', payload: { text: '**hello**' } },
  { seq: 6, kind: 'agent:done', payload: { status: 'done', exitCode: 0 } },
];

test('eventsToItems maps prompt + output + activity + thinking, skips bookkeeping', () => {
  const items = eventsToItems(events, { prompt: 'do a thing' });
  assert.deepEqual(items.map((i) => i.kind), ['user', 'thinking', 'note', 'assistant']);
  assert.equal(items[0].text, 'do a thing');
  assert.equal(items[1].text, 'pondering');
  assert.equal(items[2].text, '🔧 Reading…'); // Read -> human label
  assert.equal(items[3].text, '**hello**');   // assistant markdown preserved verbatim
});

test('eventsToItems surfaces an error run as a note, and handles no prompt / empty events', () => {
  const errItems = eventsToItems(
    [{ seq: 0, kind: 'agent:done', payload: { status: 'error', error: 'boom' } }],
    { prompt: 'x' },
  );
  assert.deepEqual(errItems.map((i) => i.kind), ['user', 'note']);
  assert.match(errItems[1].text, /ended with an error: boom/);

  assert.deepEqual(eventsToItems([], null), []);
  assert.deepEqual(eventsToItems(), []);
  // unknown tool name falls back to the raw name
  const t = eventsToItems([{ seq: 1, kind: 'agent:activity', payload: { activity: { type: 'tool_use', name: 'Weird' } } }]);
  assert.equal(t[0].text, '🔧 Weird…');
});
