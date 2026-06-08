// mtime-gated file reader. Prompts and guidelines are read on every spawn;
// caching by mtime avoids re-reading unchanged files while still picking up
// edits immediately. Returns null if the file is missing.
import { statSync, readFileSync } from 'node:fs';

const cache = new Map(); // absolutePath -> { mtimeMs, content }

export function readFileCached(filePath) {
  try {
    const { mtimeMs } = statSync(filePath);
    const hit = cache.get(filePath);
    if (hit && hit.mtimeMs === mtimeMs) return hit.content;
    const content = readFileSync(filePath, 'utf8');
    cache.set(filePath, { mtimeMs, content });
    return content;
  } catch {
    return null;
  }
}

export function clearFileCache() {
  cache.clear();
}

// Drop a single entry so the next read re-reads from disk even if the mtime
// didn't advance (e.g. a write within the same mtime tick). Used after the hub
// writes a manifest/prompt/cities.json so the next spawn sees the change.
export function invalidateFileCache(filePath) {
  cache.delete(filePath);
}
