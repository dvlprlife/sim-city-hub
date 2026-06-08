// SQLite via Node's built-in node:sqlite (Node 22+). WAL mode, schema applied
// on boot, idempotent. Requires the --experimental-sqlite flag on Node 22.x
// (the npm scripts and launch.js pass it).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_FILE } from '../paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// The DB lives in the gitignored data/ dir — make sure it exists before opening
// (this can run before the seed step, so it can't rely on data/ already being there).
mkdirSync(path.dirname(DB_FILE), { recursive: true });
export const db = new DatabaseSync(DB_FILE);

// WAL = concurrent reads while a write is in flight; the hub reads run history
// while a spawn is still writing events.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
// Wait (briefly) for a held write lock instead of failing instantly with
// SQLITE_BUSY. WAL still allows only one writer at a time, so a transient
// collision — a WAL checkpoint, or another process holding the lock (e.g. the
// test runner spawns a process per file) — should retry, not throw. Kept short:
// DatabaseSync is synchronous, so this is also the cap on how long a contended
// query can block the event loop (a real collision clears in milliseconds).
db.exec('PRAGMA busy_timeout = 2000;');

// Apply the schema (idempotent — every statement is IF NOT EXISTS / OR IGNORE).
db.exec(readFileSync(SCHEMA_PATH, 'utf8'));

// Clear orphaned runs from a prior crash so the UI doesn't show ghosts —
// includes 'queued' runs that never got a free concurrency slot before exit.
db.exec(
  "UPDATE agent_runs SET status = 'cancelled', ended_at = datetime('now') WHERE status IN ('running', 'queued');",
);

export default db;
