// Update a deployed clone: pull the latest from git, then re-run setup (deps may
// have changed; the UI needs rebuilding). Run with `npm run update`, then restart
// the hub. Working data (data/, *.db, .env) is gitignored, so the pull is clean.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = { reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m' };
const step = (msg) => console.log(`\n${C.cyan}▸ ${msg}${C.reset}`);

step('git pull --ff-only');
try {
  execSync('git pull --ff-only', { cwd: ROOT, stdio: 'inherit' });
} catch {
  console.error(`${C.red}✗ git pull failed.${C.reset} Local changes or a diverged branch? Resolve it, then re-run.`);
  process.exit(1);
}

step('Re-running setup (install + build)');
execSync('npm run setup', { cwd: ROOT, stdio: 'inherit' });

console.log(`\n${C.green}✓ Updated.${C.reset} Restart the hub to apply: stop the running process (Ctrl+C), then ${C.cyan}npm start${C.reset}.`);
