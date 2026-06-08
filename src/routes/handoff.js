import { Router } from 'express';
import {
  parseHandoff,
  summarizeForHandoff,
  summarizeWithHaiku,
  shouldUseHaikuSummary,
} from '../services/agent/handoff.js';

const router = Router();

// Parse a [HANDOFF:id] token out of agent text (the frontend does this inline
// too; exposed here for non-browser callers).
router.post('/parse', (req, res) => {
  res.json({ handoff: parseHandoff(req.body.text || '') });
});

// Returns the extractive summary immediately, upgraded to a haiku-generated one
// for substantial inputs (falls back to extractive on failure). Called directly
// rather than via the run queue — this endpoint is manual/one-at-a-time, not the
// completion burst the limiter guards against, and the haiku call self-times-out.
router.post('/summarize', async (req, res) => {
  const text = req.body.text || '';
  let summary = summarizeForHandoff(text);
  if (shouldUseHaikuSummary(text)) {
    const better = await summarizeWithHaiku(text);
    if (better) summary = better;
  }
  res.json({ summary });
});

export default router;
