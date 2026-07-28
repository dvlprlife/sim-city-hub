// First-run seeding: populate the gitignored working copies (cities.json, people/,
// guidelines/) from the committed seed/ samples. A fresh clone ships only seed/;
// the hub copies it into place on first boot, then reads/writes the working copies
// — so all live edits (real workspace paths, citizens you add, guidelines you
// tweak, etc.) stay local and never land in git. Idempotent: once a working copy
// exists, that copy is left untouched.
import { existsSync, copyFileSync, cpSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  CITIES_FILE, PEOPLE_DIR, GUIDELINES_DIR,
  SEED_CITIES_FILE, SEED_PEOPLE_DIR, SEED_GUIDELINES_DIR,
} from '../paths.js';
import { migrateRostersToBuildings } from './migrate.js';

export function ensureSeeded() {
  const seeded = [];

  if (!existsSync(CITIES_FILE) && existsSync(SEED_CITIES_FILE)) {
    mkdirSync(path.dirname(CITIES_FILE), { recursive: true });
    copyFileSync(SEED_CITIES_FILE, CITIES_FILE);
    seeded.push('cities.json');
  }

  // Seed people/ only when it's absent or empty — never clobber a populated
  // working library (the user may have added/removed citizens).
  const peopleEmpty = !existsSync(PEOPLE_DIR) || readdirSync(PEOPLE_DIR).length === 0;
  if (peopleEmpty && existsSync(SEED_PEOPLE_DIR)) {
    cpSync(SEED_PEOPLE_DIR, PEOPLE_DIR, { recursive: true });
    seeded.push('people/');
  }

  // Same rule for the per-city / per-building guidelines: seed only when the
  // working copy is absent or empty, so edits to a guideline file survive.
  const guidelinesEmpty = !existsSync(GUIDELINES_DIR) || readdirSync(GUIDELINES_DIR).length === 0;
  if (guidelinesEmpty && existsSync(SEED_GUIDELINES_DIR)) {
    cpSync(SEED_GUIDELINES_DIR, GUIDELINES_DIR, { recursive: true });
    seeded.push('guidelines/');
  }

  // Bring an older working catalogue up to the current schema. Runs after the
  // copy above so a just-seeded file (already current) is a cheap no-op, and from
  // here rather than server.js so every entry point — hub boot and the test
  // suite — reads the migrated shape.
  const migrated = migrateRostersToBuildings();
  if (migrated?.moved.length) seeded.push(`migrated rosters to ${migrated.moved.length} building(s)`);

  return seeded;
}
