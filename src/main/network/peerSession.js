'use strict';

const HEARTBEAT_INTERVAL = 3_000;
const { getLiveMetrics } = require('../../system/systemInfo');

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
  flushPendingHelpRequests,
  buildSignedPeerIdentity
}) {
  const heartbeatTimers = new Map();
  const reconnectTimers = new Map();

  function stopReconnect(peerId) {
    const id = reconnectTimers.get(peerId);
    if (id != null) {
      clearInterval(id);
      reconnectTimers.delete(peerId);
    }
  }

  function triggerDiscovery() {
    try { udp.announceMyself(); } catch {}
  }

  function scheduleReconnect(peerId) {
    const peer = state.peers.get(peerId);
    if (!peer || reconnectTimers.has(peerId)) return;

    const attempt = () => {
      const current = state.peers.get(peerId);
      const readyState = current?.ws?.readyState;
      if (!current || current.online || readyState === 0 || readyState === 1) {
        stopReconnect(peerId);
        return;
      }
      triggerDiscovery();
      if (current.ip && current.port) wsNet.connectToPeer(current);
    };

    attempt();
    reconnectTimers.set(peerId, setInterval(attempt, 3000));
  }

  function startHeartbeat(peerId) {
    if (heartbeatTimers.has(peerId)) return;
    const id = setInterval(() => {
      wsNet.sendToPeer(peerId, {
        type: 'heartbeat',
        fromId: state.myProfile?.id,
        username: state.myProfile?.username,
        role: state.myProfile?.role,
        systemInfo: state.myProfile?.systemInfo,
        liveMetrics: getLiveMetrics(),
        timestamp: Date.now()
      });
    }, HEARTBEAT_INTERVAL);
    heartbeatTimers.set(peerId, id);
  }

  function stopHeartbeat(peerId) {
    const id = heartbeatTimers.get(peerId);
    if (id != null) {
      clearInterval(id);
      heartbeatTimers.delete(peerId);
    }
  }

  function emitPeerJoined(peer) {
    peer.online = true;
    peer.lastHeartbeat = Date.now();
    stopReconnect(peer.id);
    bus.emit(EVENTS.DEVICE_JOINED, peerToSafe(peer));
    updateTrayMenu();
    startHeartbeat(peer.id);
  }

  function emitPeerLeft(id) {
    const peer = state.peers.get(id);
    const wasAlreadyOffline = !peer || peer.online === false;
    const hadReconnectTimer = reconnectTimers.has(id);
    stopHeartbeat(id);
    scheduleReconnect(id);
    triggerDiscovery();
    if (wasAlreadyOffline && hadReconnectTimer) return;
    if (peer) peer.online = false;
    broadcastToRenderer('peer:offline', { peerId: id });
    bus.emit(EVENTS.DEVICE_LEFT, { id });
    updateTrayMenu();
  }

  function recoverPeers() {
    triggerDiscovery();
    for (const [, peer] of state.peers) {
      const readyState = peer.ws?.readyState;
      if (readyState === 0 || readyState === 1) continue;
      if (peer.ip && peer.port) wsNet.connectToPeer(peer);
    }
  }

  async function start() {
    wsNet.init({
      peers: state.peers,
      myProfile: () => state.myProfile,
      myPortRef: state.myPortRef,
      buildSignedPeerIdentity,
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
    triggerDiscovery();
  }

  return { start, recoverPeers };
}

module.exports = { createPeerSession };
