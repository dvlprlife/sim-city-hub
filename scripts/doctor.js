// Preflight check for self-hosting. Verifies what the hub needs to actually run
// agents, and reports a checklist. Informational — exits non-zero only on a hard
// blocker (Node too old). Run with `npm run doctor`.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m' };
const PASS = `${C.green}✓${C.reset}`, WARN = `${C.yellow}⚠${C.reset}`, FAIL = `${C.red}✗${C.reset}`;
const line = (status, label, detail) => console.log(`  ${status} ${label}${detail ? `  ${C.dim}— ${detail}${C.reset}` : ''}`);

// First line of a command's output, or null if it isn't on PATH / errors.
function probe(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n')[0]; }
  catch { return null; }
}

console.log('\nSimCity Agent Hub — preflight\n');
let blocked = false;

const [maj, minr] = process.versions.node.split('.').map(Number);
const nodeOk = maj > 22 || (maj === 22 && minr >= 5);
line(nodeOk ? PASS : FAIL, `Node ${process.versions.node}`, nodeOk ? '' : 'need >= 22.5 for node:sqlite');
if (!nodeOk) blocked = true;

const claude = probe('claude --version');
line(claude ? PASS : WARN, 'Claude Code CLI', claude || 'not on PATH — agents cannot run until it is installed & authed');

const git = probe('git --version');
line(git ? PASS : WARN, 'git', git || 'not found — needed for `npm run update` and the Changes view');

const gh = probe('gh --version');
line(gh ? PASS : WARN, 'GitHub CLI (gh)', gh || 'optional — only the branch → PR flow uses it');

const built = existsSync(path.join(ROOT, 'client', 'dist', 'index.html'));
line(built ? PASS : WARN, 'UI build (client/dist)', built ? '' : 'not built — run `npm run setup`');

const seeded = existsSync(path.join(ROOT, 'data', 'cities.json'));
line(seeded ? PASS : WARN, 'Working data (data/)', seeded ? '' : 'will be seeded from seed/ on first start');

console.log(
  blocked
    ? `\n${C.red}Blocking issue above — fix it before running.${C.reset}\n`
    : `\n${C.green}Ready.${C.reset} Start with \`npm start\` (or launch.bat).\n`,
);
process.exit(blocked ? 1 : 0);
