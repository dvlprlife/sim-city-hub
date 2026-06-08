// Read-only workspace-path validation for the building path picker. Reports
// whether a user-supplied path exists, is a directory, and is a git repo —
// it does NOT enumerate the filesystem (no listing), so there's no traversal
// surface beyond confirming a single path the user typed.
import { existsSync, statSync } from 'node:fs';
import simpleGit from 'simple-git';

export async function validatePath(p) {
  const path = typeof p === 'string' ? p.trim() : '';
  if (!path || !existsSync(path)) return { exists: false, isDir: false, isGitRepo: false };

  let isDir = false;
  try {
    isDir = statSync(path).isDirectory();
  } catch {
    /* unreadable / race — leave isDir false */
  }

  let isGitRepo = false;
  if (isDir) {
    try {
      isGitRepo = await simpleGit(path).checkIsRepo();
    } catch {
      isGitRepo = false;
    }
  }

  return { exists: true, isDir, isGitRepo };
}
