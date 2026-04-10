'use strict';

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

function createPersistence({ storage, state }) {
  function serializePeer(peer) {
    if (!peer || !peer.id) return null;
    const activityEvents = pruneActivityEvents(peer.activityEvents);
    return {
      id: peer.id,
      username: peer.username,
      role: peer.role,
      deviceId: peer.deviceId,
      identityFingerprint: peer.identityFingerprint,
      color: peer.color,
      title: peer.title,
      avatar: peer.avatar || null,
      systemInfo: peer.systemInfo || null,
      online: false,
      connectionState: 'offline',
      restoredFromState: true,
      identityVerified: !!peer.identityVerified,
      identityRejected: !!peer.identityRejected,
      lastDisconnectedAt: Number(peer.lastDisconnectedAt || 0) || null,
      lastSeen: Number(peer.lastSeen || 0) || null,
      lastHeartbeat: Number(peer.lastHeartbeat || 0) || null,
      liveMetrics: peer.liveMetrics || null,
      activityState: peer.activityState || 'offline',
      lastInputAt: Number(peer.lastInputAt || 0) || null,
      lastStateChangeAt: Number(peer.lastStateChangeAt || 0) || null,
      currentSessionStartedAt: Number(peer.currentSessionStartedAt || 0) || null,
      idleThresholdMs: Number(peer.idleThresholdMs || 0) || null,
      activityEvents,
      latestScreenshot: peer.latestScreenshot || null
    };
  }

  function doSaveState() {
    storage.saveState({
      helpRequests: state.helpRequests,
      pendingOutgoingHelpRequests: state.pendingOutgoingHelpRequests,
      pendingReliableMessages: state.pendingReliableMessages,
      userGroups: state.userGroups,
      savedPeers: [...state.peers.values()]
        .map(serializePeer)
        .filter(Boolean)
    });
  }

  function doSaveHistory() {
    storage.saveHistory(state.chatHistory);
  }

  return { doSaveState, doSaveHistory };
}

module.exports = { createPersistence };

