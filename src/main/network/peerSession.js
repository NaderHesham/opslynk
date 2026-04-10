'use strict';

const HEARTBEAT_INTERVAL = 3_000;
const { getLiveMetrics } = require('../../system/systemInfo');
const ACTIVITY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACTIVITY_EVENTS_PER_PEER = 200;

function pruneActivityEvents(events, now = Date.now()) {
  if (!Array.isArray(events) || !events.length) return [];
  const cutoff = now - ACTIVITY_RETENTION_MS;
  return events
    .map(event => ({ type: event?.type, at: Number(event?.at || 0) }))
    .filter(event => event.at > 0 && event.at >= cutoff && ['online', 'offline', 'active', 'idle'].includes(event.type))
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_ACTIVITY_EVENTS_PER_PEER);
}

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
  buildSignedPeerIdentity,
  reliableTransport
}) {
  const heartbeatTimers = new Map();
  const reconnectTimers = new Map();

  function appendActivityEvent(peer, type, at) {
    if (!Array.isArray(peer.activityEvents)) peer.activityEvents = [];
    const safeAt = Number(at || Date.now());
    const last = peer.activityEvents[peer.activityEvents.length - 1];
    if (last && last.type === type && Math.abs(last.at - safeAt) < 1000) return;
    peer.activityEvents.push({ type, at: safeAt });
    peer.activityEvents = pruneActivityEvents(peer.activityEvents, safeAt);
  }

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
        activity: state.localActivity,
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
    peer.connectionState = 'connected';
    peer.restoredFromState = false;
    peer.lastDisconnectedAt = null;
    peer.activityState = peer.activityState === 'idle' ? 'idle' : 'active';
    peer.lastStateChangeAt = peer.lastStateChangeAt || Date.now();
    peer.lastInputAt = peer.lastInputAt || Date.now();
    peer.currentSessionStartedAt = peer.currentSessionStartedAt || Date.now();
    appendActivityEvent(peer, 'online', Date.now());
    stopReconnect(peer.id);
    reliableTransport?.notifyPeerAvailable(peer.id);
    bus.emit(EVENTS.DEVICE_JOINED, peerToSafe(peer));
    bus.emit(EVENTS.PEER_ACTIVITY, {
      peerId: peer.id,
      state: peer.activityState,
      at: Date.now(),
      source: 'session',
      transition: { type: 'online', at: Date.now() },
      lastInputAt: peer.lastInputAt || null,
      lastStateChangeAt: peer.lastStateChangeAt || null,
      currentSessionStartedAt: peer.currentSessionStartedAt || null,
      activityEvents: peer.activityEvents.slice(-24)
    });
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
    if (peer) {
      peer.online = false;
      peer.connectionState = state.networkOnline ? 'degraded' : 'offline';
      peer.screenshotRequestPending = false;
      peer.lastDisconnectedAt = Date.now();
      peer.activityState = 'offline';
      peer.lastStateChangeAt = Date.now();
      appendActivityEvent(peer, 'offline', Date.now());
      peer.currentSessionStartedAt = null;
    }
    broadcastToRenderer(EVENTS.PEER_STALE, { peerId: id });
    if (peer) {
      bus.emit(EVENTS.PEER_ACTIVITY, {
        peerId: peer.id,
        state: 'offline',
        at: Date.now(),
        source: 'session',
        transition: { type: 'offline', at: Date.now() },
        lastInputAt: peer.lastInputAt || null,
        lastStateChangeAt: peer.lastStateChangeAt || null,
        currentSessionStartedAt: null,
        activityEvents: Array.isArray(peer.activityEvents) ? peer.activityEvents.slice(-24) : []
      });
    }
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
