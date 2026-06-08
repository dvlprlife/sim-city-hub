// THEMED overlay — a paper-plane courier that flies across the screen when one
// citizen hands a task off to another. Fired from App's onHandoff, so it's
// view-independent (a fixed full-screen overlay, pointer-events: none) and shows
// up whether you're in the chat, on the map, or anywhere else. The flight + the
// whole element are disabled under `prefers-reduced-motion` via CSS.
//
// Mount with a unique `key` per handoff so React remounts it and the flight
// replays each time. App clears it on a timer (no callback contract here).
export default function HandoffCourier({ name }) {
  return (
    <div className="courier-fx" aria-hidden="true">
      <div className="courier">
        <svg className="courier-plane" viewBox="0 0 24 24">
          <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
        </svg>
        <span className="courier-label">↪ {name}</span>
      </div>
    </div>
  );
}
