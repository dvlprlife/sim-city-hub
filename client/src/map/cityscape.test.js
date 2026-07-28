import { describe, it, expect } from 'vitest';
import { buildInterior } from './cityscape.js';

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
