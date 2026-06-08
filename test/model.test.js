// Smoke tests for the pure model-selection logic. Run with `npm test`
// (node:test, built in — no test-framework dependency, per the lean-v1 rule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModelKey, pickAutoModel, modelFamily, resolveEffort, effortLevelsFor, MODEL_IDS } from '../src/services/agent/model.js';

test('resolveModelKey normalizes keys', () => {
  assert.equal(resolveModelKey('opus'), 'opus');
  assert.equal(resolveModelKey('auto'), 'auto');
  assert.equal(resolveModelKey('bogus'), 'sonnet'); // unknown -> default
  assert.equal(resolveModelKey(undefined), 'sonnet');
});

test('resolveModelKey preserves a pinned version key', () => {
  assert.equal(resolveModelKey('opus-4-7'), 'opus-4-7');
  assert.equal(resolveModelKey('sonnet-4-5'), 'sonnet-4-5');
  assert.equal(resolveModelKey('haiku-4-5'), 'haiku-4-5');
});

test('family aliases resolve to the latest id; pinned keys to their own', () => {
  assert.equal(MODEL_IDS.opus, 'claude-opus-4-8');
  assert.equal(MODEL_IDS['opus-4-7'], 'claude-opus-4-7');
  assert.notEqual(MODEL_IDS['opus-4-7'], MODEL_IDS.opus);
});

test('effortLevelsFor reflects per-model support', () => {
  assert.deepEqual(effortLevelsFor('opus-4-8'), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(effortLevelsFor('opus-4-6'), ['low', 'medium', 'high', 'max']); // no xhigh
  assert.deepEqual(effortLevelsFor('sonnet-4-6'), ['low', 'medium', 'high']);      // no max/xhigh
  assert.deepEqual(effortLevelsFor('haiku-4-5'), []);                              // unsupported
  assert.deepEqual(effortLevelsFor('opus-4-1'), []);                              // predates effort
});

test('resolveEffort passes valid combos and drops the rest', () => {
  assert.equal(resolveEffort('opus-4-8', 'xhigh'), 'xhigh');
  assert.equal(resolveEffort('sonnet-4-6', 'high'), 'high');
  assert.equal(resolveEffort('opus-4-8', 'auto'), null);   // auto -> omit
  assert.equal(resolveEffort('opus-4-8', undefined), null); // unset -> omit
  assert.equal(resolveEffort('sonnet-4-6', 'max'), null);  // max not on sonnet
  assert.equal(resolveEffort('haiku-4-5', 'high'), null);  // haiku has no effort
  assert.equal(resolveEffort('opus-4-6', 'xhigh'), null);  // xhigh not on 4.6
});

test('modelFamily maps aliases, versions, and unknowns', () => {
  assert.equal(modelFamily('opus'), 'opus');
  assert.equal(modelFamily('opus-4-7'), 'opus');
  assert.equal(modelFamily('sonnet-4-5'), 'sonnet');
  assert.equal(modelFamily('haiku'), 'haiku');
  assert.equal(modelFamily('auto'), null);
  assert.equal(modelFamily('gpt'), null);
  assert.equal(modelFamily(undefined), null);
});

test('pickAutoModel leans opus for design/security work', () => {
  assert.equal(pickAutoModel('Design the architecture and audit security'), 'opus');
});

test('pickAutoModel leans haiku for trivial work', () => {
  assert.equal(pickAutoModel('translate this'), 'haiku');
});

test('pickAutoModel defaults to sonnet for ordinary prompts', () => {
  assert.equal(pickAutoModel('Add a button to the settings page that toggles dark mode'), 'sonnet');
});

test('every model key maps to a non-empty id', () => {
  for (const key of Object.keys(MODEL_IDS)) {
    assert.ok(typeof MODEL_IDS[key] === 'string' && MODEL_IDS[key].length > 0);
  }
});
