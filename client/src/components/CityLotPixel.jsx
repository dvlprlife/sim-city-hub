import { useEffect, useRef } from 'react';
import { buildPixelLot, TS } from '../map/pixelLot.js';

// THEMED VIEW #2 (pixel-art) — one building's LOT from above, drawn on a <canvas>
// from the Sunnyside spritesheets, the citizens-view counterpart to
// CityBuildingsPixel. The building is ROOFLESS so you see the desks inside; the
// roof is painted on arrival and lifts away, the reveal a top-down game does when
// you step indoors. Citizens with a live run stand at their desk (hammering);
// idle ones walk a route around the yard.
//
// Same prop contract as CityInterior (see CLAUDE.md): { cityId, people,
// onSelectPerson } plus optional `city`, `selectedPersonId`, `personCounts`,
// `emotes`, `onAddPerson`.
//
// The Sunnyside pack is git-ignored (its licence forbids redistribution), so this
// component is lazy-loaded and only mounted when the assets are present.
// Harvest technique + tile-id encoding: see client/src/map/PIXEL-TOWN.md.

const S = 3;                            // world-px → art scale (one tile = 16*S)
const BASE = '/assets/sunnyside';
const TILE_EMPTY = -2147483648;
const GRASS = { sx: 16, sy: 48 };
const FENCE = { left: 166, mid: 167, right: 170 };
const DRAG_SLOP = 5;

// Tile rects harvested out of room1's furnished interior (see PIXEL-TOWN.md for
// how these were located). All are [tileX, tileY, tilesW, tilesH].
const FLOOR_DEF = [81, 20, 1, 1];       // wooden planks
const WALL_DEF = [80, 15, 1, 1];        // interior wall run
const DESK_DEF = [82, 16, 1, 1];        // dresser/desk with something on top
const SHELF_DEF = [83, 16, 1, 1];       // bookshelf
const RUG_DEF = [82, 17, 3, 2];         // the big light table, used as a rug
const ROOF_DEF = [31, 27, 1, 1];        // red roof fill (tile 2194 — real art!)
const ROOF_TOP_DEF = [31, 26, 1, 1];    // its top-edge course
const PATH_DEF = [41, 31, 4, 2];        // dirt path
const ROOM_LAYERS = ['land', 'paths', 'shadows', 'walls', 'building', 'decoration_01'];

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
  tree1: `${BASE}/plants/spr_deco_tree_01_strip4.png`,
  tree2: `${BASE}/plants/spr_deco_tree_02_strip4.png`,
};
const CH = { w: 96, h: 64 };
const STATE = { idle: 9, walk: 8, ham: 23 };
const FR = { tree1: { n: 4, w: 32, h: 34 }, tree2: { n: 4, w: 28, h: 43 } };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function CityLotPixel({ cityId, city, people, selectedPersonId, onSelectPerson, personCounts = {}, emotes = {}, onAddPerson }) {
  const canvasRef = useRef(null);
  const apiRef = useRef(null);
  const propsRef = useRef(null);
  propsRef.current = {
    cityId, people: people || [], selectedPersonId, onSelectPerson,
    personCounts: personCounts || {}, emotes: emotes || {}, onAddPerson,
  };

  const count = (people || []).length;
  useEffect(() => { apiRef.current?.rebuild(); }, [count]);

  useEffect(() => {
    const C = canvasRef.current; if (!C) return undefined;
    const X = C.getContext('2d'); X.imageSmoothingEnabled = false;

    const cam = { x: 0, y: 0, z: 1 };
    const IMG = {};
    const piece = {};                     // harvested canvases by name
    let layout = buildPixelLot(propsRef.current.people.length);
    let hitRects = [], addRect = null;
    let ready = false, raf = 0, start = null, drag = null, alive = true;
    let roofT = 0;                        // seconds since mount, drives the reveal

    const fitZoom = () => Math.min(C.width / layout.worldW, C.height / layout.worldH);
    function clampCam() {
      cam.z = clamp(cam.z, fitZoom() * 0.6, 3.2);
      const ww = layout.worldW * cam.z, wh = layout.worldH * cam.z;
      cam.x = ww <= C.width ? (C.width - ww) / 2 : clamp(cam.x, C.width - ww, 0);
      cam.y = wh <= C.height ? (C.height - wh) / 2 : clamp(cam.y, C.height - wh, 0);
    }
    function home() {
      cam.z = clamp(Math.min(C.width / layout.worldW, C.height / layout.worldH) * 1.02, 0.2, 2.2);
      cam.x = C.width / 2 - (layout.worldW / 2) * cam.z;
      cam.y = C.height / 2 - (layout.worldH / 2) * cam.z;
      clampCam();
    }

    // ---- tile / sprite helpers ----
    const liveTile = (v) => v !== undefined && v !== TILE_EMPTY && v !== 0;
    function putTile(g, ts, COLS, v, dx, dy, T) {
      if (!liveTile(v)) return;
      const id = v & 0x0FFFFFFF, mir = v & 0x10000000, fly = v & 0x20000000, rot = v & 0x40000000;
      g.save(); g.translate(dx + T / 2, dy + T / 2);
      if (rot) g.rotate(Math.PI / 2); g.scale(mir ? -1 : 1, fly ? -1 : 1);
      g.drawImage(ts, (id % COLS) * T, ((id / COLS) | 0) * T, T, T, -T / 2, -T / 2, T, T); g.restore();
    }
    function harvest(room, [tx, ty, tw, th]) {
      const T = room.tileW, COLS = room.cols;
      const cv = document.createElement('canvas'); cv.width = tw * T; cv.height = th * T;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      for (const name of ROOM_LAYERS) {
        const L = room.layers[name]; if (!L) continue;
        for (let yy = 0; yy < th; yy += 1) for (let xx = 0; xx < tw; xx += 1) {
          putTile(g, IMG.tileset, COLS, L.data[(ty + yy) * L.w + (tx + xx)], xx * T, yy * T, T);
        }
      }
      return cv;
    }
    const drawPiece = (cv, x, y, w, h) => { if (cv) X.drawImage(cv, x, y, w ?? cv.width * S, h ?? cv.height * S); };
    function tileById(id, dx, dy) { X.drawImage(IMG.tileset, (id % 64) * 16, ((id / 64) | 0) * 16, 16, 16, dx, dy, TS, TS); }
    function drawFrame(img, fw, fh, frame, ax, ay, scale, flip) {
      if (!img || !img.width) return;
      const dw = fw * scale, dh = fh * scale;
      X.save(); X.translate(ax, ay); if (flip) X.scale(-1, 1);
      X.drawImage(img, frame * fw, 0, fw, fh, -dw / 2, -dh, dw, dh); X.restore();
    }
    const anim = (n, fps, t) => Math.floor(t * fps) % n;
    function routePos(route, frac) {
      let total = 0; const seg = [];
      for (let i = 0; i < route.length; i += 1) {
        const a = route[i], b = route[(i + 1) % route.length];
        const L = Math.hypot(b.x - a.x, b.y - a.y); seg.push(L); total += L;
      }
      let d = (((frac % 1) + 1) % 1) * total;
      for (let i = 0; i < route.length; i += 1) {
        if (d <= seg[i] || i === route.length - 1) {
          const a = route[i], b = route[(i + 1) % route.length];
          const u = seg[i] ? d / seg[i] : 0;
          return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, dx: b.x - a.x };
        }
        d -= seg[i];
      }
      return { x: route[0].x, y: route[0].y, dx: 1 };
    }
    function roundRect(x, y, w, h, r) {
      X.beginPath(); X.moveTo(x + r, y);
      X.arcTo(x + w, y, x + w, y + h, r); X.arcTo(x + w, y + h, x, y + h, r);
      X.arcTo(x, y + h, x, y, r); X.arcTo(x, y, x + w, y, r); X.closePath();
    }
    function label(text, cx, topY, counts) {
      X.font = '600 13px system-ui, sans-serif';
      const running = counts?.running || 0, queued = counts?.queued || 0, total = running + queued;
      const badge = total > 0 ? `  ${running > 0 ? '● ' : ''}${total}` : '';
      const w = X.measureText(text + badge).width + 14;
      X.fillStyle = 'rgba(16,22,28,0.82)'; roundRect(cx - w / 2, topY, w, 20, 6); X.fill();
      X.textAlign = 'center'; X.textBaseline = 'middle';
      if (badge) {
        X.fillStyle = '#eaf3ea'; X.fillText(text, cx - X.measureText(badge).width / 2, topY + 10);
        X.fillStyle = running > 0 ? '#ff6b6b' : '#ffd166'; X.fillText(badge, cx + X.measureText(text).width / 2, topY + 10);
      } else { X.fillStyle = '#eaf3ea'; X.fillText(text, cx, topY + 10); }
    }
    // `y` is the citizen's FEET. The name rides at y - 60*S — the same offset the
    // pixel town uses — which clears the top of the 64px-tall frame, so the label
    // sits above the head instead of across the body.
    function citizen(state, t, x, y, flip, fps, name, counts) {
      const f = anim(STATE[state], fps, t);
      const footY = y + 4 * S;
      for (const part of ['base', 'hair', 'tools']) drawFrame(IMG[`${state}_${part}`], CH.w, CH.h, f, x, footY, S, flip);
      if (name) label(name, x, y - 60 * S, counts);
    }

    // ---- scene ----
    function rebuild() {
      layout = buildPixelLot(propsRef.current.people.length);
      if (ready) { computeHits(); clampCam(); }
    }
    function computeHits() {
      const list = propsRef.current.people;
      hitRects = [];
      layout.desks.forEach((d, i) => {
        const p = list[i]; if (!p) return;
        hitRects.push({ id: p.id, x: d.x - TS * 0.6, y: d.y - TS * 1.2, w: TS * 2.2, h: TS * 2.4 });
      });
      const a = layout.addDesk;
      addRect = propsRef.current.onAddPerson ? { x: a.x - TS * 0.4, y: a.y - TS * 0.4, w: TS * 1.8, h: TS * 1.8 } : null;
    }
    apiRef.current = { rebuild };

    function ground() {
      const ts = IMG.tileset;
      X.fillStyle = '#6cae3e'; X.fillRect(0, 0, layout.worldW, layout.worldH);
      for (let y = 0; y < layout.worldH; y += TS) for (let x = 0; x < layout.worldW; x += TS) {
        X.drawImage(ts, GRASS.sx, GRASS.sy, 16, 16, x, y, TS, TS);
      }
    }
    function drawPath() {
      const p = layout.path;
      for (let ty = p.ty0; ty <= p.ty1; ty += 1) drawPiece(piece.path, p.tx * TS, ty * TS, TS, TS);
    }
    function drawFence() {
      for (const f of layout.fence) {
        tileById(f.dir === 'h' ? FENCE.mid : FENCE.left, f.tx * TS, f.ty * TS);
      }
    }
    function drawBuilding() {
      const b = layout.building;
      // floor
      for (let ty = 0; ty < b.th - 2; ty += 1) for (let tx = 0; tx < b.tw - 2; tx += 1) {
        drawPiece(piece.floor, b.inX + tx * TS, b.inY + ty * TS, TS, TS);
      }
      // wall ring
      for (let tx = 0; tx < b.tw; tx += 1) {
        drawPiece(piece.wall, b.x + tx * TS, b.y, TS, TS);
        if (b.tx + tx !== layout.door.tx) drawPiece(piece.wall, b.x + tx * TS, b.y + (b.th - 1) * TS, TS, TS);
      }
      for (let ty = 1; ty < b.th - 1; ty += 1) {
        drawPiece(piece.wall, b.x, b.y + ty * TS, TS, TS);
        drawPiece(piece.wall, b.x + (b.tw - 1) * TS, b.y + ty * TS, TS, TS);
      }
      // furnishing
      drawPiece(piece.rug, b.inX + TS, b.y + b.h - TS * 3, TS * 3, TS * 2);
      for (const s of layout.shelves) drawPiece(piece.shelf, s.x, s.y, TS, TS);
    }
    function drawRoof(alpha, lift) {
      const b = layout.building;
      X.save(); X.globalAlpha = alpha;
      for (let ty = 0; ty < b.th; ty += 1) for (let tx = 0; tx < b.tw; tx += 1) {
        drawPiece(ty === 0 ? piece.roofTop : piece.roof, b.x + tx * TS, b.y + ty * TS - lift, TS, TS);
      }
      X.restore();
    }

    function frameTick(t) {
      const { people: list, selectedPersonId: sel, personCounts: counts, onAddPerson: canAdd } = propsRef.current;
      ground();
      drawPath();
      drawFence();
      for (const tr of layout.trees) {
        const fr = FR[tr.kind];
        drawFrame(IMG[tr.kind], fr.w, fr.h, 0, tr.x, tr.y, S, false);
      }
      drawBuilding();

      // desks + whoever is at them
      const running = (p) => (counts[p.id]?.running || 0) > 0;
      layout.desks.forEach((d, i) => {
        const p = list[i]; if (!p) return;
        drawPiece(piece.desk, d.x, d.y, TS, TS);
        if (running(p)) citizen('ham', t + i * 0.37, d.x + TS * 1.15, d.y + TS * 1.5, true, 14, p.name, counts[p.id]);
        if (p.id === sel) {
          X.save(); X.strokeStyle = '#43c6ff'; X.lineWidth = 3;
          X.strokeRect(d.x - 4, d.y - 4, TS + 8, TS + 8); X.restore();
        }
      });
      if (canAdd) {
        const a = layout.addDesk;
        X.save(); X.setLineDash([7, 6]); X.strokeStyle = 'rgba(255,255,255,0.75)'; X.lineWidth = 3;
        X.strokeRect(a.x, a.y, TS, TS); X.restore();
        X.fillStyle = 'rgba(255,255,255,0.9)'; X.font = '700 26px system-ui, sans-serif';
        X.textAlign = 'center'; X.textBaseline = 'middle';
        X.fillText('+', a.x + TS / 2, a.y + TS / 2);
        label('Add citizen', a.x + TS / 2, a.y + TS + 8);
      }

      // idle citizens strolling the yard
      const idle = list.filter((p) => !running(p));
      idle.forEach((p, i) => {
        const pos = routePos(layout.route, (t / 46) + i / Math.max(1, idle.length));
        citizen('walk', t + i * 0.5, pos.x, pos.y, pos.dx < 0, 9, p.name, counts[p.id]);
        if (p.id === sel) {
          X.save(); X.strokeStyle = '#43c6ff'; X.lineWidth = 3;
          X.beginPath(); X.ellipse(pos.x, pos.y - 6, 26, 12, 0, 0, Math.PI * 2); X.stroke(); X.restore();
        }
        hitRects.push({ id: p.id, x: pos.x - 30, y: pos.y - 84, w: 60, h: 92, live: true });
      });

      // the roof, painted over everything then lifted away
      if (roofT < 1.9) {
        const k = clamp((roofT - 0.5) / 1.0, 0, 1);
        drawRoof(1 - k, k * 90);
      }

      window.__lotReady = true;
      window.__lotRoof = roofT;
      // debug hook for the headless verifier (walker positions must stay on-world)
      window.__lotWalkers = idle.map((p, i) => {
        const q = routePos(layout.route, (t / 46) + i / Math.max(1, idle.length));
        return { id: p.id, x: Math.round(q.x), y: Math.round(q.y) };
      });
    }

    function loop(now) {
      if (!alive) return;
      if (start === null) start = now;
      const t = (now - start) / 1000;
      roofT = t;
      if (C.width !== C.clientWidth || C.height !== C.clientHeight) {
        C.width = C.clientWidth; C.height = C.clientHeight; clampCam();
      }
      X.setTransform(1, 0, 0, 1, 0, 0);
      X.clearRect(0, 0, C.width, C.height);
      X.fillStyle = '#0f1512'; X.fillRect(0, 0, C.width, C.height);
      X.save(); X.translate(cam.x, cam.y); X.scale(cam.z, cam.z);
      hitRects = hitRects.filter((r) => !r.live);
      if (ready) frameTick(t);
      X.restore();
      raf = requestAnimationFrame(loop);
    }

    // ---- input ----
    const toWorld = (e) => {
      const r = C.getBoundingClientRect();
      return { x: (e.clientX - r.left - cam.x) / cam.z, y: (e.clientY - r.top - cam.y) / cam.z };
    };
    const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, moved: false, cx: cam.x, cy: cam.y }; };
    const onMove = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > DRAG_SLOP) drag.moved = true;
      if (drag.moved) { cam.x = drag.cx + dx; cam.y = drag.cy + dy; clampCam(); }
    };
    const onUp = (e) => {
      if (!drag) return;
      const wasDrag = drag.moved; drag = null;
      if (wasDrag) return;
      const w = toWorld(e);
      const hit = hitRects.find((r) => w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h);
      if (hit) { propsRef.current.onSelectPerson?.(hit.id); return; }
      if (addRect && w.x >= addRect.x && w.x <= addRect.x + addRect.w && w.y >= addRect.y && w.y <= addRect.y + addRect.h) {
        propsRef.current.onAddPerson?.();
      }
    };
    const onWheel = (e) => {
      e.preventDefault();
      const r = C.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const wx = (mx - cam.x) / cam.z, wy = (my - cam.y) / cam.z;
      cam.z = clamp(cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), fitZoom() * 0.6, 3.2);
      cam.x = mx - wx * cam.z; cam.y = my - wy * cam.z; clampCam();
    };
    C.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    C.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(() => { C.width = C.clientWidth; C.height = C.clientHeight; clampCam(); });
    ro.observe(C);

    // ---- load ----
    let left = Object.keys(manifest).length;
    const done = () => {
      fetch(`${BASE}/room1.json`).then((r) => r.json()).then((room) => {
        if (!alive) return;
        piece.floor = harvest(room, FLOOR_DEF);
        piece.wall = harvest(room, WALL_DEF);
        piece.desk = harvest(room, DESK_DEF);
        piece.shelf = harvest(room, SHELF_DEF);
        piece.rug = harvest(room, RUG_DEF);
        piece.roof = harvest(room, ROOF_DEF);
        piece.roofTop = harvest(room, ROOF_TOP_DEF);
        piece.path = harvest(room, [PATH_DEF[0], PATH_DEF[1], 1, 1]);
        rebuild(); computeHits(); ready = true; home();
        raf = requestAnimationFrame(loop);
      }).catch(() => { /* assets vanished — the parent falls back */ });
    };
    Object.keys(manifest).forEach((k) => {
      const im = new Image();
      im.onload = () => { if (--left === 0) done(); };
      im.onerror = () => { if (--left === 0) done(); };
      im.src = manifest[k]; IMG[k] = im;
    });

    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      C.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp); C.removeEventListener('wheel', onWheel);
      window.__lotReady = false;
    };
  }, []);

  return (
    <div className="citylot-pixel">
      <h2 className="view-title">{city?.name || cityId} — Citizens</h2>
      <p className="view-sub">
        Click an agent to chat, or the empty desk to add one · idle agents walk the
        grounds · drag to pan · scroll to zoom · pixel-art preview.
      </p>
      {/* Reuses the pixel Buildings view's stage + canvas styling so both
          pixel views size, scale and night-tint identically. */}
      <div className="scene-pixel-stage">
        <canvas ref={canvasRef} className="scene-pixel" />
        <div className="scene-pixel-night" aria-hidden="true" />
      </div>
    </div>
  );
}
