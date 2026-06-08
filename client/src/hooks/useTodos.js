import { useCallback, useState } from 'react';
import { api } from './useApi.js';

// Insert or replace a todo in a run's list (matched by id), kept sorted by
// position then id — the order the agent intends. Pure, so it's unit-testable.
export function upsertTodo(list, todo) {
  const idx = list.findIndex((t) => t.id === todo.id);
  const next = idx >= 0 ? list.map((t) => (t.id === todo.id ? todo : t)) : [...list, todo];
  return next.sort((a, b) => (a.position - b.position) || (a.id - b.id));
}

// Live per-run agent todo lists. Agents POST their checklist to the hub API
// during a run; the backend broadcasts `todo:update` per row. We accumulate those
// (keyed by run_id) so the chat can render a live checklist, and fetch a run's
// current todos on demand (covers a reload / reconnect mid-run).
export function useTodos() {
  const [todosByRun, setTodosByRun] = useState({}); // runId -> sorted todo[]

  const onWsMessage = useCallback((msg) => {
    const todo = msg?.type === 'todo:update' ? msg.todo : null;
    if (!todo || todo.run_id == null) return;
    setTodosByRun((all) => ({ ...all, [todo.run_id]: upsertTodo(all[todo.run_id] || [], todo) }));
  }, []);

  const loadRun = useCallback((runId) => {
    if (!runId) return;
    api.todos(runId)
      .then((rows) => {
        const sorted = [...(rows || [])].sort((a, b) => (a.position - b.position) || (a.id - b.id));
        setTodosByRun((all) => ({ ...all, [runId]: sorted }));
      })
      .catch(() => { /* transient — live todo:update events will fill it in */ });
  }, []);

  const todosFor = useCallback((runId) => todosByRun[runId] || [], [todosByRun]);

  return { onWsMessage, loadRun, todosFor };
}
