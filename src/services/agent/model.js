// Model registry and selection. Keys are the user-facing choices; ids are the
// API model identifiers passed to the CLI via --model.
//
// Two kinds of key:
//   - a bare family key (`opus` / `sonnet` / `haiku`) tracks that family's
//     LATEST version — pick this to ride upgrades automatically.
//   - a pinned version key (`opus-4-7`, `sonnet-4-5`, …) locks a specific
//     version for reproducibility.
// Only currently-available (non-retired) Anthropic models are listed. When a new
// version ships, add it here and to the frontend catalogue in
// `client/src/lib/models.js` (kept in sync by hand — the two live in separate
// packages). `auto` is a sentinel resolved per-prompt by pickAutoModel.
export const MODEL_IDS = {
  // family aliases → latest of each family
  opus: 'claude-opus-4-8',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
  // pinned Opus versions
  'opus-4-8': 'claude-opus-4-8',
  'opus-4-7': 'claude-opus-4-7',
  'opus-4-6': 'claude-opus-4-6',
  'opus-4-5': 'claude-opus-4-5',
  'opus-4-1': 'claude-opus-4-1',
  // pinned Sonnet versions
  'sonnet-4-6': 'claude-sonnet-4-6',
  'sonnet-4-5': 'claude-sonnet-4-5',
  // pinned Haiku versions
  'haiku-4-5': 'claude-haiku-4-5',
};

export const DEFAULT_MODEL_KEY = 'sonnet';

// Effort levels each model accepts via the CLI's --effort flag. An empty list
// means the model doesn't support the effort param at all (passing it errors).
// Per Anthropic's effort docs: low/medium/high on Opus 4.5+ and Sonnet 4.6;
// `max` is Opus-tier only; `xhigh` was added in Opus 4.7. Older models (Opus 4.1,
// Sonnet 4.5, the Haiku tier) don't support effort. Keyed by model key (alias or
// pinned version); mirror any change in client/src/lib/models.js.
const OPUS_LATEST = ['low', 'medium', 'high', 'xhigh', 'max'];
const EFFORT_BY_MODEL = {
  opus: OPUS_LATEST,
  'opus-4-8': OPUS_LATEST,
  'opus-4-7': OPUS_LATEST,
  'opus-4-6': ['low', 'medium', 'high', 'max'],
  'opus-4-5': ['low', 'medium', 'high', 'max'],
  'opus-4-1': [],
  sonnet: ['low', 'medium', 'high'],
  'sonnet-4-6': ['low', 'medium', 'high'],
  'sonnet-4-5': [],
  haiku: [],
  'haiku-4-5': [],
};

// The effort levels valid for a given model key (empty if unsupported).
export function effortLevelsFor(modelKey) {
  return EFFORT_BY_MODEL[modelKey] || [];
}

// The --effort value to pass for a (modelKey, effort) pair, or null to omit it:
// 'auto'/empty means "let the CLI default decide", and an unsupported level for
// that model is dropped rather than passed (which would error at spawn).
export function resolveEffort(modelKey, effort) {
  if (!effort || effort === 'auto') return null;
  return effortLevelsFor(modelKey).includes(effort) ? effort : null;
}

// The pricing/display family for any model key (alias or pinned version), or
// null for unknown input. Used for the soft cost estimate and UI labels.
export function modelFamily(key) {
  if (typeof key !== 'string') return null;
  if (key.startsWith('opus')) return 'opus';
  if (key.startsWith('sonnet')) return 'sonnet';
  if (key.startsWith('haiku')) return 'haiku';
  return null;
}

// Normalize a requested key to a known key. 'auto' is preserved (resolved later
// by pickAutoModel against the prompt). Anything unknown falls back to default.
export function resolveModelKey(key) {
  if (key === 'auto') return 'auto';
  if (key && Object.prototype.hasOwnProperty.call(MODEL_IDS, key)) return key;
  return DEFAULT_MODEL_KEY;
}

// Cheap heuristic for 'auto': lean on opus for design/security/large prompts,
// haiku for trivial/format-y work, sonnet for everything in between. Returns a
// family alias (latest of that family).
export function pickAutoModel(prompt = '') {
  const text = String(prompt);
  const lower = text.toLowerCase();
  if (/\b(architect|design|refactor|security|audit|complex|strategy|plan)\b/.test(lower) || text.length > 1500) {
    return 'opus';
  }
  if (/\b(translate|format|rename|typo|lint|summari[sz]e)\b/.test(lower) || text.trim().length < 30) {
    return 'haiku';
  }
  return 'sonnet';
}
