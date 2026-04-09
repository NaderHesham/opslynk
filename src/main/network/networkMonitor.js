'use strict';

const os = require('os');

function hasLiveNetwork() {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface || []) {
      if (
        !addr.internal &&
        (addr.family === 'IPv4' || addr.family === 4 || addr.family === 'IPv6' || addr.family === 6)
      ) {
        return true;
      }
    }
  }
  return false;
}

const STALE_THRESHOLD = 10_000;
const OFFLINE_AFTER_DEGRADED_MS = 15_000;

function createNetworkMonitor({ state, bus, EVENTS, broadcastToRenderer, onNetworkRestored }) {
  function startNetworkMonitor() {
    state.networkOnline = hasLiveNetwork();

    // Network connectivity check
    setInterval(() => {
      const next = hasLiveNetwork();
      if (next === state.networkOnline) return;
      state.networkOnline = next;
      if (!state.networkOnline) {
        for (const [id, peer] of state.peers) {
          if (!peer.online) continue;
          peer.online = false;
          peer.connectionState = 'offline';
          peer.lastDisconnectedAt = Date.now();
          peer.ws = null;
          bus.emit(EVENTS.DEVICE_LEFT, { id });
        }
      }
      if (state.networkOnline) {
        try { onNetworkRestored?.(); } catch {}
      }
      bus.emit(EVENTS.NETWORK_STATUS, { online: state.networkOnline });
    }, 2500);

    // Stale-peer detection: fire even when WS appears OPEN (TCP won't detect network drop)
    setInterval(() => {
      const now = Date.now();
      for (const [id, peer] of state.peers) {
        if (!peer.online && peer.connectionState !== 'degraded') continue;
        const lastBeat = peer.lastHeartbeat || 0;
        if (peer.online && lastBeat > 0 && (now - lastBeat) > STALE_THRESHOLD) {
          peer.online = false;
          peer.connectionState = 'degraded';
          peer.lastDisconnectedAt = now;
          if (peer.ws) { try { peer.ws.terminate?.() ?? peer.ws.close(); } catch {} }
          peer.ws = null;
          broadcastToRenderer?.(EVENTS.PEER_STALE, { peerId: id });
          bus.emit(EVENTS.DEVICE_LEFT, { id });
          continue;
        }

        if (
          peer.connectionState === 'degraded' &&
          peer.lastDisconnectedAt &&
          (now - peer.lastDisconnectedAt) > OFFLINE_AFTER_DEGRADED_MS
        ) {
          peer.connectionState = 'offline';
          bus.emit(EVENTS.DEVICE_UPDATED, { id, online: false, connectionState: 'offline' });
        }
      }
    }, 1_000);
  }

  return { startNetworkMonitor };
}

module.exports = { createNetworkMonitor, hasLiveNetwork };
