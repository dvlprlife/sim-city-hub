// Minimal concurrency limiter. Caps how many CLI children run at once. Wired
// into the spawn path (services/agent.js → spawnAgent routes the fork through
// runQueued); runs beyond HUB_MAX_CONCURRENT wait here for a free slot.
const MAX_CONCURRENT = Number(process.env.HUB_MAX_CONCURRENT || 4);

let active = 0;
const waiting = [];

export function runQueued(task) {
  return new Promise((resolve, reject) => {
    waiting.push({ task, resolve, reject });
    pump();
  });
}

function pump() {
  if (active >= MAX_CONCURRENT) return;
  const next = waiting.shift();
  if (!next) return;
  active += 1;
  Promise.resolve()
    .then(next.task)
    .then(next.resolve, next.reject)
    .finally(() => {
      active -= 1;
      pump();
    });
}

export function queueStats() {
  return { active, waiting: waiting.length, max: MAX_CONCURRENT };
}
