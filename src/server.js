// SimCity Agent Hub — Express + ws on one port. Mounts /api/* and the /ws
// WebSocket. In production it also static-serves the built Vite frontend.
import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import { WebSocketServer } from 'ws';

import './db/database.js'; // side effect: open DB, apply schema, clear orphan runs
import { HUB_ROOT } from './paths.js';
import { ensureSeeded } from './services/seed.js';
import { registerClient, startHeartbeat } from './broadcast.js';
import { getConfig } from './services/projects.js';

// First run: copy the committed seed/ samples into the gitignored working copies
// (cities.json, people/) before anything reads them.
ensureSeeded();

import citiesRouter from './routes/cities.js';
import peopleRouter from './routes/people.js';
import tasksRouter from './routes/tasks.js';
import agentsRouter from './routes/agents.js';
import gitRouter from './routes/git.js';
import githubRouter from './routes/github.js';
import vscodeRouter from './routes/vscode.js';
import handoffRouter from './routes/handoff.js';
import rateLimitsRouter from './routes/rateLimits.js';
import fsRouter from './routes/fs.js';

const app = express();
// No CORS by design: the hub is same-origin in both modes — production static-serves
// the built frontend from this server, and the Vite dev server proxies /api + /ws
// (server-side) so the browser only ever talks to its own origin. A permissive
// `cors()` would let any website the user visits drive this localhost server
// (which spawns processes, shells out, and does git mutations), so it's omitted.
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/cities', citiesRouter);
app.use('/api/people', peopleRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/git', gitRouter);
app.use('/api/github', githubRouter);
app.use('/api/vscode', vscodeRouter);
app.use('/api/handoff', handoffRouter);
app.use('/api/rate-limits', rateLimitsRouter);
app.use('/api/fs', fsRouter);

// Serve the built frontend if it exists (production). A final catch-all (not a
// wildcard route) keeps this compatible with both Express 4 and 5.
const publicDir = path.join(HUB_ROOT, 'client', 'dist');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && req.path !== '/ws') {
      return res.sendFile(path.join(publicDir, 'index.html'));
    }
    next();
  });
}

// Terminal error handler — Express 5 routes any thrown/rejected route error here.
// Without it, an uncaught error (e.g. a DB constraint in a route with no try/catch)
// falls through to Express's default handler, which leaks a stack trace in dev.
// We log the full error server-side and return a generic message (no internals).
app.use((err, req, res, next) => {
  console.error('Unhandled route error:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: 'internal server error' });
});

let configuredPort = 3141;
try {
  configuredPort = getConfig().port ?? 3141;
} catch {
  // cities.json may be absent on a fresh checkout — fall back to the default.
}
const PORT = Number(process.env.PORT) || configuredPort;

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  registerClient(ws);
  ws.send(JSON.stringify({ type: 'hub:connected', ts: Date.now() }));
});
// Reap half-open sockets so the clients set + per-socket send buffers can't grow
// unbounded over a long-lived hub session. Stop it if the ws server closes.
const stopHeartbeat = startHeartbeat();
wss.on('close', stopHeartbeat);

server.listen(PORT, () => {
  console.log(`🏙  SimCity Agent Hub listening on http://localhost:${PORT}`);
});
