// Tests for the conversation -> markdown transcript serializer (the pure core
// of the chat Export feature). Run with `npm test` (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationToMarkdown } from '../client/src/lib/transcript.js';

test('serializes user + assistant turns with the person name', () => {
  const md = conversationToMarkdown(
    [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello there' }],
    { personName: 'Al the Developer' },
  );
  assert.equal(md, '## You\n\nhi\n\n## Al the Developer\n\nhello there');
});

test('excludes note/activity lines by default, includes them when asked', () => {
  const msgs = [
    { role: 'user', text: 'go' },
    { role: 'note', text: '🔧 Reading…' },
    { role: 'assistant', text: 'done' },
  ];
  assert.ok(!conversationToMarkdown(msgs, { personName: 'Bot' }).includes('Reading'));
  assert.ok(conversationToMarkdown(msgs, { personName: 'Bot', includeActivity: true }).includes('_🔧 Reading…_'));
});

test('preserves assistant markdown (mermaid fences) verbatim', () => {
  const fence = '```mermaid\ngraph TD; A-->B\n```';
  assert.ok(conversationToMarkdown([{ role: 'assistant', text: fence }], { personName: 'Bot' }).includes(fence));
});

test('skips empty messages and handles empty/nullish input', () => {
  assert.equal(conversationToMarkdown([]), '');
  assert.equal(conversationToMarkdown(null), '');
  assert.equal(
    conversationToMarkdown([{ role: 'user', text: '' }, { role: 'assistant', text: 'x' }], { personName: 'B' }),
    '## B\n\nx',
  );
});

test('defaults personName to Assistant', () => {
  assert.equal(conversationToMarkdown([{ role: 'assistant', text: 'hey' }]), '## Assistant\n\nhey');
});
