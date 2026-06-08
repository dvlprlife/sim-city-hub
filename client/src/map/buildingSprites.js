// Themed catalogue of selectable building graphics. This is the Simulated Agent City theme's
// building art set — the ONLY place the building-type strings live. ConfigPanel
// imports this to populate its graphic picker (it hardcodes none itself), and the
// map views import it to render each building's chosen graphic.
//
// Art is Kenney's CC0 isometric building sprites (see
// client/public/assets/iso/CREDITS.md). `asset` is served from /public.
//
// `key`   — stored opaquely as `building.sprite` in cities.json (backend never
//           interprets it; it rides through mergeBuildings like `tile`).
// `asset` — the iso sprite PNG (served at root from client/public).
// `glyph` — text marker shown beside the label in the Config picker dropdown.
export const buildingSprites = [
  { key: 'office', label: 'Office', glyph: '🏢', asset: '/assets/iso/office.png' },
  { key: 'apartments', label: 'Apartments', glyph: '🏨', asset: '/assets/iso/apartments.png' },
  { key: 'hotel', label: 'Hotel', glyph: '🛎️', asset: '/assets/iso/hotel.png' },
  { key: 'house', label: 'House', glyph: '🏠', asset: '/assets/iso/house.png' },
  { key: 'town-hall', label: 'Town Hall', glyph: '🏛️', asset: '/assets/iso/town-hall.png' },
  { key: 'library', label: 'Library', glyph: '📚', asset: '/assets/iso/library.png' },
  { key: 'school', label: 'School', glyph: '🏫', asset: '/assets/iso/school.png' },
  { key: 'bank', label: 'Bank', glyph: '🏦', asset: '/assets/iso/bank.png' },
  { key: 'museum', label: 'Museum', glyph: '🖼️', asset: '/assets/iso/museum.png' },
  { key: 'clinic', label: 'Clinic', glyph: '🏥', asset: '/assets/iso/clinic.png' },
  { key: 'shop', label: 'Shop', glyph: '🏬', asset: '/assets/iso/shop.png' },
  { key: 'store', label: 'Store', glyph: '🛒', asset: '/assets/iso/store.png' },
  { key: 'cafe', label: 'Café', glyph: '☕', asset: '/assets/iso/cafe.png' },
  { key: 'restaurant', label: 'Restaurant', glyph: '🍽️', asset: '/assets/iso/restaurant.png' },
  { key: 'market', label: 'Market', glyph: '🏪', asset: '/assets/iso/market.png' },
  { key: 'warehouse', label: 'Warehouse', glyph: '📦', asset: '/assets/iso/warehouse.png' },
  { key: 'factory', label: 'Factory', glyph: '🏭', asset: '/assets/iso/factory.png' },
  { key: 'depot', label: 'Depot', glyph: '🚚', asset: '/assets/iso/depot.png' },
  { key: 'arena', label: 'Arena', glyph: '🏟️', asset: '/assets/iso/arena.png' },
  { key: 'highrise', label: 'High-rise', glyph: '🏙️', asset: '/assets/iso/highrise.png' },
  { key: 'courthouse', label: 'Courthouse', glyph: '⚖️', asset: '/assets/iso/courthouse.png' },
  { key: 'chapel', label: 'Chapel', glyph: '⛪', asset: '/assets/iso/chapel.png' },
  { key: 'firehouse', label: 'Fire Station', glyph: '🚒', asset: '/assets/iso/firehouse.png' },
  { key: 'studio', label: 'Studio', glyph: '🎬', asset: '/assets/iso/studio.png' },
  { key: 'diner', label: 'Diner', glyph: '🍔', asset: '/assets/iso/diner.png' },
  { key: 'pub', label: 'Pub', glyph: '🍺', asset: '/assets/iso/pub.png' },
  { key: 'grocer', label: 'Grocer', glyph: '🥦', asset: '/assets/iso/grocer.png' },
  { key: 'florist', label: 'Florist', glyph: '💐', asset: '/assets/iso/florist.png' },
  { key: 'lodge', label: 'Lodge', glyph: '🏕️', asset: '/assets/iso/lodge.png' },
  { key: 'park', label: 'Park', glyph: '🌳', asset: '/assets/iso/park.png' },
];

// Buildings created before this feature (or saved without a choice) render this.
export const DEFAULT_BUILDING_SPRITE = 'office';

// Resolve a stored key to a catalogue entry, falling back to the default so an
// unknown / unset key never breaks the render.
export function spriteFor(key) {
  return (
    buildingSprites.find((s) => s.key === key) ||
    buildingSprites.find((s) => s.key === DEFAULT_BUILDING_SPRITE)
  );
}
