import { useEffect, useRef, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { eventsToItems } from '../lib/runTranscript.js';
import { modelBadge } from '../lib/models.js';
import MessageBubble from './MessageBubble.jsx';

// Read-only replay of a past run, opened from the Recent-runs list. Pulls the
// run row (GET /api/agents/:runId) + its persisted event log
// (GET /api/agents/:runId/events) and renders the reconstructed transcript.
export default function RunTranscript({ runId, onClose }) {
  const [run, setRun] = useState(null);
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    setRun(null);
    setItems(null);
    setError(null);
    Promise.all([api.run(runId), api.runEvents(runId)])
      .then(([r, events]) => {
        if (!live) return;
        setRun(r);
        setItems(eventsToItems(events || [], r));
      })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [runId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dialogRef = useRef(null);
  useFocusTrap(dialogRef);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal run-transcript" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Run transcript" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <span>Run transcript{run ? ` — ${run.person_id}` : ''}</span>
          <button className="modal-close" onClick={onClose} title="Close (Esc)">✕</button>
        </header>

        {run && (
          <div className="rt-meta">
            <span className={`run-status run-${run.status}`}>{run.status}</span>
            {run.model && <span>{modelBadge(run.model)}</span>}
            {run.created_at && <span>{run.created_at}</span>}
            {run.summary && <div className="rt-summary">{run.summary}</div>}
          </div>
        )}

        <div className="modal-body rt-body">
          {error && <div className="error">Failed to load run: {error}</div>}
          {!error && items === null && <p className="view-sub">Loading transcript…</p>}
          {!error && items && items.length === 0 && <p className="view-sub">No recorded output for this run.</p>}
          {items && items.map((it) => (
            it.kind === 'thinking' ? (
              <details key={it.id} className="rt-thinking">
                <summary>💭 Thinking</summary>
                <div className="rt-thinking-body">{it.text}</div>
              </details>
            ) : (
              <MessageBubble key={it.id} message={{ id: it.id, role: it.kind, text: it.text }} />
            )
          ))}
        </div>
      </div>
    </div>
  );
}
