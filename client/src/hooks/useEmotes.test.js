import { describe, it, expect } from 'vitest';
import { firstLine, accumulateOutput, finishEmote } from './useEmotes.js';

// firstLine turns a run's streamed output into the one-line blurb shown in the
// finish emote bubble over a citizen's desk.
describe('firstLine', () => {
  it('takes the first non-empty line', () => {
    expect(firstLine('\n\n  Fixed the reconnect bug  \n\nmore detail')).toBe('Fixed the reconnect bug');
  });

  it('strips a leading markdown heading marker', () => {
    expect(firstLine('## Summary\nbody')).toBe('Summary');
  });

  it('strips a leading bullet marker', () => {
    expect(firstLine('- did the thing')).toBe('did the thing');
    expect(firstLine('* did the thing')).toBe('did the thing');
  });

  it('truncates long lines with an ellipsis', () => {
    const long = 'x'.repeat(120);
    const out = firstLine(long);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(80); // 79 chars + the ellipsis
  });

  it('returns empty string for empty/whitespace input', () => {
    expect(firstLine('')).toBe('');
    expect(firstLine('   \n  ')).toBe('');
    expect(firstLine(null)).toBe('');
    expect(firstLine(undefined)).toBe('');
  });
});

// accumulateOutput builds the run's text for the summary — final blocks only, so
// the streamed partials (deltas of the same block) don't get double-counted.
describe('accumulateOutput', () => {
  it('appends final output blocks', () => {
    let acc = '';
    acc = accumulateOutput(acc, { type: 'agent:output', text: 'first' });
    acc = accumulateOutput(acc, { type: 'agent:output', text: 'second' });
    expect(acc).toBe('first\nsecond\n');
  });

  it('ignores partial deltas (no double count)', () => {
    let acc = '';
    acc = accumulateOutput(acc, { type: 'agent:output', text: 'hel', partial: true });
    acc = accumulateOutput(acc, { type: 'agent:output', text: 'hello', partial: true });
    acc = accumulateOutput(acc, { type: 'agent:output', text: 'hello' }); // the final block
    expect(acc).toBe('hello\n');
  });

  it('ignores non-output frames and empty text', () => {
    expect(accumulateOutput('x\n', { type: 'agent:activity' })).toBe('x\n');
    expect(accumulateOutput('x\n', { type: 'agent:output', text: '' })).toBe('x\n');
    expect(accumulateOutput(undefined, { type: 'agent:done' })).toBe('');
  });
});

// finishEmote maps a finished run to its desk emote.
describe('finishEmote', () => {
  it('done → ✓ kind with the summary', () => {
    expect(finishEmote('done', '## Result\nbody')).toEqual({ kind: 'done', text: 'Result' });
  });

  it('error → ❗ kind with the error blurb, falling back when empty', () => {
    expect(finishEmote('error', '', 'boom happened')).toEqual({ kind: 'error', text: 'boom happened' });
    expect(finishEmote('error', '', '')).toEqual({ kind: 'error', text: 'run failed' });
  });

  it('cancelled → no emote (no celebration)', () => {
    expect(finishEmote('cancelled', 'some text')).toBe(null);
  });
});
