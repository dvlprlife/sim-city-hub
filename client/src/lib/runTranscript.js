import { TOOL_LABELS } from './toolLabels.js';

// Replay a persisted run into ordered render items. Pure (no DOM) so it's
// unit-testable; RunTranscript turns the items into MessageBubbles / a thinking
// block. Input: the run's event log (GET /api/agents/:runId/events, shaped
// { seq, kind, payload }) plus the run row (for its prompt). Mirrors the live
// applyEvent in useConversations, minus the streaming state.
export function eventsToItems(events = [], run = null) {
  const items = [];
  if (run?.prompt) items.push({ kind: 'user', id: 'prompt', text: run.prompt });

  for (const ev of events) {
    const p = ev?.payload || {};
    if (ev.kind === 'agent:thinking' && p.text) {
      items.push({ kind: 'thinking', id: `t-${ev.seq}`, text: p.text });
    } else if (ev.kind === 'agent:output' && p.text) {
      items.push({ kind: 'assistant', id: `o-${ev.seq}`, text: p.text });
    } else if (ev.kind === 'agent:activity' && p.activity?.type === 'tool_use') {
      const label = TOOL_LABELS[p.activity.name] || p.activity.name;
      items.push({ kind: 'note', id: `a-${ev.seq}`, text: `🔧 ${label}…` });
    } else if (ev.kind === 'agent:done' && p.status === 'error') {
      items.push({ kind: 'note', id: `d-${ev.seq}`, text: `⚠ run ended with an error${p.error ? `: ${p.error}` : ''}` });
    }
    // agent:model / agent:session / non-error agent:done are bookkeeping — skipped.
  }
  return items;
}
