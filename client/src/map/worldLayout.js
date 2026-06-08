// Shared isometric projection helper used by the scene generator
// (map/cityscape.js). Kept here so the iso math lives in one theme-confined
// place. Default tile footprint (2:1); callers pass their own tileW/tileH.
export const TILE_W = 58;
export const TILE_H = 29;

// Project a grid coord [x, y] to screen offsets. Returns left/top (px) and a
// painter's-order zIndex (nearer tiles — higher x+y — paint over farther ones).
export function isoToScreen([x, y], { tileW = TILE_W, tileH = TILE_H, originX = 0, originY = 0 } = {}) {
  return {
    left: originX + (x - y) * (tileW / 2),
    top: originY + (x + y) * (tileH / 2),
    zIndex: 100 + (x + y),
  };
}
