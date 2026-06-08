import { Router } from 'express';
import { validatePath } from '../services/fs.js';

const router = Router();

// GET /api/fs/validate?path=  -> { exists, isDir, isGitRepo }. Read-only; used
// by the building path picker to check a workspace before it's saved/used.
router.get('/validate', async (req, res, next) => {
  try {
    res.json(await validatePath(req.query.path));
  } catch (e) {
    next(e); // generic 500 via the terminal handler (don't echo internals back)
  }
});

export default router;
