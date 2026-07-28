import ActivityBadge from './ActivityBadge.jsx';
import IsoCanvas from './IsoCanvas.jsx';
import IsoPerson from './IsoPerson.jsx';
import { buildLot } from '../map/cityscape.js';
import { avatarFor } from '../map/citizenAvatars.js';
import { modelBadge, modelLabel } from '../lib/models.js';

// THEMED VIEW #2 (top-down) — one building's LOT seen from above, in the same
// flat visual language as the rotary town (CityBuildings): grass field, asphalt
// driveway, fence, trees, lamps, and people walking a footpath via CSS motion
// paths. The building is drawn ROOFLESS so you see the desks inside — the
// roof-off reveal a top-down game does when you step indoors — and the roof
// itself lifts away as you arrive.
//
// Citizens with a run in flight are at their desk; idle ones stroll the path
// around the building. Hovering a stroller pauses them so they stay clickable.
// Prop contract matches CityInterior (see CLAUDE.md): { cityId, people,
// onSelectPerson } plus optional `city`, `selectedPersonId`, `personCounts`,
// `emotes`, `onAddPerson`.
export default function CityLot({ cityId, city, people, selectedPersonId, onSelectPerson, personCounts = {}, emotes = {}, onAddPerson }) {
  const roster = people || [];
  const scene = buildLot(roster.length, { perRow: 4 });
  const b = scene.building;
  const isRunning = (p) => (personCounts[p.id]?.running || 0) > 0;
  const strollers = roster.filter((p) => !isRunning(p));

  const finishedEmote = (p) => {
    const e = emotes[p.id];
    return e?.kind === 'done' || e?.kind === 'error' ? e : null;
  };

  return (
    <div className="citylot">
      <h2 className="view-title">{city?.name || cityId} — Citizens</h2>
      <p className="view-sub">
        Click an agent to chat, or the empty desk to add one · idle agents walk the
        grounds (hover to stop one) · drag to pan · scroll to zoom.
      </p>
      <IsoCanvas width={scene.width} height={scene.height} canvasClass="iso-field">
        {/* Driveway out to the road, drawn with the town's road classes so the
            asphalt and shoulder match the city view exactly. */}
        <svg className="town-roads" width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`} aria-hidden="true">
          <line className="road-shoulder" x1={scene.drive.x1} y1={scene.drive.y1} x2={scene.drive.x2} y2={scene.drive.y2} />
          <line className="road-asphalt" x1={scene.drive.x1} y1={scene.drive.y1} x2={scene.drive.x2} y2={scene.drive.y2} />
          <line className="road-shoulder" x1={0} y1={scene.road.y} x2={scene.width} y2={scene.road.y} />
          <line className="road-asphalt" x1={0} y1={scene.road.y} x2={scene.width} y2={scene.road.y} />
        </svg>

        {scene.fence.map((f, i) => (
          <span key={`fence${i}`} className={`lot-fence fence-${f.dir}`} aria-hidden="true" style={{ left: f.left, top: f.top, width: f.w }} />
        ))}

        {/* The building: walls enclosing a floor, drawn roofless. */}
        <span className="lot-building" aria-hidden="true" style={{ left: b.left, top: b.top, width: b.w, height: b.h, borderWidth: b.wall, zIndex: 150 }}>
          <span className="lot-floor" />
        </span>
        <span className="lot-door" aria-hidden="true" style={{ left: scene.door.left, top: scene.door.top, width: scene.door.w, zIndex: 152 }} />

        <span className="lot-rug" aria-hidden="true" style={{ left: scene.rug.left, top: scene.rug.top, zIndex: 151 }} />
        {scene.cabinets.map((c, i) => (
          <span key={`cab${i}`} className="lot-cabinet" aria-hidden="true" style={{ left: c.left, top: c.top, zIndex: c.z }} />
        ))}

        {scene.bushes.map((c, i) => (
          <span key={`bush${i}`} className="town-bush" aria-hidden="true" style={{ left: c.left, top: c.top, zIndex: c.z }} />
        ))}
        {scene.trees.map((c, i) => (
          <img key={`tree${i}`} className="town-tree" src="/assets/iso/tree.png" alt="" draggable="false" style={{ left: c.left, top: c.top, zIndex: c.z }} />
        ))}
        {scene.lamps.map((c, i) => (
          <span key={`lamp${i}`} className="street-lamp" aria-hidden="true" style={{ left: c.left, top: c.top, zIndex: c.z }}>
            <span className="lamp-pool" />
            <span className="lamp-pole" />
            <span className="lamp-head" />
            <span className="lamp-glow" />
          </span>
        ))}

        {/* Desks. A desk whose citizen is outside is left empty. */}
        {roster.map((p, i) => {
          const cell = scene.slots[i];
          if (!cell || isRunning(p)) return null;
          return (
            <span key={`desk-${p.id}`} className="lot-desk" aria-hidden="true" style={{ left: cell.left, top: cell.top, zIndex: cell.z }}>
              <span className="lot-desk-top" />
              <span className="lot-desk-screen" />
            </span>
          );
        })}

        {/* Seated: only citizens with a live run. */}
        {roster.map((p, i) => {
          const cell = scene.slots[i];
          if (!cell || !isRunning(p)) return null;
          const sel = p.id === selectedPersonId;
          const emote = emotes[p.id];
          return (
            <button
              key={`seat-${p.id}`}
              className={`lot-seat${sel ? ' sel' : ''} running`}
              style={{ left: cell.left, top: cell.top, zIndex: sel ? 99999 : cell.z + 2 }}
              title={`${p.job || ''}${p.defaultModel ? ` · ${modelLabel(p.defaultModel)}` : ''}`}
              onClick={() => onSelectPerson(p.id)}
            >
              <span className="lot-desk-top" aria-hidden="true" />
              <span className="lot-desk-screen" aria-hidden="true" />
              <span className="lot-seat-person"><IsoPerson avatar={avatarFor(p.icon)} scale={0.9} /></span>
              <span className="scene-label">{p.name}<ActivityBadge counts={personCounts[p.id]} /></span>
              <span className="scene-sub">{modelBadge(p.defaultModel)}</span>
              {emote?.kind === 'tool' ? (
                <span className="emote-bubble tool appear" aria-hidden="true">🔧<span className="emote-text">{emote.text}</span></span>
              ) : (
                <span className="think-bubble" aria-hidden="true"><i /><i /><i /></span>
              )}
            </button>
          );
        })}

        {/* The empty "add citizen" desk. */}
        {onAddPerson && (
          <button className="lot-add" style={{ left: scene.addSlot.left, top: scene.addSlot.top, zIndex: scene.addSlot.z }} title="Add citizen" onClick={onAddPerson}>
            <span className="lot-add-art" aria-hidden="true"><span className="lot-add-plus">+</span></span>
            <span className="scene-add-label">Add citizen</span>
          </button>
        )}

        {/* Idle citizens walking the grounds. Each starts further along the loop
            (negative delay) so they spread out; hover pauses one to click it. A
            finished run's ✓/❗ lands after the agent has left the desk, so the
            bubble travels with them. */}
        {strollers.map((p, i) => {
          const sel = p.id === selectedPersonId;
          const dur = 46 + (i % 4) * 6;
          const emote = finishedEmote(p);
          return (
            <button
              key={`walk-${p.id}`}
              className={`lot-walker${sel ? ' sel' : ''}`}
              style={{ offsetPath: `path('${scene.walkLoop}')`, '--dur': `${dur}s`, '--delay': `${-(i / Math.max(1, strollers.length)) * dur}s` }}
              title={`${p.name}${p.job ? ` — ${p.job}` : ''} · idle`}
              onClick={() => onSelectPerson(p.id)}
            >
              <IsoPerson avatar={avatarFor(p.icon)} scale={0.82} />
              <span className="lot-walker-label">{p.name}<ActivityBadge counts={personCounts[p.id]} /></span>
              {emote && (
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

        {/* The roof, lifted away on arrival to reveal the floor. Decorative only,
            so it can never swallow a click on a desk underneath. */}
        <span className="lot-roof" aria-hidden="true" style={{ left: b.left - 10, top: b.top - 10, width: b.w + 20, height: b.h + 20, zIndex: 900 }} />
      </IsoCanvas>
    </div>
  );
}
