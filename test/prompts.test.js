// Tests that buildSystemPrompt only reads guidelines from data/guidelines and
// can't be coaxed into reading an arbitrary file via a path-traversal `guidelines`
// value. Run with `npm test` (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSeeded } from '../src/services/seed.js';
import { buildSystemPrompt } from '../src/services/agent/prompts.js';

ensureSeeded(); // seed the working copies: people/ (prompt.md) + guidelines/

const base = { personId: 'mayors-aide', cwd: '/tmp/x', port: 3141 };

test('buildSystemPrompt includes guidelines for valid slugs', () => {
  const out = buildSystemPrompt({
    ...base,
    city: { name: 'Downtown', guidelines: 'downtown' },
    building: { name: 'City Hall', guidelines: 'city-hall' },
  });
  assert.match(out, /# City guidelines: Downtown/);
  assert.match(out, /# Building guidelines: City Hall/);
});

test('buildSystemPrompt ignores a path-traversal guidelines (no arbitrary file read)', () => {
  // Without the slug guard, '../../README' / '../../CHANGELOG' resolve to the
  // repo's README.md / CHANGELOG.md and would be embedded in the system prompt.
  const out = buildSystemPrompt({
    ...base,
    city: { name: 'Evil', guidelines: '../../README' },
    building: { name: 'Evil', guidelines: '../../CHANGELOG' },
  });
  assert.doesNotMatch(out, /# City guidelines/);
  assert.doesNotMatch(out, /# Building guidelines/);
});
