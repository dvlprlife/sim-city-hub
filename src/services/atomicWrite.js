// Crash- and sync-safe file write: write to a temp sibling, then rename it over
// the target. Node's rename replaces the destination on Windows too, and the
// rename is near-atomic, so a reader (or a OneDrive sync pass) never sees a
// half-written file — which is the EEXIST mid-write race CLAUDE.md warns about.
import { writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export function writeFileAtomic(filePath, content) {
  const tmp = `${filePath}.tmp-${randomUUID()}`;
  try {
    writeFileSync(tmp, content, 'utf8');
    renameSync(tmp, filePath);
  } catch (e) {
    // Best-effort cleanup of the temp file if the rename failed.
    try {
      unlinkSync(tmp);
    } catch {
      /* temp may not exist */
    }
    throw e;
  }
}
