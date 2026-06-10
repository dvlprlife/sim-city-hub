// Tests for the per-run MCP config builder and the spawn-setup cleanup path.
// The merge rule is load-bearing (--mcp-config REPLACES the global config, so
// the global + person + city merge must happen), and a setup failure must not
// leave temp files behind. Rows/files use an 'rt-' prefix and are removed in
// finally even when an assertion fails. Run with `npm test` (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PEOPLE_DIR } from '../src/paths.js';
import { ensureSeeded } from '../src/services/seed.js';
import { buildMcpConfig } from '../src/services/agent/mcp.js';
import { AGENT_TMP_DIR } from '../src/services/agent/tmp.js';
import { spawnAgent } from '../src/services/agent.js';

ensureSeeded();

const rmrf = (p) => rmSync(p, { recursive: true, force: true });

test('buildMcpConfig merges person + city mcps (both entry shapes) into the temp file', () => {
  const file = buildMcpConfig({
    runId: 'rt-mcp-merge',
    person: { mcps: [{ name: 'rt-person-mcp', command: 'p' }] }, // { name, ...config } shape
    city: { mcps: [{ 'rt-city-mcp': { command: 'c' } }] },       // { [name]: config } map shape
  });
  try {
    assert.ok(file, 'returns a file path when MCPs exist');
    const { mcpServers } = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(mcpServers['rt-person-mcp'], { command: 'p' }, 'person entry normalized and merged');
    assert.deepEqual(mcpServers['rt-city-mcp'], { command: 'c' }, 'city entry normalized and merged');
  } finally {
    if (file) unlinkSync(file);
  }
});

test('buildMcpConfig rejects a non-array mcps with a clear error (hand-edited data files)', () => {
  // The write path (validateManifest) enforces an array, but getPerson raw-parses
  // hand-edited manifests — the consumption-side check must not be `not iterable`.
  assert.throws(() => buildMcpConfig({ runId: 'rt-mcp-bad', person: { mcps: {} } }), /person mcps must be an array/);
  assert.throws(() => buildMcpConfig({ runId: 'rt-mcp-bad', person: { mcps: 'oops' } }), /person mcps must be an array/);
  assert.throws(() => buildMcpConfig({ runId: 'rt-mcp-bad', city: { mcps: {} } }), /city mcps must be an array/);
  // null/undefined mcps stay fine. (On a machine with global MCPs this writes
  // a real merged file — remove it rather than leak from the leak-fix's test.)
  const file = buildMcpConfig({ runId: 'rt-mcp-bad', person: { mcps: null }, city: {} });
  if (file) unlinkSync(file);
});

test('a spawn that fails during setup leaves no temp files behind', () => {
  // A person with a non-array mcps, written straight to disk the way a hand
  // edit would be (bypassing validateManifest). spawnAgent writes the system
  // prompt temp file BEFORE building the MCP config, so the mcps throw used to
  // strand hub-sys-<runId>.md in the temp dir.
  const personId = 'rt-bad-mcps';
  const runId = 'rt-leak-check';
  const dir = path.join(PEOPLE_DIR, personId);
  const sysFile = path.join(AGENT_TMP_DIR, `hub-sys-${runId}.md`);
  const mcpFile = path.join(AGENT_TMP_DIR, `hub-mcp-${runId}.json`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
      name: 'rt Bad Mcps', job: 'rt fixture', defaultModel: 'sonnet', effort: 'auto', mcps: {},
    }), 'utf8');
    writeFileSync(path.join(dir, 'prompt.md'), 'rt fixture prompt', 'utf8');

    assert.throws(() => spawnAgent({ runId, personId, prompt: 'rt' }), /person mcps must be an array/);
    assert.ok(!existsSync(sysFile), 'system-prompt temp file cleaned up');
    assert.ok(!existsSync(mcpFile), 'mcp temp file not left behind');
  } finally {
    rmrf(dir);
    rmSync(sysFile, { force: true });
    rmSync(mcpFile, { force: true });
  }
});

test('spawnAgent rejects a runId that is not a plain token, before touching anything', () => {
  // runId names the temp files — path-ish input must die at the boundary
  // (the route validates client input, but internal callers reach spawnAgent
  // directly). The check runs before getPerson, so no fixture person needed.
  for (const bad of ['../evil', 'a/b', 'a\\b', 'a.b', '', 'x'.repeat(129)]) {
    assert.throws(() => spawnAgent({ runId: bad, personId: 'rt-nobody' }), /Invalid runId/);
  }
});
