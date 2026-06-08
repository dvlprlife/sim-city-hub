// Build the per-run MCP config file.
//
// CRITICAL: the CLI's --mcp-config flag REPLACES the user's global MCP config,
// it does not extend it. So we read the global mcpServers block from
// ~/.claude/settings.json, layer per-person and per-city MCPs on top, and write
// the merged object to a temp file. Skipping the merge would silently drop the
// user's globally-configured MCPs for this run.
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function readMcpServersFrom(filePath) {
  try {
    const json = JSON.parse(readFileSync(filePath, 'utf8'));
    return json.mcpServers ?? {};
  } catch {
    return {};
  }
}

// Global MCP servers can live in either the CLI's top-level store (~/.claude.json)
// or ~/.claude/settings.json — read both so the merge can't silently drop a
// user's globals just because they configured them in the other file. settings.json
// is layered on top on a name collision.
function readGlobalMcpServers() {
  const home = os.homedir();
  return {
    ...readMcpServersFrom(path.join(home, '.claude.json')),
    ...readMcpServersFrom(path.join(home, '.claude', 'settings.json')),
  };
}

// A person/city `mcps` entry may be either { name, ...serverConfig } or a plain
// { [name]: serverConfig } map. Normalize both to a { [name]: config } object.
function normalize(entry) {
  if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
    const { name, ...rest } = entry;
    return { [name]: rest };
  }
  return entry && typeof entry === 'object' ? entry : {};
}

// Returns the path to the merged MCP config file, or null if there are no MCPs
// at all (in which case the caller omits the --mcp-config flag entirely).
export function buildMcpConfig({ runId, person, city }) {
  const merged = { ...readGlobalMcpServers() };
  for (const m of person?.mcps ?? []) Object.assign(merged, normalize(m));
  for (const m of city?.mcps ?? []) Object.assign(merged, normalize(m));

  if (Object.keys(merged).length === 0) return null;

  const file = path.join(os.tmpdir(), `hub-mcp-${runId}.json`);
  writeFileSync(file, JSON.stringify({ mcpServers: merged }, null, 2), 'utf8');
  return file;
}
