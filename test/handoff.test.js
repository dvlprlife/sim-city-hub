// Smoke tests for the handoff summary logic. Run with `npm test` (node:test).
// The pure parts are covered here; the live haiku CLI call (summarizeWithHaiku)
// needs the real `claude` binary and is verified manually.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeForHandoff,
  shouldUseHaikuSummary,
  parseHandoff,
} from '../src/services/agent/handoff.js';
import { buildSummaryCommand } from '../src/services/agent/runtime.js';
import { MODEL_IDS } from '../src/services/agent/model.js';

test('summarizeForHandoff returns the first sentence', () => {
  assert.equal(
    summarizeForHandoff('Done refactoring the parser. Tests pass. Ready for review.'),
    'Done refactoring the parser.',
  );
});

test('summarizeForHandoff strips code fences and collapses whitespace', () => {
  const text = 'Here is the fix.\n\n```js\nconst x = 1;\n```\n\nIt works now.';
  assert.equal(summarizeForHandoff(text), 'Here is the fix.');
});

test('summarizeForHandoff caps long output with an ellipsis', () => {
  const long = `${'x'.repeat(300)}`; // one long "sentence", no terminal punctuation
  const out = summarizeForHandoff(long);
  assert.equal(out.length, 241); // 240 chars + ellipsis
  assert.ok(out.endsWith('…'));
});

test('summarizeForHandoff returns empty string for blank input', () => {
  assert.equal(summarizeForHandoff(''), '');
  assert.equal(summarizeForHandoff('   \n  '), '');
});

test('shouldUseHaikuSummary gates on length and the env opt-out', () => {
  const saved = process.env.HUB_HAIKU_SUMMARY;
  try {
    const short = 'too short for a model call';
    const long = 'a'.repeat(250);

    delete process.env.HUB_HAIKU_SUMMARY; // default: enabled
    assert.equal(shouldUseHaikuSummary(short), false, 'short text should fall back');
    assert.equal(shouldUseHaikuSummary(long), true, 'long text should use haiku');

    process.env.HUB_HAIKU_SUMMARY = '0'; // explicit opt-out
    assert.equal(shouldUseHaikuSummary(long), false, 'opt-out disables haiku');

    process.env.HUB_HAIKU_SUMMARY = '1';
    assert.equal(shouldUseHaikuSummary(long), true);
  } finally {
    if (saved === undefined) delete process.env.HUB_HAIKU_SUMMARY;
    else process.env.HUB_HAIKU_SUMMARY = saved;
  }
});

test('buildSummaryCommand requests a plain --print haiku call', () => {
  const { command, args } = buildSummaryCommand({ modelId: MODEL_IDS.haiku });
  assert.ok(typeof command === 'string' && command.length > 0);
  assert.ok(args.includes('--print'));
  const mi = args.indexOf('--model');
  assert.ok(mi !== -1 && args[mi + 1] === MODEL_IDS.haiku);
  // One-shot summary must not carry the heavy agent flags.
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  assert.ok(!args.includes('--output-format'));
});

test('parseHandoff still extracts the token and prompt', () => {
  const h = parseHandoff('[HANDOFF:tester] Verify the change builds and write a test.');
  assert.deepEqual(h, { targetPersonId: 'tester', prompt: 'Verify the change builds and write a test.' });
  assert.equal(parseHandoff('no token here'), null);
});

test('parseHandoff captures a multi-line prompt (not just the first line)', () => {
  // The receiving Person gets ZERO history, so the whole self-contained prompt
  // must survive — a single-line capture would silently amputate the context.
  const text = "[HANDOFF:developer] Fix the bug in foo.js.\n\nSteps:\n- read the file\n- patch line 10";
  const h = parseHandoff(text);
  assert.equal(h.targetPersonId, 'developer');
  assert.match(h.prompt, /Steps:/);
  assert.match(h.prompt, /patch line 10/);
});

test('parseHandoff finds a token after leading prose (own-line anchor)', () => {
  const h = parseHandoff('Here is my summary.\n\n[HANDOFF:inspector] Review the diff on branch x.');
  assert.equal(h.targetPersonId, 'inspector');
  assert.equal(h.prompt, 'Review the diff on branch x.');
});
