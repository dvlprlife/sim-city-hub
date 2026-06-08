import { useEffect, useRef, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import PathPicker from './PathPicker.jsx';
import { buildingSprites, DEFAULT_BUILDING_SPRITE, spriteFor } from '../map/buildingSprites.js';

// Lightweight "add a building" modal — opened by clicking a blank lot in a city's
// Buildings view. Appends to the city's RAW buildings (read from
// /api/cities/config so workspace paths aren't round-tripped to absolute) and
// PATCHes the full array (writeCity merges by id, so unsent fields like `tile` on
// existing buildings survive — but the sent array must still carry them all).
export default function NewBuildingModal({ cityId, cityName, onClose, onCreated }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [sprite, setSprite] = useState(DEFAULT_BUILDING_SPRITE);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dialogRef = useRef(null);
  useFocusTrap(dialogRef);

  const submit = async () => {
    if (!id.trim() || !name.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const { cities } = await api.citiesConfig();
      const city = (cities || []).find((c) => c.id === cityId);
      if (!city) throw new Error('City not found');
      const buildings = [...(city.buildings || []), { id: id.trim(), name: name.trim(), absolutePath: path.trim(), sprite }];
      await api.saveCity(cityId, { buildings });
      onCreated?.(id.trim());
    } catch (e) { setError(e.message); setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal compact" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="New building" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">New building{cityName ? ` — ${cityName}` : ''}<button className="modal-close" onClick={onClose} title="Close (Esc)">✕</button></header>
        {error && <div className="error">{error}</div>}
        <div className="modal-body">
          <label className="field">
            <span>ID (slug)</span>
            <input autoFocus value={id} placeholder="e.g. acme" onChange={(e) => { setId(e.target.value); setError(null); }} />
          </label>
          <label className="field">
            <span>Name</span>
            <input value={name} placeholder="e.g. Acme Tower" onChange={(e) => { setName(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </label>
          <label className="field">
            <span>Workspace path</span>
            <PathPicker path={path} editable onChange={setPath} />
          </label>
          <label className="field">
            <span>Graphic</span>
            <div className="config-graphic">
              <img className="config-graphic-swatch" src={spriteFor(sprite).asset} alt="" aria-hidden="true" />
              <select className="config-graphic-select" value={sprite} onChange={(e) => setSprite(e.target.value)}>
                {buildingSprites.map((s) => <option key={s.key} value={s.key}>{s.glyph} {s.label}</option>)}
              </select>
            </div>
          </label>
        </div>
        <div className="modal-foot">
          <button className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="primary" onClick={submit} disabled={saving || !id.trim() || !name.trim()}>{saving ? 'Adding…' : 'Add building'}</button>
        </div>
      </div>
    </div>
  );
}
