# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/); during development the
`[Unreleased]` section accumulates one entry per PR and is consolidated at
release time (see [`agents/RELEASE.md`](agents/RELEASE.md)).

## [Unreleased]

- **A failed spawn no longer leaks temp files, and a hand-edited bad `mcps`
  gives a clear error.** If spawn setup failed after the system prompt was
  written (e.g. a non-array `mcps` in a hand-edited `manifest.json` or
  `cities.json`), the temp file was stranded in the OS temp dir and the UI
  showed a baffling "… is not iterable". Setup failures now clean up after
  themselves and report "person/city mcps must be an array".
- **The run-history panel now shows errors.** A failed history fetch or a failed
  "Clear finished runs" displays an error message in the panel instead of being
  silently swallowed (which left an empty-looking list or an unexplained revert).
- **Fixed a stale-diff race in the Changes panel.** Rapidly clicking between
  changed files could render the previous file's diff under the new file's
  name if the responses arrived out of order; the panel now applies only the
  latest request's response.
- **Accessibility:** the usage time-window filter, the history person/city/status
  filters, the workspace picker, and the roster's add-citizen picker now carry
  `aria-label`s, so screen readers announce what each `<select>` controls.
- **Renamed the project to Simulated Agent City Hub.** The display name and the
  city-theme references were updated throughout the UI, docs, and code comments.
  (Internal slugs — the package names, the database file, and the repo URL — are
  unchanged.)

## [0.3.0] - 2026-06-08

The Simulated Agent City world comes alive — a landscape world map, a town around a roundabout,
weather, and live agent activity — plus a City Hall task board, a Treasury HUD,
one-command self-hosting, and an "Open in VS Code" button.

- **The world became a living Simulated Agent City.** The City Map is now a sky-and-rolling-hills
  landscape — sun, drifting clouds, **birds**, and **passing rain showers** — with each
  city sitting on the grass as a cluster of its real buildings (no more boxed tile-grid).
  Step into a city and it's a little town around a **roundabout**: offshoot roads,
  buildings scattered across a field, chimney smoke, **street lamps that light at night**,
  and **cars + pedestrians** following the roads. It also reacts to the work — buildings
  **light their windows at dusk** and **glow/pulse while an agent runs**, and on the
  office floor a citizen shows a 🔧 bubble for the tool it's using, then a ✓ (or ❗) with
  a one-line summary and a coin floating off the desk when a run finishes. All of it
  respects `prefers-reduced-motion`.
- **Handoffs fly across the screen.** When one citizen hands a task to another (the
  "↪ Hand off" button), a paper-plane courier arcs across the window carrying the
  receiving citizen's name.
- **Open the workspace in VS Code from the chat.** An "Open in VS Code" button in the
  chat toolbar opens the selected building's folder via the `code` CLI.
- **City/building guidelines are now your local data.** The per-city / per-building
  guideline files (house rules appended to every agent's prompt) follow the seed→data
  pattern: samples ship in `seed/guidelines/`, copied on first run into the gitignored
  `data/guidelines/`. Edit them there — they stay local and survive `git pull`.
- **One-command setup + a clean update path for self-hosting.** `npm run setup` takes a
  fresh clone to ready-to-run; `npm run update` pulls the latest and rebuilds;
  `npm run doctor` preflights prerequisites (Node 22.5+, the Claude Code CLI, git). New
  **Deploy / self-host** section in the README; all runtime state (`data/`, `.env`) stays
  gitignored, so `git pull` updates are clean.

- **New: a City Hall work-order board (Tasks view).** The backlog tasks API now
  has a UI — a "Tasks" tab in the top bar. Queue work orders for a city with a
  priority, optionally scope each to a building and a citizen, move them across
  to-do → in progress → done, and **spawn an agent directly on a task** (it opens
  that citizen's chat and runs the task's details as the prompt). Backed by the
  existing `GET`/`POST`/`PATCH`/`DELETE /api/tasks` endpoints.

- **New: a City Treasury HUD + leaderboard.** A persistent gold/tools chip in the
  top bar gamifies agent work — citizens earn 🪙 gold for every completed run (a
  base reward plus a bonus for the output produced) and 🔧 counts tools used. Click
  it for the **Treasury** view: city-wide totals and a medal-ranked **leaderboard**
  of the most productive citizens. The numbers tick up live as runs finish, and are
  derived from real run history (new read-only `GET /api/agents/treasury`).

## [0.2.0] - 2026-06-07

First tagged release of the Simulated Agent City Hub — a local-first hub that
orchestrates Claude Code agents behind a Simulated Agent City-themed UI (Cities → Buildings →
People). Everything below ships in this release.

- **Per-citizen streaming chat (the foundation).** Each agent streams its reply
  live over a WebSocket into its own thread (routed by run id), so multiple
  citizens can run at once without their output mixing; a pulsing dot marks who's
  running. Conversations are per-citizen and persist across navigation. The
  message area scrolls and follows streaming text (unless you've scrolled up),
  markdown and ` ```mermaid ` fences render as live diagrams (lazy-loaded, with a
  source fallback while streaming/invalid), and a conversation can be exported to
  a clean markdown file.
- **Isometric, game-like UI.** A drill-down map — **City Map** (cities as iso
  ground plates) → a city's **Buildings** → its **Citizens** → chat — with a
  🗺 Map home button, clickable breadcrumbs, pan/zoom (+/−/reset), and a pulsing
  glow on tiles with a running agent. The world map is open countryside (cities
  as building clusters on pastures); inside a city is a tile scene with roads,
  lakes, and trees. Buildings use selectable isometric sprites (Kenney CC0; a
  20-option catalogue) and citizens are CSS-drawn iso figures with a selectable
  avatar.
- **A building interior that feels alive.** Entering a building shows its
  citizens at desks on an office floor — back walls with windows, paired desk
  rows with aisles, potted plants — where an empty desk is the "add citizen" lot.
  Ambient life on the city view: animated cars and strolling pedestrians, a slow
  day/night cycle (midday → dusk → night → dawn) with street lamps that warm on
  at dusk, plus desk monitors that flicker and a "thinking" bubble over a
  citizen's head while its run is active. All motion respects
  `prefers-reduced-motion`. Clicking any blank lot opens a context-appropriate
  "add new" modal (City Map → New City, a city → New Building, interior → New
  Citizen).
- **In-app configuration & citizen management.** A **Config** view edits the
  local `cities.json` from the UI — a city's name/description, its buildings
  (name + workspace path, with live existence/directory/git validation), and its
  roster (reorder, add from the library, remove). Add and delete whole cities;
  create, edit, and delete citizens — their `people/<id>/` manifest + `prompt.md`
  (name, job, icon/avatar, description, model, effort, opens-in-VS-Code, MCPs) —
  with deletes scrubbing the id from every roster so no dangling tiles are left.
  Writes are confirm-gated, preserve the hand-format for minimal diffs, and never
  rewrite a relative path to a machine-absolute one.
- **Per-citizen model version and reasoning effort.** Pick a specific model
  grouped by family (Opus / Sonnet / Haiku — each with Auto and a "(latest)" that
  rides upgrades) and an effort level (Auto / low / medium / high / xhigh / max)
  gated to what the chosen model supports, so an unsupported combo can't be saved.
  The bundled citizens ship sensible per-role defaults.
- **Runs panel & observability.** A **Recent runs** panel with full **transcript
  replay** (prompt, replies with markdown/mermaid, tool activity, collapsed
  thinking), debounced **search + person/city/status filters**, a confirm-gated
  **Clear** that protects in-flight runs, and one-line run summaries (a short
  Haiku call for substantial output, `HUB_HAIKU_SUMMARY=0` to force the
  extractive fallback). Status flips the moment a run ends. **Live agent todos**
  show as a panel while a citizen works (☐ → ▸ → ✓), **activity badges** on the
  map count in-flight agents, and a **Usage** view aggregates tokens, run counts,
  and approximate cost by model and person over a selectable window.
- **Guarded git workflow.** A **Changes** view shows the selected building's
  uncommitted changes (file list + colorized per-file diff) and a confirm-gated
  **branch → commit → push → open PR** flow. Every history-mutating step is
  separate (the hub never auto-commits), the commit message is prefilled with the
  dual `Co-authored-by:` trailers, pushes to `main`/`master` are refused, and a
  missing/unauthenticated `gh` CLI degrades gracefully (only Open PR disables).
- **Robust agent spawn pipeline.** Concurrency-limited spawns
  (`HUB_MAX_CONCURRENT`, default 4) queue past the cap and start automatically as
  agents finish (queued runs are cancellable); spawning into a non-existent
  workspace fails fast. The pipeline merges the user's global MCP config (from
  both `~/.claude/settings.json` and `~/.claude.json`) with task MCPs, passes the
  system prompt and MCP config as file paths (Windows length limits), and cleans
  up temp files if a spawn fails. Cancelling tree-kills the real CLI process on
  Windows (npx fallback), multi-line handoff prompts parse intact, and a child
  dying early can no longer crash the hub.
- **Security & robustness hardening.** Same-origin only (no permissive CORS);
  git/GitHub/VS Code routes resolve the repo strictly from the selected
  city + building (no client-supplied paths); spawn ids are validated; a
  `guidelines` value is validated as a slug so it can't escape the guidelines
  folder. Inputs are clamped/validated with clean `400`s, server errors return a
  generic `500` (no on-disk path leaked) and `404` on a missing id. WebSocket
  connections are health-checked (half-open sockets reaped) and chat recovers
  after a dropped socket instead of wedging in "running". A top-level error
  boundary keeps a UI error recoverable, and the markdown/highlight/mermaid stack
  is lazy-loaded (roughly halving initial JS, ~582 kB → ~261 kB).
- **Keyboard accessibility.** Modals trap focus, move focus in on open and
  restore it on close, and expose `role="dialog"`/`aria-modal`; the iso
  map/building/citizen buttons show a visible focus ring when tabbed to.
- **Local-first, seeded data.** The repo ships samples under `seed/`
  (`seed/cities.json`, `seed/people/`); on first run the hub copies them into a
  gitignored `data/` folder (plus the SQLite DB `data/simcity-hub.db`), so your
  real workspace paths, the citizens you add, and run history stay local while a
  fresh clone still starts fully populated. The bundled sample is
  domain-agnostic — a generic City → Building → People demonstration that applies
  to any project.
- **Current stack & scaffold.** Built on current majors — React 19, Express 5,
  Vite 8 (Rolldown-based; requires Node 20.19+ / 22.12+) — and shipped with the
  initial repository scaffold: the `SIMCITY-HUB.md` design doc, CI (`build.yml`,
  `codeql.yml`), Dependabot config, and the agent workflow pipeline under
  `agents/`.
