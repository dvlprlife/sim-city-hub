// Frontend model catalogue for the citizen "Default model" picker. Mirrors the
// backend registry in `src/services/agent/model.js` — keep the two in sync by
// hand when Anthropic ships or retires a version (they live in separate
// packages, so there's no shared import). Only currently-available models.
//
// A family alias (opus/sonnet/haiku) tracks that family's latest version; a
// pinned key (opus-4-7, …) locks a specific one. `auto` picks per task.
export const MODEL_GROUPS = [
  { family: 'opus', label: 'Opus', options: ['opus', 'opus-4-8', 'opus-4-7', 'opus-4-6', 'opus-4-5', 'opus-4-1'] },
  { family: 'sonnet', label: 'Sonnet', options: ['sonnet', 'sonnet-4-6', 'sonnet-4-5'] },
  { family: 'haiku', label: 'Haiku', options: ['haiku', 'haiku-4-5'] },
];

// Every valid stored key, including the 'auto' sentinel — used to validate a
// loaded manifest value before binding it to the <select>.
export const MODEL_KEYS = ['auto', ...MODEL_GROUPS.flatMap((g) => g.options)];

// Human label for a key: 'auto' → "Auto", a family alias → "Opus (latest)",
// a pinned version → "Opus 4.7". Falls back to the raw key if unrecognized.
export function modelLabel(key) {
  if (key === 'auto') return 'Auto';
  const m = /^(opus|sonnet|haiku)(?:-(\d+)-(\d+))?$/.exec(key || '');
  if (!m) return key;
  const family = m[1][0].toUpperCase() + m[1].slice(1);
  return m[2] ? `${family} ${m[2]}.${m[3]}` : `${family} (latest)`;
}

// Compact label for the iso badge under a citizen — version without the
// "(latest)" suffix (CSS upper-cases it). 'auto' → "Auto", opus → "Opus".
export function modelBadge(key) {
  if (key === 'auto') return 'Auto';
  const m = /^(opus|sonnet|haiku)(?:-(\d+)-(\d+))?$/.exec(key || '');
  if (!m) return key;
  const family = m[1][0].toUpperCase() + m[1].slice(1);
  return m[2] ? `${family} ${m[2]}.${m[3]}` : family;
}

// Effort levels each model accepts — mirror of EFFORT_BY_MODEL in
// src/services/agent/model.js (keep the two in sync). low/medium/high on Opus 4.5+
// and Sonnet 4.6; `max` Opus-only; `xhigh` Opus 4.7+; unsupported elsewhere.
const OPUS_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const EFFORT_BY_MODEL = {
  opus: OPUS_EFFORTS, 'opus-4-8': OPUS_EFFORTS, 'opus-4-7': OPUS_EFFORTS,
  'opus-4-6': ['low', 'medium', 'high', 'max'], 'opus-4-5': ['low', 'medium', 'high', 'max'], 'opus-4-1': [],
  sonnet: ['low', 'medium', 'high'], 'sonnet-4-6': ['low', 'medium', 'high'], 'sonnet-4-5': [],
  haiku: [], 'haiku-4-5': [],
};

// Every valid stored effort key (for validating a loaded manifest value).
export const EFFORT_KEYS = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'];

// The effort <select> options for a model: always 'auto', plus the levels that
// model supports. A model with no effort support shows only 'auto'. For the 'auto'
// model the resolved model isn't known until spawn, so offer the full superset —
// the backend's resolveEffort drops it if the per-prompt model can't take it.
export function effortOptions(modelKey) {
  if (modelKey === 'auto') return ['auto', ...OPUS_EFFORTS];
  return ['auto', ...(EFFORT_BY_MODEL[modelKey] || [])];
}

export function effortLabel(key) {
  return key === 'auto' ? 'Auto (model default)' : key.charAt(0).toUpperCase() + key.slice(1);
}
