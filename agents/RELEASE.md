# Cutting a Release

The runbook for tagging a new SimCity Agent Hub version. This is a **local-first
app** — there is no marketplace or registry publish step; a release is a version
bump, a consolidated CHANGELOG, and an annotated git tag.

The release isn't done through the agent pipeline (`agents/WORKFLOW.md`) — the
release commit is a small, mechanical change that doesn't need a planner. The
release PR still goes through the same `release/X.Y.Z` → squash-merge flow as
feature PRs, but is authored directly.

---

## 0. Pre-flight

1. On `main`, working tree clean:
   ```
   git checkout main && git pull
   git status
   ```
2. CI green on `main` (the `build.yml` matrix).
3. `package.json` version is the LAST released version.
4. `CHANGELOG.md` `[Unreleased]` section has all the user-visible changes since the last tag.

If any of these are off, **stop and fix before proceeding** — release commits are mechanical and shouldn't carry surprises.

---

## 1. Consolidate the CHANGELOG

`[Unreleased]` accumulates one entry per PR during development. Before tagging, collapse them:

- Keep entries that describe a behavior change a user of the previous release would notice.
- Merge entries that describe iterations on the same subsystem into one.
- Drop entries about bugs introduced AND fixed within the same release.
- Preserve the technical detail in parentheses (file paths, mechanism) — the CHANGELOG is read by curious users.

This is editorial work — read the section as a user would and rewrite for clarity.

---

## 2. Bump version and date the section

```
# package.json
"version": "0.1.0"  →  "version": "0.2.0"
```

```
# CHANGELOG.md
## [Unreleased]
                       →   ## [Unreleased]
## [Unreleased]            (fresh empty section above)
                           ## [0.2.0] - YYYY-MM-DD
```

Add a fresh empty `## [Unreleased]` above the dated section. Use today's date in `YYYY-MM-DD` format.

---

## 3. Release commit on a release branch

```
git checkout -b release/0.2.0
git add CHANGELOG.md package.json
git commit -m "release: 0.2.0

<2-4 sentence summary of what's in the release — what users will notice.>

Co-authored-by: dvlprlife <dvlprlife@users.noreply.github.com>
Co-authored-by: Claude <noreply@anthropic.com>"
git push -u origin release/0.2.0
```

**Trailer convention:** both `Co-authored-by` lines, lowercase `Co-authored-by:`
(not the default capitalized `Co-Authored-By:`). Confirm with `git log -8 --format=%B`.

---

## 4. Open and merge the release PR

```
gh pr create --repo dvlprlife/sim-city-hub --title "release: 0.2.0" --body "..."
```

Wait for the CI matrix to go green:

```
gh pr checks <N> --repo dvlprlife/sim-city-hub --watch
```

Then squash-merge with branch deletion:

```
gh pr merge <N> --repo dvlprlife/sim-city-hub --squash --delete-branch
```

Sync local main:

```
git checkout main && git pull
```

---

## 5. Tag

```
git tag v0.2.0 -m "Release 0.2.0 — <one-line summary>"
git push origin v0.2.0
```

Always an annotated tag (`-m`), never lightweight. The tag is the canonical reference for the release.

---

## 6. Cleanup

```
git branch -d release/0.2.0     # delete local branch (remote was deleted on merge)
git remote prune origin          # prune stale tracking refs
```

### Verify

```
gh api /repos/dvlprlife/sim-city-hub/releases/tags/v0.2.0 --jq .name 2>&1 | head -1   # only if you also cut a GitHub Release
git log --oneline -3
node -p "require('./package.json').version"
```

---

## What this process intentionally skips

- **No marketplace/registry publish.** This is a local-first hub launched via
  `launch.bat` — there's nothing to publish. The git tag IS the release.
- **No automated changelog generation.** `[Unreleased]` is hand-curated during
  development; the release step consolidates it.
- **GitHub Release is optional.** A pushed annotated tag is sufficient; attach a
  GitHub Release only if you want release notes surfaced on the repo page.
