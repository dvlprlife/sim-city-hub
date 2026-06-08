import { Router } from 'express';
import { getPersonDoc, writePerson, createPerson, deletePerson } from '../services/projects.js';

const router = Router();

// POST /api/people -> create a new citizen { id, manifest, prompt? }. Duplicate
// id or invalid manifest -> 400.
router.post('/', (req, res) => {
  try {
    const { id, manifest, prompt } = req.body || {};
    res.status(201).json(createPerson({ id, manifest, prompt }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/people/:id -> { id, manifest, prompt } for the in-app citizen editor.
router.get('/:id', (req, res) => {
  const doc = getPersonDoc(req.params.id);
  if (!doc) return res.status(404).json({ error: 'not found' });
  res.json(doc);
});

// DELETE /api/people/:id -> remove the citizen + scrub from all rosters. Unknown
// id -> 404.
router.delete('/:id', (req, res) => {
  try {
    res.json(deletePerson(req.params.id));
  } catch (e) {
    const status = /^Unknown person/.test(e.message) ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

// PATCH /api/people/:id -> write manifest fields and/or prompt.md. Validation
// failures (bad model key, missing name, non-array mcps) come back as 400; an
// unknown person id as 404 (writePerson throws 'Unknown person').
router.patch('/:id', (req, res) => {
  try {
    const { manifest, prompt } = req.body || {};
    const doc = writePerson(req.params.id, { manifest, prompt });
    res.json(doc);
  } catch (e) {
    const status = /^Unknown person/.test(e.message) ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

export default router;
