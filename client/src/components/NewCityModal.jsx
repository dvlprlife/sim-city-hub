import { useEffect, useRef, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';

// Lightweight "add a city" modal — opened by clicking a blank lot on the City
// Map. Writes via POST /api/cities, then hands the new id back to the caller.
export default function NewCityModal({ onClose, onCreated }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
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
      const city = await api.createCity({ id: id.trim(), name: name.trim() });
      onCreated?.(city?.id || id.trim());
    } catch (e) { setError(e.message); setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal compact" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="New city" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">New city<button className="modal-close" onClick={onClose} title="Close (Esc)">✕</button></header>
        {error && <div className="error">{error}</div>}
        <div className="modal-body">
          <label className="field">
            <span>ID (slug)</span>
            <input autoFocus value={id} placeholder="e.g. downtown" onChange={(e) => { setId(e.target.value); setError(null); }} />
          </label>
          <label className="field">
            <span>Name</span>
            <input value={name} placeholder="e.g. Downtown" onChange={(e) => { setName(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </label>
          <p className="modal-hint">Starts empty — add buildings and citizens after.</p>
        </div>
        <div className="modal-foot">
          <button className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="primary" onClick={submit} disabled={saving || !id.trim() || !name.trim()}>{saving ? 'Creating…' : 'Create city'}</button>
        </div>
      </div>
    </div>
  );
}
