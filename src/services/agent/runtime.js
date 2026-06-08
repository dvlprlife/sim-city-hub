// Build the child-process spawn command for the Claude Code CLI.
//
// We prefer to locate the CLI's cli.js and run it as `node cli.js ...` with
// shell:false — that sidesteps the Windows .cmd-shim requirement (Node refuses
// to spawn .cmd without shell:true) AND the arg-quoting problems that shell:true
// introduces for temp paths. npx is the documented fallback.
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';

// The native installer drops a real executable under ~/.local/bin. Spawning it
// directly (shell:false) is the cleanest path — no .cmd shim, no arg quoting.
function findClaudeExe() {
  const home = os.homedir();
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push(path.join(home, '.local', 'bin', 'claude.exe'));
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) candidates.push(path.join(localAppData, 'Programs', 'claude', 'claude.exe'));
  } else {
    candidates.push(path.join(home, '.local', 'bin', 'claude'));
    candidates.push('/usr/local/bin/claude');
    candidates.push('/opt/homebrew/bin/claude');
  }
  return candidates.find((p) => existsSync(p)) ?? null;
}

function findClaudeCli() {
  const candidates = [];
  const appData = process.env.APPDATA;
  if (appData) {
    candidates.push(path.join(appData, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'));
  }
  const home = os.homedir();
  candidates.push(path.join(home, '.npm-global', 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'));
  candidates.push('/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js');
  candidates.push('/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js');
  return candidates.find((p) => existsSync(p)) ?? null;
}

// Resolve how to launch the CLI: the native installer binary (preferred — no
// .cmd shim, no arg quoting), the npm-installed cli.js run via the current node,
// or npx as a last resort. Returns the command, any leading args, and whether a
// shell is required. Shared by buildSpawnCommand and buildSummaryCommand.
function resolveLauncher() {
  // 1. Native installer binary — spawn directly, no shell.
  const exe = findClaudeExe();
  if (exe) return { command: exe, prefix: [], shell: false };

  // 2. npm-installed cli.js run via the current node.
  const cli = findClaudeCli();
  if (cli) return { command: process.execPath, prefix: [cli], shell: false };

  // 3. Fallback: npx (requires npm on PATH). shell:true needed for npx.cmd on Win.
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return { command: npx, prefix: ['-y', '@anthropic-ai/claude-code'], shell: true };
}

// NOTE: --append-system-prompt-file and --mcp-config both take FILE PATHS
// (Windows command-line length limits make inline prompts unworkable). Verify
// the exact flag names against your installed CLI with `claude --help` if a
// spawn fails immediately — CLI flags evolve between versions.
export function buildSpawnCommand({ modelId, effort, systemPromptFile, mcpConfigFile, sessionId }) {
  const cliArgs = [
    '--print',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--model', modelId,
    '--append-system-prompt-file', systemPromptFile,
    '--dangerously-skip-permissions',
  ];
  // Only passed when the caller resolved a level valid for this model (see
  // resolveEffort) — omitting it lets the CLI use the model's default effort.
  if (effort) cliArgs.push('--effort', effort);
  if (sessionId) cliArgs.push('--resume', sessionId);
  if (mcpConfigFile) cliArgs.push('--mcp-config', mcpConfigFile);

  const { command, prefix, shell } = resolveLauncher();
  return { command, args: [...prefix, ...cliArgs], shell };
}

// One-shot, plain-text invocation for lightweight model calls (e.g. the haiku
// handoff summary). No stream-json, no tools, no skip-permissions, no MCP — the
// prompt is piped via stdin and the answer comes back on stdout.
export function buildSummaryCommand({ modelId }) {
  const { command, prefix, shell } = resolveLauncher();
  return { command, args: [...prefix, '--print', '--model', modelId], shell };
}

// Env for the child: strip the two vars that break hub-spawned runs.
export function buildSpawnEnv() {
  const env = { ...process.env };
  // The CLI refuses to nest when CLAUDECODE is set (it thinks it's already inside Claude Code).
  delete env.CLAUDECODE;
  // On a Max subscription, leaving the API key set makes the CLI burn API credits
  // instead of using the subscription. Strip it; subscription auth is picked up
  // from the CLI's own login state.
  delete env.ANTHROPIC_API_KEY;
  return env;
}
