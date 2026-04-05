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

const STALE_THRESHOLD = 25_000; // 2.5× heartbeat interval

function createNetworkMonitor({ state, bus, EVENTS }) {
  function startNetworkMonitor() {
    state.networkOnline = hasLiveNetwork();

    // Network connectivity check
    setInterval(() => {
      const next = hasLiveNetwork();
      if (next === state.networkOnline) return;
      state.networkOnline = next;
      bus.emit(EVENTS.NETWORK_STATUS, { online: state.networkOnline });
    }, 2500);

    // Stale-peer detection: mark clients as offline if no heartbeat received
    setInterval(() => {
      const now = Date.now();
      for (const [id, peer] of state.peers) {
        if (!hasAdminAccess(peer.role) && peer.online) {
          const lastBeat = peer.lastHeartbeat || 0;
          if (lastBeat > 0 && (now - lastBeat) > STALE_THRESHOLD) {
            peer.online = false;
            bus.emit(EVENTS.PEER_STALE, { peerId: id });
          }
        }
      }
    }, 15_000);
  }

  return { startNetworkMonitor };
}

// hasAdminAccess re-implemented inline to avoid circular dep with main
function hasAdminAccess(role) {
  return role === 'admin' || role === 'super_admin';
}

module.exports = { createNetworkMonitor, hasLiveNetwork };

