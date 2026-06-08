import ActivityBadge from './ActivityBadge.jsx';
import IsoScene from './IsoScene.jsx';
import IsoPerson from './IsoPerson.jsx';
import { buildInterior, TILE_W, TILE_H } from '../map/cityscape.js';
import { avatarFor } from '../map/citizenAvatars.js';
import { modelBadge, modelLabel } from '../lib/models.js';

// THEMED VIEW #2 — the "person screen": the building interior, an office floor
// where each citizen (agent) sits at a desk. No streets/cars/pedestrians here —
// those live in the city (CityBuildings) view.
// Prop contract (fixed; see CLAUDE.md): { cityId, people, onSelectPerson }
// (plus optional `city`, `selectedPersonId`, and additive `personCounts`/`emotes`).
export default function CityInterior({ cityId, city, people, selectedPersonId, onSelectPerson, personCounts = {}, emotes = {}, onAddPerson }) {
  const roster = people || [];
  const scene = buildInterior(roster.length, { perRow: 4 });
  return (
    <div className="interior">
      <h2 className="view-title">{city?.name || cityId} — Citizens</h2>
      <p className="view-sub">Click an agent to chat, or an empty desk to add one · drag to pan · scroll to zoom.</p>
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
                style={{ left: minX, top: minY, width: wd, height: ht, clipPath: `polygon(${poly})`, zIndex: 0 }}
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
          {roster.map((p, i) => {
            const cell = scene.slots[i];
            const sel = p.id === selectedPersonId;
            const running = (personCounts[p.id]?.running || 0) > 0;
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
                {running ? (
                  emote?.kind === 'tool' ? (
                    <span className="emote-bubble tool appear" aria-hidden="true">🔧<span className="emote-text">{emote.text}</span></span>
                  ) : (
                    <span className="think-bubble" aria-hidden="true"><i /><i /><i /></span>
                  )
                ) : (emote?.kind === 'done' || emote?.kind === 'error') ? (
                  <>
                    <span className={`emote-bubble ${emote.kind} appear`} aria-hidden="true">
                      {emote.kind === 'done' ? '✓' : '❗'}
                      {emote.text ? <span className="emote-text">{emote.text}</span> : null}
                    </span>
                    {emote.kind === 'done' && <span className="coin-pop" aria-hidden="true">✓</span>}
                  </>
                ) : null}
              </button>
            );
          })}
        </IsoScene>
    </div>
  );
}
