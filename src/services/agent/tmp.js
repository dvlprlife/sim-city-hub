// Private temp dir for the hub's transient files (system prompts, MCP configs,
// PR bodies). mkdtemp gives an unpredictable, owner-only (0700) directory, so
// the files are neither readable by other local users nor squattable by a
// predictable-name symlink — writing them straight into the shared os.tmpdir()
// was CodeQL js/insecure-temporary-file.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PREFIX = 'hub-agent-';

export const AGENT_TMP_DIR = mkdtempSync(path.join(os.tmpdir(), PREFIX));

// Join a file name into the private dir, re-creating it first. The mkdir is
// the self-heal: if the dir vanished (an external temp cleaner, or another hub
// instance's sweep racing an idle one), the next spawn repairs it instead of
// every spawn failing with ENOENT until restart.
export function agentTmpFile(name) {
  // mode matters: without it a recreate would be 0755, silently dropping the
  // owner-only guarantee for everything written afterwards. No-op when the
  // dir already exists; ignored where modes don't apply (Windows).
  mkdirSync(AGENT_TMP_DIR, { recursive: true, mode: 0o700 });
  return path.join(AGENT_TMP_DIR, name);
}

// Boot-time sweep of sibling dirs left by previous boots (node --watch restarts
// create one per boot; a crash mid-run can leave files inside). A dir's mtime
// refreshes whenever a file is created/removed in it, so >24h-stale means no
// spawn activity for a day — a live-but-idle instance losing its dir to the
// sweep self-heals via agentTmpFile. Best effort: never throws.
const DAY_MS = 24 * 60 * 60 * 1000;
try {
  const tmp = os.tmpdir();
  for (const entry of readdirSync(tmp)) {
    if (!entry.startsWith(PREFIX)) continue;
    const dir = path.join(tmp, entry);
    if (dir === AGENT_TMP_DIR) continue;
    try {
      if (Date.now() - statSync(dir).mtimeMs > DAY_MS) rmSync(dir, { recursive: true, force: true });
    } catch { /* in use or already gone */ }
  }
} catch { /* unreadable tmp — skip the sweep */ }
