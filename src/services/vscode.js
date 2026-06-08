// Open a building folder in VS Code. Best-effort — if `code` isn't on PATH the
// spawn errors and we report it; the hub keeps working.
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

// Build the safe launch argument for `code <folder>`. Returns null if the path
// can't be launched safely.
//
// On Windows `code` is code.cmd, a batch shim Node will only run via shell:true
// (it refuses to spawn .cmd with shell:false). But with shell:true Node does NOT
// escape args (DEP0190) — it concatenates them into the cmd.exe command line —
// so a bare path would be mis-split on spaces and a path containing a shell
// metacharacter (&, |, ^, parentheses, …) could inject a command. Wrapping the
// path in double quotes fixes both: cmd keeps a quoted run together and treats
// metacharacters literally inside it. A real Windows directory can't contain a "
// (illegal in filenames), so reject one defensively. Off Windows we spawn with
// shell:false, so the path is passed as a literal argv element with no quoting.
export function buildCodeArg(folderPath, isWin = process.platform === 'win32') {
  if (!isWin) return folderPath;
  // Reject characters that survive (or defeat) double-quoting on a cmd.exe line:
  //  - `"`  ends the quoted run (also illegal in Windows filenames),
  //  - `%`  triggers env-var expansion AFTER quoting — `%VAR%` can re-inject a
  //         quote + command if the variable's value is hostile, so quoting does
  //         NOT neutralize it,
  //  - control chars (CR/LF/NUL/…) truncate or corrupt the command line.
  // None are valid in a normal Windows directory name, so refuse to launch.
  if (folderPath.includes('"') || folderPath.includes('%')) return null;
  if ([...folderPath].some((ch) => ch.charCodeAt(0) < 0x20)) return null;
  // A trailing backslash run right before the closing quote (`"C:\dir\"`) is read
  // as an escaped quote by the downstream arg parser, swallowing the quote and
  // corrupting the path. Double a trailing backslash run so it stays literal.
  const escaped = folderPath.replace(/(\\+)$/, '$1$1');
  return `"${escaped}"`;
}

export function openWorkspace(folderPath) {
  if (!folderPath) return { opened: false, error: 'no folder path' };
  // Spawn only for a path that actually resolves to a directory.
  if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
    return { opened: false, error: 'not a directory' };
  }
  const isWin = process.platform === 'win32';
  const arg = buildCodeArg(folderPath, isWin);
  if (arg === null) return { opened: false, error: 'invalid path' };
  const cmd = isWin ? 'code.cmd' : 'code';
  try {
    const child = spawn(cmd, [arg], {
      detached: true,
      stdio: 'ignore',
      shell: isWin, // code.cmd needs a shell on Windows
    });
    child.on('error', () => {}); // swallow ENOENT; reported below if needed
    child.unref();
    return { opened: true, folderPath };
  } catch (err) {
    return { opened: false, error: err.message };
  }
}
