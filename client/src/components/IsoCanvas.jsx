import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Pan/zoom viewport for the isometric views. Wraps a sized "world" (whose px
// width/height the caller computes from the iso layout) in a clipped viewport you
// can drag to pan and scroll to zoom. Theme-neutral: it holds no SimCity strings;
// the ground look comes from `groundClass` (e.g. `iso-scene`).
//
// Click vs drag: a click only reaches a tile if the pointer didn't move past a
// small threshold, so dragging the map never accidentally selects a building.
const MIN = 0.4;
const MAX = 2.6;
const DRAG_SLOP = 5; // px before a press becomes a pan

export default function IsoCanvas({ width, height, groundClass = '', canvasClass = '', children }) {
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view; // mirror for event handlers that read the latest view
  const vpRef = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const centered = useRef(false);

  // Center the world in the viewport on first layout.
  useLayoutEffect(() => {
    if (centered.current || !vpRef.current || !width) return;
    const cw = vpRef.current.clientWidth;
    setView({ x: Math.round((cw - width) / 2), y: 24, scale: 1 });
    centered.current = true;
  }, [width]);

  // Wheel-zoom toward the cursor. Attached natively as { passive: false } so we
  // can preventDefault the page scroll — React's onWheel is passive and can't.
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return undefined;
    const handler = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setView((v) => {
        const scale = Math.min(MAX, Math.max(MIN, v.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        const k = scale / v.scale; // keep the point under the cursor fixed
        return { scale, x: cx - k * (cx - v.x), y: cy - k * (cy - v.y) };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.iso-controls')) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y, moved: false };
  }, []);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!d.moved) { d.moved = true; vpRef.current.setPointerCapture?.(e.pointerId); }
    setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
  }, []);

  const onPointerUp = useCallback(() => {
    if (drag.current?.moved) suppressClick.current = true;
    drag.current = null;
  }, []);

  // Swallow the click that ends a drag so it doesn't select a tile.
  const onClickCapture = useCallback((e) => {
    if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); suppressClick.current = false; }
  }, []);

  const zoomBy = (f) => setView((v) => ({ ...v, scale: Math.min(MAX, Math.max(MIN, v.scale * f)) }));
  const reset = () => { if (vpRef.current) setView({ x: Math.round((vpRef.current.clientWidth - width) / 2), y: 24, scale: 1 }); };

  return (
    <div
      ref={vpRef}
      className={`iso-canvas iso-enter ${canvasClass}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClickCapture={onClickCapture}
    >
      <div
        className={`iso-canvas-inner ${groundClass}`}
        style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {children}
      </div>
      <div className="iso-night" aria-hidden="true" />
      <div className="iso-controls">
        <button type="button" title="Zoom in" onClick={() => zoomBy(1.2)}>+</button>
        <button type="button" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}>−</button>
        <button type="button" title="Reset view" onClick={reset}>⤢</button>
      </div>
    </div>
  );
}
