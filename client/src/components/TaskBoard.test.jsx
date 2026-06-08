import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TaskBoard from './TaskBoard.jsx';

// SSR smoke render — useEffect (the task fetch) is a no-op in static markup, so
// this checks the board's shell renders from props without crashing.
const cities = [
  { id: 'c1', name: 'Downtown', buildings: [{ id: 'b1', name: 'HQ' }], people: [{ id: 'p1', name: 'Devon' }] },
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
    expect(out).toContain('Devon');    // citizen option
    expect(out).toContain('New work order');
  });
});
