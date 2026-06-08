import { useEffect, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { modelBadge } from '../lib/models.js';

const WINDOWS = [
  { label: 'All time', days: 0 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 24h', days: 1 },
];

const fmt = (n) => (n ?? 0).toLocaleString();

// 'days' ago as a 'YYYY-MM-DD HH:MM:SS' UTC string, matching the SQLite
// datetime('now') format stored in agent_runs.created_at. 0 = all-time.
function sinceFor(days) {
  if (!days) return undefined;
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}

function UsageTable({ label, keyField, rows }) {
  if (!rows.length) return null;
  return (
    <>
      <h3 className="usage-subhead">{label}</h3>
      <table className="usage-table">
        <thead>
          <tr><th>{keyField === 'model' ? 'Model' : 'Person'}</th><th>Runs</th><th>Input</th><th>Output</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[keyField] || '—'}>
              <td>{keyField === 'model' ? (r.model ? modelBadge(r.model) : '—') : (r[keyField] || '—')}</td>
              <td>{fmt(r.runs)}</td>
              <td>{fmt(r.input_tokens)}</td>
              <td>{fmt(r.output_tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// Token/cost usage aggregated over all runs (GET /api/agents/usage), with a
// time-window selector. Cost is a rough estimate, labelled as such.
export default function UsagePanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [windowDays, setWindowDays] = useState(0);

  useEffect(() => {
    setError(null);
    setData(null);
    api.usage({ since: sinceFor(windowDays) }).then(setData).catch((e) => setError(e.message));
  }, [windowDays]);

  return (
    <div className="usage">
      <div className="usage-head">
        <h2 className="view-title">Usage</h2>
        <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
          {WINDOWS.map((w) => <option key={w.label} value={w.days}>{w.label}</option>)}
        </select>
      </div>

      {error ? (
        <p className="view-sub">Error: {error}</p>
      ) : !data ? (
        <p className="view-sub">Loading usage…</p>
      ) : (
        <>
          <div className="usage-totals">
            <div className="usage-stat"><span>{fmt(data.totals.runs)}</span><small>runs</small></div>
            <div className="usage-stat"><span>{fmt(data.totals.input_tokens)}</span><small>input tokens</small></div>
            <div className="usage-stat"><span>{fmt(data.totals.output_tokens)}</span><small>output tokens</small></div>
            <div className="usage-stat"><span>≈ ${(data.totals.approxCostUsd ?? 0).toFixed(2)}</span><small>approx cost</small></div>
          </div>
          <UsageTable label="By model" keyField="model" rows={data.byModel} />
          <UsageTable label="By person" keyField="person_id" rows={data.byPerson} />
          <p className="view-sub">Cost is a rough estimate from static per-model rates — not billing-accurate.</p>
        </>
      )}
    </div>
  );
}
