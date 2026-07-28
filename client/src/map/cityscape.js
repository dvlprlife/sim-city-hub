// Builds a small isometric city scene: a tile grid (grass / road / water) laid
// out as city blocks with roads between them, items (buildings / citizens / city
// clusters) on the plots, a clickable empty "add" plot, trees on the remaining
// plots, and a lake. Deterministic from the item count (no randomness) so it's
// stable across renders. Theme-confined: used only by the iso views.
import { isoToScreen } from './worldLayout.js';

export const TILE_W = 88;
export const TILE_H = 44;
const PAD = 24;
const TOP_CLEARANCE = 96; // room above tiles for buildings that rise up

// Builds a ROTARY town scene (no tile grid): a roundabout in the middle with
// offshoot roads radiating out, buildings scattered across the grass field, and
// cars (driving through the rotary) + pedestrians (strolling its sidewalk) that
// follow the roads via CSS motion paths. Deterministic from the count so it's
// stable across renders. Road geometry is returned in scene-pixel coords, shared
// by the <svg> drawing and each mover's offset-path.
export function buildRotaryTown(count) {
  const n = Math.max(count, 0);
  const total = n + 1; // + the "add building" lot
  const TAU = Math.PI * 2;
  const R = 72;          // rotary ring-road radius (centre line)
  const ROAD_W = 32;
  const span = Math.max(360, 300 + Math.ceil(total / 2) * 70); // scatter radius budget
  const width = Math.round(span * 2 + 220);
  const height = Math.max(540, Math.round(span * 1.5));
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  const far = Math.hypot(width, height); // a point safely beyond any edge
  const P = (a, r) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  const round = (p) => `${Math.round(p.x)} ${Math.round(p.y)}`;

  // Offshoot roads at spread (deliberately uneven) angles.
  const angles = [-1.35, -0.25, 0.78, 1.95, 3.18];
  const spokes = angles.map((a) => {
    const inP = P(a, R);
    const farP = P(a, far);
    return { x1: Math.round(inP.x), y1: Math.round(inP.y), x2: Math.round(farP.x), y2: Math.round(farP.y) };
  });

  // Sample the rotary ring between two spoke angles, the short way round.
  const ringArc = (thA, thB) => {
    let d = thB - thA;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const steps = Math.max(2, Math.ceil(Math.abs(d) / 0.16));
    const pts = [];
    for (let s = 0; s <= steps; s += 1) pts.push(round(P(thA + (d * s) / steps, R)));
    return pts;
  };
  // A car route: in from one offshoot, around the rotary, out another — both ends
  // off-screen, so the loop's teleport is never visible.
  const route = (ai, bi) => `M ${round(P(angles[ai], far))} L ${ringArc(angles[ai], angles[bi]).join(' L ')} L ${round(P(angles[bi], far))}`;
  const carPaths = [route(0, 2), route(3, 1), route(4, 0), route(2, 4)];

  // Pedestrians stroll the rotary sidewalk — a closed ring just outside the road,
  // so it loops seamlessly (no teleport).
  const sidewalkR = R + ROAD_W / 2 + 15;
  const loopPts = [];
  for (let s = 0; s <= 40; s += 1) loopPts.push(round(P((TAU * s) / 40, sidewalkR)));
  const pedLoop = `M ${loopPts.join(' L ')} Z`;

  // Everything that isn't a road (buildings, trees, bushes) goes in the WEDGES
  // between adjacent offshoots, never on a road. Compute each wedge's mid-angle.
  const sorted = [...angles].sort((p, q) => p - q);
  const wedges = sorted.map((th, i) => {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU;
    return (th + next) / 2;
  });
  const nw = wedges.length;
  // Place item k in a wedge, spiralling outward each time round, with a little
  // in-wedge jitter (kept clear of the bounding offshoots) for a scattered look.
  const inWedge = (k, baseR, ringStep, jit, wOff = 0) => {
    const idx = k + wOff;
    const a = wedges[idx % nw] + Math.sin(k * 1.7 + wOff) * jit;
    const r = baseR + Math.floor(idx / nw) * ringStep + Math.sin(k * 2.3) * (ringStep * 0.2);
    const p = P(a, r);
    return { left: Math.round(p.x), top: Math.round(p.y), z: Math.round(200 + p.y) };
  };

  // Buildings: in the wedges, set well back from the rotary (never touching a road).
  const slots = [];
  for (let i = 0; i < n; i += 1) slots.push(inWedge(i, R + 138, 108, 0.1));
  const addSlot = inWedge(n, R + 138, 108, 0.1);

  // Trees (further out) + bushes (nearer) fill the gaps too — also road-free.
  const trees = [];
  for (let i = 0; i < Math.max(5, total + 2); i += 1) trees.push(inWedge(i, R + 176, 122, 0.24, 2));
  const bushes = [];
  for (let i = 0; i < Math.max(6, total + 3); i += 1) bushes.push(inWedge(i, R + 108, 92, 0.32, 1));

  // Lamps: a ring around the rotary + one part-way out each offshoot, OFFSET to the
  // side of the asphalt (never on the road). Glow lights at night via .lamp-glow.
  const lamps = [];
  const lampR = R + ROAD_W / 2 + 22;
  for (let k = 0; k < 6; k += 1) { const p = P((TAU * k) / 6 + 0.4, lampR); lamps.push({ left: Math.round(p.x), top: Math.round(p.y), z: Math.round(200 + p.y) }); }
  for (const a of angles) {
    const base = P(a, R + 110);
    const lx = base.x + Math.cos(a + Math.PI / 2) * 26;
    const ly = base.y + Math.sin(a + Math.PI / 2) * 26;
    lamps.push({ left: Math.round(lx), top: Math.round(ly), z: Math.round(200 + ly) });
  }

  const cars = [
    { color: '#e0b13a', dur: 18, delay: 0 },
    { color: '#3d6fb0', dur: 23, delay: -7 },
    { color: '#c44a3a', dur: 20, delay: -13 },
    { color: '#4f9e6f', dur: 25, delay: -18 },
  ];
  const peds = [
    { shirt: '#c14b8a', dur: 34, delay: 0 },
    { shirt: '#2f9e6f', dur: 38, delay: -12 },
    { shirt: '#c9a227', dur: 42, delay: -26 },
    { shirt: '#7a5cc0', dur: 36, delay: -19 },
  ];

  return {
    width, height, center: { cx, cy }, rotaryR: R, roadW: ROAD_W, islandR: Math.max(8, R - ROAD_W / 2 - 4),
    spokes, carPaths, pedLoop, slots, addSlot, trees, bushes, lamps, cars, peds,
  };
}

// A plot is a 2x2 block; roads are the 1-tile gridlines between them
// (cell is road when x or y is a multiple of 3).
const isRoadCell = (x, y) => x % 3 === 0 || y % 3 === 0;
const plotBase = (col, row) => [1 + 3 * col, 1 + 3 * row];
const key = (x, y) => `${x},${y}`;

// count = number of items to place; cols = plots per row. Always reserves one
// empty "add" plot (so even an empty scene has somewhere to click to add).
// `roads: false` makes a "pasture" scene — open grass with a lake + scattered
// trees and no road grid (used by the world City Map; inside-a-city views keep
// the road blocks).
export function buildScene(count, { cols = 3, roads = true } = {}) {
  const items = Math.max(count, 0);
  const buildingRows = Math.ceil(Math.max(items, 1) / cols); // ≥1 row even when empty
  const sceneryRow = buildingRows;
  const plotRows = buildingRows + 1;
  const gridCols = 3 * cols + 1;
  const gridRows = 3 * plotRows + 1;

  // All plot bases in reading order.
  const plots = [];
  for (let r = 0; r < plotRows; r += 1) for (let c = 0; c < cols; c += 1) plots.push(plotBase(c, r));

  // Lake: a 2x2 water block on the first plot of the scenery row.
  const [lbx, lby] = plotBase(0, sceneryRow);
  const water = new Set();
  for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) water.add(key(lbx + dx, lby + dy));

  const itemPlots = plots.slice(0, items);
  // Remaining plots after the items, minus the lake → one becomes the add plot,
  // the rest get trees.
  const remaining = plots.slice(items).filter(([bx, by]) => !(bx === lbx && by === lby));
  const addPlots = remaining.slice(0, 1);
  const treePlots = remaining.slice(1);

  const centers = (ps) => ps.map(([bx, by]) => ({ cx: bx + 0.5, cy: by + 0.5 }));
  const slots = centers(itemPlots);
  const addSlots = centers(addPlots);
  const trees = centers(treePlots);

  // Pasture mode: scatter trees across the (now grass) gap cells between plots,
  // thinned to a checker and kept clear of any item / add lot so they never
  // crowd a city.
  if (!roads) {
    const occupied = [...slots, ...addSlots];
    for (let y = 1; y < gridRows - 1; y += 1) {
      for (let x = 1; x < gridCols - 1; x += 1) {
        if (!(x % 3 === 0 || y % 3 === 0)) continue; // gap cells only (between plots)
        if (water.has(key(x, y))) continue;
        if ((x + y) % 2 !== 0) continue; // thin out so it reads as pasture, not forest
        if (occupied.some((s) => Math.hypot(s.cx - x, s.cy - y) < 2.3)) continue;
        trees.push({ cx: x, cy: y });
      }
    }
  }

  // Ground tiles.
  const tiles = [];
  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      const type = water.has(key(x, y)) ? 'water' : (roads && isRoadCell(x, y)) ? 'road' : 'grass';
      tiles.push({ x, y, type });
    }
  }

  // Normalize to positive pixel coords that fit the canvas.
  const raw = tiles.map((t) => isoToScreen([t.x, t.y], { tileW: TILE_W, tileH: TILE_H }));
  const minLeft = Math.min(...raw.map((p) => p.left));
  const minTop = Math.min(...raw.map((p) => p.top));
  const offX = -minLeft + PAD;
  const offY = -minTop + PAD + TOP_CLEARANCE;
  const place = (cx, cy) => {
    const p = isoToScreen([cx, cy], { tileW: TILE_W, tileH: TILE_H });
    return { left: p.left + offX, top: p.top + offY, z: Math.round(100 + (cx + cy) * 10) };
  };

  // Ambient traffic: a few cars that loop along road lanes (roads mode only).
  // A car drives from off one edge to off the other along a road row/col; its
  // facing sprite matches the iso travel direction (+x→SE, -x→NW, +y→SW, -y→NE).
  const car = (sprite, a, b, dur, delay) => {
    const s = place(a[0], a[1]);
    const e = place(b[0], b[1]);
    return { sprite, left: s.left, top: s.top, z: s.z, dx: e.left - s.left, dy: e.top - s.top, dur, delay };
  };
  // Negative delays start each car partway along its route, so they begin already
  // on the grid and moving (a positive delay would park them off-grid first).
  const cars = roads ? [
    car('taxi-se', [-1, 3], [gridCols, 3], 9, -3),
    car('taxi-nw', [gridCols, 6], [-1, 6], 10.5, -6),
    car('police-sw', [3, -1], [3, gridRows], 11, -3),
    car('police-ne', [6, gridRows], [6, -1], 9.5, -5),
  ] : [];

  // Pedestrians strolling the sidewalks — same lane idea as cars but much slower,
  // nudged just off the road centre (perpY) onto the kerb, and emoji rather than
  // sprites (swap to real character sprites later). Roads mode only.
  const ped = (shirt, a, b, dur, delay, perpY = 0, courier = false) => {
    const s = place(a[0], a[1]);
    const e = place(b[0], b[1]);
    return { shirt, left: s.left, top: s.top + perpY, z: s.z, dx: e.left - s.left, dy: e.top - s.top, dur, delay, courier };
  };
  // A few citizens stroll the lanes (proper walk cycle in App.css); one is a
  // courier carrying a parcel between blocks.
  const peds = roads ? [
    ped('#c14b8a', [-1, 3], [gridCols, 3], 26, -8, 12),
    ped('#2f9e6f', [gridCols, 6], [-1, 6], 29, -15, -12),
    ped('#c9a227', [3, gridRows], [3, -1], 32, -11, 0),
    ped('#3b6fb0', [6, -1], [6, gridRows], 27, -20, 0),
    ped('#7a5cc0', [-1, 6], [gridCols, 6], 24, -4, 12),
    ped('#b5651d', [gridCols, 3], [-1, 3], 22, -12, -12, true), // courier
  ] : [];

  // Street lamps at a checker of road intersections (roads mode only). Their glow
  // fades on/off in sync with the day/night cycle — see `.lamp-glow` (App.css),
  // which runs the same 100s timeline as the `.iso-night` overlay.
  const lamps = [];
  if (roads) {
    for (let yi = 0, y = 0; y <= gridRows - 1; y += 3, yi += 1) {
      for (let xi = 0, x = 0; x <= gridCols - 1; x += 3, xi += 1) {
        if ((xi + yi) % 2 === 0) lamps.push(place(x, y));
      }
    }
  }

  const ground = tiles.map((t) => {
    const p = isoToScreen([t.x, t.y], { tileW: TILE_W, tileH: TILE_H });
    return { ...t, left: p.left + offX, top: p.top + offY, z: t.x + t.y };
  });
  const maxLeft = Math.max(...ground.map((c) => c.left));
  const maxTop = Math.max(...ground.map((c) => c.top));
  return {
    ground,
    slots: slots.map((s) => place(s.cx, s.cy)),
    addSlots: addSlots.map((s) => place(s.cx, s.cy)),
    trees: trees.map((s) => place(s.cx, s.cy)),
    cars,
    peds,
    lamps,
    width: maxLeft + TILE_W + PAD,
    height: maxTop + TILE_H + PAD,
  };
}

// Builds the BUILDING LOT scene — a roofless office floor with desks, standing in
// its own fenced yard. Used by the citizens view (the "person screen"): each agent
// owns a desk inside, and walks a looping path around the yard while idle (the
// view seats them only while a run is in flight). Desks are laid in tidy rows of
// paired pods (two adjacent desks per pod, an aisle between pods and between
// rows); one empty desk is always reserved for the "add citizen" lot.
//
// Coordinates are YARD-relative: the building floor sits inset by YARD_M tiles on
// every side, so tile (0,0) is the far corner of the grass, not of the floor.
const YARD_M = 4;                      // tiles of yard around the building
export function buildInterior(count, { perRow = 4 } = {}) {
  const items = Math.max(count, 0);
  const total = items + 1; // + the add lot
  // Within a row of `perRow`, agents are grouped into pods of 2 (cols 0-1, 2-3…);
  // pods are 5 cells apart, the two desks in a pod 2 apart; rows are 3 apart.
  const deskCell = (k) => {
    const c = k % perRow;
    const r = Math.floor(k / perRow);
    return [1 + Math.floor(c / 2) * 5 + (c % 2) * 2, 1 + r * 3];
  };
  const allCells = Array.from({ length: total }, (_, k) => deskCell(k));
  const bCols = Math.max(...allCells.map((c) => c[0])) + 2;   // building footprint
  const bRows = Math.max(...allCells.map((c) => c[1])) + 2;
  const gridCols = bCols + YARD_M * 2;                        // whole lot
  const gridRows = bRows + YARD_M * 2;
  const inBuilding = (x, y) => x >= YARD_M && y >= YARD_M && x < YARD_M + bCols && y < YARD_M + bRows;

  const slots = [];
  for (let k = 0; k < items; k += 1) { const [x, y] = deskCell(k); slots.push({ cx: YARD_M + x + 0.5, cy: YARD_M + y + 0.5 }); }
  const [ax, ay] = deskCell(items);
  const addSlots = [{ cx: YARD_M + ax + 0.5, cy: YARD_M + ay + 0.5 }];

  // Decorative potted plants in the four INDOOR corners (never a desk).
  const propCells = [
    { cx: YARD_M + 0.5, cy: YARD_M + 0.5 },
    { cx: YARD_M + bCols - 0.5, cy: YARD_M + 0.5 },
    { cx: YARD_M + 0.5, cy: YARD_M + bRows - 0.5 },
    { cx: YARD_M + bCols - 0.5, cy: YARD_M + bRows - 0.5 },
  ];

  // The walkway leaves the building's front corner and runs straight down-screen
  // (x and y both +1 per step is vertical in iso) to the gate in the fence.
  const pathCells = new Set();
  for (let k = 1; k <= YARD_M; k += 1) pathCells.add(`${YARD_M + bCols - 1 + k},${YARD_M + bRows - 1 + k}`);

  const tiles = [];
  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      const type = inBuilding(x, y) ? 'floor' : (pathCells.has(`${x},${y}`) ? 'yardpath' : 'grass');
      tiles.push({ x, y, type });
    }
  }

  const raw = tiles.map((t) => isoToScreen([t.x, t.y], { tileW: TILE_W, tileH: TILE_H }));
  const minLeft = Math.min(...raw.map((p) => p.left));
  const minTop = Math.min(...raw.map((p) => p.top));
  const offX = -minLeft + PAD;
  const offY = -minTop + PAD + TOP_CLEARANCE;
  const place = (cx, cy) => {
    const p = isoToScreen([cx, cy], { tileW: TILE_W, tileH: TILE_H });
    return { left: p.left + offX, top: p.top + offY, z: Math.round(100 + (cx + cy) * 10) };
  };
  const ground = tiles.map((t) => {
    const p = isoToScreen([t.x, t.y], { tileW: TILE_W, tileH: TILE_H });
    return { ...t, left: p.left + offX, top: p.top + offY, z: t.x + t.y };
  });

  // Two back walls rising from the FLOOR's far edges (the iso "room"). Each is a
  // parallelogram given by its 4 screen-space corners; the view clips a div to it.
  const tileBox = (x, y) => { const p = isoToScreen([x, y], { tileW: TILE_W, tileH: TILE_H }); return { left: p.left + offX, top: p.top + offY }; };
  const WH = 66; // wall height (px)
  const t00 = tileBox(YARD_M, YARD_M);
  const tR = tileBox(YARD_M + bCols - 1, YARD_M);
  const tL = tileBox(YARD_M, YARD_M + bRows - 1);
  const topV = { x: t00.left + TILE_W / 2, y: t00.top };
  const rightV = { x: tR.left + TILE_W, y: tR.top + TILE_H / 2 };
  const leftV = { x: tL.left, y: tL.top + TILE_H / 2 };
  // Walls take the painter's-order z of the building's BACK corner — the tile they
  // stand on. That puts them over the grass behind, and under everything in front
  // (desks, plants, the yard trees flanking the building), which is what reads
  // correctly. Strollers are the one exception: they ride a motion path, so their
  // z is fixed and they pass in front of a wall even when rounding the back. The
  // walls are low and the moment is brief — much less jarring than a wall
  // permanently covering a tree that stands in front of it.
  const wallZ = place(YARD_M, YARD_M).z;
  const walls = [
    { side: 'right', z: wallZ, pts: [topV, rightV, { x: rightV.x, y: rightV.y - WH }, { x: topV.x, y: topV.y - WH }] },
    { side: 'left', z: wallZ, pts: [topV, leftV, { x: leftV.x, y: leftV.y - WH }, { x: topV.x, y: topV.y - WH }] },
  ];

  // Fence posts around the lot's outer ring, with a gate where the walkway exits.
  const gate = `${gridCols - 1},${gridRows - 1}`;
  const fence = [];
  for (let x = 0; x < gridCols; x += 1) {
    for (const y of [0, gridRows - 1]) {
      if (`${x},${y}` === gate) continue;
      fence.push({ ...place(x + 0.5, y + 0.5), side: y === 0 ? 'back' : 'front' });
    }
  }
  for (let y = 1; y < gridRows - 1; y += 1) {
    for (const x of [0, gridCols - 1]) {
      if (`${x},${y}` === gate) continue;
      fence.push({ ...place(x + 0.5, y + 0.5), side: x === 0 ? 'left' : 'right' });
    }
  }

  // Yard scenery on the grass. Kept to ring 1 — just inside the fence and OUTSIDE
  // the stroll loop (inset 1.5) — so nobody walks through a tree and no canopy
  // overhangs the floor. Never on the walkway or under the building.
  const yardTrees = [];
  const treeCells = [
    [1, 1], [gridCols - 2, 1], [1, gridRows - 2], [gridCols - 2, gridRows - 2],
    [1, Math.floor(gridRows / 2)], [gridCols - 2, Math.floor(gridRows / 2)],
    [Math.floor(gridCols / 2), 1],
  ];
  for (const [x, y] of treeCells) {
    if (x < 0 || y < 0 || x >= gridCols || y >= gridRows) continue;
    if (inBuilding(x, y) || pathCells.has(`${x},${y}`)) continue;
    yardTrees.push(place(x + 0.5, y + 0.5));
  }

  // A closed loop through the yard, encircling the building — walkers follow it as
  // a CSS motion path (offset-path), so they round the corners smoothly and never
  // jump back at the end. Straight lines in tile space stay straight on screen, so
  // the four corners are enough. Inset half a tile off the fence.
  const ringPts = [
    [YARD_M - 1.5, YARD_M - 1.5],
    [YARD_M + bCols + 0.5, YARD_M - 1.5],
    [YARD_M + bCols + 0.5, YARD_M + bRows + 0.5],
    [YARD_M - 1.5, YARD_M + bRows + 0.5],
  ].map(([cx, cy]) => { const p = place(cx, cy); return `${Math.round(p.left)} ${Math.round(p.top)}`; });
  const walkLoop = `M ${ringPts.join(' L ')} Z`;

  const maxLeft = Math.max(...ground.map((c) => c.left));
  const maxTop = Math.max(...ground.map((c) => c.top));
  return {
    ground,
    slots: slots.map((s) => place(s.cx, s.cy)),
    addSlots: addSlots.map((s) => place(s.cx, s.cy)),
    props: propCells.map((s) => place(s.cx, s.cy)),
    walls,
    fence,
    walkLoop,
    trees: yardTrees,      // IsoScene already paints scene.trees with the iso tree
    cars: [],
    peds: [],
    width: maxLeft + TILE_W + PAD,
    height: maxTop + TILE_H + PAD,
  };
}
