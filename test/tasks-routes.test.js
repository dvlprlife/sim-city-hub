// Route-level tests for the /api/tasks surface. The hub-API todo contract is
// load-bearing (People update todos via these endpoints, never the CLI's
// TodoWrite), so the validation and batch-atomicity behaviors are pinned here.
// Mounts the real router on an ephemeral Express server and exercises it over
// HTTP with fetch — no new dependencies. Rows use an 'rt-' prefix and are
// removed in after() even if a test fails. Run with `npm test` (node:test).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import db from '../src/db/database.js';
import tasksRouter from '../src/routes/tasks.js';

let server;
let base;

before(() => {
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', tasksRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/tasks`;
});

after(() => {
  server.close();
  db.prepare("DELETE FROM tasks WHERE city_id LIKE 'rt-%'").run();
  db.prepare("DELETE FROM agent_todos WHERE run_id LIKE 'rt-%'").run();
});

const send = (method) => (path, body) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const post = send('POST');
const patch = send('PATCH');
const del = (path) => fetch(base + path, { method: 'DELETE' });
const get = async (path) => (await fetch(base + path)).json();

// --- Backlog tasks ---

test('POST / rejects missing cityId/title and an unknown priority with 400', async () => {
  assert.equal((await post('/', { title: 'rt-no-city' })).status, 400);
  assert.equal((await post('/', { cityId: 'rt-c' })).status, 400);
  assert.equal((await post('/', { cityId: 'rt-c', title: 'rt-t', priority: 'urgent' })).status, 400);
});

test('POST / creates with schema defaults; GET / filters by cityId and status', async () => {
  const res = await post('/', { cityId: 'rt-city-a', title: 'rt-task-1', priority: 'high' });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.city_id, 'rt-city-a');
  assert.equal(created.priority, 'high');
  assert.equal(created.status, 'todo'); // schema default
  await post('/', { cityId: 'rt-city-b', title: 'rt-task-2' });

  const byCity = await get('/?cityId=rt-city-a');
  assert.ok(byCity.some((t) => t.id === created.id), 'filter returns the created task');
  assert.ok(byCity.every((t) => t.city_id === 'rt-city-a'), 'filter excludes other cities');

  const byStatus = await get('/?cityId=rt-city-a&status=done');
  assert.equal(byStatus.length, 0, 'no rt-city-a task is done yet');
});

test('GET / coerces a repeated query key to its first value instead of a 500', async () => {
  // Express parses ?cityId=a&cityId=b into an array, which node:sqlite cannot
  // bind — the route's scalar() guard must keep this a 200.
  const res = await fetch(`${base}?cityId=rt-city-a&cityId=rt-city-b`);
  assert.equal(res.status, 200);
  const rows = await res.json();
  assert.ok(rows.every((t) => t.city_id === 'rt-city-a'), 'filters on the first value');
});

test('PATCH /:id validates, 404s on unknown id, and applies updates', async () => {
  const created = await (await post('/', { cityId: 'rt-city-p', title: 'rt-patch-me' })).json();

  assert.equal((await patch(`/${created.id}`, { status: 'paused' })).status, 400);
  assert.equal((await patch(`/${created.id}`, { priority: 'urgent' })).status, 400);
  assert.equal((await patch(`/${created.id}`, { unknownField: 1 })).status, 400);
  assert.equal((await patch('/999999999', { title: 'rt-nope' })).status, 404);

  const res = await patch(`/${created.id}`, { title: 'rt-patched', status: 'in_progress', personId: 'rt-person' });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.title, 'rt-patched');
  assert.equal(updated.status, 'in_progress');
  assert.equal(updated.person_id, 'rt-person'); // camelCase personId maps to the column
});

test('DELETE /:id removes the task once: 204 then 404', async () => {
  const created = await (await post('/', { cityId: 'rt-city-d', title: 'rt-delete-me' })).json();
  assert.equal((await del(`/${created.id}`)).status, 204);
  assert.equal((await del(`/${created.id}`)).status, 404);
});

// --- Agent todos (the hub-API todo contract) ---

test('GET /todos requires runId', async () => {
  assert.equal((await fetch(`${base}/todos`)).status, 400);
});

test('POST /todos/batch is all-or-nothing: a bad item anywhere inserts ZERO rows', async () => {
  const countFor = (runId) => db.prepare('SELECT COUNT(*) AS c FROM agent_todos WHERE run_id = ?').get(runId).c;

  // Empty content mid-batch — the valid first item must not land.
  let res = await post('/todos/batch', { runId: 'rt-run-atomic', todos: ['rt-valid-first', { content: '' }] });
  assert.equal(res.status, 400);
  assert.equal(countFor('rt-run-atomic'), 0, 'no partial insert on empty content');

  // Invalid status mid-batch — same guarantee.
  res = await post('/todos/batch', { runId: 'rt-run-atomic', todos: ['rt-valid-first', { content: 'x', status: 'nope' }] });
  assert.equal(res.status, 400);
  assert.equal(countFor('rt-run-atomic'), 0, 'no partial insert on bad status');

  // Missing args.
  assert.equal((await post('/todos/batch', { todos: ['rt-x'] })).status, 400);
  assert.equal((await post('/todos/batch', { runId: 'rt-run-atomic' })).status, 400);
});

test('POST /todos/batch accepts string + object items; GET /todos returns them by position', async () => {
  const res = await post('/todos/batch', {
    runId: 'rt-run-ok',
    todos: ['rt-step-one', { content: 'rt-step-three', position: 2 }, { content: 'rt-step-two', status: 'in_progress', position: 1 }],
  });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.length, 3);
  assert.equal(created[0].status, 'pending'); // string shorthand defaults

  const listed = await get('/todos?runId=rt-run-ok');
  assert.deepEqual(listed.map((t) => t.content), ['rt-step-one', 'rt-step-two', 'rt-step-three']);
  assert.equal(listed[1].status, 'in_progress');
});

test('PATCH /todos/:id validates status and content, 404s on unknown id, applies updates', async () => {
  const [todo] = await (await post('/todos/batch', { runId: 'rt-run-patch', todos: ['rt-todo-patch'] })).json();

  assert.equal((await patch(`/todos/${todo.id}`, { status: 'paused' })).status, 400);
  assert.equal((await patch(`/todos/${todo.id}`, { content: '' })).status, 400);
  assert.equal((await patch(`/todos/${todo.id}`, {})).status, 400);
  assert.equal((await patch('/todos/999999999', { status: 'done' })).status, 404);

  const res = await patch(`/todos/${todo.id}`, { status: 'done', content: 'rt-todo-done' });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.status, 'done');
  assert.equal(updated.content, 'rt-todo-done');
});
