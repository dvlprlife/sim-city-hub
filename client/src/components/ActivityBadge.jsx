// Generic, theme-neutral activity pill: shows how many agents are in-flight
// (running + queued) and pulses while any is actually running. Renders nothing
// when idle, so quiet tiles stay visually unchanged. Used by the themed map
// views (CityMap / CityInterior) but holds no theme strings itself.
export default function ActivityBadge({ counts }) {
  const running = counts?.running || 0;
  const queued = counts?.queued || 0;
  const total = running + queued;
  if (total <= 0) return null;
  const title = `${running} running${queued ? `, ${queued} queued` : ''}`;
  return (
    <span className={`activity-badge${running ? ' active' : ''}`} title={title}>
      {running > 0 && <span className="run-dot" aria-hidden="true">●</span>}
      {total}
    </span>
  );
}
