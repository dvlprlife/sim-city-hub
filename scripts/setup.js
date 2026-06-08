// One-command setup for a fresh clone: preflight Node, install backend + frontend
// deps, and build the UI. Run with `npm run setup`.
//
// Uses only Node built-ins so it works on a fresh clone before anything is
// installed (`npm run <script>` doesn't need node_modules). `npm ci` is preferred
// when a lockfile is present (reproducible, matches the committed versions);
// `--include=dev` keeps the Vite build working even if NODE_ENV=production is set
// (otherwise the build-time devDependencies would be omitted and the build fails).
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const C = { reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m' };
const step = (msg) => console.log(`\n${C.cyan}▸ ${msg}${C.reset}`);
const ok = (msg) => console.log(`${C.green}✓${C.reset} ${msg}`);

// node:sqlite (used by the DB layer) needs Node 22.5+.
export function requireNode(min = [22, 5]) {
  const [maj, minr] = process.versions.node.split('.').map(Number);
  if (maj < min[0] || (maj === min[0] && minr < min[1])) {
    console.error(`${C.red}✗ Node ${min.join('.')}+ required (for node:sqlite); found ${process.versions.node}.${C.reset}`);
    console.error('  Install a newer Node from https://nodejs.org and re-run.');
    process.exit(1);
  }
  ok(`Node ${process.versions.node}`);
}

function install(dir, label) {
  const cmd = existsSync(path.join(dir, 'package-lock.json')) ? 'npm ci --include=dev' : 'npm install --include=dev';
  step(`${label} (${cmd})`);
  execSync(cmd, { cwd: dir, stdio: 'inherit' });
}

export function setup() {
  step('Checking prerequisites');
  requireNode();
  install(ROOT, 'Backend deps');
  install(path.join(ROOT, 'client'), 'Frontend deps');
  step('Building the UI (vite build)');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  console.log(`\n${C.green}✓ Setup complete.${C.reset} Start the hub with ${C.cyan}npm start${C.reset} (or double-click launch.bat).`);
}

// Run only when invoked directly (so update.js / launch.js can import requireNode).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  setup();
}
