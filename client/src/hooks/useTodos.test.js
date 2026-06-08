import { describe, it, expect } from 'vitest';
import { upsertTodo } from './useTodos.js';

describe('upsertTodo', () => {
  it('inserts and keeps the list sorted by position then id', () => {
    let list = [];
    list = upsertTodo(list, { id: 5, position: 1, status: 'pending', content: 'b' });
    list = upsertTodo(list, { id: 4, position: 0, status: 'pending', content: 'a' });
    list = upsertTodo(list, { id: 6, position: 1, status: 'pending', content: 'c' }); // tie on position → by id
    expect(list.map((t) => t.content)).toEqual(['a', 'b', 'c']);
  });

  it('replaces an existing todo by id (e.g. a status change) without duplicating', () => {
    let list = [{ id: 1, position: 0, status: 'pending', content: 'x' }];
    list = upsertTodo(list, { id: 1, position: 0, status: 'done', content: 'x' });
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('done');
  });
});
