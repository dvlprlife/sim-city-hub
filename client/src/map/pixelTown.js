// Deterministic pixel-town layout for the (optional) pixel-art Buildings view.
// World-space geometry only — the renderer (CityBuildingsPixel) draws it under a
// pan/zoom camera. Deterministic from the building count, like cityscape.js's
// buildRotaryTown, so a city renders identically across re-renders. Theme-confined
// (a map/ file); holds positions, not art.

export const ROAD_BASE_Y = 358;     // average top of the meandering street
const MARGIN = 200;                 // x of the first house / left/right padding
const STEP = 300;                   // x spacing between houses
const HOUSE_RISE = 36;              // how far above the road a house sits
const WORLD_H = 840;

// The gentle wave the renderer draws the road along — single source of truth so
// houses, path stubs and the road all agree.
export function roadY(x, baseY = ROAD_BASE_Y) {
  return baseY + 26 * Math.sin((x / 1300) * Math.PI * 2) + 12 * Math.sin(x / 470);
}

export function buildPixelTown(count) {
  const n = Math.max(0, count | 0);
  const addX = MARGIN + n * STEP;                 // the "+ add" lot sits one past the last house
  const worldW = Math.max(1560, addX + MARGIN);

  let seed = 1234 + n * 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  const houses = [];
  for (let i = 0; i < n; i += 1) {
    const x = MARGIN + i * STEP;
    houses.push({ index: i, x, yBottom: Math.round(roadY(x) - HOUSE_RISE) });
  }
  const addLot = { x: addX, yBottom: Math.round(roadY(addX) - HOUSE_RISE) };

  // a short fence between each pair of adjacent houses, on the grass verge
  const fences = [];
  for (let i = 0; i < n - 1; i += 1) {
    const mx = (houses[i].x + houses[i + 1].x) / 2;
    const yTop = Math.min(houses[i].yBottom, houses[i + 1].yBottom) - 8;
    fences.push({ x: mx - 48, yTop, n: 0 });
  }
  // trees: tucked between houses but ON THE GRASS VERGE (well above the road), plus
  // a few in the foreground — never on the path.
  const trees = [];
  for (let i = 0; i < n - 1; i += 1) {
    const mx = (houses[i].x + houses[i + 1].x) / 2;
    trees.push({ kind: rnd() < 0.5 ? 'tree1' : 'tree2', x: mx, y: Math.round(roadY(mx) - 70), phase: rnd() });
  }
  const fgTrees = Math.min(5, 2 + (n >> 1));
  for (let i = 0; i < fgTrees; i += 1) trees.push({ kind: rnd() < 0.5 ? 'tree1' : 'tree2', x: 70 + rnd() * (worldW - 140), y: 500 + rnd() * 150, phase: rnd() });

  // ground scatter (flowers / a few mushrooms+rocks) across the foreground grass
  const scatter = [];
  const kinds = ['sunflower', 'sunflower', 'mushroomR', 'rock'];
  const scount = Math.min(26, 10 + n * 2);
  for (let i = 0; i < scount; i += 1) {
    scatter.push({ kind: kinds[Math.floor(rnd() * kinds.length)], x: 40 + rnd() * (worldW - 80), y: 470 + rnd() * 320, flip: rnd() < 0.5, phase: rnd() });
  }

  // two ponds (ducks paddle on the second), a crop garden, a few animals,
  // and an ambient walker — all in the foreground band (below the houses).
  const ponds = [
    { x: Math.round(worldW * 0.72), yBottom: 800, scale: 2.2, flip: false },
    { x: Math.round(worldW * 0.30), yBottom: 825, scale: 2.0, flip: true },
  ];
  const farm = { x0: 70, y0: 690 };
  const animals = [
    { kind: 'chicken', x: Math.round(worldW * 0.46), y: 560, flip: false, fps: 5, phase: 0 },
    { kind: 'chicken', x: Math.round(worldW * 0.49), y: 575, flip: true, fps: 5, phase: 0.4 },
    { kind: 'pig', x: Math.round(worldW * 0.60), y: 600, flip: true, fps: 4, phase: 0 },
    { kind: 'cow', x: Math.round(worldW * 0.80), y: 560, flip: true, fps: 3, phase: 0 },
    { kind: 'sheep', x: Math.round(worldW * 0.84), y: 580, flip: false, fps: 3, phase: 0.3 },
  ];
  // A looping foot ROUTE around the village so citizens wander a circuit instead
  // of pacing a straight line. It is kept entirely on the road — the only
  // obstacle-free surface — running the front edge L->R then the back edge R->L
  // (both within the ~96px road band, in front of the houses), so walkers never
  // cross houses, fences, trees, ponds or the farm. Points sample the meandering
  // roadY so the path hugs the curving street.
  const ambient = [];
  if (n >= 1) {
    const xL = houses[0].x - 90;
    const xR = addX + 90;
    const route = [];
    for (let x = xL; x <= xR; x += 80) route.push({ x, y: roadY(x) + 76 });   // front edge, walking right
    for (let x = xR; x >= xL; x -= 80) route.push({ x, y: roadY(x) + 20 });   // back edge, walking left
    ambient.push({ state: 'walk', route, period: 46, fps: 9, t0: 0 });
    ambient.push({ state: 'walk', route, period: 46, fps: 8, t0: 23 });        // half a lap behind
  }
  // A windmill out past the right edge of the village: a stone mill house with the
  // rotor (the sprite is sails-only — no tower) mounted on its upper front wall.
  // The rotor's x is NOT millX: the mill's harvested canvas is 80 src px wide but
  // its opaque tower only spans src x 40..71, so the visible tower centres at
  // src 55.5 — i.e. 15.5 src px right of the canvas centre the building is drawn
  // about, = +34.1 world px at BS 2.2. The rotor sprite's hub is 0.5 src px left
  // of its own 112px frame centre (= -1.1 world px at scale 2.2), so anchoring the
  // hub on the tower centre gives millX + 34.1 + 1.1 ≈ +35.
  const millX = worldW - 150;
  const landmark = {
    kind: 'windmill',
    building: { key: 'mill', x: millX, yBottom: 470 },
    rotor: { x: millX + 35, y: 438, scale: 2.2 },   // hub centred on the tower, ~y315 on its upper wall
  };

  return { worldW, worldH: WORLD_H, houses, addLot, trees, fences, scatter, ponds, farm, animals, ambient, landmark };
}
