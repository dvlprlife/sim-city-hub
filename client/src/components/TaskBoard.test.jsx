import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TaskBoard from './TaskBoard.jsx';

// SSR smoke render — useEffect (the task fetch) is a no-op in static markup, so
// this checks the board's shell renders from props without crashing.
// Rosters hang off the BUILDING (CLAUDE.md), and with no building picked the
// board offers everyone staffed anywhere in the city.
const cities = [
  { id: 'c1', name: 'Downtown', buildings: [{ id: 'b1', name: 'HQ', people: [{ id: 'p1', name: 'Devon' }] }] },
];
const html = (props) => renderToStaticMarkup(<TaskBoard cities={cities} allPeople={[{ id: 'p1', name: 'Devon' }]} {...props} />);

describe('TaskBoard', () => {
  it('renders the City Hall shell with the three status columns', () => {
    const out = html({ defaultCityId: 'c1' });
    expect(out).toContain('City Hall');
    expect(out).toContain('To do');
    expect(out).toContain('In progress');
    expect(out).toContain('Done');
  });

  it('offers the city, building and citizen scopes in the create form', () => {
    const out = html({ defaultCityId: 'c1' });
    expect(out).toContain('Downtown'); // city option
    expect(out).toContain('HQ');       // building option
    expect(out).toContain('Devon');    // citizen option, folded up from the building
    expect(out).toContain('New work order');
  });

  it('folds citizens from every building, without duplicating a shared one', () => {
    const shared = { id: 'p1', name: 'Devon' };
    const twoBuildings = [{
      id: 'c1',
      name: 'Downtown',
      buildings: [
        { id: 'b1', name: 'HQ', people: [shared] },
        { id: 'b2', name: 'Annex', people: [shared, { id: 'p2', name: 'Robin' }] },
      ],
    }];
    const out = renderToStaticMarkup(
      <TaskBoard cities={twoBuildings} allPeople={[shared, { id: 'p2', name: 'Robin' }]} defaultCityId="c1" />,
    );
    expect(out).toContain('Robin');                              // staffed only in the Annex
    expect(out.match(/>Devon</g) ?? []).toHaveLength(1);         // staffed in both, listed once
  });
});
