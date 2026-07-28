import { cityPeople } from '../lib/roster.js';

// Left rail: the list of cities. Selecting one opens its interior.
export default function CitySidebar({ cities, selectedCityId, onSelectCity }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">Cities</div>
      <ul className="city-list">
        {cities.map((c) => (
          <li key={c.id}>
            <button
              className={c.id === selectedCityId ? 'active' : ''}
              onClick={() => onSelectCity(c.id)}
            >
              <span className="city-name">{c.name}</span>
              <span className="city-meta">
                {cityPeople(c).length} 👤 · {(c.buildings?.length ?? 0)} 🏢
              </span>
            </button>
          </li>
        ))}
        {cities.length === 0 && <li className="empty" style={{ padding: '0 14px' }}>No cities in cities.json</li>}
      </ul>
    </aside>
  );
}
