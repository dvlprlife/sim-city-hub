import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../hooks/useApi.js';
import GitHubPanel from './GitHubPanel.jsx';

// Color a unified-diff string line-by-line (GitHub-ish). Self-contained so it
// doesn't depend on a highlight.js theme being loaded.
function DiffBody({ diff }) {
  const lines = diff.split('\n');
  let added = 0;
  let removed = 0;
  for (const ln of lines) {
    if (ln.startsWith('+') && !ln.startsWith('+++')) added += 1;
    else if (ln.startsWith('-') && !ln.startsWith('---')) removed += 1;
  }
  return (
    <>
      <div className="diff-stat">
        <span className="diff-add-count">+{added}</span> <span className="diff-del-count">−{removed}</span>
      </div>
      <pre className="diff-pre">
        {lines.map((ln, i) => {
          let cls = 'diff-ctx';
          if (ln.startsWith('@@')) cls = 'diff-hunk';
          else if (ln.startsWith('+++') || ln.startsWith('---') || ln.startsWith('diff ') || ln.startsWith('index ') || ln.startsWith('new file') || ln.startsWith('deleted file')) cls = 'diff-meta';
          else if (ln.startsWith('+')) cls = 'diff-add';
          else if (ln.startsWith('-')) cls = 'diff-del';
          return <div key={i} className={`diff-line ${cls}`}>{ln || ' '}</div>;
        })}
      </pre>
    </>
  );
}

// Review the working-tree changes of the selected building's repo: lists
// changed files (via /api/git/status) and shows a per-file unified diff
// (/api/git/diff). Untracked files have no `git diff` body — surfaced as such.
export default function DiffViewer({ cityId, buildingId }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [openFile, setOpenFile] = useState(null);
  const [diff, setDiff] = useState(null);
  const [diffError, setDiffError] = useState(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  // Request counter so an out-of-order response (rapid file clicks, a refresh
  // while a diff is in flight, or a quick building switch racing two statuses)
  // can't overwrite the current state. Same pattern as PathPicker's validate
  // guard. One counter covers both fetches: a diff can only be opened after a
  // status has landed, so an openDiff bump never invalidates a live gitStatus.
  const diffReq = useRef(0);

  const refresh = useCallback(() => {
    const id = ++diffReq.current;
    setError(null);
    setStatus(null);
    setOpenFile(null);
    setDiff(null);
    setDiffError(null);
    api.gitStatus({ cityId, buildingId })
      .then((s) => { if (id === diffReq.current) setStatus(s); })
      .catch((e) => { if (id === diffReq.current) setError(e.message); });
  }, [cityId, buildingId]);

  useEffect(() => { refresh(); }, [refresh]);

  const openDiff = (file) => {
    const id = ++diffReq.current;
    setOpenFile(file);
    setLoadingDiff(true);
    setDiff(null);
    setDiffError(null);
    api.gitDiff({ cityId, buildingId, file })
      .then((r) => { if (id === diffReq.current) setDiff(r.diff || ''); })
      .catch((e) => { if (id === diffReq.current) setDiffError(e.message); })
      .finally(() => { if (id === diffReq.current) setLoadingDiff(false); });
  };

  if (error) {
    return <div className="diffview"><h2 className="view-title">Changes</h2><p className="view-sub">Git error: {error}</p></div>;
  }
  if (!status) {
    return <div className="diffview"><h2 className="view-title">Changes</h2><p className="view-sub">Loading changes…</p></div>;
  }
  if (!status.isRepo) {
    return <div className="diffview"><h2 className="view-title">Changes</h2><p className="view-sub">This building's workspace isn't a git repository.</p></div>;
  }

  const groups = [
    ['Modified', status.modified || []],
    ['Staged', status.staged || []],
    ['Deleted', status.deleted || []],
    ['Untracked', status.not_added || []],
    ['Conflicted', status.conflicted || []],
  ].filter(([, files]) => files.length);
  const total = groups.reduce((n, [, files]) => n + files.length, 0);
  const branch = `${status.current}${status.ahead || status.behind ? ` (↑${status.ahead} ↓${status.behind})` : ''}`;

  return (
    <div className="diffview">
      <div className="diffview-head">
        <h2 className="view-title">Changes — {branch}</h2>
        <button className="diff-refresh" onClick={refresh} title="Refresh">↻</button>
      </div>
      {total === 0 ? (
        <p className="view-sub">No uncommitted changes in this workspace.</p>
      ) : (
        <div className="diff-files">
          {groups.map(([label, files]) => (
            <div key={label} className="diff-group">
              <div className="diff-group-head">{label} ({files.length})</div>
              {files.map((f) => (
                <button
                  key={f}
                  className={`diff-file${f === openFile ? ' active' : ''}`}
                  onClick={() => openDiff(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {openFile && (
        <div className="diff-body">
          {loadingDiff ? (
            <p className="view-sub">Loading diff…</p>
          ) : diffError ? (
            <p className="view-sub">Error loading diff: {diffError}</p>
          ) : diff ? (
            <DiffBody diff={diff} />
          ) : (
            <p className="view-sub">No textual diff — likely an untracked, binary, or empty-change file. ({openFile})</p>
          )}
        </div>
      )}

      <GitHubPanel cityId={cityId} buildingId={buildingId} onChanged={refresh} />
    </div>
  );
}
