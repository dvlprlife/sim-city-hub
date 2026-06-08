// WebSocket broadcast helper. Every connected client gets every hub event
// (agent:*, todo:update, rate_limit:update). The frontend filters by runId.
const clients = new Set();

const OPEN = 1; // ws.readyState OPEN

export function registerClient(ws) {
  // isAlive drives the heartbeat below; a 'pong' reply marks the socket live.
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
}

export function broadcast(message) {
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState !== OPEN) continue;
    // send() failures surface via the callback (and rarely a sync throw); drop
    // the socket either way rather than buffering to a dead peer.
    try {
      ws.send(data, (err) => {
        if (err) clients.delete(ws);
      });
    } catch {
      clients.delete(ws);
    }
  }
}

// One heartbeat tick (exported for tests). The ws library does NOT notice a
// client that vanished without a TCP FIN (laptop sleep, killed Wi-Fi, dropped
// proxy): readyState stays OPEN forever, so broadcast() keeps serializing and
// buffering every hub event to a dead socket. So: terminate+drop any socket that
// didn't answer the previous ping, then ping the rest (the 'pong' handler in
// registerClient flips isAlive back to true before the next tick).
export function reapDeadClients() {
  for (const ws of clients) {
    if (ws.isAlive === false) {
      try {
        ws.terminate();
      } catch {
        /* already gone */
      }
      clients.delete(ws);
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      clients.delete(ws);
    }
  }
}

// Start the heartbeat interval; returns a stop() (clear on shutdown / in tests).
// unref() so the timer never keeps the process alive on its own.
export function startHeartbeat(intervalMs = 30000) {
  const timer = setInterval(reapDeadClients, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function clientCount() {
  return clients.size;
}
