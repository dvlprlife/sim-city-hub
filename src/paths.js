// Central path resolution. The hub root is the repo root (one level above src/).
// Everything the hub reads at runtime — cities.json, the people/ library, the
// guidelines/ tree, and the SQLite DB — is resolved from here so the hub
// can run from any working directory.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const HUB_ROOT = path.resolve(__dirname, '..');
// All runtime/working data lives in one gitignored folder, data/ — the catalogue
// + citizen library + per-city/building guidelines the hub reads AND writes, plus
// the SQLite DB. Seeded from seed/ on first run (services/seed.js) so a fresh clone
// starts from the samples and live edits never land in git. (rootPath still
// resolves against HUB_ROOT, so building paths are unaffected by where cities.json
// lives.)
export const DATA_DIR = path.join(HUB_ROOT, 'data');
export const CITIES_FILE = path.join(DATA_DIR, 'cities.json');
export const PEOPLE_DIR = path.join(DATA_DIR, 'people');
export const GUIDELINES_DIR = path.join(DATA_DIR, 'guidelines');
export const DB_FILE = path.join(DATA_DIR, 'simcity-hub.db');
// Committed samples a fresh clone ships with.
export const SEED_DIR = path.join(HUB_ROOT, 'seed');
export const SEED_CITIES_FILE = path.join(SEED_DIR, 'cities.json');
export const SEED_PEOPLE_DIR = path.join(SEED_DIR, 'people');
export const SEED_GUIDELINES_DIR = path.join(SEED_DIR, 'guidelines');
