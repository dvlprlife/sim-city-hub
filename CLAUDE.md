# CLAUDE.md — SimCity Agent Hub

Project conventions and load-bearing architectural rules. The agent pipeline
(`agents/WORKFLOW.md`) treats this file as authoritative: the issue worker
follows it, and the PR reviewer checks compliance against it.

This file is the authoritative, enforceable summary of the architecture and its
load-bearing rules. (A fuller design document is maintained outside the repo.)

## What this is

A local-first hub that orchestrates Claude Code agents behind a SimCity-themed
UI. The naming model is three nested layers: **Cities** (domains) → **Buildings**
(workspaces) → **People** (agents). The backend is theme-agnostic; the SimCity
theme lives entirely in the frontend.

## Stack

- **Backend** — Node **22+** (built-in `node:sqlite`, WAL mode), Express + `ws`
  on port `3141`, `simple-git`, `dotenv`. **No bundler, no ORM, no test
  framework, no nodemon** — run with `node --watch`.
- **Frontend** — Vite + React 19. CSS-grid views in v1; isometric art is a
  later pass. Vite dev-proxies `/api` and `/ws` → `:3141`; production build is
  static-served by the same Express server.

## Layout

```
src/                     backend (theme-free)
  server.js              Express + ws, mounts /api/* + WS /ws
  db/                    database.js (node:sqlite), schema.sql
  services/              projects, agent/ (spawn pipeline), queue, git, vscode
  routes/                agents, tasks, cities, git, vscode, handoff, rateLimits
client/src/              frontend (Vite + React)
  components/            CityMap + CityInterior are the ONLY themed views
  map/                   worldLayout.js, castleLayouts.js (stubs in v1)
seed/                    committed SAMPLES: seed/cities.json + seed/people/ + seed/guidelines/
data/                    gitignored WORKING data: data/cities.json + data/people/ + data/guidelines/ + the SQLite DB (seeded from seed/)
  guidelines/            per-city / per-building markdown, appended to prompts
```

## Load-bearing rules (do not break these)

These are the "clever parts." A PR that violates one is wrong even if it passes
CI:

- **The backend is theme-agnostic.** The SimCity theme touches ONLY
  `components/CityMap.jsx`, `components/CityInterior.jsx`, the two `map/` files,
  the toolbar string, and CSS vars. Never leak theme strings into `src/`.
- **`--mcp-config` REPLACES the user's global MCP config — it does not extend
  it.** The spawn pipeline must read `~/.claude/settings.json`, merge its
  `mcpServers` block with task-specific MCPs, and write the merged object to a
  temp file. Skipping the merge silently drops the user's global MCPs.
- **Strip `CLAUDECODE`** from the child env before spawn (the CLI refuses to
  nest otherwise), and **strip `ANTHROPIC_API_KEY`** when on a Max subscription
  (leaving it set burns API credits instead of using the subscription).
- **Pass the system prompt and MCP config as file paths**, not inline — Windows
  has command-line length limits. The user prompt is piped via `stdin`.
- **People update todos via the hub API** (`POST /api/tasks/todos/batch`,
  `PATCH /api/tasks/todos/:id`), never Claude Code's built-in `TodoWrite` — the
  built-in renders only in the CLI console, not the hub UI.
- **Never auto-commit.** Agents must not run `git commit` unless the user
  explicitly asks; the system-prompt footer must say so.
- **Rosters are per-City and order matters.** Each city's `people: [...]` array
  binds citizens to interior tiles by index. `people/<id>/` is a shared library.
- **The handoff token is literal:** `[HANDOFF:other-person-id] <self-contained
  prompt>` on its own line. The receiving Person gets ZERO conversation history
  — the handoff prompt must carry all context.
- **Frontend prop contracts are fixed.** Replacing the themed views is fine as
  long as `CityMap` / `CityInterior` honor their documented props (see the
  contract comment at the top of each component). Backend changes must not alter
  the WebSocket event union or the REST surface without a deliberate, documented
  reason.
- **Build chat end-to-end before any art.** Prove one citizen streaming over
  `/ws` before spending a minute on sprites.

## Seed vs. working data

The repo commits **samples**, not live data. `seed/cities.json`, `seed/people/`,
and `seed/guidelines/` are the shipped examples; on first boot `services/seed.js`
(`ensureSeeded`, called from `server.js`) copies them into the **gitignored `data/`
folder** — `data/cities.json`, `data/people/`, and `data/guidelines/`, which the hub
then reads and writes. The SQLite DB (`data/simcity-hub.db`) lives there too, so all
runtime/working data is in one ignored folder. Each working copy is seeded only when
absent/empty, so edits you make to a citizen or a guideline file are never clobbered.
So: **never commit `data/`** (real workspace paths, runtime-created citizens, edited
guidelines, run history) — to change what a fresh clone ships with, edit `seed/`.
`.gitignore` ignores `/data/`; `seed/` stays committed.

## Windows / OneDrive

Keep the hub out of any OneDrive-synced folder — background sync collides with
Node's mid-edit writes (`EEXIST`). Any non-OneDrive clone location works.
Paths resolve at runtime and **no machine path is committed**: `cities.json`
stores no `rootPath` (it defaults to the repo directory), and a building
`absolutePath` of `.` means the repo root.

## GitHub workflow

- **No direct pushes to `main`.** All changes land via PR. Branches are named
  `issue-{number}-short-description`.
- **Commit trailers:** end commit message bodies with both co-author trailers,
  lowercase `Co-authored-by:` (not the capitalized default):
  ```
  Co-authored-by: dvlprlife <dvlprlife@users.noreply.github.com>
  Co-authored-by: Claude <noreply@anthropic.com>
  ```
  Confirm the live convention with `git log -8 --format=%B` before committing.
- **CHANGELOG maintenance:** if a change is user-visible (new behavior, a bug a
  user would hit, a new command/setting), add a one-line entry under
  `## [Unreleased]` in `CHANGELOG.md` in the same PR. Contributor-facing-only
  changes (tests, CI, `agents/`, internal docs, pure refactors) skip the entry —
  note the skip in the PR body so the reviewer treats it as deliberate.
- **README maintenance:** if a change introduces a new user-discoverable
  command, setting, or endpoint, update `README.md` in the same PR. Otherwise
  note the skip in the PR body.

## Out of scope for v1

Language-specific compile/lint tooling, the `treasury` gamification UI, the isometric sprite
pipeline, and Azure DevOps / telemetry MCP integrations. Keep the `treasury`
table; ignore its UI. Add the rest only when a real project needs it.
