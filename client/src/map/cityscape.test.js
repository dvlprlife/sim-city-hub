import { describe, it, expect } from 'vitest';
import { buildInterior, buildLot } from './cityscape.js';

// Is a point inside the building's walls?
const indoors = (b, p) => p.left > b.left + b.wall && p.left < b.left + b.w - b.wall
  && p.top > b.top + b.wall && p.top < b.top + b.h - b.wall;

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

describe('buildLot (top-down citizens view)', () => {
  it('places one desk per citizen plus one add lot, all distinct', () => {
    for (const n of [0, 1, 2, 3, 4, 7, 11]) {
      const s = buildLot(n);
      expect(s.slots).toHaveLength(n);
      const keys = new Set([...s.slots, s.addSlot].map((p) => `${p.left},${p.top}`));
      expect(keys.size).toBe(n + 1);
    }
  });

  it('keeps every desk, the add lot and the furniture inside the walls', () => {
    const s = buildLot(9);
    for (const p of [...s.slots, s.addSlot, ...s.cabinets, s.rug]) {
      expect(indoors(s.building, p)).toBe(true);
    }
  });

  it('never puts a cabinet or the rug on a desk', () => {
    const s = buildLot(9);
    const desks = new Set([...s.slots, s.addSlot].map((p) => `${p.left},${p.top}`));
    for (const f of [...s.cabinets, s.rug]) expect(desks.has(`${f.left},${f.top}`)).toBe(false);
  });

  it('runs the stroll loop right around the building, never through it', () => {
    const s = buildLot(6);
    expect(s.walkLoop).toMatch(/^M .* Z$/);
    const pts = [...s.walkLoop.matchAll(/(-?\d+) (-?\d+)/g)].map((m) => ({ left: +m[1], top: +m[2] }));
    expect(pts).toHaveLength(4);
    const b = s.building;
    for (const p of pts) expect(indoors(b, p)).toBe(false);
    // and it must enclose the building, not sit off to one side
    expect(Math.min(...pts.map((p) => p.left))).toBeLessThan(b.left);
    expect(Math.max(...pts.map((p) => p.left))).toBeGreaterThan(b.left + b.w);
    expect(Math.min(...pts.map((p) => p.top))).toBeLessThan(b.top);
    expect(Math.max(...pts.map((p) => p.top))).toBeGreaterThan(b.top + b.h);
  });

  it('leaves a gate in the fence where the driveway crosses it', () => {
    const s = buildLot(4);
    const frontY = Math.max(...s.fence.filter((f) => f.dir === 'h').map((f) => f.top));
    const front = s.fence.filter((f) => f.dir === 'h' && f.top === frontY);
    const back = s.fence.filter((f) => f.dir === 'h' && f.top !== frontY);
    expect(front.length).toBeLessThan(back.length);        // the gap is the gate
    for (const f of front) expect(Math.abs(f.left + f.w / 2 - s.door.left)).toBeGreaterThan(s.door.w);
  });

  it('lines the driveway up with the door and reaches the road', () => {
    const s = buildLot(3);
    expect(s.drive.x1).toBe(s.door.left);
    expect(s.drive.x2).toBe(s.door.left);
    expect(s.drive.y1).toBe(s.building.top + s.building.h);
    expect(s.drive.y2).toBe(s.road.y);
    expect(s.road.y).toBeLessThan(s.height);
  });

  it('clamps a negative count and still yields a finite scene', () => {
    const s = buildLot(-4);
    expect(s.slots).toHaveLength(0);
    for (const v of [s.width, s.height, s.addSlot.left, s.addSlot.top]) expect(Number.isFinite(v)).toBe(true);
  });
});
