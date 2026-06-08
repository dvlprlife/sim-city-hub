import { Router } from 'express';
import db from '../db/database.js';
import { broadcast } from '../broadcast.js';

const router = Router();

// Allowed enum values (mirror the schema.sql comments). Validated on write so a
// client can't persist a status/priority the UI state machine won't recognize.
const TASK_PRIORITIES = ['low', 'medium', 'high'];
const TASK_STATUSES = ['todo', 'in_progress', 'done'];
const TODO_STATUSES = ['pending', 'in_progress', 'done', 'skipped'];

// Express parses a repeated query key (?x=a&x=b) into an array, which node:sqlite
// can't bind (it throws, surfacing as an opaque 500). Coerce query values used as
// bound params to a scalar string so a malformed query just filters on the first
// value instead of crashing the request.
const scalar = (v) => (Array.isArray(v) ? v[0] : v);

// --- Backlog tasks ---

router.get('/', (req, res) => {
  const cityId = scalar(req.query.cityId);
  const buildingId = scalar(req.query.buildingId);
  const status = scalar(req.query.status);
  const where = [];
  const params = [];
  if (cityId) (where.push('city_id = ?'), params.push(cityId));
  if (buildingId) (where.push('building_id = ?'), params.push(buildingId));
  if (status) (where.push('status = ?'), params.push(status));
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const sql = `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC
    LIMIT ? OFFSET ?`;
  res.json(db.prepare(sql).all(...params, limit, offset));
});

// Per-run todo list (populated by the Person via the hub API).
router.get('/todos', (req, res) => {
  const runId = scalar(req.query.runId);
  if (!runId) return res.status(400).json({ error: 'runId required' });
  res.json(db.prepare('SELECT * FROM agent_todos WHERE run_id = ? ORDER BY position, id').all(runId));
});

router.post('/', (req, res) => {
  const { cityId, buildingId, title, description, priority = 'medium', personId } = req.body;
  if (!cityId || !title) return res.status(400).json({ error: 'cityId and title required' });
  if (!TASK_PRIORITIES.includes(priority)) return res.status(400).json({ error: `priority must be one of ${TASK_PRIORITIES.join(', ')}` });
  const info = db
    .prepare('INSERT INTO tasks (city_id, building_id, person_id, title, description, priority) VALUES (?, ?, ?, ?, ?, ?)')
    .run(cityId, buildingId ?? null, personId ?? null, title, description ?? null, priority);
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  if ('priority' in req.body && !TASK_PRIORITIES.includes(req.body.priority)) {
    return res.status(400).json({ error: `priority must be one of ${TASK_PRIORITIES.join(', ')}` });
  }
  if ('status' in req.body && !TASK_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: `status must be one of ${TASK_STATUSES.join(', ')}` });
  }
  const fields = [];
  const params = [];
  for (const k of ['title', 'description', 'priority', 'status', 'building_id']) {
    if (k in req.body) (fields.push(`${k} = ?`), params.push(req.body[k]));
  }
  if ('personId' in req.body) (fields.push('person_id = ?'), params.push(req.body.personId));
  if ('person_id' in req.body) (fields.push('person_id = ?'), params.push(req.body.person_id));
  if (!fields.length) return res.status(400).json({ error: 'no updatable fields' });
  fields.push("updated_at = datetime('now')");
  params.push(req.params.id);
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

// --- Agent todos (live progress; broadcast over WS) ---

router.post('/todos/batch', (req, res) => {
  const { runId, todos } = req.body;
  if (!runId || !Array.isArray(todos)) return res.status(400).json({ error: 'runId and todos[] required' });
  // Validate the whole batch up front (each needs non-empty content + a valid
  // status) so a bad item can't insert a partial batch then 500 on the NOT NULL.
  for (const t of todos) {
    const content = typeof t === 'string' ? t : t?.content;
    if (!content || typeof content !== 'string') return res.status(400).json({ error: 'each todo needs non-empty content' });
    const status = (typeof t === 'object' && t.status) || 'pending';
    if (!TODO_STATUSES.includes(status)) return res.status(400).json({ error: `todo status must be one of ${TODO_STATUSES.join(', ')}` });
  }
  const insert = db.prepare('INSERT INTO agent_todos (run_id, content, status, position) VALUES (?, ?, ?, ?)');
  const created = todos.map((t, i) => {
    const content = typeof t === 'string' ? t : t.content;
    const status = (typeof t === 'object' && t.status) || 'pending';
    const position = typeof t === 'object' && t.position != null ? t.position : i;
    const info = insert.run(runId, content, status, position);
    const row = db.prepare('SELECT * FROM agent_todos WHERE id = ?').get(info.lastInsertRowid);
    broadcast({ type: 'todo:update', todo: row });
    return row;
  });
  res.status(201).json(created);
});

router.patch('/todos/:id', (req, res) => {
  if ('status' in req.body && !TODO_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: `status must be one of ${TODO_STATUSES.join(', ')}` });
  }
  // Mirror the batch endpoint's check: content is NOT NULL, so a null/non-string
  // value would bind-fail as an opaque 500 instead of a clean 400.
  if ('content' in req.body && (typeof req.body.content !== 'string' || !req.body.content)) {
    return res.status(400).json({ error: 'content must be a non-empty string' });
  }
  const fields = [];
  const params = [];
  for (const k of ['content', 'status', 'position']) {
    if (k in req.body) (fields.push(`${k} = ?`), params.push(req.body[k]));
  }
  if (!fields.length) return res.status(400).json({ error: 'no updatable fields' });
  fields.push("updated_at = datetime('now')");
  params.push(req.params.id);
  db.prepare(`UPDATE agent_todos SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  const row = db.prepare('SELECT * FROM agent_todos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  broadcast({ type: 'todo:update', todo: row });
  res.json(row);
});

export default router;
