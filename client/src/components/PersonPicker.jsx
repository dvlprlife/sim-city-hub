import PathPicker from './PathPicker.jsx';

// Right panel: choose the building (workspace) the next message runs in, and
// pick which citizen to talk to in the current city. A dot marks citizens with
// an in-flight run, so concurrent agents are visible at a glance.
export default function PersonPicker({
  city, buildings, selectedBuildingId, onSelectBuilding,
  people, selectedPersonId, onSelectPerson, runningPersonIds = [], onEditPerson, onNewPerson,
}) {
  if (!city) {
    return (
      <div className="picker">
        <div className="picker-head">Workspace</div>
        <div className="picker-path">Pick a city to begin.</div>
      </div>
    );
  }
  const building = (buildings || []).find((b) => b.id === selectedBuildingId);
  return (
    <div className="picker">
      <div className="picker-head">Workspace</div>
      <select aria-label="Workspace" value={selectedBuildingId || ''} onChange={(e) => onSelectBuilding(e.target.value)}>
        {(buildings || []).map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      <PathPicker path={building?.absolutePath} />

      <div className="picker-head">{city.name} citizens</div>
      <ul className="picker-people">
        {(people || []).map((p) => (
          <li key={p.id}>
            <button
              className={p.id === selectedPersonId ? 'active' : ''}
              onClick={() => onSelectPerson(p.id)}
            >
              <span>
                {runningPersonIds.includes(p.id) && <span className="run-dot" title="running">●</span>}
                {p.name}
              </span>
              <small>{p.job}</small>
            </button>
            {onEditPerson && (
              <button
                className="person-edit"
                title={`Edit ${p.name}`}
                onClick={() => onEditPerson(p.id)}
              >
                ✎
              </button>
            )}
          </li>
        ))}
      </ul>
      {onNewPerson && (
        <button className="config-add picker-newperson" onClick={onNewPerson}>+ New citizen</button>
      )}
    </div>
  );
}
