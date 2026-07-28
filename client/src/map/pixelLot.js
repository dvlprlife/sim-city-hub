// Deterministic layout for the pixel-art CITIZENS view — one building's lot seen
// from above, the counterpart to pixelTown.js (which lays out the whole village).
// World-space geometry only, in the same pre-scaled world pixels pixelTown uses
// (one 16px tile renders at TS world px); the renderer draws it under a pan/zoom
// camera. Theme-confined: holds positions, not art.

export const TS = 48;              // one tile in world px (16px art at scale 3)
// A citizen sprite is 64px of art drawn at scale 3 = 192 world px tall, rising
// from its feet. The stroll route runs 2 tiles outside the walls, so the yard
// needs more than 4 tiles above the building or walkers on the top edge are
// clipped off the top of the world.
const YARD = 7;                    // tiles of yard on each side of the building
const DRIVE = 4;                   // tiles of driveway below the lot
const PITCH = 3;                   // tiles between desks (desk + aisle)

// Desks sit on a grid inside the building; the LAST cell is the "add citizen"
// lot, so an empty building still has somewhere to click.
export function buildPixelLot(count, { perRow = 4 } = {}) {
  const items = Math.max(0, count | 0);
  const total = items + 1;
  const cols = Math.min(perRow, Math.max(2, total));
  const rows = Math.ceil(total / cols);

  // Interior in tiles: a margin row at the top for shelves, then the desk grid.
  const inW = cols * PITCH + 1;
  const inH = rows * PITCH + 2;
  const bW = inW + 2;                       // + the wall ring
  const bH = inH + 2;

  const lotW = bW + YARD * 2;
  const lotH = bH + YARD * 2 + DRIVE;
  const worldW = lotW * TS;
  const worldH = lotH * TS;

  const bx = YARD, by = YARD;               // building's top-left, in tiles
  const building = {
    tx: bx, ty: by, tw: bW, th: bH,
    x: bx * TS, y: by * TS, w: bW * TS, h: bH * TS,
    inX: (bx + 1) * TS, inY: (by + 1) * TS, inW: inW * TS, inH: inH * TS,
  };

  // Desk cells, in tiles, relative to the interior's top-left.
  const cells = [];
  for (let k = 0; k < total; k += 1) {
    const c = k % cols, r = Math.floor(k / cols);
    cells.push({ tx: bx + 1 + 1 + c * PITCH, ty: by + 1 + 2 + r * PITCH });
  }
  const toWorld = (c) => ({ x: c.tx * TS, y: c.ty * TS, tx: c.tx, ty: c.ty });
  const desks = cells.slice(0, items).map(toWorld);
  const addDesk = toWorld(cells[items]);

  // Shelves line the free row just inside the top wall.
  const shelves = [];
  for (let c = 0; c < cols; c += 1) shelves.push(toWorld({ tx: bx + 2 + c * PITCH, ty: by + 1 }));

  // Front door, centred on the bottom wall, with a path down to the road.
  const doorTx = bx + Math.floor(bW / 2);
  const door = { tx: doorTx, ty: by + bH - 1, x: doorTx * TS, y: (by + bH - 1) * TS };
  const path = { tx: doorTx, ty0: by + bH, ty1: lotH - 1 };

  // Fence around the lot, with a gate where the path crosses the front line.
  const fx0 = 1, fy0 = 1, fx1 = lotW - 2, fy1 = lotH - DRIVE;
  const fence = [];
  for (let x = fx0; x <= fx1; x += 1) {
    fence.push({ tx: x, ty: fy0, dir: 'h' });
    if (x !== doorTx) fence.push({ tx: x, ty: fy1, dir: 'h' });
  }
  for (let y = fy0 + 1; y < fy1; y += 1) {
    fence.push({ tx: fx0, ty: y, dir: 'v' });
    fence.push({ tx: fx1, ty: y, dir: 'v' });
  }

  // Trees on the grass, clear of the building, the path and the stroll route.
  const trees = [];
  const treeCells = [
    [fx0 + 1, fy0 + 1], [fx1 - 1, fy0 + 1], [fx0 + 1, fy1 - 2], [fx1 - 1, fy1 - 2],
    [fx0 + 1, by + Math.floor(bH / 2)], [fx1 - 1, by + Math.floor(bH / 2)],
  ];
  for (const [tx, ty] of treeCells) {
    if (tx === doorTx && ty >= by + bH) continue;
    trees.push({ x: tx * TS + TS / 2, y: ty * TS + TS, kind: (tx + ty) % 2 ? 'tree1' : 'tree2' });
  }

  // The stroll route: a closed rectangle in the grass around the building, set
  // between the walls and the fence so nobody clips either.
  const m = 2;
  const rx0 = (bx - m) * TS, ry0 = (by - m) * TS;
  const rx1 = (bx + bW + m) * TS, ry1 = (by + bH + m) * TS;
  const route = [
    { x: rx0, y: ry0 }, { x: rx1, y: ry0 }, { x: rx1, y: ry1 }, { x: rx0, y: ry1 },
  ];

  return { worldW, worldH, lotW, lotH, building, desks, addDesk, shelves, door, path, fence, trees, route };
}
