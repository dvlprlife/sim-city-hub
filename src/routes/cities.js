import { Router } from 'express';
import { getCityTree, getRawCities, writeCity, createCity, deleteCity } from '../services/projects.js';

const router = Router();

// Full city/building/people tree from cities.json (people manifests inlined).
router.get('/', (req, res, next) => {
  try {
    res.json(getCityTree());
  } catch (e) {
    // Delegate to the terminal handler (generic 500) — e.message can embed the
    // absolute cities.json path (e.g. "cities.json not found at <path>").
    next(e);
  }
});

// Raw, unresolved catalogue for the config editor — paths are returned exactly
// as stored ('.', 'REPLACE_WITH/...') so the editor never round-trips a
// machine-absolute path back into cities.json. Declared before /:id.
router.get('/config', (req, res, next) => {
  try {
    res.json({ cities: getRawCities() });
  } catch (e) {
    next(e); // generic 500 via the terminal handler (e.message can leak a path)
  }
});

// Create a city — { id, name, description? }. 400 on duplicate/invalid id or
// missing name.
router.post('/', (req, res) => {
  try {
    res.status(201).json(createCity(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH a city's editable fields — { name?, description?, people?, buildings? }.
// Validation failures (unknown roster id, bad building) → 400; unknown city → 404.
router.patch('/:id', (req, res) => {
  try {
    res.json(writeCity(req.params.id, req.body || {}));
  } catch (e) {
    const status = /^Unknown city/.test(e.message) ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

// DELETE a city. Unknown id → 404.
router.delete('/:id', (req, res) => {
  try {
    res.json(deleteCity(req.params.id));
  } catch (e) {
    const status = /^Unknown city/.test(e.message) ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

export default router;
