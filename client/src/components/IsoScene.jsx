import IsoCanvas from './IsoCanvas.jsx';
import IsoPerson from './IsoPerson.jsx';
import { TILE_W, TILE_H } from '../map/cityscape.js';

// Renders a city scene (from buildScene): the ground tile grid + scenery trees +
// a clickable empty "add" plot, inside the pan/zoom IsoCanvas. The caller
// positions its own items (buildings / citizens / city plates) over `scene.slots`
// as children, and passes `onAdd` (+ `addLabel`) to make the blank plot create a
// new entity for the current screen. Theme-confined.
export default function IsoScene({ scene, onAdd, addLabel = 'Add', children }) {
  return (
    <IsoCanvas width={scene.width} height={scene.height} groundClass="iso-scene">
      {scene.ground.map((c) => (
        <span
          key={`g${c.x}-${c.y}`}
          className={`gtile g-${c.type}`}
          style={{ left: c.left, top: c.top, width: TILE_W, height: TILE_H, zIndex: c.z }}
        />
      ))}
      {scene.trees.map((c, i) => (
        <img
          key={`t${i}`}
          className="scene-tree"
          src="/assets/iso/tree.png"
          alt=""
          draggable="false"
          style={{ left: c.left + TILE_W / 2, top: c.top + TILE_H / 2, zIndex: c.z }}
        />
      ))}
      {(scene.cars || []).map((c, i) => (
        <img
          key={`car${i}`}
          className="scene-car"
          src={`/assets/iso/cars/${c.sprite}.png`}
          alt=""
          draggable="false"
          style={{
            left: c.left + TILE_W / 2,
            top: c.top + TILE_H / 2,
            zIndex: c.z,
            '--dx': `${c.dx}px`,
            '--dy': `${c.dy}px`,
            '--dur': `${c.dur}s`,
            '--delay': `${c.delay}s`,
          }}
        />
      ))}
      {(scene.peds || []).map((p, i) => (
        <span
          key={`ped${i}`}
          className="scene-ped"
          style={{
            left: p.left + TILE_W / 2,
            top: p.top + TILE_H / 2,
            zIndex: p.z,
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            '--dur': `${p.dur}s`,
            '--delay': `${p.delay}s`,
          }}
        >
          <span className="ped-shadow" />
          <IsoPerson avatar={{ shirt: p.shirt }} scale={0.78} />
          {p.courier && <span className="ped-parcel" />}
        </span>
      ))}
      {(scene.lamps || []).map((c, i) => (
        <span
          key={`lamp${i}`}
          className="street-lamp"
          aria-hidden="true"
          style={{ left: c.left + TILE_W / 2, top: c.top + TILE_H / 2, zIndex: c.z }}
        >
          <span className="lamp-pool" />
          <span className="lamp-pole" />
          <span className="lamp-head" />
          <span className="lamp-glow" />
        </span>
      ))}
      {onAdd && scene.addSlots.map((c, i) => (
        <button
          key={`add${i}`}
          className="scene-add"
          style={{ left: c.left + TILE_W / 2, top: c.top + TILE_H / 2, zIndex: c.z }}
          title={addLabel}
          onClick={onAdd}
        >
          <span className="scene-add-tile" aria-hidden="true" />
          <span className="scene-add-plus" aria-hidden="true">+</span>
          <span className="scene-add-label">{addLabel}</span>
        </button>
      ))}
      {children}
    </IsoCanvas>
  );
}
