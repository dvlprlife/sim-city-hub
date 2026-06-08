import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TodoPanel from './TodoPanel.jsx';

const html = (todos) => renderToStaticMarkup(<TodoPanel todos={todos} />);

describe('TodoPanel', () => {
  it('renders nothing without todos', () => {
    expect(html([])).toBe('');
    expect(html(null)).toBe('');
    expect(html(undefined)).toBe('');
  });

  it('renders the checklist with a done/total count and per-status classes', () => {
    const out = html([
      { id: 1, content: 'read files', status: 'done', position: 0 },
      { id: 2, content: 'write the fix', status: 'in_progress', position: 1 },
      { id: 3, content: 'run tests', status: 'pending', position: 2 },
    ]);
    expect(out).toContain('read files');
    expect(out).toContain('write the fix');
    expect(out).toContain('1/3'); // one of three done
    expect(out).toContain('todo-active'); // in_progress
    expect(out).toContain('todo-done');
  });
});
