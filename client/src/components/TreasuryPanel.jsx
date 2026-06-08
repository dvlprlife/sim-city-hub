const MEDALS = ['🥇', '🥈', '🥉'];

// The Treasury view: city-wide totals + a citizen leaderboard ranked by gold.
// Gold/tools/runs are derived from real run history (GET /api/agents/treasury);
// citizen names/jobs are resolved from the people library passed in.
export default function TreasuryPanel({ data, people = [] }) {
  if (!data) return <p className="view-sub">Loading treasury…</p>;
  const person = (pid) => people.find((p) => p.id === pid) || null;
  const fmt = (n) => (n ?? 0).toLocaleString();

  return (
    <div className="treasury">
      <h2 className="view-title">City Treasury</h2>
      <p className="view-sub">
        Citizens earn gold for completed runs — a base reward plus a bonus for the output they produce.
        A playful productivity score, derived from run history (not billing).
      </p>

      <div className="usage-totals">
        <div className="usage-stat"><span>🪙 {fmt(data.gold)}</span><small>gold in the treasury</small></div>
        <div className="usage-stat"><span>🔧 {fmt(data.tools)}</span><small>tools used</small></div>
        <div className="usage-stat"><span>{fmt(data.runs)}</span><small>completed runs</small></div>
        <div className="usage-stat"><span>{fmt(data.personCount)}</span><small>earning citizens</small></div>
      </div>

      <h3 className="usage-subhead">Leaderboard</h3>
      {data.leaderboard?.length ? (
        <table className="usage-table treasury-board">
          <thead>
            <tr><th>Citizen</th><th>Gold</th><th>Runs</th><th>Output tokens</th></tr>
          </thead>
          <tbody>
            {data.leaderboard.map((r, i) => {
              const p = person(r.person_id);
              return (
                <tr key={r.person_id || '—'}>
                  <td>
                    <span className="tr-rank">{MEDALS[i] || `#${i + 1}`}</span> {p?.name || r.person_id}
                    {p?.job ? <small> · {p.job}</small> : null}
                  </td>
                  <td>🪙 {fmt(r.gold)}</td>
                  <td>{fmt(r.runs)}</td>
                  <td>{fmt(r.output_tokens)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="empty">No completed runs yet — gold is earned when citizens finish work.</p>
      )}
    </div>
  );
}
