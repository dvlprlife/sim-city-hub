# Agent Workflow

This document describes the full lifecycle of an issue through the agent system
for the `dvlprlife/sim-city-hub` repository.

> **Cutting a release?** See [`RELEASE.md`](RELEASE.md) — the release process is
> mechanical and doesn't go through the planner/worker pipeline.

## Agents

| Agent | File | Purpose |
|-------|------|---------|
| Repo Check | `repo-check.md` | Ensures all required labels exist in the repo |
| Issue Planner | `issue-planner.md` | Reviews issues and writes implementation plans |
| Issue Worker | `issue-worker.md` | Implements changes, commits, and opens a PR |
| PR Reviewer | `pr-reviewer.md` | Reviews the PR against the plan, AC, code quality, and CLAUDE.md |

---

## Issue Lifecycle

### 1. Setup (Repo Check Agent)
Run once before using the other agents to ensure all required labels exist.

```
agent: repo-check
```

> **Bootstrapping a brand-new repo** (labels + branch-protection rules + CI +
> merge settings, mirroring the AL-EventLens model)? Follow
> [`repo-setup.md`](repo-setup.md) — the Repo Check agent only handles labels.

---

### 2. Issue Created by Human
A human creates an issue and applies the following labels to queue it for agent processing:

| Label | Purpose |
|-------|---------|
| `agent` | Marks the issue for agent pickup |
| `status: need plan` | Signals the issue planner to review it |

---

### 3. Planning (Issue Planner Agent)
The planner finds issues labeled `agent` + `status: need plan`.

**Happy path — enough information:**
1. Posts an `## Implementation Plan` comment (file-by-file changes + acceptance criteria)
2. Removes `status: need plan`, adds `status: ready`

**Failure path — not enough information:**
1. Adds `status: follow up` and `human` labels, removes `agent`
2. Posts a `## Needs Clarification` comment explaining what is missing
3. Stops — human intervention required

---

### 4. Implementation (Issue Worker Agent)
The worker finds issues labeled `agent` + `status: ready`.

1. Swaps `status: ready` → `status: in-progress`
2. Verifies an implementation plan exists — either an `## Implementation Plan` comment (planner-authored) **or** a `## Plan` section in the issue body (when a human or interactive agent files a ready issue directly). If neither exists, transitions back to `status: need plan` and stops
3. Creates a branch, implements the changes, commits, and pushes
4. Opens a PR referencing the issue
5. Swaps `status: in-progress` → `status: in-review`
6. Posts a comment on the issue linking to the PR

---

### 4.5. Automated Review (PR Reviewer Agent)
The reviewer finds issues labeled `agent` + `status: in-review`.

1. Locates the open PR referencing the issue (`Closes #{number}`)
2. Gathers the issue body, the `## Implementation Plan` comment, the PR, and the diff
3. Reviews against six criteria: Implementation Plan adherence, Acceptance Criteria, code quality, CLAUDE.md compliance, CHANGELOG compliance, and README compliance
4. Posts a review on the PR (request changes if findings exist, comment review otherwise — agents cannot self-approve)
5. Posts a summary comment on the issue

**If findings:** adds `status: follow up` + `human`, removes `status: in-review`.
**If clean:** adds `status: agent approved`, removes `status: in-review`.

---

### 5. Review (Human)
A human reviews the PR. On merge the issue is closed.

---

## Label State Machine

```
[human creates issue]
        │
        ▼
  agent + status: need plan
        │
        ▼ (issue planner)
        ├─── not enough info ──▶ status: follow up + human  (awaits human)
        │
        ▼
  agent + status: ready
        │
        ▼ (issue worker)
  agent + status: in-progress
        │
        ├─── no plan found ──▶ status: need plan  (replanner picks up)
        │
        ▼
  agent + status: in-review
        │
        ▼ (pr reviewer)
        ├─── findings ──▶ status: follow up + human  (awaits human)
        │
        ▼
  agent + status: agent approved
        │
        ▼ (human merges PR)
  issue closed
```

---

## Required Labels

| Label | Color | Description |
|-------|-------|-------------|
| `agent` | `#0075ca` | Issue is assigned to agent processing |
| `status: need plan` | `#fbca04` | Awaiting implementation plan |
| `status: ready` | `#0e8a16` | Planned and ready for the worker |
| `status: in-progress` | `#e4e669` | Worker is actively implementing |
| `status: in-review` | `#d93f0b` | PR open, awaiting human review |
| `status: follow up` | `#c5def5` | Needs follow-up after human review |
| `status: agent approved` | `#2da44e` | PR reviewer agent found no issues; awaiting human approval |
| `human` | `#b60205` | Requires human attention |

---

## Non-agent PR streams

[Dependabot](../.github/dependabot.yml) PRs (npm + GitHub Actions, weekly, grouped) are a **human-reviewed** stream that lives **outside** this label state machine. They carry only the `dependencies` label — never `agent` or any `status:*` label — so the planner / worker / reviewer agents never pick them up as pipeline work. They run through the same `build.yml` CI matrix as any other PR.

---

## Project-specific notes

These are the architectural ground rules the PR Reviewer should treat as load-bearing alongside `CLAUDE.md`. They are repeated here so the reviewer agent loads them automatically with `agents/WORKFLOW.md`. `CLAUDE.md` is the authoritative source.

### Stack

- **Node 22+ backend, no bundler.** The backend uses built-in `node:sqlite`
  (WAL mode) — Node 22 is a hard requirement, not a preference. Express + `ws`
  on port `3141`, `simple-git`, `dotenv`. No ORM, no test framework, no nodemon;
  development runs under `node --watch`.
- **Vite + React 19 frontend.** Dev-proxies `/api` and `/ws` → `:3141`;
  production build is static-served by the same Express server.

### Theme discipline

- **The backend is theme-agnostic.** The Simulated Agent City theme is confined to
  `client/src/components/CityMap.jsx`, `CityInterior.jsx`, the two `map/` files,
  the toolbar string, and CSS vars. A PR that leaks Simulated Agent City strings into `src/`
  is wrong. Themed views must honor the fixed prop contracts documented at the top
  of `CityMap.jsx` / `CityInterior.jsx`.

### The agent-spawn pipeline (the only "clever" part)

- **`--mcp-config` REPLACES the global MCP config — it does not extend it.** The
  pipeline must read `~/.claude/settings.json`, merge its `mcpServers` block with
  task-specific MCPs, and write the merged object to a temp file. Skipping the
  merge silently drops the user's global MCPs for that run.
- **Strip `CLAUDECODE`** from the child env (the CLI refuses to nest otherwise)
  and **strip `ANTHROPIC_API_KEY`** on a Max subscription (it burns API credits
  instead of the subscription otherwise).
- **System prompt and MCP config are passed as file paths**, not inline (Windows
  command-line length limits); the user prompt is piped via `stdin`.
- **Stream-json is parsed line-buffered** into the WebSocket event union, and
  every event is persisted to `agent_run_events` for replayable history. The WS
  event union and the REST surface must not change without a deliberate,
  documented reason.

### Behavior contracts

- **People update todos via the hub API**, never Claude Code's built-in
  `TodoWrite` (which renders only in the CLI console, not the hub UI).
- **Never auto-commit** — agents spawned by the hub must not `git commit` unless
  the user explicitly asks; the system-prompt footer must say so.
- **Handoff token is literal:** `[HANDOFF:other-person-id] <self-contained prompt>`
  on its own line; the receiving Person gets ZERO conversation history.
- **Rosters are per-City and order matters** — `people: [...]` order binds
  citizens to interior tiles.

### Platform

- **Windows-first; never inside a OneDrive-synced folder** (background sync
  collides with Node's mid-edit writes → `EEXIST`). The hub runs from its repo
  checkout; paths resolve at runtime, so no machine path is committed to config.
