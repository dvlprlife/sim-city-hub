import { useCallback, useEffect, useRef, useState } from 'react';
import { TOOL_LABELS } from '../lib/toolLabels.js';

// Per-citizen status emotes for the office-floor view (CityInterior): a 🔧 bubble
// while a tool runs, and a ✓ / ❗ + one-line summary that pops when a run this
// browser started finishes. Self-contained — it maps runId → personId via
// startRun() (mirroring useConversations, since WS frames carry only a runId) and
// derives the summary from the run's own streamed output, so it never refetches.
// The finish emote auto-clears after a few seconds; the running glow + activity
// badges (driven cross-client by useActiveRuns) are unaffected.
const DONE_TTL = 7000;

// First non-empty line of the run's output, stripped of a leading markdown
// heading / bullet marker and clipped — the blurb for the finish bubble.
export function firstLine(text) {
  const line = (text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  const clean = line.replace(/^#+\s*/, '').replace(/^[-*]\s+/, '');
  return clean.length > 80 ? `${clean.slice(0, 79)}…` : clean;
}

// Pure: accumulate a run's completed output blocks for the summary. Partials are
// deltas of the same block (already captured by its final), so only finals count
// — accumulating partials too would double the text.
export function accumulateOutput(prev, msg) {
  if (msg.type !== 'agent:output' || !msg.text || msg.partial) return prev || '';
  return (prev || '') + msg.text + '\n';
}

// Pure: the emote for a finished run. A cancelled run gets none (no celebration);
// an error shows ❗ with the error's first line (or a fallback); otherwise ✓ with
// the run's one-line summary.
export function finishEmote(status, accText, error) {
  if (status === 'cancelled') return null;
  if (status === 'error') return { kind: 'error', text: firstLine(error) || 'run failed' };
  return { kind: 'done', text: firstLine(accText) };
}

export function useEmotes() {
  const [emotes, setEmotes] = useState({}); // personId -> { kind: 'tool'|'done'|'error', text }
  const owner = useRef({});  // runId -> personId
  const acc = useRef({});    // runId -> accumulated final assistant text (for the summary)
  const timers = useRef({}); // personId -> auto-clear timeout
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    const t = timers.current;
    return () => { live.current = false; Object.values(t).forEach(clearTimeout); };
  }, []);

  const clearTimer = useCallback((pid) => {
    if (timers.current[pid]) { clearTimeout(timers.current[pid]); delete timers.current[pid]; }
  }, []);

  const setEmote = useCallback((pid, emote) => {
    setEmotes((e) => {
      if (!emote) { if (!e[pid]) return e; const n = { ...e }; delete n[pid]; return n; }
      return { ...e, [pid]: emote };
    });
  }, []);

  // Called when this browser spawns a run (mirrors conv.startRun): index the run
  // to its citizen and clear any lingering finish emote on that desk.
  const startRun = useCallback((pid, runId) => {
    owner.current[runId] = pid;
    acc.current[runId] = '';
    clearTimer(pid);
    setEmote(pid, null);
  }, [clearTimer, setEmote]);

  const onWsMessage = useCallback((msg) => {
    if (!msg || !msg.runId) return;
    const pid = owner.current[msg.runId];
    if (!pid) return; // a run this client didn't start
    switch (msg.type) {
      case 'agent:output':
        acc.current[msg.runId] = accumulateOutput(acc.current[msg.runId], msg);
        break;
      case 'agent:activity':
        if (msg.activity?.type === 'tool_use') {
          clearTimer(pid);
          setEmote(pid, { kind: 'tool', text: TOOL_LABELS[msg.activity.name] || msg.activity.name });
        }
        break;
      case 'agent:done': {
        const emote = finishEmote(msg.status, acc.current[msg.runId], msg.error);
        delete owner.current[msg.runId];
        delete acc.current[msg.runId];
        clearTimer(pid);
        setEmote(pid, emote); // null (cancelled) clears any tool emote
        if (emote) {
          timers.current[pid] = setTimeout(() => {
            delete timers.current[pid];
            if (live.current) setEmote(pid, null);
          }, DONE_TTL);
        }
        break;
      }
      default:
        break;
    }
  }, [clearTimer, setEmote]);

  return { emotes, startRun, onWsMessage };
}
