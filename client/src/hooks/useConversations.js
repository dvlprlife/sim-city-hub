import { useCallback, useRef, useState } from 'react';
import { api } from './useApi.js';
import { TOOL_LABELS } from '../lib/toolLabels.js';

// Re-exported for existing importers; the map now lives in the pure lib so the
// run-transcript replay can reuse it without importing React.
export { TOOL_LABELS };

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e6)}`);

const emptyConvo = () => ({ messages: [], liveText: '', status: 'idle', sessionId: null, activeRunId: null, lastRunId: null });

// Apply one streamed WS event to a single conversation, returning the next state.
function applyEvent(cv, msg) {
  switch (msg.type) {
    case 'agent:output':
      if (msg.partial) return { ...cv, liveText: cv.liveText + (msg.text || '') };
      if (msg.text) {
        return { ...cv, messages: [...cv.messages, { id: uid(), role: 'assistant', text: msg.text }], liveText: '' };
      }
      return cv;
    case 'agent:activity':
      if (msg.activity?.type === 'tool_use') {
        const label = TOOL_LABELS[msg.activity.name] || msg.activity.name;
        return { ...cv, messages: [...cv.messages, { id: uid(), role: 'note', text: `🔧 ${label}…` }] };
      }
      return cv;
    case 'agent:session':
      return { ...cv, sessionId: msg.sessionId };
    case 'agent:done': {
      const next = { ...cv, status: 'idle', activeRunId: null };
      if (msg.status === 'error') {
        next.messages = [...cv.messages, { id: uid(), role: 'note', text: `⚠ run ended with an error${msg.error ? `: ${msg.error}` : ''}` }];
      }
      return next;
    }
    default:
      return cv;
  }
}

// Pure: finalize a conversation left 'running' because its run actually finished
// during a WS gap (the final agent:output/agent:done were broadcast while the
// socket was down and are never replayed). Commit any dangling partial liveText
// as the final assistant message, append an error note if the run errored, and
// clear the running state so the composer unsticks.
export function finalizeStuckConvo(cv, { status = 'done', error = null } = {}) {
  let messages = cv.liveText
    ? [...cv.messages, { id: uid(), role: 'assistant', text: cv.liveText }]
    : cv.messages;
  if (status === 'error') {
    messages = [...messages, { id: uid(), role: 'note', text: `⚠ run ended with an error${error ? `: ${error}` : ''}` }];
  }
  return { ...cv, messages, liveText: '', status: 'idle', activeRunId: null };
}

// Owns ALL chat conversations, keyed by personId. WS events route to the owning
// conversation by runId, so concurrent runs stream into separate threads and
// switching person restores its thread (state persists in the map; in-memory
// only — past runs still live in the DB history).
export function useConversations() {
  const [convos, setConvos] = useState({}); // personId -> convo
  const runOwner = useRef({});               // runId -> personId
  const convosRef = useRef(convos);          // latest convos, for async resync reads
  convosRef.current = convos;

  const update = useCallback((pid, fn) => {
    setConvos((all) => ({ ...all, [pid]: fn(all[pid] || emptyConvo()) }));
  }, []);

  const get = useCallback((pid) => convos[pid] || emptyConvo(), [convos]);

  const pushUser = useCallback(
    (pid, text) => update(pid, (cv) => ({ ...cv, messages: [...cv.messages, { id: uid(), role: 'user', text }] })),
    [update],
  );
  const pushNote = useCallback(
    (pid, text) => update(pid, (cv) => ({ ...cv, messages: [...cv.messages, { id: uid(), role: 'note', text }] })),
    [update],
  );

  const startRun = useCallback((pid, runId) => {
    runOwner.current[runId] = pid;
    // lastRunId persists past agent:done so the todos panel keeps showing the
    // finished run's final checklist until the next run starts.
    update(pid, (cv) => ({ ...cv, status: 'running', activeRunId: runId, lastRunId: runId, liveText: '' }));
  }, [update]);

  // Fresh thread for a handoff target — the receiving Person gets ZERO history.
  const resetConvo = useCallback((pid) => update(pid, () => emptyConvo()), [update]);

  const onWsMessage = useCallback((msg) => {
    if (!msg || !msg.type || !msg.runId) return; // non-chat frames (hub/todo:update/rate_limit) handled elsewhere (todos → useTodos)
    const pid = runOwner.current[msg.runId];
    if (!pid) return;                              // event for a run this client doesn't own
    update(pid, (cv) => applyEvent(cv, msg));
    if (msg.type === 'agent:done') delete runOwner.current[msg.runId]; // run finished — drop the index entry
  }, [update]);

  // Resync after a WS reconnect. The hub broadcast is fire-and-forget with no
  // replay, so if the socket dropped across a run's completion the final
  // agent:output/agent:done were lost and the thread is wedged in 'running'
  // forever (dead Stop button, hanging partial). For each conversation still
  // 'running', ask the server whether its run is still active; if it finished
  // during the gap, finalize the thread (status + error come from the run row).
  const resyncAfterReconnect = useCallback(async () => {
    const stuck = Object.entries(convosRef.current).filter(([, cv]) => cv.status === 'running' && cv.activeRunId);
    if (!stuck.length) return;
    let active;
    try {
      active = await api.activeRuns();
    } catch {
      return; // transient — a later event or reconnect retries
    }
    const activeIds = new Set((active || []).map((r) => r.run_id));
    for (const [pid, cv] of stuck) {
      const runId = cv.activeRunId;
      if (activeIds.has(runId)) continue; // genuinely still running — streaming resumes
      let status = 'done';
      let error = null;
      try {
        const run = await api.run(runId);
        status = run?.status || 'done';
        error = run?.error || null;
      } catch {
        /* fall back to a plain 'done' finalize */
      }
      update(pid, (c) => {
        if (c.activeRunId !== runId || c.status !== 'running') return c; // changed under us
        return finalizeStuckConvo(c, { status, error });
      });
      delete runOwner.current[runId];
    }
  }, [update]);

  // personIds with an in-flight run (drives the picker's running indicator).
  const runningIds = Object.keys(convos).filter((pid) => convos[pid].status === 'running');

  return { get, pushUser, pushNote, startRun, resetConvo, onWsMessage, runningIds, resyncAfterReconnect };
}
