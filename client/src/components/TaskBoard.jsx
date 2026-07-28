import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { peopleFor } from '../lib/roster.js';

// THEMED VIEW — "City Hall": a work-order board over the backend tasks API
// (GET/POST/PATCH/DELETE /api/tasks). Queue work for a city's citizens, move it
// across todo → in progress → done, and spawn an agent directly on a task. The
// board is theme flavour ("work orders"); the data underneath is generic tasks.
const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];
const PRIORITIES = ['high', 'medium', 'low'];
const PRIO_LABEL = { high: '▲ High', medium: '● Medium', low: '▼ Low' };
const NEXT = { todo: 'in_progress', in_progress: 'done' };
const PREV = { done: 'in_progress', in_progress: 'todo' };

export default function TaskBoard({ cities = [], allPeople = [], defaultCityId = null, onSpawnTask }) {
  const [filterCity, setFilterCity] = useState(defaultCityId || cities[0]?.id || '');
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [priority, setPriority] = useState('medium');
  const [buildingId, setBuildingId] = useState('');
  const [personId, setPersonId] = useState('');

  const city = useMemo(() => cities.find((c) => c.id === filterCity) || null, [cities, filterCity]);
  const buildings = city?.buildings || [];
  // Assignees follow the chosen workspace (rosters are per-building); before one
  // is picked, offer everyone staffed anywhere in the city.
  const people = useMemo(() => peopleFor(city, buildingId), [city, buildingId]);

  const load = useCallback(() => {
    if (!filterCity) { setTasks([]); return; }
    setError(null);
    api.tasks({ cityId: filterCity })
      .then((rows) => setTasks(Array.isArray(rows) ? rows : []))
      .catch((e) => setError(e.message));
  }, [filterCity]);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!title.trim() || !filterCity) return;
    try {
      await api.createTask({
        cityId: filterCity,
        title: title.trim(),
        description: desc.trim() || null,
        priority,
        buildingId: buildingId || null,
        personId: personId || null,
      });
      setTitle(''); setDesc(''); setPriority('medium'); setBuildingId(''); setPersonId('');
      load();
    } catch (e2) { setError(e2.message); }
  };

  const move = (t, status) => api.updateTask(t.id, { status }).then(load).catch((e) => setError(e.message));
  const remove = (id) => api.deleteTask(id).then(() => { setConfirmDel(null); load(); }).catch((e) => setError(e.message));

  const nameOf = (pid) => allPeople.find((p) => p.id === pid)?.name || pid;
  const bldgOf = (bid) => buildings.find((b) => b.id === bid)?.name || bid;
  const inColumn = (s) => tasks.filter((t) => t.status === s);

  return (
    <div className="taskboard">
      <div className="usage-head">
        <h2 className="view-title">City Hall — Work Orders</h2>
        <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} aria-label="City">
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <p className="view-sub">Queue work for a city's citizens, then spawn an agent on a task (assign a citizen + building to enable ▶ Run).</p>

      <form className="tb-new" onSubmit={create}>
        <div className="tb-new-row">
          <input className="tb-title" placeholder="New work order…" aria-label="Work order title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIO_LABEL[p]}</option>)}
          </select>
          <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} aria-label="Building">
            <option value="">(any building)</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Citizen">
            <option value="">(unassigned)</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="primary" type="submit" disabled={!title.trim()}>Add</button>
        </div>
        <textarea className="tb-desc" placeholder="Details / the prompt the agent runs (optional)…" aria-label="Work order details" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </form>

      {error && <div className="error">{error}</div>}

      <div className="tb-columns">
        {COLUMNS.map((col) => (
          <div key={col.key} className="tb-col">
            <div className="tb-col-head">{col.label} <span className="tb-count">{inColumn(col.key).length}</span></div>
            {inColumn(col.key).map((t) => {
              const canSpawn = t.person_id && t.building_id && t.status !== 'done';
              return (
                <div key={t.id} className={`tb-card prio-${t.priority}`}>
                  <div className="tb-card-title">{t.title}</div>
                  {t.description && <div className="tb-card-desc">{t.description}</div>}
                  <div className="tb-card-meta">
                    <span className={`tb-prio prio-${t.priority}`}>{PRIO_LABEL[t.priority]}</span>
                    {t.person_id && <span className="tb-tag">👤 {nameOf(t.person_id)}</span>}
                    {t.building_id && <span className="tb-tag">🏢 {bldgOf(t.building_id)}</span>}
                  </div>
                  <div className="tb-card-actions">
                    {PREV[t.status] && <button title="Move back" onClick={() => move(t, PREV[t.status])}>←</button>}
                    {NEXT[t.status] && <button title="Move forward" onClick={() => move(t, NEXT[t.status])}>→</button>}
                    {canSpawn && <button className="tb-spawn" title="Spawn an agent on this task" onClick={() => onSpawnTask?.(t)}>▶ Run</button>}
                    {confirmDel === t.id ? (
                      <span className="tb-confirm">
                        <span className="confirm-msg">Delete?</span>
                        <button className="tb-del-go" onClick={() => remove(t.id)}>Yes</button>
                        <button onClick={() => setConfirmDel(null)}>No</button>
                      </span>
                    ) : (
                      <button className="tb-del" title="Delete" onClick={() => setConfirmDel(t.id)}>🗑</button>
                    )}
                  </div>
                </div>
              );
            })}
            {!inColumn(col.key).length && <div className="empty">—</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
