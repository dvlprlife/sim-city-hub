# Pixel-town buildings — how the art is made

Self-contained notes on how the optional pixel-art Buildings view builds its
houses out of the **Sunnyside World** tile pack. Written so this feature can be
lifted into another project: everything here is about the pack and the harvest
technique, not about this hub's domain model.

Implemented by `CityBuildingsPixel.jsx` (renderer) + `pixelTown.js` (layout) +
`scripts/extract-sunnyside-room.cjs` (one-time asset extraction).

---

## 1. The pack, and why buildings are "harvested"

Source: **Sunnyside World** by Daniel Diggle — <https://danieldiggle.itch.io/sunnyside>

The pack ships a **16px tileset with autotiles**, character/animal/prop sprite
strips, and a bonus **GameMaker example project**. Critically, it ships **no
standalone building sprites**. Buildings exist only as tiles *assembled in the
demo room*. So to get a house you must copy a rectangle of tiles out of that
room — "harvesting". There is no better source; this is not a workaround.

**Licence (V1, as published on the itch page):** modify freely; credit
appreciated but not required; **may not repackage or resell**; **may not be used
to train AI**; educational redistribution requires linking back to the itch page.

Consequences, which any port must preserve:

- The art and the extracted `room1.json` are **git-ignored** and never committed.
- Do not publish pack art to any hosted page or shared artifact. Keep renders,
  contact sheets and screenshots as local files.
- The view must degrade gracefully when the pack is absent (here: a
  `useSunnysideAvailable` probe + a lazy import, so a fresh clone never 404s).

## 2. Getting the assets on disk

```
node scripts/extract-sunnyside-room.cjs <path-to-unzipped-Sunnyside-pack>
```

It does two things:

1. Parses the GameMaker room `Sunnyside_World_Gamemaker/rooms/Room1/Room1.yy` and
   writes **`client/public/assets/sunnyside/room1.json`** — *layout data only*
   (tile indices), no art. GameMaker 2.3 stores tile layers **run-length
   encoded** in `TileCompressedData`: a negative count `N` (that is not the empty
   sentinel) means "repeat the next value `-N` times"; a positive `N` means "`N`
   literal values follow". Only layers whose tileset is
   `tileset_sunnysideworld` are kept.
2. Copies the exact sprite files the view loads out of
   `Sunnyside_World_Assets/` into the same folder.

Output shape:

```jsonc
{ "tileW": 16, "cols": 64, "order": [...],
  "layers": { "building": { "w": 86, "h": 48, "data": [ /* w*h tile ids */ ] }, ... } }
```

`cols: 64` is the tileset width in tiles (the sheet is 1024x1024 = 64x64 tiles).

## 3. Layers

| layer | use |
| --- | --- |
| `walls`, `building` | **structure** — this is what a building harvest reads |
| `land`, `paths` | ground; used for the road and pond harvests |
| `decoration_01/02/03` | props: bushes, barrels, flowers, signs |
| `shadows` | drop shadows baked into the room |
| `clouds_01/02`, `cloud_shadow` | sky overlay, unused here |

**Harvest buildings from `['walls', 'building']` only.** Including the decoration
layers drags in whatever scenery happens to sit near that building in the room —
neighbouring trees, barrels, mushrooms — because the room is a *scene*, not a
sprite sheet. (Verified: they also do **not** supply any missing roof geometry.)

## 4. Tile-id encoding

Each cell is a 32-bit int with flags in the high bits:

```js
const TILE_EMPTY = -2147483648;
const liveTile = (v) => v !== undefined && v !== TILE_EMPTY && v !== 0;

const id  = v & 0x0FFFFFFF;   // index into the tileset, row-major, `cols` per row
const mir = v & 0x10000000;   // mirror horizontally
const fly = v & 0x20000000;   // flip vertically
const rot = v & 0x40000000;   // rotate 90°
```

> ### Do not "skip placeholder" tiles
> Tile **2194** was long dropped here as a supposed magenta-X placeholder. It is
> the **red roof-fill tile** — one of a family carrying an X lattice motif
> (`1170` green, `2706` purple). Skipping it punched holes clean through every
> red roof. The tell: one affected house sits on a riverbank, and the water
> showed *through the roof*. A placeholder would not be load-bearing over
> terrain. **The X marks on roofs are genuine art.** There is no skip-list.

## 5. The harvest

```js
function putTile(g, ts, COLS, v, dx, dy, T) {
  if (!liveTile(v)) return;
  const id = v & 0x0FFFFFFF, mir = v & 0x10000000, fly = v & 0x20000000, rot = v & 0x40000000;
  g.save(); g.translate(dx + T / 2, dy + T / 2);
  if (rot) g.rotate(Math.PI / 2);
  g.scale(mir ? -1 : 1, fly ? -1 : 1);
  g.drawImage(ts, (id % COLS) * T, ((id / COLS) | 0) * T, T, T, -T / 2, -T / 2, T, T);
  g.restore();
}

// rect is [tileX, tileY, tilesW, tilesH] in room coordinates
function harvest(room, layers, [tx, ty, tw, th]) {
  const T = room.tileW, COLS = room.cols;
  const cv = document.createElement('canvas');
  cv.width = tw * T; cv.height = th * T;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  for (const name of layers) {
    const L = room.layers[name]; if (!L) continue;
    for (let yy = 0; yy < th; yy++) for (let xx = 0; xx < tw; xx++)
      putTile(g, ts, COLS, L.data[(ty + yy) * L.w + (tx + xx)], xx * T, yy * T, T);
  }
  return cv;                      // an offscreen canvas, kept for the session
}
```

Harvest once at load; cache the canvases. `imageSmoothingEnabled = false`
everywhere, or the pixels turn to mush at non-integer scales.

## 6. Placement contract

A building is drawn **bottom-centred** on its world position, at `BS = 2.2`:

```js
const dw = cv.width * BS, dh = cv.height * BS;
X.drawImage(cv, x - dw / 2, yBottom - dh, dw, dh);
```

So `x` is the *canvas* centre — see the trap below — and `yBottom` is where the
building meets the ground. Hit-testing uses the same `dw`/`dh` box.

> ### Trap: the art is often not centred inside its rect
> Rects are hand-picked, so several have transparent slack on one side, and the
> canvas centre is then **not** the visible centre. Measured offsets of visible
> centre from canvas centre, in source px:
>
> | rect | offset |
> | --- | --- |
> | most houses | ≈ −0.5 (fine) |
> | `cyan` `[50,6,6,4]` | **+7.5** |
> | mill `[38,14,5,6]` | **+15.5** |
>
> Multiply by `BS` for world px. This makes a house sit off its intended spot and
> gives it an over-wide click target — and it is what made the windmill's rotor
> look unmounted for two sessions. **Always measure the opaque bbox** (§8) rather
> than assuming the rect is tight.

## 7. Composite landmarks — the windmill

Some pack sprites are **parts, not objects**. `spr_deco_windmill_strip9.png` is
**sails only — there is no tower**, which is why a bare rotor floats over the
grass. Compose it from two pieces, drawn in order:

1. a stone tower harvested from the room (`[38,14,5,6]`), then
2. the rotor sprite on top, so the blades sit *on* the wall.

Anchoring the rotor is arithmetic, not guesswork:

```
tower visible centre  = +15.5 src px from canvas centre  = +34.1 world px (×2.2)
rotor hub inside its own 112px frame = 55.5, i.e. −0.5 px → −1.1 world px
rotor.x = millX + 34.1 + 1.1  ≈  millX + 35
```

The hub position was measured across all 9 frames of the strip (their bounding
boxes share a centre, which *is* the rotation centre). Same method applies to any
other animated part you need to mount on something.

## 8. How to measure — the only method that works

To find a sprite's true extents, **run the real `harvest()`/`putTile()` code in
the browser** against an offscreen canvas, then read alpha via `getImageData`.
Same engine, same code path, no scene contamination.

```js
function alphaBox(cv) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++)
    if (d[(y * cv.width + x) * 4 + 3] > 16) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  return { minX, maxX, minY, maxY, centreOffset: (minX + maxX) / 2 - cv.width / 2 };
}
```

Two approaches that gave **wrong answers** — do not repeat them:

- **Sampling the live scene canvas.** The road, ground and neighbours bleed into
  the sample band; the numbers are garbage.
- **Re-implementing the harvest outside the browser** (tried in
  PowerShell/System.Drawing). It disagreed with the real render over flag bits
  and compositing. If you must verify headlessly, drive a real browser.

Useful diagnostics, in rough order of value:

1. **Per-layer tile dump** for a rect — prints `layer=id` per cell. Instantly
   answers "why is there a hole here" and "which layer owns this pixel".
2. **Context render** — the rect drawn *in situ* with all layers and the rect
   outlined, so you can see whether a stray element belongs to a neighbour.
3. **Contact sheet** — every candidate on a grass background with its opaque box
   and centre line drawn, labelled with rect and offset.
4. **Tile-id viewer** — specific ids blown up with usage counts per layer. This
   is what proved 2194 was roof art.

## 9. Picking a rect

Connected-component scanning the structure layers (4-neighbour flood fill over
`walls`+`building`, bbox each component) finds **22 candidates** in room1. Filter
to `tiles >= 8`, `w <= 12`, `h <= 12`, then eyeball a contact sheet — the scan
finds *shapes*, and only your eye can tell a house from three pine trees.

Known-good, currently used:

```
purple [13,26,6,6]  red [71,41,4,5]  redSm [30,26,4,4]  blue  [54,0,5,4]
purpleSm [76,39,4,6]  cyan [50,6,6,4]  orange [55,31,6,4]  mill [38,14,5,6]
```

Known-good, unused — pick from here to expand the catalog:

```
[32,19,5,5] red 2-storey   [40,33,5,5] green roof   [21,25,4,4] small green
[70,26,4,3] small dark     [22,17,3,3] tiny cottage [72,3,4,9] tall tower (48x134)
```

Known-bad, and why:

| rect | problem |
| --- | --- |
| `[17,33,11,6]`, `[1,21,5,10]`, `[42,1,5,9]` | component merges **two** structures |
| `[45,15,5,5]` | it's three pine trees, not a building |
| `[61,8,3,3]` | renders empty |
| `[50,11,7,5]`, `[39,24,9,6]` | huge rect slack (+23.5 / −16.5 offset) |

Aesthetic notes from earlier passes: green roofs (tile family `1170`) read as
*grass* against a grass ground, so they look like a hole in the lawn — use them
only over a non-green surface. Oversized towers break the cottage scale. The
purple house's **red door** (tile `3024`) is genuine: that tile carries the
purple wall along its top edge, proving it belongs to that building rather than
bleeding in from a neighbour.

## 10. Porting checklist

- [ ] Copy `CityBuildingsPixel.jsx`, `pixelTown.js`, this file, and
      `scripts/extract-sunnyside-room.cjs`.
- [ ] Git-ignore the asset folder; document the pack download in the README with
      a link to the itch page.
- [ ] Keep the availability probe + lazy import so the app works without the pack.
- [ ] Re-point the prop contract (`buildings`, `selectedBuildingId`,
      `onSelectBuilding`, `buildingCounts`, `onAddBuilding`) at the new domain.
- [ ] `harvest()` and `putTile()` port **verbatim** — they encode the pack's tile
      format, not this app's logic.
- [ ] Re-measure offsets (§6/§8) if you change any rect; never assume tight.
