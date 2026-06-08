// Double-click launcher. Health-checks the hub; starts it if down; opens the
// browser. Pass --restart to force-open even if it's already running.
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3141;
const URL = `http://localhost:${PORT}`;
const restart = process.argv.slice(2).includes('--restart');

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get(`${URL}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function openBrowser() {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '""', URL], { detached: true, stdio: 'ignore' }).unref();
  } else {
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(opener, [URL], { detached: true, stdio: 'ignore' }).unref();
  }
}

function startServer() {
  const child = spawn(process.execPath, ['--experimental-sqlite', path.join(__dirname, 'src', 'server.js')], {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  });
  process.on('SIGINT', () => {
    child.kill();
    process.exit(0);
  });
  return child;
}

// Guard the common first-run footguns before we bother starting anything:
// too-old Node (node:sqlite needs 22.5+), a never-built UI, and a missing Claude
// CLI (chat opens but agents can't run). Build automatically if deps are present
// but the UI isn't; otherwise point at `npm run setup`.
function preflight() {
  const [maj, minr] = process.versions.node.split('.').map(Number);
  if (maj < 22 || (maj === 22 && minr < 5)) {
    console.error(`Node 22.5+ required (for node:sqlite); found ${process.versions.node}. Install from https://nodejs.org`);
    process.exit(1);
  }
  if (!existsSync(path.join(__dirname, 'client', 'dist', 'index.html'))) {
    const haveDeps = existsSync(path.join(__dirname, 'node_modules')) &&
      existsSync(path.join(__dirname, 'client', 'node_modules'));
    if (!haveDeps) {
      console.error('First run: install deps + build the UI with `npm run setup`, then launch again.');
      process.exit(1);
    }
    console.log('UI not built yet — building (npm run build)…');
    try {
      execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
    } catch {
      console.error('Build failed. Run `npm run setup` and try again.');
      process.exit(1);
    }
  }
  try {
    execSync('claude --version', { stdio: 'ignore' });
  } catch {
    console.warn('⚠ Claude Code CLI (`claude`) not found on PATH — the UI will open, but agents can\'t run until it\'s installed & authed.');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHealth(maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await healthCheck()) return true;
    await sleep(400);
  }
  return false;
}

async function main() {
  preflight();
  const up = await healthCheck();
  if (up) {
    if (restart) {
      // A true restart (kill-by-port) is platform-specific and left out of v1.
      // Stop the existing `npm run dev` window first, then re-run this.
      console.log('Hub already running. To restart, stop the existing process, then re-run.');
    }
    openBrowser();
    return;
  }
  console.log('Starting Simulated Agent City Hub…');
  startServer();
  if (await waitForHealth()) {
    console.log(`Hub is up at ${URL}`);
    openBrowser();
  } else {
    console.error('Hub did not become healthy within 15s — check the logs above.');
    process.exitCode = 1;
  }
}

main();
