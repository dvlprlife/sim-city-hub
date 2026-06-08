-- SimCity Agent Hub schema. Idempotent — applied on every boot.
-- node:sqlite, WAL mode (set in database.js).

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id     TEXT NOT NULL,
  building_id TEXT,
  person_id   TEXT,
  title       TEXT NOT NULL,
  description TEXT,
  priority    TEXT NOT NULL DEFAULT 'medium',   -- low | medium | high
  status      TEXT NOT NULL DEFAULT 'todo',      -- todo | in_progress | done
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_runs (
  run_id        TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL,
  city_id       TEXT NOT NULL,
  building_id   TEXT,
  cwd           TEXT,
  prompt        TEXT,
  model         TEXT,
  status        TEXT NOT NULL,                    -- queued | running | done | error | cancelled
  exit_code     INTEGER,
  session_id    TEXT,
  parent_run_id TEXT,
  summary       TEXT,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at      TEXT
);

-- Replayable event log — one row per streamed event, monotonic seq per run.
CREATE TABLE IF NOT EXISTS agent_run_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id  TEXT NOT NULL,
  seq     INTEGER NOT NULL,
  kind    TEXT NOT NULL,
  payload TEXT,                                   -- JSON
  ts      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_run_events_run ON agent_run_events(run_id, seq);

CREATE TABLE IF NOT EXISTS agent_todos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',     -- pending | in_progress | done | skipped
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_todos_run ON agent_todos(run_id);

-- Gamified ledger (cosmetic / optional). Single row.
CREATE TABLE IF NOT EXISTS treasury (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  gold  INTEGER NOT NULL DEFAULT 0,
  tools INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO treasury (id, gold, tools) VALUES (1, 0, 0);

-- Cached rate-limit state from CLI events. Single row.
CREATE TABLE IF NOT EXISTS rate_limits (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  payload    TEXT,                                -- JSON
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO rate_limits (id, payload) VALUES (1, NULL);
