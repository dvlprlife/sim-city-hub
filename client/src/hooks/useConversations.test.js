import { describe, it, expect } from 'vitest';
import { finalizeStuckConvo } from './useConversations.js';

// finalizeStuckConvo recovers a conversation left 'running' when its run actually
// finished during a WS disconnect (the final frames were never replayed).
const base = () => ({
  messages: [{ id: 'm1', role: 'user', text: 'hi' }],
  liveText: '',
  status: 'running',
  sessionId: 's1',
  activeRunId: 'r1',
  lastRunId: 'r1',
});

describe('finalizeStuckConvo', () => {
  it('commits a dangling partial as the final assistant message and unsticks the thread', () => {
    const out = finalizeStuckConvo({ ...base(), liveText: 'partial answer' }, { status: 'done' });
    expect(out.status).toBe('idle');
    expect(out.activeRunId).toBe(null);
    expect(out.liveText).toBe('');
    const last = out.messages[out.messages.length - 1];
    expect(last.role).toBe('assistant');
    expect(last.text).toBe('partial answer');
  });

  it('appends an error note when the run errored', () => {
    const out = finalizeStuckConvo({ ...base() }, { status: 'error', error: 'boom' });
    expect(out.status).toBe('idle');
    const last = out.messages[out.messages.length - 1];
    expect(last.role).toBe('note');
    expect(last.text).toMatch(/error: boom/);
  });

  it('just finalizes when there is no partial and no error (no spurious message)', () => {
    const out = finalizeStuckConvo(base(), { status: 'done' });
    expect(out.messages).toHaveLength(1); // unchanged
    expect(out.status).toBe('idle');
    expect(out.activeRunId).toBe(null);
  });
});
