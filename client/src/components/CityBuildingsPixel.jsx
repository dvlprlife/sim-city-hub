import { useEffect, useRef } from 'react';
import { buildPixelTown, roadY } from '../map/pixelTown.js';

// THEMED VIEW #1b (pixel-art) — inside one city, an OPTIONAL pixel-art top-down
// town rendered on a <canvas> from the Sunnyside CC-pack spritesheets. Same prop
// contract as CityBuildings: each house = one building (click to enter), a blank
// lot to add one, an activity glow + a hammering citizen while an agent runs.
// Props: { city, buildings, selectedBuildingId, onSelectBuilding(buildingId) }
//   plus additive buildingCounts[`${cityId}::${buildingId}`] = { running, queued }
//   + onAddBuilding(). Theme art confined here + map/pixelTown.js + CSS.
//
// The Sunnyside pack (and room1.json) is git-ignored — its licence forbids
// redistribution. This component is lazy-loaded and only mounted when the assets
// are detected (useSunnysideAvailable); it fetches them at runtime. Houses are
// "harvested" from the pack's demo room (room1.json) into offscreen canvases.

const S = 3;                          // world-px → render-px scale
const BASE = '/assets/sunnyside';
const BS = 2.2;                       // building scale
const TILE_EMPTY = -2147483648;
const STRUCT_LAYERS = ['walls', 'building'];
// NOTE: tile 2194 was previously dropped here as a "magenta X placeholder". It is
// NOT a placeholder — it is the RED roof-fill tile, one of a family that carries an
// X lattice motif (1170 green, 2706 purple, ...), and dropping it punched holes in
// every red roof: room1 uses it 10x, inside redSm, purpleSm and [17,33,11,6] only.
// Those holes showed the ground through the roof. Do not re-add it.
const GRASS = { sx: 16, sy: 48 };     // base grass tile (matches the room's grass)
const POND_DEF = [35, 8, 8, 4];       // tile rect of a roundish pond in room1
const PATH_DEF = [41, 31, 4, 2];      // tile rect of a straight dirt road in room1
const MILL_DEF = [38, 14, 5, 6];      // stone building harvested as the windmill's mill house
const FENCE = { left: 166, mid: 167, right: 170 };
const DRAG_SLOP = 5;                  // px before a press becomes a pan

// Curated catalog of clean, well-proportioned single houses, each a
// [tileX,tileY,tilesW,tilesH] rect harvested (structure-only) from room1's tile
// layers. Buildings hash onto these by index, so the key ORDER also nudges which
// house a given building lands on. Deliberately EXCLUDED variants:
//   - green / greenSm (pale lattice-green roof, room1 tile 1170): that green reads
//     as grass against our grass ground, so the house looks like a hole in the lawn.
//   - blueWide (9x6 glass office), redTall (4x9 grey stone tower), blueTall (5x9 —
//     its harvest also bleeds a neighbouring structure): oversized / not cozy / broken.
//   - redstone (5x6 narrow stone tower): reads as "too big" beside the cottages.
// Everything here is 4x4..6x6 with a roof that contrasts with the grass.
const HOUSES = {
  purple: [13, 26, 6, 6], red: [71, 41, 4, 5], redSm: [30, 26, 4, 4],
  blue: [54, 0, 5, 4], purpleSm: [76, 39, 4, 6], cyan: [50, 6, 6, 4],
  orange: [55, 31, 6, 4],
};
const HOUSE_KEYS = Object.keys(HOUSES);

const manifest = {
  tileset: `${BASE}/tileset/spr_tileset_sunnysideworld_16px.png`,
  idle_base: `${BASE}/human/IDLE/base_idle_strip9.png`,
  idle_hair: `${BASE}/human/IDLE/shorthair_idle_strip9.png`,
  idle_tools: `${BASE}/human/IDLE/tools_idle_strip9.png`,
  walk_base: `${BASE}/human/WALKING/base_walk_strip8.png`,
  walk_hair: `${BASE}/human/WALKING/shorthair_walk_strip8.png`,
  walk_tools: `${BASE}/human/WALKING/tools_walk_strip8.png`,
  ham_base: `${BASE}/human/HAMMERING/base_hamering_strip23.png`,
  ham_hair: `${BASE}/human/HAMMERING/shorthair_hamering_strip23.png`,
  ham_tools: `${BASE}/human/HAMMERING/tools_hamering_strip23.png`,
  wat_base: `${BASE}/human/WATERING/base_watering_strip5.png`,
  wat_hair: `${BASE}/human/WATERING/shorthair_watering_strip5.png`,
  wat_tools: `${BASE}/human/WATERING/tools_watering_strip5.png`,
  tree1: `${BASE}/plants/spr_deco_tree_01_strip4.png`,
  tree2: `${BASE}/plants/spr_deco_tree_02_strip4.png`,
  windmill: `${BASE}/other/spr_deco_windmill_strip9.png`,
  smoke: `${BASE}/vfx/chimneysmoke_01_strip30.png`,
  chicken: `${BASE}/animals/spr_deco_chicken_01_strip4.png`,
  cow: `${BASE}/animals/spr_deco_cow_strip4.png`,
  sheep: `${BASE}/animals/spr_deco_sheep_01_strip4.png`,
  bird: `${BASE}/animals/spr_deco_bird_01_strip4.png`,
  pig: `${BASE}/animals/spr_deco_pig_01_strip4.png`,
  duck: `${BASE}/animals/spr_deco_duck_01_strip4.png`,
  mushroomR: `${BASE}/props/spr_deco_mushroom_red_01_strip4.png`,
  rock: `${BASE}/crops/rock.png`,
  sunflower: `${BASE}/crops/sunflower_05.png`,
  pumpkin: `${BASE}/crops/pumpkin_05.png`,
  cabbage: `${BASE}/crops/cabbage_05.png`,
  wheat: `${BASE}/crops/wheat_05.png`,
  soil: `${BASE}/crops/soil_00.png`,
};

const CH = { w: 96, h: 64 };                                  // human frame size
const STATE = { idle: 9, walk: 8, ham: 23, wat: 5 };          // frames per state
const FR = {
  tree1: { n: 4, w: 32, h: 34 }, tree2: { n: 4, w: 28, h: 43 },
  windmill: { n: 9, w: 112, h: 112 }, smoke: { n: 30, w: 15, h: 37 },
  chicken: { n: 4, w: 32, h: 32 }, cow: { n: 4, w: 32, h: 32 }, sheep: { n: 4, w: 32, h: 32 },
  bird: { n: 4, w: 16, h: 16 }, pig: { n: 4, w: 32, h: 32 }, duck: { n: 4, w: 16, h: 16 },
  mushroomR: { n: 4, w: 16, h: 16 },
};
const ST = { rock: [10, 10], sunflower: [13, 16], pumpkin: [12, 14], cabbage: [12, 11], wheat: [13, 13], soil: [16, 12] };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }
function houseKeyFor(b) { return HOUSE_KEYS[hashStr(String(b.sprite || b.id || '')) % HOUSE_KEYS.length]; }

export default function CityBuildingsPixel({ city, buildings, selectedBuildingId, onSelectBuilding, buildingCounts = {}, onAddBuilding }) {
  const canvasRef = useRef(null);
  const apiRef = useRef(null);
  const propsRef = useRef(null);
  propsRef.current = {
    cityId: city?.id, buildings: buildings || [], selectedBuildingId,
    onSelectBuilding, buildingCounts: buildingCounts || {}, onAddBuilding,
  };

  // Recompute the town layout when the building count changes (without restarting
  // the render loop — the loop reads the live layout via the engine).
  const count = (buildings || []).length;
  useEffect(() => { apiRef.current?.rebuild(); }, [count]);

  useEffect(() => {
    const C = canvasRef.current; if (!C) return undefined;
    const X = C.getContext('2d'); X.imageSmoothingEnabled = false;

    // ---- engine state (replaces the prototype's module globals) ----
    const cam = { x: 0, y: 0, z: 1 };
    const IMG = {};
    const houseCanvas = {};
    let pathCanvas = null, pathVCanvas = null, pondCanvas = null;
    let layout = buildPixelTown(propsRef.current.buildings.length);
    let WORLD_W = layout.worldW, WORLD_H = layout.worldH;
    let hitRects = [], addRect = null;
    let ready = false, raf = 0, start = null, drag = null, alive = true;

    const fitZoom = () => Math.min(C.width / WORLD_W, C.height / WORLD_H);
    const minZoom = () => fitZoom() * 0.5; // allow zooming out past "fit" for breathing room
    function clampCam() {
      cam.z = clamp(cam.z, minZoom(), 3.2);
      const ww = WORLD_W * cam.z, wh = WORLD_H * cam.z;
      cam.x = ww <= C.width ? (C.width - ww) / 2 : clamp(cam.x, C.width - ww, 0);
      cam.y = wh <= C.height ? (C.height - wh) / 2 : clamp(cam.y, C.height - wh, 0);
    }
    // Frame the village nicely on entry: zoom so ~600px of vertical scene fills the
    // view, centred on the house row (not the whole empty world fit-to-screen).
    function home() {
      const hs = layout.houses;
      const right = propsRef.current.onAddBuilding ? layout.addLot.x : (hs[hs.length - 1]?.x ?? WORLD_W / 2);
      const cxw = hs.length ? (hs[0].x + right) / 2 : WORLD_W / 2;
      const cyw = 400;
      cam.z = clamp(C.height / 620, minZoom(), 1.4);
      cam.x = C.width / 2 - cxw * cam.z;
      cam.y = C.height / 2 - cyw * cam.z;
      clampCam();
    }

    // ---- ported draw helpers (operate on ctx X) ----
    function drawFrame(img, fw, fh, frame, ax, ay, scale, flip) {
      if (!img || !img.width) return;
      const dw = fw * scale, dh = fh * scale;
      X.save(); X.translate(ax, ay); if (flip) X.scale(-1, 1);
      X.drawImage(img, frame * fw, 0, fw, fh, -dw / 2, -dh, dw, dh); X.restore();
    }
    const anim = (n, fps, t) => Math.floor(t * fps) % n;
    // Position along a closed polyline route at fraction `frac` (loops). Returns the
    // world point plus dx (travel direction, for facing). Route is small (~40 pts),
    // so recomputing segment lengths per frame is cheap.
    function routePos(route, frac) {
      let total = 0; const seg = [];
      for (let i = 0; i < route.length; i += 1) { const a = route[i], b = route[(i + 1) % route.length]; const L = Math.hypot(b.x - a.x, b.y - a.y); seg.push(L); total += L; }
      let d = (((frac % 1) + 1) % 1) * total;
      for (let i = 0; i < route.length; i += 1) {
        if (d <= seg[i] || i === route.length - 1) { const a = route[i], b = route[(i + 1) % route.length]; const u = seg[i] ? d / seg[i] : 0; return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, dx: b.x - a.x }; }
        d -= seg[i];
      }
      return { x: route[0].x, y: route[0].y, dx: 1 };
    }
    const stat = (key, x, y, scale, flip) => drawFrame(IMG[key], ST[key][0], ST[key][1], 0, x, y, scale, flip);
    function roundRect(x, y, w, h, r) { X.beginPath(); X.moveTo(x + r, y); X.arcTo(x + w, y, x + w, y + h, r); X.arcTo(x + w, y + h, x, y + h, r); X.arcTo(x, y + h, x, y, r); X.arcTo(x, y, x + w, y, r); X.closePath(); }
    function label(text, cx, topY, counts) {
      X.font = '600 13px system-ui, sans-serif';
      const running = counts?.running || 0, queued = counts?.queued || 0, total = running + queued;
      const badge = total > 0 ? `  ${running > 0 ? '● ' : ''}${total}` : '';
      const w = X.measureText(text + badge).width + 14;
      X.fillStyle = 'rgba(16,22,28,0.82)'; roundRect(cx - w / 2, topY, w, 20, 6); X.fill();
      X.textAlign = 'center'; X.textBaseline = 'middle';
      if (badge) {
        X.fillStyle = '#eaf3ea'; X.fillText(text, cx - X.measureText(badge).width / 2, topY + 10);
        X.fillStyle = running > 0 ? '#ff6b6b' : '#ffd166';
        X.fillText(badge, cx + X.measureText(text).width / 2, topY + 10);
      } else {
        X.fillStyle = '#eaf3ea'; X.fillText(text, cx, topY + 10);
      }
    }
    function citizen(state, t, x, y, flip, fps, name) {
      const f = anim(STATE[state], fps, t);
      const footY = y + 4 * S;
      drawFrame(IMG[`${state}_base`], CH.w, CH.h, f, x, footY, S, flip);
      drawFrame(IMG[`${state}_hair`], CH.w, CH.h, f, x, footY, S, flip);
      drawFrame(IMG[`${state}_tools`], CH.w, CH.h, f, x, footY, S, flip);
      if (name) label(name, x, y - 60 * S);
    }
    function ground() {
      const ts = IMG.tileset, sz = 16 * S;
      X.fillStyle = '#6cae3e'; X.fillRect(0, 0, WORLD_W, WORLD_H);
      for (let gy = 0; gy < WORLD_H; gy += sz) for (let gx = 0; gx < WORLD_W; gx += sz)
        X.drawImage(ts, GRASS.sx, GRASS.sy, 16, 16, gx, gy, sz, sz);
    }
    const liveTile = (v) => v !== undefined && v !== TILE_EMPTY && v !== 0;
    function putTile(g, ts, COLS, v, dx, dy, T) {
      if (!liveTile(v)) return;
      const id = v & 0x0FFFFFFF, mir = v & 0x10000000, fly = v & 0x20000000, rot = v & 0x40000000;
      g.save(); g.translate(dx + T / 2, dy + T / 2);
      if (rot) g.rotate(Math.PI / 2); g.scale(mir ? -1 : 1, fly ? -1 : 1);
      g.drawImage(ts, (id % COLS) * T, ((id / COLS) | 0) * T, T, T, -T / 2, -T / 2, T, T); g.restore();
    }
    function harvest(room, layers, [tx, ty, tw, th]) {
      const T = room.tileW, COLS = room.cols, ts = IMG.tileset;
      const cv = document.createElement('canvas'); cv.width = tw * T; cv.height = th * T;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      for (const name of layers) {
        const L = room.layers[name]; if (!L) continue;
        for (let yy = 0; yy < th; yy++) for (let xx = 0; xx < tw; xx++)
          putTile(g, ts, COLS, L.data[(ty + yy) * L.w + (tx + xx)], xx * T, yy * T, T);
      }
      return cv;
    }
    function buildHouses(room) { for (const [key, rect] of Object.entries(HOUSES)) houseCanvas[key] = harvest(room, STRUCT_LAYERS, rect); }
    function buildPond(room) { pondCanvas = harvest(room, ['land'], POND_DEF); }
    function buildPath(room) {
      pathCanvas = harvest(room, ['land', 'paths'], PATH_DEF);
      const vc = document.createElement('canvas'); vc.width = pathCanvas.height; vc.height = pathCanvas.width;
      const vg = vc.getContext('2d'); vg.imageSmoothingEnabled = false;
      vg.translate(vc.width / 2, vc.height / 2); vg.rotate(Math.PI / 2);
      vg.drawImage(pathCanvas, -pathCanvas.width / 2, -pathCanvas.height / 2);
      pathVCanvas = vc;
    }
    function building(key, x, yBottom) {
      const cv = houseCanvas[key]; if (!cv) return;
      const dw = cv.width * BS, dh = cv.height * BS;
      X.save(); X.fillStyle = 'rgba(0,0,0,0.16)'; X.beginPath();
      X.ellipse(x, yBottom - 6 * BS, dw * 0.44, 11 * BS, 0, 0, Math.PI * 2); X.fill(); X.restore();
      X.drawImage(cv, x - dw / 2, yBottom - dh, dw, dh);
    }
    function road() {
      if (!pathCanvas) return;
      const tile = pathCanvas.width / 4, sh = pathCanvas.height, dw = tile * S, dh = sh * S;
      // Contain the road to the village span (with grass margins) so it doesn't
      // run off the edges of the world.
      const first = layout.houses[0]?.x ?? 200;
      const lastAnchor = propsRef.current.onAddBuilding ? layout.addLot.x : (layout.houses[layout.houses.length - 1]?.x ?? first);
      const startX = first - 130, endX = lastAnchor + 130;
      let col = 0;
      for (let x = startX; x < endX; x += dw) { X.drawImage(pathCanvas, (col % 4) * tile, 0, tile, sh, x, roadY(x), dw, dh); col += 1; }
    }
    function pond(x, yBottom, scale, flip) {
      if (!pondCanvas) return;
      const dw = pondCanvas.width * scale, dh = pondCanvas.height * scale;
      X.save(); X.translate(x - dw / 2, yBottom - dh);
      if (flip) { X.translate(dw, 0); X.scale(-1, 1); }
      X.drawImage(pondCanvas, 0, 0, dw, dh); X.restore();
    }
    function pathStub(cx, doorY) {
      if (!pathVCanvas) return;
      const w = pathVCanvas.width * S, h = pathVCanvas.height * S, yEnd = roadY(cx) + 64;
      X.save(); X.beginPath(); X.rect(cx - w / 2, doorY, w, Math.max(0, yEnd - doorY)); X.clip();
      for (let y = doorY; y < yEnd; y += h) X.drawImage(pathVCanvas, cx - w / 2, y, w, h);
      X.restore();
    }
    function tileById(id, dx, dyTop, scale) { X.drawImage(IMG.tileset, (id % 64) * 16, ((id / 64) | 0) * 16, 16, 16, dx, dyTop, 16 * scale, 16 * scale); }
    function fenceRun(x, yTop, n) {
      const w = 16 * S; let cx = x;
      tileById(FENCE.left, cx, yTop, S); cx += w;
      for (let i = 0; i < n; i += 1) { tileById(FENCE.mid, cx, yTop, S); cx += w; }
      tileById(FENCE.right, cx, yTop, S);
    }
    function farm(x0, y0) {
      const colW = ST.soil[0] * S, rowH = ST.soil[1] * S, cols = 5, rows = 3;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) X.drawImage(IMG.soil, x0 + c * colW, y0 + r * rowH, colW, rowH);
      const crop = ['wheat', 'cabbage', 'pumpkin', 'sunflower']; let i = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if ((r + c) % 2 !== 0) continue; stat(crop[i++ % crop.length], x0 + c * colW + colW / 2, y0 + r * rowH + rowH * 0.9, S, false); }
    }

    // ---- layout / hit-testing ----
    function houseSize(key) { const cv = houseCanvas[key]; return cv ? { dw: cv.width * BS, dh: cv.height * BS } : { dw: 176, dh: 150 }; }
    function rebuild() {
      layout = buildPixelTown(propsRef.current.buildings.length);
      WORLD_W = layout.worldW; WORLD_H = layout.worldH;
      const list = propsRef.current.buildings;
      layout.houses.forEach((h, i) => { const b = list[i]; if (b) { h.b = b; h.key = houseKeyFor(b); } });
      if (ready) { computeHits(); clampCam(); }
    }
    function computeHits() {
      const list = propsRef.current.buildings;
      hitRects = [];
      layout.houses.forEach((h, i) => {
        const b = list[i]; if (!b) return;
        const key = h.key || houseKeyFor(b); h.key = key; h.b = b;
        const { dw, dh } = houseSize(key);
        hitRects.push({ id: b.id, x: h.x - dw / 2, y: h.yBottom - dh, w: dw, h: dh });
      });
      const a = layout.addLot;
      addRect = propsRef.current.onAddBuilding ? { x: a.x - 72, y: a.yBottom - 130, w: 144, h: 130 } : null;
    }
    apiRef.current = { rebuild };

    function drawAddLot() {
      const a = layout.addLot, w = 16 * S;
      fenceRun(a.x - w * 1.5, a.yBottom - 40, 1);
      X.save(); X.fillStyle = 'rgba(20,28,24,0.5)'; X.beginPath();
      X.ellipse(a.x, a.yBottom - 6, 60, 12, 0, 0, Math.PI * 2); X.fill(); X.restore();
      X.fillStyle = 'rgba(255,255,255,0.85)'; X.font = '700 40px system-ui, sans-serif';
      X.textAlign = 'center'; X.textBaseline = 'middle'; X.fillText('+', a.x, a.yBottom - 40);
      label('Add building', a.x, a.yBottom - 78);
    }

    function frameTick(t) {
      const { buildings: list, selectedBuildingId: sel, buildingCounts: counts, cityId, onAddBuilding: canAdd } = propsRef.current;
      ground();
      road();
      if (layout.landmark) {
        const lm = layout.landmark, fr = FR[lm.kind];
        // mill house first, then the rotor mounted on its upper wall — the windmill
        // sprite is sails-only (no tower), so the blades sit ON the building.
        if (lm.building) building(lm.building.key, lm.building.x, lm.building.yBottom);
        if (lm.rotor) drawFrame(IMG[lm.kind], fr.w, fr.h, anim(fr.n, 8, t), lm.rotor.x, lm.rotor.y, lm.rotor.scale || S, false);
      }
      // path stubs (under the houses)
      layout.houses.forEach((h) => pathStub(h.x, h.yBottom - 36));
      if (canAdd) pathStub(layout.addLot.x, layout.addLot.yBottom - 36);
      // houses + selection ring + running glow + hammering citizen
      layout.houses.forEach((h, i) => {
        const b = list[i]; if (!b) return;
        const key = h.key || houseKeyFor(b);
        const c = counts[`${cityId}::${b.id}`];
        const running = (c?.running || 0) > 0, isSel = b.id === sel;
        const { dw, dh } = houseSize(key);
        if (isSel || running) {
          X.save(); X.lineWidth = 4;
          X.strokeStyle = isSel ? '#43c6ff' : `rgba(255,209,102,${0.4 + 0.3 * Math.sin(t * 3)})`;
          X.beginPath(); X.ellipse(h.x, h.yBottom - 6, dw * 0.5, 13, 0, 0, Math.PI * 2); X.stroke(); X.restore();
        }
        building(key, h.x, h.yBottom);
        if (running) citizen('ham', t + i * 0.37, h.x + dw * 0.4, h.yBottom + 14, false, 16, null);
        label(b.name, h.x, h.yBottom - dh - 22, c);
      });
      if (canAdd) drawAddLot();
      layout.fences.forEach((f) => fenceRun(f.x, f.yTop, f.n));
      // Trees are drawn STATIC (frame 0) — the strip's sway animation read as a
      // distracting "pulse", so they stand still.
      layout.trees.forEach((tr) => { const fr = FR[tr.kind]; drawFrame(IMG[tr.kind], fr.w, fr.h, 0, tr.x, tr.y, S, false); });
      farm(layout.farm.x0, layout.farm.y0);
      layout.scatter.forEach((s) => { if (s.kind === 'mushroomR') drawFrame(IMG.mushroomR, FR.mushroomR.w, FR.mushroomR.h, anim(4, 3, t + s.phase), s.x, s.y, S, s.flip); else stat(s.kind, s.x, s.y, S, s.flip); });
      layout.ponds.forEach((p) => pond(p.x, p.yBottom, p.scale, p.flip));
      const duckPond = layout.ponds[1];
      if (duckPond) {
        drawFrame(IMG.duck, FR.duck.w, FR.duck.h, anim(FR.duck.n, 6, t), duckPond.x - 25, duckPond.yBottom - 48, S, false);
        drawFrame(IMG.duck, FR.duck.w, FR.duck.h, anim(FR.duck.n, 6, t + 0.5), duckPond.x + 25, duckPond.yBottom - 34, S, true);
      }
      layout.animals.forEach((a) => { const fr = FR[a.kind]; drawFrame(IMG[a.kind], fr.w, fr.h, anim(fr.n, a.fps, t + a.phase), a.x, a.y, S, a.flip); });
      const bx = (t * 70) % (WORLD_W + 120) - 60;
      drawFrame(IMG.bird, FR.bird.w, FR.bird.h, anim(FR.bird.n, 8, t), bx, 130, S, true);
      const walkPos = [];
      layout.ambient.forEach((a) => {
        if (!a.route) return;
        const p = routePos(a.route, (t + (a.t0 || 0)) / a.period);
        citizen(a.state, t, p.x, p.y, p.dx < 0, a.fps, null);
        walkPos.push({ x: Math.round(p.x), y: Math.round(p.y), roadY: Math.round(roadY(p.x)) });
      });
      window.__pixelWalkers = walkPos;

      // debug hooks for verification (screen-space centres of clickables)
      window.__cam = cam;
      window.__pixelBuildings = hitRects.map((r) => ({ id: r.id, sx: (r.x + r.w / 2) * cam.z + cam.x, sy: (r.y + r.h * 0.7) * cam.z + cam.y }));
      window.__pixelAddLot = addRect ? { sx: (addRect.x + addRect.w / 2) * cam.z + cam.x, sy: (addRect.y + addRect.h / 2) * cam.z + cam.y } : null;
    }

    function loop(now) {
      if (!alive) return;
      if (start === null) start = now;
      const t = (now - start) / 1000;
      X.setTransform(1, 0, 0, 1, 0, 0); X.imageSmoothingEnabled = false;
      X.fillStyle = '#1d2716'; X.fillRect(0, 0, C.width, C.height);
      X.setTransform(cam.z, 0, 0, cam.z, cam.x, cam.y); X.imageSmoothingEnabled = false;
      frameTick(t);
      raf = requestAnimationFrame(loop);
    }

    // ---- responsive sizing ----
    function resize() { C.width = C.clientWidth || 960; C.height = C.clientHeight || 560; clampCam(); }
    const ro = new ResizeObserver(resize); ro.observe(C);
    resize();

    // ---- pan / zoom / click ----
    const toCanvas = (e) => { const r = C.getBoundingClientRect(); return { mx: (e.clientX - r.left) * (C.width / r.width), my: (e.clientY - r.top) * (C.height / r.height) }; };
    function hitAt(mx, my) {
      const wx = (mx - cam.x) / cam.z, wy = (my - cam.y) / cam.z;
      for (let i = hitRects.length - 1; i >= 0; i--) { const r = hitRects[i]; if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return { type: 'b', id: r.id }; }
      if (addRect && wx >= addRect.x && wx <= addRect.x + addRect.w && wy >= addRect.y && wy <= addRect.y + addRect.h) return { type: 'add' };
      return null;
    }
    function onDown(e) { if (e.button !== 0) return; drag = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false }; }
    function onMove(e) {
      if (drag) {
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
        drag.moved = true; const r = C.getBoundingClientRect();
        cam.x = drag.cx + dx * (C.width / r.width); cam.y = drag.cy + dy * (C.height / r.height);
        clampCam(); C.style.cursor = 'grabbing'; return;
      }
      const { mx, my } = toCanvas(e); C.style.cursor = hitAt(mx, my) ? 'pointer' : 'grab';
    }
    function onUp(e) {
      const wasDrag = drag?.moved; drag = null;
      if (wasDrag) { C.style.cursor = 'grab'; return; }
      const { mx, my } = toCanvas(e); const hit = hitAt(mx, my); if (!hit) return;
      const p = propsRef.current;
      if (hit.type === 'b') p.onSelectBuilding(hit.id);
      else if (hit.type === 'add' && p.onAddBuilding) p.onAddBuilding();
    }
    function onWheel(e) {
      e.preventDefault(); const { mx, my } = toCanvas(e);
      const wx = (mx - cam.x) / cam.z, wy = (my - cam.y) / cam.z;
      cam.z = clamp(cam.z * (e.deltaY < 0 ? 1.12 : 0.89), minZoom(), 3.2);
      cam.x = mx - wx * cam.z; cam.y = my - wy * cam.z; clampCam();
    }
    C.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    C.addEventListener('wheel', onWheel, { passive: false });
    C.style.cursor = 'grab';

    // ---- load assets, then harvest + start ----
    let left = Object.keys(manifest).length;
    const done = () => {
      if (!alive) return;
      fetch(`${BASE}/room1.json`).then((r) => { if (!r.ok) throw new Error('no room1'); return r.json(); }).then((room) => {
        if (!alive) return;
        buildHouses(room); houseCanvas.mill = harvest(room, STRUCT_LAYERS, MILL_DEF); buildPath(room); buildPond(room);
        rebuild(); computeHits(); ready = true;
        home();
        window.__pixelReady = true;
        raf = requestAnimationFrame(loop);
      }).catch(() => { /* assets vanished mid-session — parent's availability flips to fallback */ });
    };
    Object.keys(manifest).forEach((k) => { const im = new Image(); im.onload = () => { if (--left === 0) done(); }; im.onerror = () => { if (--left === 0) done(); }; im.src = manifest[k]; IMG[k] = im; });

    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      C.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp); C.removeEventListener('wheel', onWheel);
      window.__pixelReady = false;
    };
  }, []); // mount once; live data read via propsRef

  return (
    <div className="citybuildings">
      <h2 className="view-title">{city?.name || 'City'} — Buildings</h2>
      <p className="view-sub">Click a building to enter it, or the blank lot to add one · drag to pan · scroll to zoom · pixel-art preview.</p>
      <div className="scene-pixel-stage">
        <canvas
          ref={canvasRef}
          className="scene-pixel"
          aria-label={`${city?.name || 'City'} buildings — pixel-art view (${(buildings || []).length} buildings)`}
        />
        <div className="scene-pixel-night" aria-hidden="true" />
      </div>
    </div>
  );
}
