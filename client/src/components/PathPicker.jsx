import { useEffect, useRef, useState } from 'react';
import { api } from '../hooks/useApi.js';

// Shows a workspace path with live exists / directory / git-repo validation
// (debounced, via GET /api/fs/validate). Display-only by default; pass
// `editable` + `onChange` to use it as an input (built for reuse by a future
// cities.json config editor).
export default function PathPicker({ path, editable = false, onChange }) {
  const [value, setValue] = useState(path || '');
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const reqId = useRef(0);

  // Re-sync when the source path changes (e.g. switching the selected building).
  useEffect(() => { setValue(path || ''); }, [path]);

  useEffect(() => {
    const p = value.trim();
    if (!p) { setResult(null); setChecking(false); return undefined; }
    setChecking(true);
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      api.validatePath(p)
        .then((r) => { if (id === reqId.current) { setResult(r); setChecking(false); } })
        .catch(() => { if (id === reqId.current) { setResult(null); setChecking(false); } });
    }, 350);
    return () => clearTimeout(timer);
  }, [value]);

  const set = (v) => { setValue(v); onChange?.(v); };
  const trimmed = value.trim();

  return (
    <div className="pathpicker">
      {editable ? (
        <input
          className="pathpicker-input"
          value={value}
          placeholder="path/to/workspace"
          spellCheck={false}
          onChange={(e) => set(e.target.value)}
        />
      ) : (
        <div className="picker-path">{value || '—'}</div>
      )}
      {trimmed && (
        <div className="pathpicker-badges">
          {checking ? (
            <span className="pp-badge pp-muted">checking…</span>
          ) : result ? (
            <>
              <span className={`pp-badge ${result.exists ? 'pp-ok' : 'pp-bad'}`}>{result.exists ? 'exists' : 'missing'}</span>
              {result.exists && (
                <span className={`pp-badge ${result.isDir ? 'pp-ok' : 'pp-bad'}`}>{result.isDir ? 'directory' : 'not a dir'}</span>
              )}
              {result.isDir && (
                <span className={`pp-badge ${result.isGitRepo ? 'pp-ok' : 'pp-muted'}`}>{result.isGitRepo ? 'git repo' : 'no git'}</span>
              )}
            </>
          ) : (
            <span className="pp-badge pp-muted">couldn’t check</span>
          )}
        </div>
      )}
    </div>
  );
}
