# 🏙 Simulated Agent City Hub

[![Build](https://github.com/dvlprlife/sim-city-hub/actions/workflows/build.yml/badge.svg)](https://github.com/dvlprlife/sim-city-hub/actions/workflows/build.yml)
[![CodeQL](https://github.com/dvlprlife/sim-city-hub/actions/workflows/codeql.yml/badge.svg)](https://github.com/dvlprlife/sim-city-hub/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/dvlprlife/sim-city-hub)](https://github.com/dvlprlife/sim-city-hub/releases/latest)
[![License: MIT](https://img.shields.io/github/license/dvlprlife/sim-city-hub)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.5-brightgreen)](https://nodejs.org)

A local-first, Simulated Agent City-themed hub for orchestrating Claude Code agents. Organize
your work as a city: **Cities** (domains) → **Buildings** (workspaces) → **People**
(agents), each one click away.

```
Cities (domains)   →   Buildings (workspaces)   →   People (agents)
  left sidebar           City Map (overview)         City Interior (inside one city)
```

- A **City** is a high-level domain (e.g. *Downtown* = your main projects,
  *Suburbs* = side projects). Each city has its own guidelines and its buildings.
- A **Building** is a concrete codebase/workspace on disk — its absolute path
  becomes the agent's `cwd` — and it carries its own ordered roster of People, so
  each workspace is staffed with the team that suits it.
- A **Person** is a single Claude Code persona (system prompt + default model +
  optional MCPs). The `people/` library is shared, so the same Person can be
  rostered in as many Buildings as you like; pick the Building first, then the
  Person who works in it.

The spatial UI is a visual reskin of "pick city → pick building → pick person."
The orchestration underneath is plain HTTP + WebSockets — the backend is
theme-agnostic; the Simulated Agent City theme lives entirely in two frontend views.

## Stack

- **Backend** — Node 22+ (built-in `node:sqlite`), Express + `ws`, `simple-git`.
  No bundler; run with `node --watch`.
- **Frontend** — Vite + React 19. CSS-grid views in v1; isometric Simulated Agent City art is
  a later pass.

> **Windows note:** keep the hub out of a OneDrive-synced folder — background
> sync collides with Node's mid-edit file writes (`EEXIST`). Any non-OneDrive
> clone location works; paths resolve relative to the repo at runtime.

## Quick start

```bash
npm run setup          # installs backend + frontend deps and builds the UI
npm start              # serves API + WebSocket + the built UI on :3141
```

`npm run setup` works on a fresh clone (it doesn't need anything installed first).
Then `npm start`, or double-click **`launch.bat`** (preflights, builds the UI if
needed, starts the hub, opens the browser). Run `npm run doctor` any time to check
prerequisites.

**Developing the UI?** Use the two-process dev setup for hot reload:

```bash
npm run dev            # backend on :3141 (node --watch)
npm run client:dev     # Vite dev server on :5173 (proxies /api + /ws → :3141)
```

## Deploy / self-host

The hub is **local-first**: it spawns the **Claude Code CLI** on the host and reads
your `~/.claude/settings.json`, so it runs on a machine where Claude Code is
installed and authenticated — not on a generic cloud host. The model is *clone the
repo on that machine and run from the clone.*

**Prerequisites** (run `npm run doctor` any time to check these):

- **Node 22.5+** — required for the built-in `node:sqlite`. Get it from
  [nodejs.org](https://nodejs.org) (LTS), or via a version manager:
  - macOS/Linux: `nvm install 22 && nvm use 22` ([nvm](https://github.com/nvm-sh/nvm))
  - Windows: `winget install OpenJS.NodeJS.LTS` (or [nvm-windows](https://github.com/coreybutler/nvm-windows))
  - Verify: `node -v` → `v22.5.0` or newer.
- **Claude Code CLI**, installed **and** authenticated — the hub spawns it to run
  agents. Install per [Anthropic's docs](https://docs.claude.com/en/docs/claude-code/overview),
  then sign in once with `claude` (or `claude login`). Verify: `claude --version`.
- **git** — to clone and to `npm run update`.
- **gh** (GitHub CLI) — *optional*, only the *Changes → PR* flow uses it.

**First deploy**

```bash
git clone https://github.com/dvlprlife/sim-city-hub.git
cd sim-city-hub
cp .env.example .env    # optional — set PORT, HUB_MAX_CONCURRENT, etc.
npm run setup           # install + build
npm start               # serves on :3141 (Windows: double-click launch.bat)
```

Then open the in-app **Config** view (or edit `data/cities.json`) to point buildings
at the workspace paths on that machine.

**Update an existing deploy** — pull the latest and rebuild, then restart:

```bash
npm run update          # git pull --ff-only, then re-install + rebuild
# restart the hub (Ctrl+C the running process, then `npm start`)
```

All runtime state — `data/` (your cities, people, run-history DB) and `.env` — is
**gitignored**, so `git pull` never touches it and updates are clean.

**Keep it running.** `npm start` runs in the foreground. To keep the hub up across
logouts/reboots, run it under a process manager, e.g.:

```bash
pm2 start npm --name simcity-hub -- start    # then: pm2 save && pm2 startup
```

(or a `systemd` unit on Linux / Task Scheduler on Windows).

**First run seeds your local data.** The repo ships only samples under `seed/`;
on first boot the hub copies `seed/cities.json`, `seed/people/`, and
`seed/guidelines/` into the **gitignored `data/` folder** (`data/cities.json`,
`data/people/`, `data/guidelines/`, and the SQLite DB `data/simcity-hub.db`). Edit
`data/cities.json` (or the in-app **Config** view) to point buildings at your real
workspace paths, and edit `data/guidelines/*.md` to set per-city / per-building
house rules — everything in `data/` stays local and is never committed (a working
copy is seeded only when missing, so your edits survive). To change what a fresh
clone ships with, edit `seed/`.

## Status

**v1 scaffolded.** Backend (Express + ws + `node:sqlite`), a minimal Vite/React
UI (isometric **city scenes** — roads, water, trees — with streaming chat),
`cities.json`, and the `people/` library are all in place. Citizens are editable
in-app — the ✎ on a citizen opens an editor for their model, **avatar**, prompt,
and MCPs, and
**+ New citizen** / **Delete** create and remove them
(`POST`/`GET`/`PATCH`/`DELETE /api/people[/:id]`); since the `people/` library is
shared, an edit applies to every building that rosters them (and a delete scrubs
them from every roster). The **Config** view (top bar) edits
`cities.json` — add/delete cities, edit buildings (workspace paths with live
validation, plus a per-building **graphic** shown on the isometric City Map), and
reorder rosters — via `GET /api/cities/config`,
`POST`/`PATCH`/`DELETE /api/cities[/:id]`; it writes your local `cities.json` and
never rewrites a `.`/relative path to an absolute one. The **Changes** view also has a guarded **branch → commit → push →
open PR** flow (via the `gh` CLI) — every git-history-mutating step is an
explicit, confirm-gated action, pushes to `main`/`master` are refused, and a
missing/unauthenticated `gh` degrades gracefully (`/api/github/*`). The **Tasks**
view (top bar) is a *City Hall* work-order board over `/api/tasks` — queue work
for a city's citizens with a priority, move it across to-do → in progress → done,
and **spawn an agent directly on a task** (`GET`/`POST`/`PATCH`/`DELETE
/api/tasks`). A **Treasury** HUD in the top bar gamifies the work — citizens earn
gold per completed run (with a leaderboard of the most productive), derived live
from run history (`GET /api/agents/treasury`). The
right-panel run history can be **cleared** (a confirm-gated button removes
finished runs via `DELETE /api/agents/history`; in-flight runs are kept), and
clicking a run opens its full **transcript**. Project conventions and the
load-bearing architectural rules live in **[`CLAUDE.md`](CLAUDE.md)**; first-run and
deploy steps are in [Deploy / self-host](#deploy--self-host) above. Build order: get
one citizen chatting end-to-end over the WebSocket pipe **before** touching any
isometric art.

## Working in this repo

Project conventions live in [`CLAUDE.md`](CLAUDE.md). Issues flow through an
agent-driven pipeline documented in [`agents/WORKFLOW.md`](agents/WORKFLOW.md)
(`repo-check` → `issue-planner` → `issue-worker` → `pr-reviewer`).

## Assets & credits

The bundled isometric sprites are **Kenney** CC0 art (public domain) in
`client/public/assets/`.

An **experimental pixel-art town view** (an optional top-down skin of a city's
Buildings view) uses the **Sunnyside World** asset pack by **Daniel Diggle**.
That pack is **not bundled with this repo** — its licence allows use in projects
but **prohibits redistributing the assets**, so they're kept out of version
control (the `client/public/assets/sunnyside/` folder is git-ignored). The view
is fully optional: without the pack the app runs exactly as before, and when the
pack is present a **`◰ pixel`** toggle appears in a city's Buildings view to
switch between the isometric and pixel-art renderings. To enable it locally:

1. Download the pack (pay-what-you-want, free option available) from
   **https://danieldiggle.itch.io/sunnyside** and unzip it anywhere.
2. Run the one-time setup, pointing it at the unzipped pack folder (the one that
   contains `Sunnyside_World_Assets/` and `Sunnyside_World_Gamemaker/`):

   ```bash
   node scripts/extract-sunnyside-room.cjs <path-to-unzipped-pack>
   ```

   That copies the exact sprites the view needs into
   `client/public/assets/sunnyside/` and generates `room1.json` (the town layout,
   harvested from the pack's GameMaker demo room — layout data, not art). Then
   restart the dev server (or rebuild). Inside a city, the Buildings view now
   defaults to the pixel-art town, with a **`◱ 2D`** toggle to switch back to the
   isometric scene. Everything under `client/public/assets/sunnyside/` stays
   git-ignored.

Sunnyside is under its own custom licence: commercial use is allowed and credit
is appreciated; redistribution, reselling, and AI-training use are not. The MIT
licence below covers this project's **code only**, not third-party assets.

## License

[MIT](LICENSE)
