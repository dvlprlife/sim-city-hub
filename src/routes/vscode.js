import { Router } from 'express';
import { openWorkspace } from '../services/vscode.js';
import { getBuilding } from '../services/projects.js';

const router = Router();

router.post('/open-workspace', (req, res) => {
  // Resolve strictly from the configured building — never an arbitrary client path
  // (that would let a caller open / shell-out against any folder on disk).
  const { cityId, buildingId } = req.body;
  const folder = cityId && buildingId ? getBuilding(cityId, buildingId)?.absolutePath : null;
  res.json(openWorkspace(folder));
});

export default router;
