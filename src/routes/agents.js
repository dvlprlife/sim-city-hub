import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { spawnAgent, cancelAgent, retryRun } from '../services/agent.js';
import { getActiveRuns, getHistory, getRun, getRunEvents, getUsage, getTreasury, clearHistory } from '../services/agent/history.js';

const router = Router();

// Client-supplied ids that reach a temp-file path (runId) or a CLI arg (sessionId)
// must be plain tokens — no path separators, dots, or shell metacharacters.
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

router.post('/spawn', (req, res) => {
  try {
    const { personId, cityId, buildingId, prompt, model, effort, sessionId, parentRunId } = req.body;
    if (!personId) return res.status(400).json({ error: 'personId required' });
    for (const [k, v] of Object.entries({ runId: req.body.runId, sessionId, parentRunId })) {
      if (v != null && !SAFE_ID.test(String(v))) return res.status(400).json({ error: `invalid ${k}` });
    }
    const runId = req.body.runId || randomUUID();
    const result = spawnAgent({ runId, personId, cityId, buildingId, prompt, model, effort, sessionId, parentRunId });
    res.status(202).json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Static sub-paths declared before /:runId so they aren't captured by it.
router.get('/active', (req, res) => res.json(getActiveRuns()));
router.get('/usage', (req, res) => {
  try {
    res.json(getUsage(req.query));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// Gamified treasury stats derived from run history (gold/tools + citizen leaderboard).
router.get('/treasury', (req, res, next) => {
  try {
    res.json(getTreasury());
  } catch (e) {
    next(e);
  }
});
router.get('/history', (req, res) => {
  try {
    res.json(getHistory(req.query));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// Clear finished runs (and their events). In-flight runs are never deleted.
router.delete('/history', (req, res, next) => {
  try {
    res.json(clearHistory());
  } catch (e) {
    next(e); // generic 500 via the terminal handler (don't echo DB internals back)
  }
});

router.get('/:runId', (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) return res.status(404).json({ error: 'not found' });
  res.json(run);
});

router.get('/:runId/events', (req, res) => res.json(getRunEvents(req.params.runId)));
router.post('/:runId/cancel', (req, res) => res.json(cancelAgent(req.params.runId)));
router.post('/:runId/retry', (req, res) => {
  try {
    res.status(202).json(retryRun(req.params.runId));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
