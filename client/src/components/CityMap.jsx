import ActivityBadge from './ActivityBadge.jsx';
import { spriteFor } from '../map/buildingSprites.js';

// Raindrops for the passing shower — a deterministic spread (no Math.random) so
// they don't re-shuffle on every render. Each drop falls on its own loop; the
// parent .ls-rain layer fades the WHOLE shower in and out over a long cycle, so
// it reads as weather passing through rather than constant rain.
const RAIN_DROPS = Array.from({ length: 34 }, (_, i) => ({
  left: `${(i * 97) % 100}%`,
  dur: `${0.55 + ((i * 7) % 5) * 0.09}s`,
  delay: `${-(((i * 13) % 20) * 0.12).toFixed(2)}s`,
}));

// THEMED VIEW #1 — the world overview as a LANDSCAPE (not an iso plate): a sky +
// rolling hills + a grassy foreground, with each CITY sitting on the grass as a
// little cluster of its real building sprites. No boxed ground tile-grid — the
// cities live directly on the living landscape. Click a city to enter; click the
// empty lot to add one. Theme art is confined to this component + map/ + CSS.
// Prop contract (drill-down model — fixed; see CLAUDE.md "Frontend prop contracts"):
//   cities, onEnterCity(cityId)   (+ additive cityCounts[cityId] = {running,queued})

// A little town: up to three of the city's real building sprites, overlapped, laid
// out in normal flow (so it sits on the landscape rather than an iso anchor).
function CityCluster({ buildings }) {
  const shown = (buildings || []).slice(0, 3);
  if (!shown.length) return <span className="ls-empty">∅</span>;
  return shown.map((b) => <img key={b.id} className="ls-mini" src={spriteFor(b.sprite).asset} alt="" draggable="false" />);
}

export default function CityMap({ cities, onEnterCity, cityCounts = {}, onAddCity }) {
  return (
    <div className="worldmap">
      <h2 className="view-title">City Map</h2>
      <p className="view-sub">Click a city to enter, or the empty lot to add one.</p>
      <div className="landscape">
        <span className="ls-sun" aria-hidden="true" />
        <span className="ls-cloud ls-cloud-a" aria-hidden="true" />
        <span className="ls-cloud ls-cloud-b" aria-hidden="true" />

        {/* Birds drifting across the sky (CSS-drawn ⌒⌒ silhouettes that flap). */}
        <span className="ls-bird" style={{ top: '14%', '--dur': '64s', '--delay': '-8s' }} aria-hidden="true"><i /></span>
        <span className="ls-bird" style={{ top: '21%', '--dur': '83s', '--delay': '-47s' }} aria-hidden="true"><i /></span>
        <span className="ls-bird" style={{ top: '9%', '--dur': '74s', '--delay': '-31s' }} aria-hidden="true"><i /></span>
        <span className="ls-hill ls-hill-back" aria-hidden="true" />
        <span className="ls-hill ls-hill-mid" aria-hidden="true" />
        <span className="ls-hill ls-hill-front" aria-hidden="true" />
        <div className="ls-ground" aria-hidden="true" />
        <img className="ls-tree ls-tree-a" src="/assets/iso/tree.png" alt="" aria-hidden="true" draggable="false" />
        <img className="ls-tree ls-tree-b" src="/assets/iso/tree.png" alt="" aria-hidden="true" draggable="false" />
        <img className="ls-tree ls-tree-c" src="/assets/iso/tree.png" alt="" aria-hidden="true" draggable="false" />

        <div className="ls-cities">
          {cities.map((c, i) => {
            const running = (cityCounts[c.id]?.running || 0) > 0;
            return (
              <button
                key={c.id}
                className={`ls-city${running ? ' running' : ''}`}
                style={{ '--lift': `${(i % 2) * 16}px` }}
                onClick={() => onEnterCity(c.id)}
                title={c.description}
              >
                <span className="ls-city-art">
                  <CityCluster buildings={c.buildings} />
                  <span className="ls-glow" aria-hidden="true" />
                  <span className="ls-shadow" aria-hidden="true" />
                </span>
                <span className="ls-name">{c.name}<ActivityBadge counts={cityCounts[c.id]} /></span>
                <span className="ls-sub">{(c.buildings?.length ?? 0)} 🏢 · {(c.people?.length ?? 0)} 👤</span>
              </button>
            );
          })}
          <button className="ls-city ls-add" onClick={onAddCity} title="Add city">
            <span className="ls-city-art ls-add-art">
              <span className="ls-add-plus" aria-hidden="true">+</span>
              <span className="ls-shadow" aria-hidden="true" />
            </span>
            <span className="ls-name">Add city</span>
          </button>
        </div>

        {/* A passing rain shower — drops fall continuously; the layer fades the
            whole shower in and out so it comes and goes like real weather. */}
        <div className="ls-rain" aria-hidden="true">
          {RAIN_DROPS.map((d, i) => (
            <b key={i} style={{ left: d.left, '--rd': d.dur, '--rdelay': d.delay }} />
          ))}
        </div>

        <div className="landscape-night" aria-hidden="true" />
      </div>
    </div>
  );
}
