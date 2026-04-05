'use strict';

const HEARTBEAT_INTERVAL = 10_000;

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
  const heartbeatTimers = new Map(); // peerId → intervalId

  function startHeartbeat(peerId) {
    if (heartbeatTimers.has(peerId)) return;
    const id = setInterval(() => {
      wsNet.sendToPeer(peerId, {
        type:       'heartbeat',
        fromId:     state.myProfile?.id,
        username:   state.myProfile?.username,
        role:       state.myProfile?.role,
        systemInfo: state.myProfile?.systemInfo,
        timestamp:  Date.now()
      });
    }, HEARTBEAT_INTERVAL);
    heartbeatTimers.set(peerId, id);
  }

  function stopHeartbeat(peerId) {
    const id = heartbeatTimers.get(peerId);
    if (id != null) { clearInterval(id); heartbeatTimers.delete(peerId); }
  }

  function emitPeerJoined(peer) {
    bus.emit(EVENTS.DEVICE_JOINED, peerToSafe(peer));
    updateTrayMenu();
    // Start heartbeat only when this node is a client talking to an admin
    if (hasAdminAccess(peer.role)) {
      startHeartbeat(peer.id);
    }
  }

  function emitPeerLeft(id) {
    stopHeartbeat(id);
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
