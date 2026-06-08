import { Router } from 'express';
import { getStatus, getDiff } from '../services/git.js';
import { getBuilding, getConfig } from '../services/projects.js';

const router = Router();

// Resolve the repo path from a city+building (its configured absolutePath), or the
// hub root. No arbitrary ?path escape hatch — that would expose `git status`/`diff`
// of any repo on disk to any caller.
function resolvePath(req) {
  const { cityId, buildingId } = req.query;
  if (cityId && buildingId) return getBuilding(cityId, buildingId)?.absolutePath;
  return getConfig().rootPath;
}

router.get('/status', async (req, res, next) => {
  try {
    res.json(await getStatus(resolvePath(req)));
  } catch (e) {
    next(e); // generic 500 via the terminal handler — git errors embed the repo path
  }
});

router.get('/diff', async (req, res, next) => {
  try {
    res.json(await getDiff(resolvePath(req), req.query.file));
  } catch (e) {
    next(e); // generic 500 via the terminal handler — git errors embed the repo path
  }
});

export default router;
