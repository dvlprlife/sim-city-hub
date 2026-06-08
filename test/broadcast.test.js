// Tests for the WebSocket broadcast helper's heartbeat + dead-socket cleanup.
// Uses lightweight fake sockets (no real ws). Run with `npm test` (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerClient, broadcast, reapDeadClients, clientCount } from '../src/broadcast.js';

function fakeWs() {
  const ws = {
    readyState: 1, // OPEN
    listeners: {},
    pinged: 0,
    terminated: false,
    on(ev, cb) {
      this.listeners[ev] = cb;
    },
    ping() {
      this.pinged++;
    },
    terminate() {
      this.terminated = true;
    },
    send(_data, cb) {
      if (cb) cb(null);
    },
  };
  return ws;
}

test('heartbeat pings live sockets and reaps ones that miss a pong', () => {
  const live = fakeWs();
  const dead = fakeWs();
  registerClient(live);
  registerClient(dead);
  try {
    // First tick: both were isAlive=true, so both get pinged and flipped to false.
    reapDeadClients();
    assert.equal(live.pinged, 1);
    assert.equal(dead.pinged, 1);

    // `live` answers its ping; `dead` stays silent.
    live.listeners.pong();

    // Second tick: live answered (kept + pinged again); dead didn't (terminated + dropped).
    reapDeadClients();
    assert.equal(dead.terminated, true, 'unresponsive socket is terminated');
    assert.equal(live.terminated, false, 'responsive socket is kept');
    assert.equal(live.pinged, 2);
  } finally {
    live.listeners.close(); // drop live from the shared clients set
  }
});

test('broadcast drops a socket whose send fails', () => {
  const ok = fakeWs();
  const bad = fakeWs();
  bad.send = (_data, cb) => cb(new Error('send failed'));
  registerClient(ok);
  registerClient(bad);
  try {
    assert.equal(clientCount(), 2);
    broadcast({ type: 'test' });
    assert.equal(clientCount(), 1, 'the failing socket is removed');
  } finally {
    ok.listeners.close();
  }
});
