'use strict';

function createMessageRouter({
  state,
  wsNet,
  helpSvc,
  bus,
  EVENTS,
  hasAdminAccess,
  peerToSafe,
  updateTrayMenu,
  doSaveState,
  doSaveHistory,
  flushPendingHelpRequests,
  showNotification,
  showUrgentOverlay,
  showNormalBroadcastPopup,
  showHelpRequestPopup,
  showForcedVideoWindow,
  closeForcedVideoWindow,
  showLockScreen,
  unlockScreen
}) {
  function handleP2PMessage(ws, msg, remoteIp) {
    const { type } = msg;

    for (const [, peer] of state.peers) {
      if (peer.ws === ws) {
        peer.lastSeen = Date.now();
        peer.online = true;
        break;
      }
    }

    if (type === 'hello' || type === 'hello-ack') {
      const p = msg.from;
      if (!p || p.id === state.myProfile.id) return;
      let peer = state.peers.get(p.id);
      if (!peer) {
        peer = { ...p, ip: remoteIp, port: p.port || wsNet.CHAT_PORT_BASE, ws, online: true, lastSeen: Date.now() };
        state.peers.set(p.id, peer);
      } else {
        Object.assign(peer, { ...p, ip: remoteIp, ws, online: true, lastSeen: Date.now() });
      }
      bus.emit(EVENTS.DEVICE_UPDATED, peerToSafe(peer));
      updateTrayMenu();
      if (type === 'hello') {
        wsNet.safeSend(ws, {
          type: 'hello-ack',
          from: { ...state.myProfile, port: state.myPortRef.value }
        });
      }
      return;
    }

    if (type === 'chat') {
      const { fromId, text, emoji, msgId, timestamp } = msg;
      const peer = state.peers.get(fromId);
      if (!peer) return;
      if (!state.chatHistory[fromId]) state.chatHistory[fromId] = [];
      const entry = { id: msgId, fromId, text, emoji, timestamp, mine: false };
      state.chatHistory[fromId].push(entry);
      doSaveHistory();
      bus.emit(EVENTS.NETWORK_MESSAGE, { peerId: fromId, message: entry });
      if (state.soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'message' });
      showNotification(`${peer.username}`, text || emoji || '');
      return;
    }

    if (type === 'chat-file') {
      const { fromId, msgId, timestamp, attachment } = msg;
      const peer = state.peers.get(fromId);
      if (!peer || !attachment?.name || !attachment?.data) return;
      if (!state.chatHistory[fromId]) state.chatHistory[fromId] = [];
      const entry = { id: msgId, fromId, timestamp, mine: false, attachment };
      state.chatHistory[fromId].push(entry);
      doSaveHistory();
      bus.emit(EVENTS.NETWORK_MESSAGE, { peerId: fromId, message: entry });
      if (state.soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'message' });
      showNotification(`File from ${peer.username}`, attachment.name);
      return;
    }

    if (type === 'broadcast') {
      const peer = state.peers.get(msg.fromId) || { username: 'Admin' };
      const data = { ...msg, fromName: peer.username };
      bus.emit(EVENTS.NETWORK_BROADCAST, data);
      if (msg.urgency === 'urgent') showUrgentOverlay(data);
      else {
        showNormalBroadcastPopup(data);
        if (state.soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'broadcast' });
      }
      return;
    }

    if (type === 'ack') {
      const peer = state.peers.get(msg.fromId);
      bus.emit(EVENTS.NETWORK_ACK, { fromId: msg.fromId, broadcastId: msg.broadcastId, username: peer?.username });
      return;
    }

    if (type === 'broadcast-reply') {
      const peer = state.peers.get(msg.fromId);
      bus.emit(EVENTS.NETWORK_REPLY, { ...msg, username: peer?.username });
      if (hasAdminAccess(state.myProfile.role)) {
        if (state.soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'message' });
        showNotification(`Reply from ${peer?.username}`, msg.text);
      }
      return;
    }

    if (type === 'help-request') {
      const req = { ...msg, status: 'open' };
      const prio = msg.priority || 'normal';
      helpSvc.upsertHelpRequest(state.helpRequests, req, doSaveState);
      bus.emit(EVENTS.HELP_REQUEST, req);
      if (hasAdminAccess(state.myProfile.role)) {
        showHelpRequestPopup(req);
        showNotification(`[${prio}] ${msg.username} @ ${msg.machine}`, msg.description);
      }
      updateTrayMenu();
      return;
    }

    if (type === 'help-ack') {
      bus.emit(EVENTS.HELP_ACKED, { reqId: msg.reqId, fromId: msg.fromId });
      return;
    }

    if (type === 'profile-update') {
      const peer = state.peers.get(msg.id);
      if (!peer) return;
      Object.assign(peer, {
        color: msg.color,
        title: msg.title,
        username: msg.username,
        avatar: msg.avatar,
        role: msg.role || peer.role,
        systemInfo: msg.systemInfo || peer.systemInfo || null
      });
      if (hasAdminAccess(peer.role) && peer.ws?.readyState === 1) flushPendingHelpRequests(peer.id);
      bus.emit(EVENTS.DEVICE_UPDATED, peerToSafe(peer));
      return;
    }

    if (type === 'forced-video-broadcast') {
      showForcedVideoWindow({
        fromId: msg.fromId,
        fromName: msg.fromName || 'Admin',
        videoB64: msg.videoB64,
        mime: msg.mime || 'video/mp4',
        fileName: msg.fileName || 'broadcast-video',
        label: msg.label || '',
        broadcastId: msg.broadcastId,
        timestamp: msg.timestamp
      });
      return;
    }

    if (type === 'forced-video-broadcast-stop') {
      closeForcedVideoWindow(true);
      return;
    }

    if (type === 'screen-lock') {
      const sender = state.peers.get(msg.fromId);
      if (!sender || !hasAdminAccess(sender.role)) return;
      showLockScreen(msg.message || '');
      bus.emit(EVENTS.SCREEN_LOCKED, { fromId: msg.fromId, message: msg.message });
      return;
    }

    if (type === 'screen-unlock') {
      const sender = state.peers.get(msg.fromId);
      if (!sender || !hasAdminAccess(sender.role)) return;
      unlockScreen();
      bus.emit(EVENTS.SCREEN_UNLOCKED, { fromId: msg.fromId });
    }
  }

  return { handleP2PMessage };
}

module.exports = { createMessageRouter };
