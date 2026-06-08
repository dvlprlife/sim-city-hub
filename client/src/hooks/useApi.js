// Thin fetch wrappers around the hub REST API. Paths are relative so they work
// behind the Vite dev proxy and when static-served in production.
async function json(res) {
  if (res.ok) return res.status === 204 ? null : res.json();
  let detail = res.statusText;
  try {
    detail = (await res.json()).error || detail;
  } catch {
    /* non-JSON error body */
  }
  throw new Error(detail);
}

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then(json);

const patch = (url, body) =>
  fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then(json);

const del = (url) => fetch(url, { method: 'DELETE' }).then(json);

export const api = {
  getCities: () => fetch('/api/cities').then(json),
  citiesConfig: () => fetch('/api/cities/config').then(json),
  saveCity: (id, body) => patch(`/api/cities/${encodeURIComponent(id)}`, body),
  createCity: (body) => post('/api/cities', body),
  deleteCity: (id) => del(`/api/cities/${encodeURIComponent(id)}`),
  getPerson: (id) => fetch(`/api/people/${encodeURIComponent(id)}`).then(json),
  savePerson: (id, body) => patch(`/api/people/${encodeURIComponent(id)}`, body),
  createPerson: (body) => post('/api/people', body),
  deletePerson: (id) => del(`/api/people/${encodeURIComponent(id)}`),
  spawn: (body) => post('/api/agents/spawn', body),
  cancel: (runId) => post(`/api/agents/${runId}/cancel`),
  retry: (runId) => post(`/api/agents/${runId}/retry`),
  history: (params = {}) => {
    const f = typeof params === 'number' ? { limit: params } : params;
    const qs = new URLSearchParams();
    qs.set('limit', f.limit ?? 50);
    for (const k of ['q', 'personId', 'cityId', 'status', 'offset']) {
      if (f[k]) qs.set(k, f[k]);
    }
    return fetch(`/api/agents/history?${qs.toString()}`).then(json);
  },
  runEvents: (runId) => fetch(`/api/agents/${runId}/events`).then(json),
  run: (runId) => fetch(`/api/agents/${runId}`).then(json),
  todos: (runId) => fetch(`/api/tasks/todos?runId=${encodeURIComponent(runId)}`).then(json),
  clearHistory: () => del('/api/agents/history'),
  activeRuns: () => fetch('/api/agents/active').then(json),
  openWorkspace: (body) => post('/api/vscode/open-workspace', body),
  gitStatus: ({ cityId, buildingId }) =>
    fetch(`/api/git/status?cityId=${encodeURIComponent(cityId)}&buildingId=${encodeURIComponent(buildingId)}`).then(json),
  gitDiff: ({ cityId, buildingId, file }) =>
    fetch(`/api/git/diff?cityId=${encodeURIComponent(cityId)}&buildingId=${encodeURIComponent(buildingId)}&file=${encodeURIComponent(file)}`).then(json),
  githubInfo: ({ cityId, buildingId }) =>
    fetch(`/api/github/info?cityId=${encodeURIComponent(cityId)}&buildingId=${encodeURIComponent(buildingId)}`).then(json),
  githubBranch: (body) => post('/api/github/branch', body),
  githubCommit: (body) => post('/api/github/commit', body),
  githubPush: (body) => post('/api/github/push', body),
  githubPr: (body) => post('/api/github/pr', body),
  validatePath: (path) => fetch(`/api/fs/validate?path=${encodeURIComponent(path)}`).then(json),
  usage: (params = {}) => {
    const qs = new URLSearchParams();
    for (const k of ['cityId', 'personId', 'since']) {
      if (params[k]) qs.set(k, params[k]);
    }
    const query = qs.toString();
    return fetch(`/api/agents/usage${query ? `?${query}` : ''}`).then(json);
  },
  // Backlog tasks (the "City Hall" work-order board).
  tasks: (params = {}) => {
    const qs = new URLSearchParams();
    for (const k of ['cityId', 'buildingId', 'status']) {
      if (params[k]) qs.set(k, params[k]);
    }
    const query = qs.toString();
    return fetch(`/api/tasks${query ? `?${query}` : ''}`).then(json);
  },
  createTask: (body) => post('/api/tasks', body),
  updateTask: (id, body) => patch(`/api/tasks/${encodeURIComponent(id)}`, body),
  deleteTask: (id) => del(`/api/tasks/${encodeURIComponent(id)}`),
  // Gamified treasury stats (gold/tools + citizen leaderboard), derived from runs.
  treasury: () => fetch('/api/agents/treasury').then(json),
};
