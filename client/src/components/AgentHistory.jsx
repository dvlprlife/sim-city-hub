import { useEffect, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { modelBadge } from '../lib/models.js';
import RunTranscript from './RunTranscript.jsx';

// Right-panel run history with search + filters. Self-fetching: re-queries when
// a filter changes, the ↻ button is clicked, or the external `reload` signal
// bumps (App bumps it after a spawn). `people`/`cities` populate the dropdowns.
const STATUSES = ['running', 'queued', 'done', 'error', 'cancelled'];

export default function AgentHistory({ reload, people = [], cities = [] }) {
  const [runs, setRuns] = useState([]);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [personId, setPersonId] = useState('');
  const [cityId, setCityId] = useState('');
  const [status, setStatus] = useState('');
  const [localReload, setLocalReload] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [openRunId, setOpenRunId] = useState(null);
  const [error, setError] = useState(null);

  // Clear finished runs (backend never deletes an in-flight one), then refresh.
  const doClear = () => {
    setClearing(true);
    api.clearHistory()
      .then(() => { setConfirmClear(false); setLocalReload((n) => n + 1); })
      .catch((e) => { setConfirmClear(false); setError(`Clear failed: ${e.message}`); })
      .finally(() => setClearing(false));
  };

  // Debounce the text query so we don't fetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch on filter change, manual refresh, or external reload.
  useEffect(() => {
    api.history({
      q: debouncedQ || undefined,
      personId: personId || undefined,
      cityId: cityId || undefined,
      status: status || undefined,
      limit: 50,
    }).then((rs) => { setRuns(rs); setError(null); }).catch((e) => setError(e.message));
  }, [debouncedQ, personId, cityId, status, reload, localReload]);

  const filtered = Boolean(q || personId || cityId || status);

  return (
    <div className="history">
      <div className="history-head">
        <span>Recent runs</span>
        <span className="history-actions">
          {confirmClear ? (
            <>
              <button className="hist-clear-go" onClick={doClear} disabled={clearing}>
                {clearing ? '…' : 'Clear finished?'}
              </button>
              <button onClick={() => setConfirmClear(false)} disabled={clearing} title="Cancel">✕</button>
            </>
          ) : (
            <button onClick={() => setConfirmClear(true)} title="Clear finished runs">Clear</button>
          )}
          <button onClick={() => setLocalReload((n) => n + 1)} title="Refresh">↻</button>
        </span>
      </div>
      <div className="history-filters">
        <input
          className="hist-search"
          placeholder="Search prompt / summary…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="hist-selects">
          <select aria-label="Filter by person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">All people</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="Filter by city" value={cityId} onChange={(e) => setCityId(e.target.value)}>
            <option value="">All cities</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {error && <div className="error hist-error">{error}</div>}
      <ul>
        {runs.map((r) => (
          <li key={r.run_id} className={`run run-${r.status}`}>
            <button className="run-open" onClick={() => setOpenRunId(r.run_id)} title="View transcript">
              <span className="run-row">
                <span className="run-person">{r.person_id}</span>
                <span className="run-model">{modelBadge(r.model)}</span>
                <span className="run-status">{r.status}</span>
              </span>
              {r.summary && <span className="run-summary">{r.summary}</span>}
            </button>
          </li>
        ))}
        {runs.length === 0 && <li className="empty">{filtered ? 'No runs match.' : 'No runs yet.'}</li>}
      </ul>
      {openRunId && <RunTranscript runId={openRunId} onClose={() => setOpenRunId(null)} />}
    </div>
  );
}
