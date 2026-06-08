import ActivityBadge from './ActivityBadge.jsx';
import IsoCanvas from './IsoCanvas.jsx';
import IsoPerson from './IsoPerson.jsx';
import { buildRotaryTown } from '../map/cityscape.js';
import { spriteFor } from '../map/buildingSprites.js';

// Sprites that shouldn't puff smoke (open-air / no chimney).
const NO_SMOKE = new Set(['park', 'arena']);

// THEMED VIEW #1b — inside one city: a ROTARY town. A roundabout in the middle
// with offshoot roads, buildings scattered across a grass field, cars driving
// through the rotary and pedestrians strolling its sidewalk (CSS motion paths).
// No tile-grid. Click a building to enter it, or the blank lot to add one.
// Props: { city, buildings, selectedBuildingId, onSelectBuilding(buildingId) }
//   plus additive buildingCounts[`${cityId}::${buildingId}`] = { running, queued }
export default function CityBuildings({ city, buildings, selectedBuildingId, onSelectBuilding, buildingCounts = {}, onAddBuilding }) {
  const list = buildings || [];
  const scene = buildRotaryTown(list.length);
  const { cx, cy } = scene.center;

  return (
    <div className="citybuildings">
      <h2 className="view-title">{city?.name || 'City'} — Buildings</h2>
      <p className="view-sub">Click a building to enter it, or the blank lot to add one · drag to pan · scroll to zoom.</p>
      <IsoCanvas width={scene.width} height={scene.height} canvasClass="iso-field">
        {/* Roads: offshoots, then the rotary ring over them, then the grass island.
            Each road has a soft shoulder that blends into the field + asphalt. */}
        <svg className="town-roads" width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`} aria-hidden="true">
          {scene.spokes.map((s, i) => (
            <line key={`sp-sh${i}`} className="road-shoulder" x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
          ))}
          {scene.spokes.map((s, i) => (
            <line key={`sp${i}`} className="road-asphalt" x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
          ))}
          <circle className="road-shoulder" cx={cx} cy={cy} r={scene.rotaryR} />
          <circle className="road-asphalt" cx={cx} cy={cy} r={scene.rotaryR} />
          <circle className="rotary-island" cx={cx} cy={cy} r={scene.islandR} />
        </svg>

        {/* Fountain/tree on the rotary island. */}
        <img className="town-tree town-island-tree" src="/assets/iso/tree.png" alt="" draggable="false" style={{ left: cx, top: cy + 4, zIndex: Math.round(200 + cy) }} />

        {scene.trees.map((c, i) => (
          <img key={`t${i}`} className="town-tree" src="/assets/iso/tree.png" alt="" draggable="false" style={{ left: c.left, top: c.top, zIndex: c.z }} />
        ))}
        {scene.bushes.map((c, i) => (
          <span key={`bush${i}`} className="town-bush" aria-hidden="true" style={{ left: c.left, top: c.top, zIndex: c.z }} />
        ))}

        {scene.lamps.map((c, i) => (
          <span key={`lamp${i}`} className="street-lamp" aria-hidden="true" style={{ left: c.left, top: c.top, zIndex: c.z }}>
            <span className="lamp-pool" />
            <span className="lamp-pole" />
            <span className="lamp-head" />
            <span className="lamp-glow" />
          </span>
        ))}

        {/* Cars drive through the rotary (offset-rotate: auto → turn with the road);
            pedestrians stroll the rotary sidewalk, upright. */}
        {scene.cars.map((c, i) => (
          <span key={`car${i}`} className="town-car" style={{ offsetPath: `path('${scene.carPaths[i % scene.carPaths.length]}')`, color: c.color, '--dur': `${c.dur}s`, '--delay': `${c.delay}s` }} aria-hidden="true">
            <span className="town-car-top" />
          </span>
        ))}
        {scene.peds.map((p, i) => (
          <span key={`ped${i}`} className="town-ped" style={{ offsetPath: `path('${scene.pedLoop}')`, '--dur': `${p.dur}s`, '--delay': `${p.delay}s` }} aria-hidden="true">
            <IsoPerson avatar={{ shirt: p.shirt }} scale={0.72} />
          </span>
        ))}

        {list.map((b, i) => {
          const spr = spriteFor(b.sprite);
          const cell = scene.slots[i];
          const sel = b.id === selectedBuildingId;
          const running = (buildingCounts[`${city?.id}::${b.id}`]?.running || 0) > 0;
          return (
            <button
              key={b.id}
              className={`scene-item building${sel ? ' sel' : ''}${running ? ' running' : ''}`}
              style={{ left: cell.left, top: cell.top, zIndex: sel ? 99999 : cell.z }}
              title={`${b.name}${b.absolutePath ? ` — ${b.absolutePath}` : ''}`}
              onClick={() => onSelectBuilding(b.id)}
            >
              <span className="scene-shadow" aria-hidden="true" />
              <img className="scene-sprite" src={spr.asset} alt="" draggable="false" />
              {!NO_SMOKE.has(b.sprite) && (
                <span className="bldg-smoke" aria-hidden="true" style={{ '--sd': `${(i % 4) * 1.3}s` }}><i /><i /><i /></span>
              )}
              <span className="bldg-glow" aria-hidden="true" />
              <span className="scene-label">{b.name}<ActivityBadge counts={buildingCounts[`${city?.id}::${b.id}`]} /></span>
            </button>
          );
        })}

        {onAddBuilding && (
          <button className="scene-add town-add" style={{ left: scene.addSlot.left, top: scene.addSlot.top, zIndex: scene.addSlot.z }} title="Add building" onClick={onAddBuilding}>
            <span className="town-add-art" aria-hidden="true"><span className="town-add-plus">+</span></span>
            <span className="scene-add-label">Add building</span>
          </button>
        )}
      </IsoCanvas>
    </div>
  );
}
