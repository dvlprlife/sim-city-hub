// One-time schema migrations for the working (gitignored) data/cities.json.
// A fresh clone is seeded from seed/ and is already current, so these only ever
// fire for a catalogue written by an older hub. Each migration is idempotent and
// safe to run on every boot: it detects the old shape, rewrites, and no-ops after.
import { existsSync, readFileSync, copyFileSync } from 'node:fs';
import { CITIES_FILE } from '../paths.js';
import { writeCatalogueFile } from './projects.js';

// Rosters moved from the City to the Building (agents are per-workspace, not
// per-domain). An old catalogue has `city.people`; the new shape has
// `building.people`. Every building inherits a COPY of its city's roster, so
// behaviour is unchanged on first boot and each building can be trimmed after —
// nobody silently loses their citizens. Buildings that already carry a roster are
// left alone, so a half-migrated file converges rather than being clobbered.
export function migrateRostersToBuildings() {
  if (!existsSync(CITIES_FILE)) return null;

  let catalogue;
  try {
    catalogue = JSON.parse(readFileSync(CITIES_FILE, 'utf8'));
  } catch {
    return null;                       // unparseable: leave it for the loader to report
  }
  const cities = catalogue.cities ?? [];
  if (!cities.some((c) => Array.isArray(c.people))) return null;   // already migrated

  const moved = [];
  for (const city of cities) {
    if (!Array.isArray(city.people)) continue;
    const roster = city.people;
    for (const b of city.buildings ?? []) {
      if (Array.isArray(b.people)) continue;                       // keep an explicit roster
      b.people = [...roster];
      moved.push(`${city.id}/${b.id}`);
    }
    delete city.people;
  }

  // The old file is the only copy of the pre-migration rosters — keep one backup
  // beside it before the shape changes (best-effort; never block the migration).
  try {
    if (!existsSync(`${CITIES_FILE}.bak`)) copyFileSync(CITIES_FILE, `${CITIES_FILE}.bak`);
  } catch { /* a backup is a nicety, not a precondition */ }

  catalogue.cities = cities;
  writeCatalogueFile(catalogue);
  return { moved, backup: `${CITIES_FILE}.bak` };
}
