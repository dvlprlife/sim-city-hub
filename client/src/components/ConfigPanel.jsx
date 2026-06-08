import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../hooks/useApi.js';
import PathPicker from './PathPicker.jsx';
// Building-graphic options come from the Simulated Agent City theme layer — ConfigPanel
// renders the list but hardcodes no sprite strings of its own, so the theme
// stays confined to the map/ + themed-view files (see issue #32 plan).
import { buildingSprites, DEFAULT_BUILDING_SPRITE, spriteFor } from '../map/buildingSprites.js';

// Stable client-side key for an as-yet-unsaved building (so reordering/removing
// rows can't make React reconcile the wrong PathPicker). Stripped before save.
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `b-${Date.now()}-${Math.round(Math.random() * 1e6)}`);

// Editor for cities.json — cities, their buildings (name + workspace path), and
// their rosters (order-preserving). Edits the RAW catalogue (GET
// /api/cities/config returns unresolved paths) so a '.'/relative path is never
// round-tripped into a machine-absolute one. Saves are confirm-gated and write
// the LOCAL cities.json — real workspace paths should not be committed.
export default function ConfigPanel({ allPeople = [], onSaved }) {
  const [cities, setCities] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [errorById, setErrorById] = useState({});
  const [newCityId, setNewCityId] = useState('');
  const [newCityName, setNewCityName] = useState('');
  const [addError, setAddError] = useState(null);
  const [addingCity, setAddingCity] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadConfig = useCallback(
    () => api.citiesConfig()
      .then((data) => setCities((data.cities || []).map((c) => ({
        ...c, people: [...(c.people || [])], buildings: (c.buildings || []).map((b) => ({ ...b })),
      }))))
      .catch((e) => setLoadError(e.message)),
    [],
  );
  useEffect(() => { loadConfig(); }, [loadConfig]);

  const nameById = useMemo(() => {
    const m = {};
    for (const p of allPeople) m[p.id] = p.name;
    return m;
  }, [allPeople]);

  // Any mutation cancels a pending confirm and clears that city's stale flags.
  const touch = (cityId) => {
    setConfirmingId((id) => (id === cityId ? null : id));
    setSavedId((id) => (id === cityId ? null : id));
    setErrorById((e) => (e[cityId] ? { ...e, [cityId]: null } : e));
  };
  const patchCity = (cityId, fn) => {
    setCities((cs) => cs.map((c) => (c.id === cityId ? fn(c) : c)));
    touch(cityId);
  };

  const setField = (cityId, key, value) => patchCity(cityId, (c) => ({ ...c, [key]: value }));

  // --- buildings ---
  const setBuilding = (cityId, i, patch) =>
    patchCity(cityId, (c) => ({ ...c, buildings: c.buildings.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const addBuilding = (cityId) =>
    patchCity(cityId, (c) => ({ ...c, buildings: [...c.buildings, { id: '', name: '', absolutePath: '', _new: true, _key: uid() }] }));
  const removeBuilding = (cityId, i) =>
    patchCity(cityId, (c) => ({ ...c, buildings: c.buildings.filter((_, j) => j !== i) }));

  // --- roster ---
  const moveMember = (cityId, i, dir) =>
    patchCity(cityId, (c) => {
      const j = i + dir;
      if (j < 0 || j >= c.people.length) return c;
      const people = [...c.people];
      [people[i], people[j]] = [people[j], people[i]];
      return { ...c, people };
    });
  const removeMember = (cityId, i) =>
    patchCity(cityId, (c) => ({ ...c, people: c.people.filter((_, j) => j !== i) }));
  const addMember = (cityId, pid) => {
    if (!pid) return;
    patchCity(cityId, (c) => (c.people.includes(pid) ? c : { ...c, people: [...c.people, pid] }));
  };

  const save = async (city) => {
    setSavingId(city.id);
    setErrorById((e) => ({ ...e, [city.id]: null }));
    try {
      // Strip editor-only flags (_new, _key) so they never reach cities.json.
      const buildings = city.buildings.map(({ _new, _key, ...b }) => b);
      const saved = await api.saveCity(city.id, {
        name: city.name, description: city.description ?? '', people: city.people, buildings,
      });
      // Adopt the server's canonical city (drops _new/_key; reflects the merge).
      setCities((cs) => cs.map((c) => (c.id === city.id
        ? { ...c, ...saved, people: [...(saved.people || [])], buildings: (saved.buildings || []).map((b) => ({ ...b })) }
        : c)));
      setConfirmingId(null);
      setSavedId(city.id);
      onSaved?.();
    } catch (e) {
      setErrorById((er) => ({ ...er, [city.id]: e.message }));
      setConfirmingId(null);
    } finally {
      setSavingId(null);
    }
  };

  const addCity = async () => {
    setAddingCity(true);
    setAddError(null);
    try {
      await api.createCity({ id: newCityId.trim(), name: newCityName.trim() });
      setNewCityId('');
      setNewCityName('');
      await loadConfig();
      onSaved?.();
    } catch (e) {
      setAddError(e.message);
    } finally {
      setAddingCity(false);
    }
  };

  const removeCity = async (cityId) => {
    setDeletingId(cityId);
    setErrorById((er) => ({ ...er, [cityId]: null }));
    try {
      await api.deleteCity(cityId);
      setConfirmDeleteId(null);
      await loadConfig();
      onSaved?.();
    } catch (e) {
      setErrorById((er) => ({ ...er, [cityId]: e.message }));
    } finally {
      setDeletingId(null);
    }
  };

  if (loadError) return <div className="error">Failed to load config: {loadError}</div>;
  if (!cities) return <p className="view-sub">Loading config…</p>;

  return (
    <div className="configpanel">
      <h2 className="view-title">Config — cities.json</h2>
      <p className="view-sub">
        Edit cities, buildings (workspace paths), and rosters. Saves write your
        <strong> local</strong> cities.json — real paths should not be committed.
      </p>

      <section className="config-city config-newcity">
        <div className="config-sub">New city</div>
        <div className="config-newcity-row">
          <input className="bid" placeholder="id (slug)" value={newCityId}
            onChange={(e) => { setNewCityId(e.target.value); setAddError(null); }} />
          <input className="bname" placeholder="name" value={newCityName}
            onChange={(e) => { setNewCityName(e.target.value); setAddError(null); }} />
          <button className="primary" disabled={addingCity || !newCityId.trim() || !newCityName.trim()} onClick={addCity}>
            {addingCity ? 'Adding…' : 'Add city'}
          </button>
        </div>
        {addError && <div className="error">{addError}</div>}
      </section>

      {cities.map((city) => {
        const available = allPeople.filter((p) => !city.people.includes(p.id));
        const saving = savingId === city.id;
        return (
          <section className="config-city" key={city.id}>
            <div className="config-city-head">
              <span>{city.name || city.id} <small>{city.id}</small></span>
              {confirmDeleteId === city.id ? (
                <span className="config-roster-actions">
                  <span className="confirm-msg">Delete city {city.id}?</span>
                  <button className="ghost" onClick={() => setConfirmDeleteId(null)} disabled={deletingId === city.id}>Cancel</button>
                  <button className="danger" onClick={() => removeCity(city.id)} disabled={deletingId === city.id}>
                    {deletingId === city.id ? '…' : 'Delete'}
                  </button>
                </span>
              ) : (
                <button className="config-remove" title="Delete city" onClick={() => setConfirmDeleteId(city.id)}>🗑</button>
              )}
            </div>

            <label className="field">
              <span>Name</span>
              <input value={city.name || ''} onChange={(e) => setField(city.id, 'name', e.target.value)} />
            </label>
            <label className="field">
              <span>Description</span>
              <input value={city.description || ''} onChange={(e) => setField(city.id, 'description', e.target.value)} />
            </label>

            <div className="config-sub">Buildings</div>
            {city.buildings.map((b, i) => (
              <div className="config-building" key={b._key || b.id}>
                <div className="config-building-row">
                  {b._new ? (
                    <input className="bid" placeholder="id (slug)" value={b.id}
                      onChange={(e) => setBuilding(city.id, i, { id: e.target.value })} />
                  ) : (
                    <span className="bid mono">{b.id}</span>
                  )}
                  <input className="bname" placeholder="name" value={b.name || ''}
                    onChange={(e) => setBuilding(city.id, i, { name: e.target.value })} />
                  <button className="config-remove" title="Remove building" onClick={() => removeBuilding(city.id, i)}>✕</button>
                </div>
                <PathPicker path={b.absolutePath} editable onChange={(v) => setBuilding(city.id, i, { absolutePath: v })} />
                <div className="config-graphic">
                  <img className="config-graphic-swatch" src={spriteFor(b.sprite).asset} alt="" aria-hidden="true" />
                  <select
                    className="config-graphic-select"
                    value={b.sprite || DEFAULT_BUILDING_SPRITE}
                    onChange={(e) => setBuilding(city.id, i, { sprite: e.target.value })}
                    title="Building graphic shown on the City Map"
                  >
                    {buildingSprites.map((s) => (
                      <option key={s.key} value={s.key}>{s.glyph} {s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            <button className="config-add" onClick={() => addBuilding(city.id)}>+ Add building</button>

            <div className="config-sub">Roster <small>(order = interior tile order)</small></div>
            <ol className="config-roster">
              {city.people.map((pid, i) => (
                <li key={pid}>
                  <span className={nameById[pid] ? '' : 'missing'}>{nameById[pid] || pid}</span>
                  <span className="config-roster-actions">
                    <button title="Move up" disabled={i === 0} onClick={() => moveMember(city.id, i, -1)}>▲</button>
                    <button title="Move down" disabled={i === city.people.length - 1} onClick={() => moveMember(city.id, i, 1)}>▼</button>
                    <button title="Remove" onClick={() => removeMember(city.id, i)}>✕</button>
                  </span>
                </li>
              ))}
            </ol>
            {available.length > 0 && (
              <div className="config-add-member">
                <select value="" onChange={(e) => addMember(city.id, e.target.value)}>
                  <option value="">+ Add citizen…</option>
                  {available.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                </select>
              </div>
            )}

            {errorById[city.id] && <div className="error">{errorById[city.id]}</div>}

            <div className="config-foot">
              {savedId === city.id && <span className="config-saved">saved ✓</span>}
              {confirmingId === city.id ? (
                <>
                  <span className="confirm-msg">Write {city.name || city.id} to cities.json?</span>
                  <button className="ghost" onClick={() => setConfirmingId(null)} disabled={saving}>Cancel</button>
                  <button className="primary" onClick={() => save(city)} disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</button>
                </>
              ) : (
                <button className="primary" onClick={() => setConfirmingId(city.id)} disabled={saving}>Save {city.name || city.id}</button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
