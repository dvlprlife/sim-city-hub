import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

router.get('/', (req, res) => {
  const row = db.prepare('SELECT payload, updated_at FROM rate_limits WHERE id = 1').get();
  res.json({
    payload: row?.payload ? JSON.parse(row.payload) : null,
    updatedAt: row?.updated_at ?? null,
  });
});

export default router;
