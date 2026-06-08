// Live checklist for a run — the todos the agent maintains via the hub API. Pure
// (todos in), so it renders the same whether fed by live WS events or a fetch.
const STATUS = {
  pending: { icon: '☐', cls: 'todo-pending' },
  in_progress: { icon: '▸', cls: 'todo-active' },
  done: { icon: '✓', cls: 'todo-done' },
  skipped: { icon: '⊘', cls: 'todo-skipped' },
};

export default function TodoPanel({ todos }) {
  if (!todos || todos.length === 0) return null;
  const done = todos.filter((t) => t.status === 'done').length;
  return (
    <div className="todo-panel">
      <div className="todo-head">
        <span>Tasks</span>
        <span className="todo-count">{done}/{todos.length}</span>
      </div>
      <ul className="todo-list">
        {todos.map((t) => {
          const s = STATUS[t.status] || STATUS.pending;
          return (
            <li key={t.id} className={`todo-item ${s.cls}`}>
              <span className="todo-icon" aria-hidden="true">{s.icon}</span>
              <span className="todo-text">{t.content}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
