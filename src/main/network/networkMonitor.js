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

function createNetworkMonitor({ state, bus, EVENTS }) {
  function startNetworkMonitor() {
    state.networkOnline = hasLiveNetwork();
    setInterval(() => {
      const next = hasLiveNetwork();
      if (next === state.networkOnline) return;
      state.networkOnline = next;
      bus.emit(EVENTS.NETWORK_STATUS, { online: state.networkOnline });
    }, 2500);
  }

  return { startNetworkMonitor };
}

module.exports = { createNetworkMonitor, hasLiveNetwork };

