import { Router } from 'express';
import { getBuilding, getConfig } from '../services/projects.js';
import { getRepoInfo, createBranch, commitAll, pushBranch, openPr } from '../services/github.js';

const router = Router();

// Resolve the repo path from a city+building (its configured absolutePath), falling
// back to the hub root — same rule as routes/git.js. No arbitrary ?path/body.path
// escape hatch: these ops branch/commit/push/PR, so an arbitrary path would let a
// caller mutate any git repo on disk.
function repoPath(req) {
  const src = { ...req.query, ...req.body };
  if (src.cityId && src.buildingId) return getBuilding(src.cityId, src.buildingId)?.absolutePath;
  return getConfig().rootPath;
}

// Mutating ops surface validation/git/gh failures as 400 with the message so the
// UI can show gh stdout/stderr. (Nothing here runs without an explicit POST.)
const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

router.get('/info', handle((req) => getRepoInfo(repoPath(req))));
router.post('/branch', handle((req) => createBranch(repoPath(req), req.body.branch)));
router.post('/commit', handle((req) => commitAll(repoPath(req), req.body.message)));
router.post('/push', handle((req) => pushBranch(repoPath(req))));
router.post('/pr', handle((req) => openPr(repoPath(req), req.body)));

export default router;
