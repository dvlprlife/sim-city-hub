// Smoke tests for the pure Person-manifest validator. Run with `npm test`
// (node:test, built in — no test-framework dependency, per the lean-v1 rule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PEOPLE_DIR, CITIES_FILE } from '../src/paths.js';
import { ensureSeeded } from '../src/services/seed.js';
import {
  validateManifest, MANIFEST_MODELS, MANIFEST_EFFORTS, isValidPersonId, getPersonDoc,
  createPerson, deletePerson, writeCity, getRawCities,
  listPeopleIds, getAllPeople,
} from '../src/services/projects.js';

// A fresh checkout has only seed/ (cities.json + people/ are gitignored working
// copies); seed them before the tests read/write the real files.
ensureSeeded();

// A throwaway citizen id used by the create/delete tests; each cleans up the
// folder it makes and restores cities.json so the working tree stays clean.
const TMP_ID = 'tmp-test-citizen';
const TMP_DIR = path.join(PEOPLE_DIR, TMP_ID);
const ORIG_CITIES = readFileSync(CITIES_FILE, 'utf8');
function cleanupPerson() {
  rmSync(TMP_DIR, { recursive: true, force: true });
  writeFileSync(CITIES_FILE, ORIG_CITIES);
}

const base = {
  name: 'Sample Developer',
  job: 'Developer',
  icon: 'developer',
  description: 'Builds and maintains the project.',
  defaultModel: 'sonnet',
  opensInVSCode: true,
  mcps: [],
};

test('validateManifest accepts a well-formed manifest and normalizes keys', () => {
  const out = validateManifest({ ...base, surprise: 'dropped' });
  assert.deepEqual(Object.keys(out), [
    'name', 'job', 'icon', 'description', 'defaultModel', 'effort', 'opensInVSCode', 'mcps',
  ]);
  assert.equal(out.name, 'Sample Developer');
  assert.equal(out.surprise, undefined); // unknown keys are not carried through
});

test('validateManifest accepts every valid defaultModel key', () => {
  for (const m of MANIFEST_MODELS) {
    assert.equal(validateManifest({ ...base, defaultModel: m }).defaultModel, m);
  }
});

test('validateManifest rejects an unknown model key', () => {
  assert.throws(() => validateManifest({ ...base, defaultModel: 'gpt' }), /defaultModel must be one of/);
});

test('validateManifest accepts every valid effort key, defaults to auto, rejects unknown', () => {
  for (const e of MANIFEST_EFFORTS) {
    assert.equal(validateManifest({ ...base, effort: e }).effort, e);
  }
  assert.equal(validateManifest({ ...base }).effort, 'auto'); // unset -> auto
  assert.throws(() => validateManifest({ ...base, effort: 'ultra' }), /effort must be one of/);
});

test('validateManifest requires a non-empty name and job', () => {
  assert.throws(() => validateManifest({ ...base, name: '' }), /name is required/);
  assert.throws(() => validateManifest({ ...base, name: '   ' }), /name is required/);
  assert.throws(() => validateManifest({ ...base, job: undefined }), /job is required/);
});

test('validateManifest rejects a non-array mcps and non-boolean opensInVSCode', () => {
  assert.throws(() => validateManifest({ ...base, mcps: 'nope' }), /mcps must be an array/);
  assert.throws(() => validateManifest({ ...base, opensInVSCode: 'yes' }), /opensInVSCode must be a boolean/);
});

test('validateManifest defaults optional fields (model, mcps, opensInVSCode)', () => {
  const out = validateManifest({ name: 'X', job: 'Y' });
  assert.equal(out.defaultModel, 'sonnet');
  assert.deepEqual(out.mcps, []);
  assert.equal(out.opensInVSCode, false);
  assert.equal(out.icon, '');
});

test('isValidPersonId accepts slugs and rejects path-traversal ids', () => {
  for (const ok of ['developer', 'web-dev', 'writer', 'Clerk123']) assert.ok(isValidPersonId(ok));
  for (const bad of ['../secret', '..\\secret', 'a/b', 'a/../b', '', '.', null, undefined, 42]) {
    assert.equal(isValidPersonId(bad), false);
  }
});

test('getPersonDoc returns null for a traversal id (no arbitrary file read)', () => {
  // Decodes to ../../package.json from a raw request; the guard must reject it
  // before path.join escapes PEOPLE_DIR.
  assert.equal(getPersonDoc('../../package'), null);
  assert.equal(getPersonDoc('..\\..\\package'), null);
});

test('createPerson writes the folder + files; rejects dup / bad manifest / bad id', () => {
  try {
    const doc = createPerson({ id: TMP_ID, manifest: { name: 'Tmp', job: 'Tester' }, prompt: 'hi there' });
    assert.equal(doc.id, TMP_ID);
    assert.equal(doc.manifest.name, 'Tmp');
    assert.equal(doc.prompt, 'hi there');
    assert.ok(existsSync(path.join(TMP_DIR, 'manifest.json')));
    assert.ok(existsSync(path.join(TMP_DIR, 'prompt.md')));
    assert.throws(() => createPerson({ id: 'clerk', manifest: { name: 'X', job: 'Y' } }), /already exists/);
    assert.throws(() => createPerson({ id: TMP_ID, manifest: { name: 'X', job: 'Y' } }), /already exists/);
    // bad manifest is rejected BEFORE the folder is created (no 'ok-new' left behind)
    assert.throws(() => createPerson({ id: 'ok-new', manifest: { job: 'NoName' } }), /name is required/);
    assert.equal(existsSync(path.join(PEOPLE_DIR, 'ok-new')), false);
    assert.throws(() => createPerson({ id: '../evil', manifest: { name: 'X', job: 'Y' } }), /Invalid person id/);
  } finally {
    cleanupPerson();
  }
});

test('getAllPeople / listPeopleIds include a created-but-unrostered citizen', () => {
  try {
    createPerson({ id: TMP_ID, manifest: { name: 'Tmp', job: 'Tester' } });
    // It is in NO city roster...
    assert.ok(!getRawCities().some((c) => (c.people || []).includes(TMP_ID)));
    // ...yet it must be reachable in the library (so the Config picker can offer it).
    assert.ok(listPeopleIds().includes(TMP_ID));
    assert.ok(getAllPeople().some((p) => p.id === TMP_ID));
  } finally {
    cleanupPerson();
  }
});

test('deletePerson removes the folder AND scrubs the id from city rosters', () => {
  try {
    createPerson({ id: TMP_ID, manifest: { name: 'Tmp', job: 'Tester' } });
    const downtown = getRawCities().find((c) => c.id === 'downtown');
    writeCity('downtown', { people: [...downtown.people, TMP_ID] });
    assert.ok(getRawCities().find((c) => c.id === 'downtown').people.includes(TMP_ID));

    const res = deletePerson(TMP_ID);
    assert.equal(res.deleted, TMP_ID);
    assert.ok(res.removedFrom.includes('downtown'));
    assert.equal(existsSync(TMP_DIR), false);
    assert.ok(!getRawCities().find((c) => c.id === 'downtown').people.includes(TMP_ID));

    assert.throws(() => deletePerson('nope-nobody'), /Unknown person/);
    assert.throws(() => deletePerson('../evil'), /Invalid person id/);
  } finally {
    cleanupPerson();
  }
});
