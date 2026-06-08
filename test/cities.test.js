// Tests for the cities.json editor writes. Run with `npm test` (node:test).
// These touch the real cities.json, so each writing test snapshots and restores
// the original bytes in a finally — the working tree stays clean even on failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { CITIES_FILE } from '../src/paths.js';
import { ensureSeeded } from '../src/services/seed.js';
import { writeCity, getRawCities, createCity, deleteCity, stringifyCompact } from '../src/services/projects.js';

ensureSeeded(); // fresh checkout ships only seed/; populate the working cities.json first
const ORIGINAL = readFileSync(CITIES_FILE, 'utf8');
const lf = (s) => s.replace(/\r\n/g, '\n'); // normalize CRLF (Windows checkout) for comparison
function withRestore(fn) {
  try {
    return fn();
  } finally {
    writeFileSync(CITIES_FILE, ORIGINAL);
  }
}

const downtownBuildings = () => getRawCities().find((c) => c.id === 'downtown').buildings;

test('stringifyCompact round-trips and keeps primitive arrays inline', () => {
  const sample = {
    s: 'a "quote" \\and\\ slash', n: 12, b: true, nil: null,
    prims: ['x', 'y'], coords: [10, 10], empty: [], emptyObj: {},
    objs: [{ id: 'a', t: [1, 2] }, { id: 'b' }],
    nested: { deep: { list: ['p', 'q'] } },
  };
  const out = stringifyCompact(sample);
  assert.deepEqual(JSON.parse(out), sample); // valid JSON, data preserved
  assert.match(out, /"prims": \["x", "y"\]/); // primitive array inline
  assert.match(out, /"coords": \[10, 10\]/);
  assert.match(out, /"objs": \[\n/); // array of objects stays multi-line
});

test('stringifyCompact stays valid JSON for undefined/function values', () => {
  // Defensive: never emit invalid JSON even for inputs JSON.stringify would drop.
  assert.equal(JSON.parse(stringifyCompact({ a: undefined, b: 1 })).a, null);
  assert.deepEqual(JSON.parse(stringifyCompact(['x', undefined])), ['x', null]);
  assert.equal(JSON.parse(stringifyCompact({ f: () => 1 })).f, null);
});

test('re-serializing the catalogue matches the hand-format (no diff churn)', () => {
  // Parsing then re-serializing the committed cities.json must reproduce it
  // byte-for-byte (modulo CRLF/LF), i.e. people/tile arrays stay inline.
  const round = `${stringifyCompact(JSON.parse(ORIGINAL))}\n`;
  assert.equal(lf(round), lf(ORIGINAL));
});

test('writeCity preserves roster order exactly as given', () => {
  withRestore(() => {
    const reversed = [...getRawCities().find((c) => c.id === 'downtown').people].reverse();
    const city = writeCity('downtown', { people: reversed });
    assert.deepEqual(city.people, reversed);
    // persisted (fresh read), not just returned
    assert.deepEqual(getRawCities().find((c) => c.id === 'downtown').people, reversed);
  });
});

test('writeCity rejects an unknown roster id (tile binding stays valid)', () => {
  withRestore(() => {
    assert.throws(() => writeCity('downtown', { people: ['mayors-aide', 'nobody-here'] }), /Unknown person in roster/);
  });
});

test('writeCity rejects a duplicate roster id', () => {
  withRestore(() => {
    assert.throws(() => writeCity('downtown', { people: ['clerk', 'clerk'] }), /Duplicate person in roster/);
  });
});

test('writeCity merges buildings by id, preserving guidelines/tile', () => {
  withRestore(() => {
    // Send only id/name/absolutePath; guidelines + tile must survive the merge.
    const sent = downtownBuildings().map((b) => ({ id: b.id, name: b.name, absolutePath: b.absolutePath }));
    sent[0].name = 'City Hall (renamed)';
    const city = writeCity('downtown', { buildings: sent });
    const cityHall = city.buildings.find((b) => b.id === 'city-hall');
    assert.equal(cityHall.name, 'City Hall (renamed)');
    assert.equal(cityHall.guidelines, 'city-hall'); // preserved
    assert.deepEqual(cityHall.tile, [10, 10]); // preserved
  });
});

test('writeCity never rewrites a "." path to an absolute one (no machine-path leak)', () => {
  withRestore(() => {
    const sent = downtownBuildings().map((b) => ({ id: b.id, name: b.name, absolutePath: b.absolutePath }));
    writeCity('downtown', { buildings: sent });
    const cityHall = getRawCities().find((c) => c.id === 'downtown').buildings.find((b) => b.id === 'city-hall');
    assert.equal(cityHall.absolutePath, '.'); // stays '.', not the resolved repo root
  });
});

test('writeCity rejects a building with a non-slug id', () => {
  withRestore(() => {
    assert.throws(() => writeCity('downtown', { buildings: [{ id: '../evil', name: 'x', absolutePath: '.' }] }), /Invalid building id/);
  });
});

test('writeCity rejects a building with a path-traversal guidelines (no arbitrary file read)', () => {
  withRestore(() => {
    assert.throws(
      () => writeCity('downtown', { buildings: [{ id: 'city-hall', name: 'x', guidelines: '../../README' }] }),
      /guidelines must be a slug/,
    );
  });
});

test('writeCity throws Unknown city for a missing id', () => {
  assert.throws(() => writeCity('atlantis', { name: 'X' }), /Unknown city/);
});

test('writeCity rejects an invalid (non-slug) city id', () => {
  assert.throws(() => writeCity('../etc', { name: 'X' }), /Invalid city id/);
});

test('createCity adds an empty city; rejects dup / invalid id / empty name', () => {
  withRestore(() => {
    const city = createCity({ id: 'newtown', name: 'New Town', description: 'fresh' });
    assert.deepEqual(city, { id: 'newtown', name: 'New Town', description: 'fresh', people: [], buildings: [] });
    assert.ok(getRawCities().some((c) => c.id === 'newtown'));
    assert.throws(() => createCity({ id: 'downtown', name: 'Dup' }), /already exists/);
    assert.throws(() => createCity({ id: '../evil', name: 'X' }), /Invalid city id/);
    assert.throws(() => createCity({ id: 'ok', name: '   ' }), /name is required/);
  });
});

test('deleteCity removes a city, preserves others, rejects unknown/invalid', () => {
  withRestore(() => {
    const before = getRawCities().length;
    assert.deepEqual(deleteCity('suburbs'), { deleted: 'suburbs' });
    const after = getRawCities();
    assert.equal(after.length, before - 1);
    assert.ok(!after.some((c) => c.id === 'suburbs'));
    assert.ok(after.some((c) => c.id === 'downtown')); // other city untouched
    assert.throws(() => deleteCity('atlantis'), /Unknown city/);
    assert.throws(() => deleteCity('../etc'), /Invalid city id/);
  });
});
