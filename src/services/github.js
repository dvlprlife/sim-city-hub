// Guarded git-history mutation + PR creation for a building's repo. This is the
// ONLY service that changes git history from the UI, so it is deliberately
// step-wise: createBranch / commitAll / pushBranch / openPr are separate calls,
// each triggered by an explicit, confirmed UI action (CLAUDE.md: never
// auto-commit). Branch/commit/push use simple-git; opening a PR shells out to
// the `gh` CLI (no API token is managed here).
import { spawn } from 'node:child_process';
import { writeFileSync, unlink, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import simpleGit from 'simple-git';

const PROTECTED = new Set(['main', 'master']);

// No direct pushes to main (CLAUDE.md) — the push step refuses these.
export function isProtectedBranch(name) {
  return PROTECTED.has(String(name));
}

// A branch ref the UI may create: starts alphanumeric, then [A-Za-z0-9._/-],
// no '..', no leading '-'/'/', no trailing '/'/'.'. Keeps the ref surface tight.
export function isValidBranchName(name) {
  if (typeof name !== 'string') return false;
  const n = name.trim();
  if (!n || n.length > 200) return false;
  if (n.includes('..') || n.startsWith('/') || n.startsWith('-') || n.endsWith('/') || n.endsWith('.')) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(n);
}

// Spawn a CLI capturing stdout/stderr. No shell → no Windows arg-quoting
// footgun, and `gh` resolves as gh.exe via CreateProcess. An ENOENT (gh not
// installed) resolves as { ok: false } instead of throwing.
function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    child.on('error', (e) => resolve({ ok: false, code: -1, stdout, stderr: stderr || e.message }));
    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('close', (code) => resolve({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

async function openRepo(repoPath) {
  // simpleGit() throws synchronously on a non-existent dir, so check first —
  // building paths may be unset/placeholder (e.g. cities.json's REPLACE_WITH/...).
  if (!repoPath || !existsSync(repoPath)) throw new Error('This building\'s workspace path does not exist.');
  const git = simpleGit(repoPath);
  if (!(await git.checkIsRepo().catch(() => false))) throw new Error('This building\'s workspace is not a git repository.');
  return git;
}

// Pre-flight for the UI: repo state + whether `gh` is available/authenticated,
// so the panel can disable Open PR (and warn) without the user hitting an error.
export async function getRepoInfo(repoPath) {
  // Missing/placeholder path or non-repo dir → degrade to { isRepo: false } so
  // the panel shows the calm "not a git repository" state, not a hard error.
  // (existsSync guard first: simpleGit() throws synchronously on a missing dir.)
  if (!repoPath || !existsSync(repoPath)) return { isRepo: false };
  const git = simpleGit(repoPath);
  if (!(await git.checkIsRepo().catch(() => false))) return { isRepo: false };
  const status = await git.status();

  const ver = await run('gh', ['--version'], repoPath);
  const ghAvailable = ver.ok;
  let ghAuthed = false;
  let ghUser = null;
  if (ghAvailable) {
    ghAuthed = (await run('gh', ['auth', 'status'], repoPath)).ok;
    if (ghAuthed) {
      const who = await run('gh', ['api', 'user', '-q', '.login'], repoPath);
      if (who.ok && who.stdout) ghUser = who.stdout;
    }
  }

  return {
    isRepo: true,
    branch: status.current,
    tracking: status.tracking,
    ahead: status.ahead,
    behind: status.behind,
    changes: status.files.length,
    isProtected: isProtectedBranch(status.current),
    ghAvailable,
    ghAuthed,
    ghUser,
  };
}

export async function createBranch(repoPath, branch) {
  if (!isValidBranchName(branch)) throw new Error(`Invalid branch name: ${branch}`);
  const name = branch.trim();
  const git = await openRepo(repoPath);
  const locals = await git.branchLocal();
  if (locals.all.includes(name)) await git.checkout(name);
  else await git.checkoutLocalBranch(name);
  return { branch: name, created: !locals.all.includes(name) };
}

export async function commitAll(repoPath, message) {
  if (typeof message !== 'string' || !message.trim()) throw new Error('A commit message is required.');
  const git = await openRepo(repoPath);
  const status = await git.status();
  if (status.files.length === 0) throw new Error('Nothing to commit — the working tree is clean.');
  await git.add('-A');
  const res = await git.commit(message);
  return { committed: true, hash: res.commit, branch: res.branch, summary: res.summary };
}

export async function pushBranch(repoPath) {
  const git = await openRepo(repoPath);
  const status = await git.status();
  const branch = status.current;
  if (isProtectedBranch(branch)) {
    throw new Error(`Refusing to push "${branch}" — create a feature branch first (no direct pushes to main).`);
  }
  await git.push(['-u', 'origin', branch]);
  return { pushed: true, branch };
}

export async function openPr(repoPath, { title, body = '', base } = {}) {
  if (!repoPath) throw new Error('No workspace path for this building.');
  if (typeof title !== 'string' || !title.trim()) throw new Error('A PR title is required.');
  if (!(await run('gh', ['--version'], repoPath)).ok) {
    throw new Error('GitHub CLI (gh) is not installed or not on PATH.');
  }
  if (!(await run('gh', ['auth', 'status'], repoPath)).ok) {
    throw new Error('GitHub CLI is not authenticated. Run `gh auth login` in a terminal.');
  }

  // Body via a temp file: dodges command-line length limits and quoting.
  const bodyFile = path.join(os.tmpdir(), `hub-pr-${randomUUID()}.md`);
  writeFileSync(bodyFile, body, 'utf8');
  const args = ['pr', 'create', '--title', title, '--body-file', bodyFile];
  if (base && String(base).trim()) args.push('--base', String(base).trim());
  const res = await run('gh', args, repoPath);
  unlink(bodyFile, () => {});

  if (!res.ok) throw new Error(res.stderr || res.stdout || 'gh pr create failed.');
  const url = (res.stdout.match(/https?:\/\/\S+/) || [res.stdout])[0];
  return { url, stdout: res.stdout };
}
