import { describe, it, expect } from 'vitest';
import { MODEL_GROUPS, MODEL_KEYS, modelLabel, modelBadge, EFFORT_KEYS, effortOptions, effortLabel } from './models.js';

describe('model catalogue', () => {
  it('MODEL_KEYS is auto + every group option, with no duplicates', () => {
    const fromGroups = MODEL_GROUPS.flatMap((g) => g.options);
    expect(MODEL_KEYS).toEqual(['auto', ...fromGroups]);
    expect(new Set(MODEL_KEYS).size).toBe(MODEL_KEYS.length);
  });

  it('every group leads with its family alias (the "latest" option)', () => {
    for (const g of MODEL_GROUPS) {
      expect(g.options[0]).toBe(g.family);
      expect(g.options.slice(1).every((k) => k.startsWith(`${g.family}-`))).toBe(true);
    }
  });
});

describe('modelLabel', () => {
  it('labels auto, family aliases, and pinned versions', () => {
    expect(modelLabel('auto')).toBe('Auto');
    expect(modelLabel('opus')).toBe('Opus (latest)');
    expect(modelLabel('opus-4-7')).toBe('Opus 4.7');
    expect(modelLabel('sonnet-4-6')).toBe('Sonnet 4.6');
    expect(modelLabel('haiku-4-5')).toBe('Haiku 4.5');
  });

  it('falls back to the raw key for an unknown value', () => {
    expect(modelLabel('gpt-9')).toBe('gpt-9');
    expect(modelLabel('')).toBe('');
  });
});

describe('modelBadge', () => {
  it('is the compact label (no "(latest)" suffix)', () => {
    expect(modelBadge('auto')).toBe('Auto');
    expect(modelBadge('opus')).toBe('Opus');
    expect(modelBadge('opus-4-8')).toBe('Opus 4.8');
    expect(modelBadge('sonnet')).toBe('Sonnet');
  });

  it('every catalogue key renders a non-empty badge & label', () => {
    for (const k of MODEL_KEYS) {
      expect(modelBadge(k)).toBeTruthy();
      expect(modelLabel(k)).toBeTruthy();
    }
  });
});

describe('effort options', () => {
  it('always leads with auto and adds the model-supported levels', () => {
    expect(effortOptions('opus-4-8')).toEqual(['auto', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect(effortOptions('sonnet-4-6')).toEqual(['auto', 'low', 'medium', 'high']);
    expect(effortOptions('haiku-4-5')).toEqual(['auto']); // unsupported -> just auto
    expect(effortOptions('opus-4-1')).toEqual(['auto']);
    expect(effortOptions('auto')).toEqual(['auto', 'low', 'medium', 'high', 'xhigh', 'max']); // model unknown -> superset
  });

  it('every offered effort key is a known EFFORT_KEY, and labels are non-empty', () => {
    for (const k of [...MODEL_KEYS, 'opus-4-8']) {
      for (const e of effortOptions(k)) {
        expect(EFFORT_KEYS).toContain(e);
        expect(effortLabel(e)).toBeTruthy();
      }
    }
  });
});
