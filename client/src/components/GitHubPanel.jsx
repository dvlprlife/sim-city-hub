import { useCallback, useEffect, useState } from 'react';
import { api } from '../hooks/useApi.js';

// Trailers per CLAUDE.md's GitHub workflow (lowercase, both co-authors). The
// user confirms/edits the message before it's committed — the hub never edits it.
const TRAILERS = '\n\nCo-authored-by: dvlprlife <dvlprlife@users.noreply.github.com>\nCo-authored-by: Claude <noreply@anthropic.com>';

// A two-step button: the first click arms it, the second confirms. Every
// git-history-mutating action in this panel goes through one, so nothing
// happens without an explicit confirmation (CLAUDE.md: never auto-commit).
function ConfirmButton({ label, confirmLabel, onConfirm, disabled, busy, danger }) {
  const [armed, setArmed] = useState(false);
  const cls = danger ? 'danger' : 'primary';
  if (busy) return <button className={cls} disabled>…</button>;
  if (armed) {
    // Confirm honors `disabled` too: a button armed before another action
    // started must not fire mid-flight (the panel's steps are serialized).
    return (
      <span className="gh-confirm">
        <span className="confirm-msg">{confirmLabel || 'Confirm?'}</span>
        <button className="ghost" onClick={() => setArmed(false)}>Cancel</button>
        <button className={cls} disabled={disabled} onClick={() => { setArmed(false); onConfirm(); }}>Confirm</button>
      </span>
    );
  }
  return <button className={cls} disabled={disabled} onClick={() => setArmed(true)}>{label}</button>;
}

// Guarded branch → commit → push → open-PR flow for the selected building's repo.
// Rendered inside the Changes view (below the diff), so the changes are shown
// before any action. gh-absent / not-authed degrades gracefully.
export default function GitHubPanel({ cityId, buildingId, onChanged }) {
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState(null);
  const [branch, setBranch] = useState('');
  const [message, setMessage] = useState(TRAILERS);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prBase, setPrBase] = useState('main');
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const loadInfo = useCallback(() => {
    setInfoError(null);
    return api.githubInfo({ cityId, buildingId })
      .then(setInfo)
      .catch((e) => setInfoError(e.message));
  }, [cityId, buildingId]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  const act = async (key, fn, describe) => {
    // One action at a time: overlapping requests would race on busy/result
    // state (the first to finish un-busies the other's button) and collide on
    // the repo's index lock anyway. The buttons below are disabled while any
    // action runs; this guard backstops them.
    if (busy) return;
    setBusy(key);
    setError(null);
    setResult(null);
    try {
      const r = await fn();
      setResult(describe(r));
      await loadInfo();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (infoError) return <div className="ghpanel"><div className="error">Git/GitHub error: {infoError}</div></div>;
  if (!info) return <div className="ghpanel"><p className="view-sub">Checking repository…</p></div>;
  if (!info.isRepo) return null; // DiffViewer already explains a non-repo workspace

  const noChanges = info.changes === 0;

  return (
    <div className="ghpanel">
      <h3 className="gh-title">Branch, commit &amp; open a PR</h3>

      {/* graceful-degrade banners */}
      {!info.ghAvailable && (
        <div className="gh-banner warn">GitHub CLI (<code>gh</code>) not found — install it to open PRs. Branch / commit / push still work.</div>
      )}
      {info.ghAvailable && !info.ghAuthed && (
        <div className="gh-banner warn">GitHub CLI isn’t authenticated — run <code>gh auth login</code> to enable Open PR.</div>
      )}
      {info.isProtected && (
        <div className="gh-banner warn">You’re on <strong>{info.branch}</strong>. Create a feature branch before pushing (no direct pushes to main).</div>
      )}

      <div className="gh-meta">
        On <strong>{info.branch}</strong>
        {info.tracking ? ` → ${info.tracking}` : ' (no upstream)'} ·{' '}
        {info.changes} change{info.changes === 1 ? '' : 's'}
        {info.ghUser ? ` · gh: ${info.ghUser}` : ''}
      </div>

      <div className="gh-step">
        <label className="field">
          <span>1 · Branch</span>
          <input value={branch} placeholder={`issue-${''}NN-short-description`} onChange={(e) => setBranch(e.target.value)} />
        </label>
        <ConfirmButton
          label="Create / switch branch"
          confirmLabel={`Switch to "${branch.trim()}"?`}
          busy={busy === 'branch'}
          disabled={!branch.trim() || !!busy}
          onConfirm={() => act('branch', () => api.githubBranch({ cityId, buildingId, branch }), (r) => `On branch ${r.branch}${r.created ? ' (created)' : ''}.`)}
        />
      </div>

      <div className="gh-step">
        <label className="field">
          <span>2 · Commit message <small>(first line = subject; trailers prefilled)</small></span>
          <textarea className="mono" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <ConfirmButton
          label={noChanges ? 'Nothing to commit' : 'Commit all changes'}
          confirmLabel="Commit all staged + unstaged changes?"
          busy={busy === 'commit'}
          disabled={noChanges || !message.trim() || !!busy}
          onConfirm={() => act('commit', () => api.githubCommit({ cityId, buildingId, message }), (r) => `Committed ${r.hash?.slice(0, 7)} — ${r.summary?.changes ?? 0} file(s).`)}
        />
      </div>

      <div className="gh-step">
        <span className="gh-step-label">3 · Push</span>
        <ConfirmButton
          label={`Push ${info.branch}`}
          confirmLabel={`Push ${info.branch} to origin?`}
          busy={busy === 'push'}
          disabled={info.isProtected || !!busy}
          onConfirm={() => act('push', () => api.githubPush({ cityId, buildingId }), (r) => `Pushed ${r.branch} to origin.`)}
        />
      </div>

      <div className="gh-step gh-step-pr">
        <span className="gh-step-label">4 · Open pull request</span>
        <label className="field">
          <span>Title</span>
          <input value={prTitle} onChange={(e) => setPrTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Body</span>
          <textarea className="mono" rows={5} value={prBody} onChange={(e) => setPrBody(e.target.value)} />
        </label>
        <label className="field">
          <span>Base branch</span>
          <input value={prBase} onChange={(e) => setPrBase(e.target.value)} />
        </label>
        <ConfirmButton
          label="Open pull request"
          confirmLabel="Open a PR on GitHub?"
          busy={busy === 'pr'}
          disabled={!info.ghAuthed || !prTitle.trim() || !!busy}
          onConfirm={() => act('pr', () => api.githubPr({ cityId, buildingId, title: prTitle, body: prBody, base: prBase }), (r) => (
            <>PR opened: <a href={r.url} target="_blank" rel="noreferrer">{r.url}</a></>
          ))}
        />
      </div>

      {error && <div className="error">{error}</div>}
      {result && <div className="gh-result">{result}</div>}
    </div>
  );
}
