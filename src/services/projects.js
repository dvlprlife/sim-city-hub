// Loads the catalogue (cities.json) and the people/ library. Everything is
// read through the mtime-gated file cache, so edits to cities.json or a
// manifest are picked up on the next request without a restart.
import path from 'node:path';
import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { readFileCached, invalidateFileCache } from './agent/fileCache.js';
import { writeFileAtomic } from './atomicWrite.js';
import { MODEL_IDS } from './agent/model.js';
import { CITIES_FILE, PEOPLE_DIR, HUB_ROOT } from '../paths.js';

function loadCatalogue() {
  const raw = readFileCached(CITIES_FILE);
  if (!raw) throw new Error(`cities.json not found at ${CITIES_FILE}`);
  return JSON.parse(raw);
}

// Resolve a configured path to an absolute one WITHOUT committing machine paths
// to cities.json: '.', '', or a missing value means the hub root; a relative
// path is resolved against the hub root; an absolute path is used as-is. This is
// why cities.json carries no machine-specific rootPath.
export function resolvePath(p) {
  if (!p || p === '.') return HUB_ROOT;
  return path.isAbsolute(p) ? p : path.resolve(HUB_ROOT, p);
}

export function getConfig() {
  const c = loadCatalogue();
  return {
    rootPath: resolvePath(c.rootPath),
    port: c.port ?? 3141,
  };
}

export function getCities() {
  return loadCatalogue().cities ?? [];
}

export function getCity(cityId) {
  return getCities().find((c) => c.id === cityId) ?? null;
}

export function getBuilding(cityId, buildingId) {
  const city = getCity(cityId);
  const b = city?.buildings?.find((bld) => bld.id === buildingId);
  return b ? { ...b, absolutePath: resolvePath(b.absolutePath) } : null;
}

// Ids (person / city / building) map directly to folders or catalogue keys, so
// they must be plain slugs — never paths. Guarding every id that reaches the
// filesystem stops a raw request like `/api/people/..%2f..%2fsecret` (Express
// decodes %2f to '/') from escaping a base dir via path.join.
const SLUG_RE = /^[a-z0-9-]+$/i;
export function isValidSlug(id) {
  return typeof id === 'string' && SLUG_RE.test(id);
}
// Person ids are slugs; kept as a named export for the people endpoints/spawn.
export const isValidPersonId = isValidSlug;

export function getPerson(personId) {
  if (!isValidPersonId(personId)) return null;
  const raw = readFileCached(path.join(PEOPLE_DIR, personId, 'manifest.json'));
  if (!raw) return null;
  return { id: personId, ...JSON.parse(raw) };
}

// Valid defaultModel keys for a manifest: every registered model key (family
// aliases + pinned versions) plus the 'auto' sentinel (resolved per-prompt by
// pickAutoModel at spawn time). Derived from agent/model.js so the two can't drift.
export const MANIFEST_MODELS = [...Object.keys(MODEL_IDS), 'auto'];

// Valid effort keys for a manifest: 'auto' (let the model's default decide) plus
// the CLI's fixed --effort levels. Whether a level actually applies depends on the
// chosen model (resolved by agent/model.js resolveEffort at spawn) — this just
// validates the stored intent.
export const MANIFEST_EFFORTS = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'];

// Validate + normalize a Person manifest before it's written. Pure (no I/O), so
// it's unit-testable. Throws an Error on the first violation; on success returns
// a clean manifest with the known keys in a stable order (extra keys dropped).
export function validateManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('manifest must be an object');
  }
  const str = (key, { required = false } = {}) => {
    const v = input[key];
    if (v === undefined || v === null) {
      if (required) throw new Error(`manifest.${key} is required`);
      return '';
    }
    if (typeof v !== 'string') throw new Error(`manifest.${key} must be a string`);
    return v;
  };

  const name = str('name', { required: true }).trim();
  if (!name) throw new Error('manifest.name is required');
  const job = str('job', { required: true }).trim();
  if (!job) throw new Error('manifest.job is required');

  const defaultModel = input.defaultModel ?? 'sonnet';
  if (!MANIFEST_MODELS.includes(defaultModel)) {
    throw new Error(`manifest.defaultModel must be one of ${MANIFEST_MODELS.join(', ')}`);
  }

  const effort = input.effort ?? 'auto';
  if (!MANIFEST_EFFORTS.includes(effort)) {
    throw new Error(`manifest.effort must be one of ${MANIFEST_EFFORTS.join(', ')}`);
  }

  if (input.opensInVSCode !== undefined && typeof input.opensInVSCode !== 'boolean') {
    throw new Error('manifest.opensInVSCode must be a boolean');
  }

  const mcps = input.mcps ?? [];
  if (!Array.isArray(mcps)) throw new Error('manifest.mcps must be an array');

  return {
    name,
    job,
    icon: str('icon'),
    description: str('description'),
    defaultModel,
    effort,
    opensInVSCode: input.opensInVSCode ?? false,
    mcps,
  };
}

// Read a Person's full editable document: the parsed manifest plus the raw
// prompt.md text. Returns null when the person folder/manifest is absent.
export function getPersonDoc(personId) {
  if (!isValidPersonId(personId)) return null;
  const dir = path.join(PEOPLE_DIR, personId);
  const raw = readFileCached(path.join(dir, 'manifest.json'));
  if (!raw) return null;
  const { id: _ignored, ...manifest } = JSON.parse(raw);
  const prompt = readFileCached(path.join(dir, 'prompt.md')) ?? '';
  return { id: personId, manifest, prompt };
}

// Persist edits to an existing Person. Writes only the provided file(s):
// `manifest` (validated, pretty-printed) and/or `prompt` (verbatim). Atomic
// writes dodge the OneDrive mid-write race; the cache is invalidated so the next
// spawn picks up the change. Throws if the person folder doesn't exist (this is
// an editor, not a creator — new citizens are added with the People library).
export function writePerson(personId, { manifest, prompt } = {}) {
  if (!isValidPersonId(personId)) throw new Error(`Invalid person id: ${personId}`);
  const dir = path.join(PEOPLE_DIR, personId);
  if (!existsSync(dir)) throw new Error(`Unknown person: ${personId}`);
  if (manifest === undefined && prompt === undefined) {
    throw new Error('nothing to write — provide manifest and/or prompt');
  }

  if (manifest !== undefined) {
    const clean = validateManifest(manifest);
    const file = path.join(dir, 'manifest.json');
    writeFileAtomic(file, `${JSON.stringify(clean, null, 2)}\n`);
    invalidateFileCache(file);
  }
  if (prompt !== undefined) {
    if (typeof prompt !== 'string') throw new Error('prompt must be a string');
    const file = path.join(dir, 'prompt.md');
    writeFileAtomic(file, prompt);
    invalidateFileCache(file);
  }
  return getPersonDoc(personId);
}

// Create a new Person in the shared library — people/<id>/manifest.json +
// prompt.md. `id` must be a fresh slug whose folder doesn't already exist; the
// manifest is validated; prompt defaults to ''. (The new citizen is added to no
// rosters — wire it into cities via the Config editor afterwards.)
export function createPerson({ id, manifest, prompt = '' } = {}) {
  if (!isValidPersonId(id)) throw new Error(`Invalid person id: ${id}`);
  if (typeof prompt !== 'string') throw new Error('prompt must be a string');
  const dir = path.join(PEOPLE_DIR, id);
  if (existsSync(dir)) throw new Error(`Person already exists: ${id}`);
  const clean = validateManifest(manifest); // throws on a bad manifest before any write
  mkdirSync(dir, { recursive: true });
  const mfile = path.join(dir, 'manifest.json');
  const pfile = path.join(dir, 'prompt.md');
  writeFileAtomic(mfile, `${JSON.stringify(clean, null, 2)}\n`);
  writeFileAtomic(pfile, prompt);
  invalidateFileCache(mfile);
  invalidateFileCache(pfile);
  return getPersonDoc(id);
}

// Delete a Person from the library AND scrub its id from every city's roster, so
// no dangling roster id (a 'missing' tile) is left behind. Throws Unknown person
// if the folder is absent. Returns { deleted, removedFrom: [cityId, ...] }.
export function deletePerson(personId) {
  if (!isValidPersonId(personId)) throw new Error(`Invalid person id: ${personId}`);
  const dir = path.join(PEOPLE_DIR, personId);
  if (!existsSync(dir)) throw new Error(`Unknown person: ${personId}`);

  // Scrub rosters first (re-read fresh; atomic write only if something changed).
  const catalogue = readCatalogueRaw();
  const cities = catalogue.cities ?? [];
  const removedFrom = [];
  for (const city of cities) {
    if (Array.isArray(city.people) && city.people.includes(personId)) {
      city.people = city.people.filter((pid) => pid !== personId);
      removedFrom.push(city.id);
    }
  }
  if (removedFrom.length) {
    catalogue.cities = cities;
    writeCatalogue(catalogue);
  }

  rmSync(dir, { recursive: true, force: true });
  invalidateFileCache(path.join(dir, 'manifest.json'));
  invalidateFileCache(path.join(dir, 'prompt.md'));
  return { deleted: personId, removedFrom };
}

// Every person id present in the people/ library — a slug-named folder with a
// manifest.json — whether or not any city rosters them. So a newly-created,
// not-yet-rostered citizen is still reachable (the Config "add citizen" picker,
// history filters, etc.).
export function listPeopleIds() {
  let entries;
  try {
    entries = readdirSync(PEOPLE_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && isValidPersonId(e.name))
    .filter((e) => existsSync(path.join(PEOPLE_DIR, e.name, 'manifest.json')))
    .map((e) => e.name);
}

// The whole People library, resolved to manifests (rostered or not).
export function getAllPeople() {
  return listPeopleIds().map((id) => getPerson(id)).filter(Boolean);
}

// Full tree for GET /api/cities — people ids inlined as resolved manifests,
// preserving roster order (which binds citizens to interior tiles).
export function getCityTree() {
  const cities = getCities().map((city) => ({
    ...city,
    buildings: (city.buildings ?? []).map((b) => ({ ...b, absolutePath: resolvePath(b.absolutePath) })),
    people: (city.people ?? []).map((pid) => getPerson(pid) ?? { id: pid, name: pid, missing: true }),
  }));
  return { config: getConfig(), cities, allPeople: getAllPeople() };
}

// --- cities.json editing (config UI) -------------------------------------
// The editor edits RAW (unresolved) values. Resolution ('.' -> repo root) lives
// only in the read/spawn path above, never here — so a '.'/relative path is
// never rewritten to a machine-absolute one (which would leak a machine path
// and break the no-machine-path-committed contract, CLAUDE.md).

// Read cities.json straight from disk (no cache) so a write merges against the
// freshest on-disk state and can't clobber a concurrent manual edit.
function readCatalogueRaw() {
  const raw = readFileSync(CITIES_FILE, 'utf8');
  return JSON.parse(raw);
}

// Pretty-print like JSON.stringify(x, null, 2), but keep arrays whose elements
// are all primitives (e.g. a roster `["a", "b"]` or a `tile` `[10, 10]`) on one
// line — matching cities.json's hand-format, so a UI write doesn't expand those
// arrays and churn the diff. Object/array-of-object values stay multi-line.
// Values go through JSON.stringify so escaping/quoting is exactly correct.
export function stringifyCompact(value, indent = 0) {
  // Total function: an undefined/function value (which JSON.stringify would drop
  // or omit) becomes null, so the writer can never emit invalid JSON. Not
  // reachable for the catalogue (always parsed from disk/JSON), but it makes the
  // serializer safe for any future call site.
  if (value === undefined || typeof value === 'function') return 'null';
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((v) => v === null || typeof v !== 'object')) {
      return `[${value.map((v) => stringifyCompact(v)).join(', ')}]`;
    }
    const items = value.map((v) => padIn + stringifyCompact(v, indent + 1));
    return `[\n${items.join(',\n')}\n${pad}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const items = keys.map((k) => `${padIn}${JSON.stringify(k)}: ${stringifyCompact(value[k], indent + 1)}`);
    return `{\n${items.join(',\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
}

// Serialize + atomically write cities.json (compact-array format) + invalidate
// the cache. The single write path for every catalogue mutation.
function writeCatalogue(catalogue) {
  writeFileAtomic(CITIES_FILE, `${stringifyCompact(catalogue)}\n`);
  invalidateFileCache(CITIES_FILE);
}

// Raw, unresolved cities array for the config editor (paths as stored).
export function getRawCities() {
  return readCatalogueRaw().cities ?? [];
}

// Roster: every id must be a slug that resolves to a people/<id>/ folder (a bad
// id would break tile binding). Order is preserved; duplicates are rejected.
function validateRoster(people) {
  if (!Array.isArray(people)) throw new Error('city.people must be an array');
  const seen = new Set();
  return people.map((pid) => {
    if (!isValidSlug(pid)) throw new Error(`Invalid person id in roster: ${pid}`);
    if (!existsSync(path.join(PEOPLE_DIR, pid))) throw new Error(`Unknown person in roster: ${pid}`);
    if (seen.has(pid)) throw new Error(`Duplicate person in roster: ${pid}`);
    seen.add(pid);
    return pid;
  });
}

// Buildings: merged BY ID into the existing array so fields the editor doesn't
// send (guidelines, tile, …) survive. absolutePath is stored as-given; its
// existence is NOT enforced here (the UI soft-warns via the PathPicker) — a
// workspace may legitimately not exist yet.
function mergeBuildings(existing, sent) {
  if (!Array.isArray(sent)) throw new Error('city.buildings must be an array');
  const byId = new Map((existing ?? []).map((b) => [b.id, b]));
  const seen = new Set();
  return sent.map((b) => {
    if (!b || typeof b !== 'object') throw new Error('building must be an object');
    if (!isValidSlug(b.id)) throw new Error(`Invalid building id: ${b.id}`);
    if (typeof b.name !== 'string' || !b.name.trim()) throw new Error(`building.name is required (${b.id})`);
    if (b.absolutePath !== undefined && typeof b.absolutePath !== 'string') {
      throw new Error(`building.absolutePath must be a string (${b.id})`);
    }
    // guidelines maps to <data>/guidelines/<name>.md and is read into the system
    // prompt, so it must be a slug — never a path that could escape the dir.
    if (b.guidelines !== undefined && !isValidSlug(b.guidelines)) {
      throw new Error(`building.guidelines must be a slug (${b.id})`);
    }
    if (seen.has(b.id)) throw new Error(`Duplicate building id: ${b.id}`);
    seen.add(b.id);
    return { ...(byId.get(b.id) ?? {}), ...b };
  });
}

// Merge an edit into one city of the freshly-read catalogue and persist it.
// Accepts { name?, description?, people?, buildings? }; only provided fields are
// touched. Atomic write + cache invalidation so the next read/spawn sees it.
export function writeCity(cityId, patch = {}) {
  if (!isValidSlug(cityId)) throw new Error(`Invalid city id: ${cityId}`);
  const catalogue = readCatalogueRaw();
  const cities = catalogue.cities ?? [];
  const idx = cities.findIndex((c) => c.id === cityId);
  if (idx === -1) throw new Error(`Unknown city: ${cityId}`);

  const city = { ...cities[idx] };
  if (patch.name !== undefined) {
    if (typeof patch.name !== 'string' || !patch.name.trim()) throw new Error('city.name is required');
    city.name = patch.name.trim();
  }
  if (patch.description !== undefined) {
    if (typeof patch.description !== 'string') throw new Error('city.description must be a string');
    city.description = patch.description;
  }
  if (patch.people !== undefined) city.people = validateRoster(patch.people);
  if (patch.buildings !== undefined) city.buildings = mergeBuildings(cities[idx].buildings, patch.buildings);

  cities[idx] = city;
  catalogue.cities = cities;
  writeCatalogue(catalogue);
  return city;
}

// Create a new city. `id` must be a fresh slug; `name` is required. The city
// starts empty (no buildings/roster) — fill it via the editor afterwards.
export function createCity({ id, name, description = '' } = {}) {
  if (!isValidSlug(id)) throw new Error(`Invalid city id: ${id}`);
  if (typeof name !== 'string' || !name.trim()) throw new Error('city.name is required');
  if (typeof description !== 'string') throw new Error('city.description must be a string');
  const catalogue = readCatalogueRaw();
  const cities = catalogue.cities ?? [];
  if (cities.some((c) => c.id === id)) throw new Error(`City already exists: ${id}`);
  const city = { id, name: name.trim(), description, people: [], buildings: [] };
  cities.push(city);
  catalogue.cities = cities;
  writeCatalogue(catalogue);
  return city;
}

// Remove a city from the catalogue. Throws `Unknown city` if it isn't present.
export function deleteCity(cityId) {
  if (!isValidSlug(cityId)) throw new Error(`Invalid city id: ${cityId}`);
  const catalogue = readCatalogueRaw();
  const cities = catalogue.cities ?? [];
  const idx = cities.findIndex((c) => c.id === cityId);
  if (idx === -1) throw new Error(`Unknown city: ${cityId}`);
  cities.splice(idx, 1);
  catalogue.cities = cities;
  writeCatalogue(catalogue);
  return { deleted: cityId };
}
