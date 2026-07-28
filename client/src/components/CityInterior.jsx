import ActivityBadge from './ActivityBadge.jsx';
import IsoScene from './IsoScene.jsx';
import IsoPerson from './IsoPerson.jsx';
import { buildInterior, TILE_W, TILE_H } from '../map/cityscape.js';
import { avatarFor } from '../map/citizenAvatars.js';
import { modelBadge, modelLabel } from '../lib/models.js';

// THEMED VIEW #2 — the "person screen": the building and its yard. The floor is
// roofless so you see the desks inside; the grass, walkway, fence and trees around
// it are this building's lot. Citizens WALK a looping path around the yard while
// idle and take their desk while a run is in flight, so the view reads at a glance
// as who is working. No streets/cars here — those live in the city view.
// Prop contract (fixed; see CLAUDE.md): { cityId, people, onSelectPerson }
// (plus optional `city`, `selectedPersonId`, and additive `personCounts`/`emotes`).
export default function CityInterior({ cityId, city, people, selectedPersonId, onSelectPerson, personCounts = {}, emotes = {}, onAddPerson }) {
  const roster = people || [];
  const scene = buildInterior(roster.length, { perRow: 4 });
  const isRunning = (p) => (personCounts[p.id]?.running || 0) > 0;
  // Idle citizens are spread evenly around the loop by starting each one further
  // along it (a negative delay on a running animation = start part-way through).
  const strollers = roster.filter((p) => !isRunning(p));
  return (
    <div className="interior">
      <h2 className="view-title">{city?.name || cityId} — Citizens</h2>
      <p className="view-sub">
        Click an agent to chat, or an empty desk to add one · idle agents stroll the
        yard (hover to stop one) · drag to pan · scroll to zoom.
      </p>
        <IsoScene scene={scene} onAdd={onAddPerson} addLabel="Add citizen">
          {(scene.walls || []).map((w, i) => {
            const xs = w.pts.map((p) => p.x);
            const ys = w.pts.map((p) => p.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const wd = Math.max(...xs) - minX;
            const ht = Math.max(...ys) - minY;
            const poly = w.pts.map((p) => `${(((p.x - minX) / wd) * 100).toFixed(2)}% ${(((p.y - minY) / ht) * 100).toFixed(2)}%`).join(', ');
            return (
              <span
                key={`wall${i}`}
                className={`office-wall wall-${w.side}`}
                aria-hidden="true"
                style={{ left: minX, top: minY, width: wd, height: ht, clipPath: `polygon(${poly})`, zIndex: w.z ?? 0 }}
              />
            );
          })}
          {(scene.props || []).map((c, i) => (
            <span
              key={`plant${i}`}
              className="office-plant"
              aria-hidden="true"
              style={{ left: c.left + TILE_W / 2, top: c.top + TILE_H / 2, zIndex: c.z }}
            >
              <span className="leaves" />
              <span className="pot" />
            </span>
          ))}
          {/* Indoor furnishing under the roof (cabinets along the back, a rug). */}
          {(scene.furniture || []).map((f, i) => (
            <span
              key={`furn${i}`}
              className={`office-${f.kind}`}
              aria-hidden="true"
              style={{ left: f.left + TILE_W / 2, top: f.top + TILE_H / 2, zIndex: f.z }}
            />
          ))}
          {/* The roof, lifted away on entry to reveal the floor below. Purely
              decorative and non-interactive, so it can never eat a desk click. */}
          {scene.roof && (() => {
            const r = scene.roof;
            const xs = r.pts.map((p) => p.x); const ys = r.pts.map((p) => p.y);
            const minX = Math.min(...xs); const minY = Math.min(...ys);
            const wd = Math.max(...xs) - minX; const ht = Math.max(...ys) - minY;
            const poly = r.pts.map((p) => `${(((p.x - minX) / wd) * 100).toFixed(2)}% ${(((p.y - minY) / ht) * 100).toFixed(2)}%`).join(', ');
            return (
              <span
                className="office-roof"
                aria-hidden="true"
                style={{ left: minX, top: minY, width: wd, height: ht, zIndex: r.z, clipPath: `polygon(${poly})` }}
              />
            );
          })()}
          {/* Fence around the lot, with a gap where the walkway reaches the gate. */}
          {(scene.fence || []).map((f, i) => (
            <span
              key={`fence${i}`}
              className={`lot-fence fence-${f.side}`}
              aria-hidden="true"
              style={{ left: f.left + TILE_W / 2, top: f.top + TILE_H / 2, zIndex: f.z }}
            />
          ))}
          {/* An empty desk stands in for a citizen who is out strolling the yard. */}
          {roster.map((p, i) => {
            const cell = scene.slots[i];
            if (!cell || (personCounts[p.id]?.running || 0) > 0) return null;
            return (
              <span key={`desk-${p.id}`} className="lot-desk" aria-hidden="true" style={{ left: cell.left + TILE_W / 2, top: cell.top + TILE_H / 2, zIndex: cell.z }}>
                <span className="scene-desk" />
                <span className="desk-monitor" />
              </span>
            );
          })}
          {/* Idle citizens walk a loop through the yard, around the building. Each
              starts further along the path (negative delay) so they spread out;
              hovering pauses one so a moving target is still easy to click. */}
          {strollers.map((p, i) => {
            const sel = p.id === selectedPersonId;
            const dur = 52 + (i % 4) * 7;
            // A run's done/error emote lands AFTER the run ends — by which point the
            // citizen has left their desk — so the bubble has to travel with them.
            const emote = emotes[p.id];
            const finished = emote?.kind === 'done' || emote?.kind === 'error';
            return (
              <button
                key={`walk-${p.id}`}
                className={`lot-walker${sel ? ' sel' : ''}`}
                style={{ offsetPath: `path('${scene.walkLoop}')`, '--dur': `${dur}s`, '--delay': `${-(i / Math.max(1, strollers.length)) * dur}s` }}
                title={`${p.name}${p.job ? ` — ${p.job}` : ''} · idle`}
                onClick={() => onSelectPerson(p.id)}
              >
                <span className="ped-shadow" aria-hidden="true" />
                <IsoPerson avatar={avatarFor(p.icon)} scale={0.95} />
                <span className="lot-walker-label">{p.name}<ActivityBadge counts={personCounts[p.id]} /></span>
                {finished && (
                  <>
                    <span className={`emote-bubble ${emote.kind} appear`} aria-hidden="true">
                      {emote.kind === 'done' ? '✓' : '❗'}
                      {emote.text ? <span className="emote-text">{emote.text}</span> : null}
                    </span>
                    {emote.kind === 'done' && <span className="coin-pop" aria-hidden="true">✓</span>}
                  </>
                )}
              </button>
            );
          })}
          {roster.map((p, i) => {
            const cell = scene.slots[i];
            const sel = p.id === selectedPersonId;
            const running = (personCounts[p.id]?.running || 0) > 0;
            if (!running) return null;          // out in the yard — drawn above
            const emote = emotes[p.id];
            return (
              <button
                key={p.id}
                className={`scene-item citizen${sel ? ' sel' : ''}${running ? ' running' : ''}`}
                style={{ left: cell.left + TILE_W / 2, top: cell.top + TILE_H / 2, zIndex: sel ? 99999 : cell.z }}
                title={`${p.job || ''}${p.defaultModel ? ` · ${modelLabel(p.defaultModel)}` : ''}`}
                onClick={() => onSelectPerson(p.id)}
              >
                <span className="scene-shadow" aria-hidden="true" />
                <span className="scene-avatar" style={{ '--bd': `${(-(i % 6) * 0.45).toFixed(2)}s` }}><IsoPerson avatar={avatarFor(p.icon)} className="seated" scale={1.3} /></span>
                <span className="scene-desk" aria-hidden="true" />
                <span className="desk-monitor" aria-hidden="true" />
                <span className="scene-label">{p.name}<ActivityBadge counts={personCounts[p.id]} /></span>
                <span className="scene-sub">{modelBadge(p.defaultModel)}</span>
                {/* Only in-flight states here — this branch renders solely while
                    running; done/error land after the citizen has gone back out. */}
                {emote?.kind === 'tool' ? (
                  <span className="emote-bubble tool appear" aria-hidden="true">🔧<span className="emote-text">{emote.text}</span></span>
                ) : (
                  <span className="think-bubble" aria-hidden="true"><i /><i /><i /></span>
                )}
              </button>
            );
          })}
        </IsoScene>
    </div>
  );
}
