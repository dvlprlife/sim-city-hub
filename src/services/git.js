// Thin wrapper over simple-git for the git status/diff routes. Every call is
// scoped to a building's absolutePath (the repo the agent is working in).
import simpleGit from 'simple-git';

async function open(repoPath) {
  const git = simpleGit(repoPath);
  const isRepo = await git.checkIsRepo().catch(() => false);
  return { git, isRepo };
}

export async function getStatus(repoPath) {
  const { git, isRepo } = await open(repoPath);
  if (!isRepo) return { isRepo: false };
  const status = await git.status();
  return {
    isRepo: true,
    current: status.current,
    tracking: status.tracking,
    ahead: status.ahead,
    behind: status.behind,
    staged: status.staged,
    modified: status.modified,
    not_added: status.not_added,
    deleted: status.deleted,
    conflicted: status.conflicted,
  };
}

export async function getDiff(repoPath, file) {
  const { git, isRepo } = await open(repoPath);
  if (!isRepo) return { isRepo: false, diff: '' };
  const diff = file ? await git.diff(['--', file]) : await git.diff();
  return { isRepo: true, diff };
}
