# Repo Setup Runbook

How to bootstrap a new GitHub repository to match the **AL-EventLens model** —
the template all `dvlprlife` repos mirror (labels, agent pipeline, CI, and
**branch-protection rules**). Run this once per new repo, or to repair an
existing one. Everything here is idempotent: re-running skips what already
exists.

> The model repo is [`dvlprlife/AL-EventLens`](https://github.com/dvlprlife/AL-EventLens).
> Sibling docs: label set in [`repo-check.md`](repo-check.md), the lifecycle in
> [`WORKFLOW.md`](WORKFLOW.md), releases in [`RELEASE.md`](RELEASE.md).

Set the target once (bash) and reuse it below:

```bash
REPO=dvlprlife/<new-repo>        # e.g. dvlprlife/sim-city-hub
MODEL=dvlprlife/AL-EventLens     # the template to copy from
```

---

## 1. Labels

The agent pipeline is driven by a fixed label set. Create them by running the
**Repo Check agent** (`agents/repo-check.md`) against the new repo, or apply them
directly:

| Label | Color | Description |
|-------|-------|-------------|
| `agent` | `0075ca` | Issue is assigned to an agent for automated processing |
| `status: need plan` | `fbca04` | Issue needs a plan before work can begin |
| `status: ready` | `0e8a16` | Issue is ready to be picked up |
| `status: in-progress` | `e4e669` | Issue is currently being worked on |
| `status: in-review` | `d93f0b` | Issue has an open PR awaiting review |
| `status: follow up` | `c5def5` | Needs follow-up after completion |
| `status: agent approved` | `2da44e` | PR reviewer agent found no issues; awaiting human approval |
| `human` | `b60205` | Requires human attention or intervention |
| `dependencies` | `0366d6` | Dependency updates (Dependabot stream) |

```bash
gh label create "agent" --repo "$REPO" --color 0075ca \
  --description "Issue is assigned to an agent for automated processing"
# …repeat per row; --force to update an existing label's color/description.
```

The default GitHub labels (`bug`, `enhancement`, `documentation`, etc.) are kept
as-is — no need to delete them.

---

## 2. Branch-protection rules (the "model" rules)

The model does **not** use classic branch protection — it uses a **repository
ruleset** named `main-pr`. Recreate it on the new repo:

```bash
# Inspect the model's ruleset to confirm it hasn't drifted:
RID=$(gh api repos/$MODEL/rulesets -q '.[] | select(.name=="main-pr") | .id')
gh api repos/$MODEL/rulesets/$RID
```

What `main-pr` enforces (on `main` and `release/*`):

- **No branch deletion** (`deletion`) and **no force-push** (`non_fast_forward`).
- **Pull request required** before merge: **1 approving review**, **dismiss stale
  reviews on push**, **require conversation resolution**. Merge methods:
  merge / squash / rebase all allowed.
- **Required status checks** must pass, **strict** (branch must be up to date
  before merge).
- **Bypass:** the **Repository Admin** role (`actor_id: 5`) is `exempt` — so the
  owner/admin can still merge directly (this is what lets the autonomous
  auto-merge of clean+green PRs work; PRs from the owner can't self-approve under
  the PR rule, and admin bypass covers that).

### ⚠️ The one field you must adapt per repo: required status check contexts

The required check **context strings must match the repo's actual check-run
names**, or `strict` policy makes every PR permanently unmergeable. They differ
when CI uses a matrix:

- AL-EventLens' `build` job is single-OS → context is just **`build`**.
- A matrix job `build` over `[ubuntu-latest, windows-latest]` (like sim-city-hub)
  produces **`build (ubuntu-latest)`** and **`build (windows-latest)`** — require
  **both**, not the bare `build`.

Find the real names from a recent run on the default branch:

```bash
gh api repos/$REPO/commits/main/check-runs -q '.check_runs[].name'
```

Then create the ruleset (edit the `context` values to match the output above):

```bash
cat > /tmp/main-pr-ruleset.json <<'JSON'
{
  "name": "main-pr",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "exclude": [], "include": ["refs/heads/main", "refs/heads/release/*"] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "required_reviewers": [],
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["merge", "squash", "rebase"] } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "build (ubuntu-latest)" },
          { "context": "build (windows-latest)" }
        ] } }
  ],
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "exempt" } ]
}
JSON

gh api -X POST repos/$REPO/rulesets --input /tmp/main-pr-ruleset.json
```

Verify it took:

```bash
gh api repos/$REPO/rulesets -q '.[] | .name + " (" + .enforcement + ")"'
```

> CodeQL is **manual-only** and Dependabot PRs run the same `build` matrix but
> don't go through the agent labels — so do **not** add a CodeQL context to the
> required checks. Only the `build` matrix legs are required.

---

## 3. Repository merge settings

Match the model's merge configuration:

```bash
gh api -X PATCH repos/$REPO \
  -F allow_squash_merge=true -F allow_merge_commit=true -F allow_rebase_merge=true \
  -F allow_auto_merge=false -F delete_branch_on_merge=false -F allow_update_branch=false \
  -f squash_merge_commit_title=COMMIT_OR_PR_TITLE -f squash_merge_commit_message=COMMIT_MESSAGES
```

Confirm against the model:

```bash
gh api repos/$MODEL -q '{squash:.allow_squash_merge,merge:.allow_merge_commit,rebase:.allow_rebase_merge,autoMerge:.allow_auto_merge,delBranch:.delete_branch_on_merge}'
gh api repos/$REPO  -q '{squash:.allow_squash_merge,merge:.allow_merge_commit,rebase:.allow_rebase_merge,autoMerge:.allow_auto_merge,delBranch:.delete_branch_on_merge}'
```

---

## 4. CI workflows + Dependabot

Copy these from the model into `.github/` and adapt to the new repo's stack
(they land via a normal commit/PR, not the API):

- **`.github/workflows/build.yml`** — the required check. Matrix over the OSes you
  care about (sim-city-hub: `[ubuntu-latest, windows-latest]`). Whatever the job
  name + matrix produces is what §2's required contexts must match.
- **`.github/workflows/codeql.yml`** — security scan, **manual-only** (`workflow_dispatch`),
  so it never blocks PRs.
- **`.github/dependabot.yml`** — npm + GitHub Actions, weekly, grouped. Dependabot
  PRs carry only the `dependencies` label and stay outside the agent state machine.

---

## 5. Agent pipeline files

Copy the `agents/` folder from the model and update the hardcoded
`dvlprlife/<repo>` references inside each file (`repo-check.md`,
`issue-planner.md`, `issue-worker.md`, `pr-reviewer.md`, `WORKFLOW.md`,
`RELEASE.md`). Then write a project-specific `CLAUDE.md` and add the
**Project-specific notes** section to `WORKFLOW.md` so the PR reviewer loads the
repo's load-bearing rules automatically.

---

## Post-setup checklist

- [ ] All labels from §1 exist (`gh label list --repo "$REPO"`).
- [ ] `main-pr` ruleset is `active` with the **correct** check contexts (§2).
- [ ] Merge settings match the model (§3).
- [ ] `build.yml`, `codeql.yml`, `dependabot.yml` present and green on `main` (§4).
- [ ] `agents/` + `CLAUDE.md` in place, repo references updated (§5).
- [ ] Open a throwaway test PR and confirm it **cannot merge** until the `build`
      checks pass — proves the rules are wired to real check names.
