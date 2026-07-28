// Rosters live on BUILDINGS, not cities (CLAUDE.md), so anything that wants a
// city-wide view of its citizens has to fold the buildings together. Kept here
// because three views need the same derivation and must agree.

// Every distinct citizen staffed anywhere in the city, in first-seen order.
// The same Person can be rostered in several buildings — they count once.
export function cityPeople(city) {
  const seen = new Map();
  for (const b of city?.buildings ?? []) {
    for (const p of b.people ?? []) {
      const id = typeof p === 'string' ? p : p?.id;
      if (id && !seen.has(id)) seen.set(id, p);
    }
  }
  return [...seen.values()];
}

// Citizens assignable in a city-level context: the chosen building's roster when
// one is selected, otherwise everyone staffed anywhere in the city — so a picker
// is never empty just because no building has been chosen yet.
export function peopleFor(city, buildingId) {
  const b = (city?.buildings ?? []).find((x) => x.id === buildingId);
  return b ? (b.people ?? []) : cityPeople(city);
}
