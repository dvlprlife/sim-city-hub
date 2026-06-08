// Persistent top-bar "city treasury" HUD: gold + tools, always visible, doubles
// as the toggle for the Treasury leaderboard panel. Numbers tick up live as runs
// finish (App refetches on every agent:done). Theme flavour over derived stats.
export default function TreasuryHud({ data, active, onClick }) {
  const gold = data?.gold ?? 0;
  const tools = data?.tools ?? 0;
  return (
    <button
      type="button"
      className={`treasury-hud${active ? ' active' : ''}`}
      onClick={onClick}
      title="City treasury — citizens earn gold for completed runs. Click for the leaderboard."
    >
      <span className="th-gold">🪙 {gold.toLocaleString()}</span>
      <span className="th-tools">🔧 {tools.toLocaleString()}</span>
    </button>
  );
}
