import { describe, it, expect } from 'vitest';
import { buildInterior, TILE_W, TILE_H } from './cityscape.js';

// Items are placed at a tile's CENTRE (x+0.5, y+0.5), which in this projection
// shares the tile's `left` and sits half a tile lower — so an item can be mapped
// back to the tile it stands on, and thus to that tile's terrain type.
const tileTypeUnder = (scene, item) => scene.ground.find(
  (g) => g.left === item.left && Math.abs(g.top + TILE_H / 2 - item.top) < 0.001,
)?.type;

describe('buildInterior', () => {
  it('places one desk slot per citizen plus a single add lot and four plants', () => {
    for (const n of [0, 1, 2, 3, 4, 8, 12]) {
      const s = buildInterior(n);
      expect(s.slots).toHaveLength(n);
      expect(s.addSlots).toHaveLength(1);
      expect(s.props).toHaveLength(4);
    }
  });

  it('gives every desk slot a distinct screen position (no overlapping desks)', () => {
    const s = buildInterior(8);
    const keys = new Set([...s.slots, ...s.addSlots].map((p) => `${Math.round(p.left)},${Math.round(p.top)}`));
    expect(keys.size).toBe(s.slots.length + s.addSlots.length);
  });

  it('produces finite coordinates and a non-empty floor for an empty building', () => {
    const s = buildInterior(0);
    expect(s.ground.length).toBeGreaterThan(0);
    for (const p of [...s.addSlots, ...s.props]) {
      expect(Number.isFinite(p.left)).toBe(true);
      expect(Number.isFinite(p.top)).toBe(true);
    }
  });

  it('clamps a negative count to an empty roster (just the add lot)', () => {
    const s = buildInterior(-3);
    expect(s.slots).toHaveLength(0);
    expect(s.addSlots).toHaveLength(1);
  });
});

describe('buildInterior yard', () => {
  it('surrounds the floor with grass and a walkway out to the gate', () => {
    const types = new Set(buildInterior(4).ground.map((g) => g.type));
    expect(types).toContain('floor');
    expect(types).toContain('grass');
    expect(types).toContain('yardpath');
  });

  it('fences the lot, leaving exactly one gap for the gate', () => {
    const s = buildInterior(4);
    // the outer ring is every tile with no neighbour on one side; its length is
    // the perimeter, and the fence covers all of it but the gate.
    const xs = s.ground.map((g) => g.x); const ys = s.ground.map((g) => g.y);
    const cols = Math.max(...xs) + 1; const rows = Math.max(...ys) + 1;
    expect(s.fence).toHaveLength(2 * cols + 2 * (rows - 2) - 1);
  });

  it('keeps desks indoors and yard trees on the grass', () => {
    const s = buildInterior(6);
    for (const d of [...s.slots, ...s.addSlots]) expect(tileTypeUnder(s, d)).toBe('floor');
    expect(s.trees.length).toBeGreaterThan(0);
    for (const t of s.trees) expect(tileTypeUnder(s, t)).toBe('grass');
  });

  it('roofs the whole building, so nothing shows through before the reveal', () => {
    const s = buildInterior(6);
    expect(s.roof.pts).toHaveLength(6);           // footprint + the wall-height skirt
    const floor = s.ground.filter((g) => g.type === 'floor');
    const rx = s.roof.pts.map((p) => p.x); const ry = s.roof.pts.map((p) => p.y);
    // the roof's bounding box must contain every floor tile's
    expect(Math.min(...rx)).toBeLessThanOrEqual(Math.min(...floor.map((g) => g.left)));
    expect(Math.max(...rx)).toBeGreaterThanOrEqual(Math.max(...floor.map((g) => g.left)) + TILE_W);
    expect(Math.max(...ry)).toBeGreaterThanOrEqual(Math.max(...floor.map((g) => g.top)) + TILE_H);
    // and it must reach above the floor by at least the wall height
    expect(Math.min(...ry)).toBeLessThan(Math.min(...floor.map((g) => g.top)));
  });

  it('furnishes the floor without landing anything on a desk', () => {
    const s = buildInterior(6);
    expect(s.furniture.length).toBeGreaterThan(0);
    for (const f of s.furniture) expect(tileTypeUnder(s, f)).toBe('floor');
    const deskKeys = new Set(s.slots.map((d) => `${d.left},${d.top}`));
    for (const f of s.furniture) expect(deskKeys.has(`${f.left},${f.top}`)).toBe(false);
  });

  it('gives the strollers a closed loop that never crosses the floor', () => {
    const s = buildInterior(5);
    expect(s.walkLoop).toMatch(/^M [-\d]+ [-\d]+( L [-\d]+ [-\d]+){3} Z$/);
    // every corner of the loop must sit outside the building's screen-space box
    const floor = s.ground.filter((g) => g.type === 'floor');
    const box = {
      l: Math.min(...floor.map((g) => g.left)), r: Math.max(...floor.map((g) => g.left)),
      t: Math.min(...floor.map((g) => g.top)), b: Math.max(...floor.map((g) => g.top)),
    };
    const pts = [...s.walkLoop.matchAll(/(-?\d+) (-?\d+)/g)].map((m) => [+m[1], +m[2]]);
    expect(pts).toHaveLength(4);
    for (const [x, y] of pts) {
      expect(x < box.l || x > box.r || y < box.t || y > box.b).toBe(true);
    }
  });
});
