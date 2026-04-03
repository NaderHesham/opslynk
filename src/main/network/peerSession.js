'use strict';

function createPeerSession({
  state,
  wsNet,
  udp,
  bus,
  EVENTS,
  peerToSafe,
  updateTrayMenu,
  hasAdminAccess,
  helpSvc,
  broadcastToRenderer,
  handleP2PMessage,
  flushPendingHelpRequests
}) {
  function emitPeerJoined(peer) {
    bus.emit(EVENTS.DEVICE_JOINED, peerToSafe(peer));
    updateTrayMenu();
  }

  function emitPeerLeft(id) {
    bus.emit(EVENTS.DEVICE_LEFT, { id });
    updateTrayMenu();
  }

  async function start() {
    wsNet.init({
      peers: state.peers,
      myProfile: () => state.myProfile,
      myPortRef: state.myPortRef,
      onMessage: handleP2PMessage,
      onPeerOnline: emitPeerJoined,
      onPeerOffline: emitPeerLeft,
      getPendingMsgs: helpSvc.getPendingMessages,
      clearPendingMsgs: helpSvc.clearPendingMessages,
      hasAdminAccess,
      flushHelpRequests: flushPendingHelpRequests
    });

    udp.init({
      peers: state.peers,
      myProfile: () => state.myProfile,
      myPortRef: state.myPortRef,
      connectToPeer: wsNet.connectToPeer,
      onPeerOnline: emitPeerJoined,
      onPeerOffline: emitPeerLeft,
      broadcastToRenderer
    });

    await wsNet.startWsServer(wsNet.CHAT_PORT_BASE);
    udp.startUdpDiscovery();
  }

  return { start };
}

module.exports = { createPeerSession };
