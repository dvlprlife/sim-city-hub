#!/usr/bin/env node
// Generate client/public/assets/sunnyside/room1.json from the Sunnyside World
// pack's bundled GameMaker demo room (Room1.yy). The optional pixel-art Buildings
// view harvests its houses / paths / ponds from this room's tile layers at runtime.
//
// This is a local dev tool — it reads the (download-separately, NON-redistributable)
// Sunnyside pack you already have on disk and writes a layout-data JSON (tile
// indices, not art). Run it after downloading the pack:
//
//   node scripts/extract-sunnyside-room.cjs <path-to-unzipped-Sunnyside-pack>
//
// e.g. node scripts/extract-sunnyside-room.cjs ~/Downloads/Sunnyside_World_ASSET_PACK_V2.1
//
// The pack's licence forbids redistribution, so neither the art nor this output is
// committed (client/public/assets/sunnyside/ is git-ignored). See the README.
const fs = require('fs');
const path = require('path');

const packRoot = process.argv[2];
if (!packRoot) {
  console.error('Usage: node scripts/extract-sunnyside-room.cjs <path-to-unzipped-Sunnyside-pack>');
  process.exit(1);
}
const roomPath = path.join(packRoot, 'Sunnyside_World_Gamemaker', 'rooms', 'Room1', 'Room1.yy');
if (!fs.existsSync(roomPath)) {
  console.error(`Could not find the GameMaker room at:\n  ${roomPath}\nPass the folder that contains "Sunnyside_World_Gamemaker".`);
  process.exit(1);
}
const outPath = path.join(__dirname, '..', 'client', 'public', 'assets', 'sunnyside', 'room1.json');

const s = fs.readFileSync(roomPath, 'utf8');
const EMPTY = -2147483648;
// GameMaker 2.3 tile layers store run-length-encoded tile data: a negative count
// N (not the empty sentinel) means "the next value, repeated -N times"; a positive
// N means "N literal values follow".
function decodeRLE(arr) {
  const out = [];
  let k = 0;
  while (k < arr.length) {
    const n = arr[k++];
    if (n < 0 && n !== EMPTY) { const v = arr[k++]; for (let i = 0; i < -n; i++) out.push(v); }
    else if (n > 0) { for (let i = 0; i < n; i++) out.push(arr[k++]); }
    else { out.push(n); }
  }
  return out;
}

const layers = [];
const re = /"resourceType":"GMRTileLayer"/g;
const idxs = [];
let m;
while ((m = re.exec(s))) idxs.push(m.index);
idxs.push(s.length);
for (let i = 0; i < idxs.length - 1; i++) {
  const block = s.slice(idxs[i], idxs[i + 1]);
  const name = (block.match(/"name":"([^"]+)"/) || [])[1];
  const ts = (block.match(/"tilesetId":\{"name":"([^"]+)"/) || [])[1];
  const w = +(block.match(/"SerialiseWidth":(-?\d+)/) || [])[1];
  const h = +(block.match(/"SerialiseHeight":(-?\d+)/) || [])[1];
  const cd = block.match(/"TileCompressedData":\[([\s\S]*?)\]/);
  if (!name || !ts || !cd) continue;
  const data = decodeRLE(cd[1].split(',').map((x) => x.trim()).filter(Boolean).map(Number));
  if (data.length !== w * h) { console.warn(`! layer ${name}: ${data.length} tiles, expected ${w * h}`); }
  layers.push({ name, tileset: ts, w, h, data });
}

const keep = layers.filter((l) => l.tileset === 'tileset_sunnysideworld');
const json = { tileW: 16, cols: 64, order: keep.map((l) => l.name), layers: {} };
for (const l of keep) json.layers[l.name] = { w: l.w, h: l.h, data: l.data };

const ssDir = path.dirname(outPath);
fs.mkdirSync(ssDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(json));
console.log(`Wrote ${outPath} (${keep.length} layers, ${(fs.statSync(outPath).size / 1024) | 0} KB)`);

// Also copy the exact sprite files the pixel view loads, from the pack's
// Sunnyside_World_Assets into client/public/assets/sunnyside/ (so a fresh setup
// is one command and the files land in the right place). [dest, srcInAssets]
const ASSETS_ROOT = path.join(packRoot, 'Sunnyside_World_Assets');
const human = (state, file) => [`human/${state}/${file}`, `Characters/Human/${state}/${file}`];
const animal = (f) => [`animals/${f}`, `Elements/Animals/${f}`];
const crop = (f) => [`crops/${f}`, `Elements/Crops/${f}`];
const ASSETS = [
  ['tileset/spr_tileset_sunnysideworld_16px.png', 'Tileset/spr_tileset_sunnysideworld_16px.png'],
  human('IDLE', 'base_idle_strip9.png'), human('IDLE', 'shorthair_idle_strip9.png'), human('IDLE', 'tools_idle_strip9.png'),
  human('WALKING', 'base_walk_strip8.png'), human('WALKING', 'shorthair_walk_strip8.png'), human('WALKING', 'tools_walk_strip8.png'),
  human('HAMMERING', 'base_hamering_strip23.png'), human('HAMMERING', 'shorthair_hamering_strip23.png'), human('HAMMERING', 'tools_hamering_strip23.png'),
  human('WATERING', 'base_watering_strip5.png'), human('WATERING', 'shorthair_watering_strip5.png'), human('WATERING', 'tools_watering_strip5.png'),
  ['plants/spr_deco_tree_01_strip4.png', 'Elements/Plants/spr_deco_tree_01_strip4.png'],
  ['plants/spr_deco_tree_02_strip4.png', 'Elements/Plants/spr_deco_tree_02_strip4.png'],
  ['other/spr_deco_windmill_strip9.png', 'Elements/Other/spr_deco_windmill_strip9.png'],
  ['props/spr_deco_mushroom_red_01_strip4.png', 'Elements/Plants/spr_deco_mushroom_red_01_strip4.png'],
  ['vfx/chimneysmoke_01_strip30.png', 'Elements/VFX/Chimney Smoke/chimneysmoke_01_strip30.png'],
  animal('spr_deco_chicken_01_strip4.png'), animal('spr_deco_cow_strip4.png'), animal('spr_deco_sheep_01_strip4.png'),
  animal('spr_deco_bird_01_strip4.png'), animal('spr_deco_pig_01_strip4.png'), animal('spr_deco_duck_01_strip4.png'),
  crop('rock.png'), crop('sunflower_05.png'), crop('pumpkin_05.png'), crop('cabbage_05.png'), crop('wheat_05.png'), crop('soil_00.png'),
];
let copied = 0; const missing = [];
for (const [dest, src] of ASSETS) {
  const from = path.join(ASSETS_ROOT, src), to = path.join(ssDir, dest);
  if (!fs.existsSync(from)) { missing.push(src); continue; }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to); copied += 1;
}
console.log(`Copied ${copied}/${ASSETS.length} sprite files into ${ssDir}`);
if (missing.length) console.warn(`! ${missing.length} not found (check the pack path):\n  ${missing.join('\n  ')}`);
console.log('Done — restart the dev server / rebuild, enter a city, and the pixel view will be the default.');
