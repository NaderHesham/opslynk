import type { HelpRequest, NetworkRuntimeState, PeerSession } from '../../shared/types/runtime';

interface RouterDeps {
  state: NetworkRuntimeState;
  wsNet: { CHAT_PORT_BASE: number; safeSend: (ws: unknown, payload: Record<string, unknown>) => void };
  helpSvc: { upsertHelpRequest: (list: HelpRequest[], req: HelpRequest, save: () => void) => void };
  bus: { emit: (event: string, payload?: unknown) => void };
  EVENTS: Record<string, string>;
  hasAdminAccess: (role: string | undefined) => boolean;
  peerToSafe: (peer: PeerSession) => unknown;
  updateTrayMenu: () => void;
  doSaveState: () => void;
  doSaveHistory: () => void;
  flushPendingHelpRequests: (peerId?: string) => void;
  showNotification: (title: string, body: string) => void;
  showUrgentOverlay: (data: Record<string, unknown>) => void;
  showNormalBroadcastPopup: (data: Record<string, unknown>) => void;
  showHelpRequestPopup: (req: unknown) => void;
  showForcedVideoWindow: (data: Record<string, unknown>) => void;
  closeForcedVideoWindow: (force?: boolean) => void;
  showLockScreen: (message: string) => void;
  unlockScreen: () => void;
}

export function createMessageRouter({
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
}: RouterDeps): { handleP2PMessage: (ws: unknown, msg: Record<string, unknown>, remoteIp: string) => void } {
  function handleP2PMessage(ws: unknown, msg: Record<string, unknown>, remoteIp: string): void {
    const type = String(msg.type || '');

    for (const [, peer] of state.peers) {
      if (peer.ws === ws) {
        peer.lastSeen = Date.now();
        peer.online = true;
        break;
      }
    }

    if (type === 'hello' || type === 'hello-ack') {
      const p = msg.from as PeerSession | undefined;
      if (!p || p.id === state.myProfile?.id) return;
      let peer = state.peers.get(p.id);
      if (!peer) {
        peer = { ...p, ip: remoteIp, port: p.port || wsNet.CHAT_PORT_BASE, ws, online: true, lastSeen: Date.now() };
        state.peers.set(p.id, peer);
      } else {
        Object.assign(peer, { ...p, ip: remoteIp, ws, online: true, lastSeen: Date.now() });
      }
      if (!peer) return;
      bus.emit(EVENTS.DEVICE_UPDATED, peerToSafe(peer));
      updateTrayMenu();
      if (type === 'hello') {
        wsNet.safeSend(ws, { type: 'hello-ack', from: { ...state.myProfile, port: state.myPortRef.value } });
      }
      return;
    }

    if (type === 'broadcast') {
      const peer = state.peers.get(String(msg.fromId || '')) || ({ username: 'Admin' } as PeerSession);
      const data = { ...msg, fromName: peer.username };
      bus.emit(EVENTS.NETWORK_BROADCAST, data);
      if (msg.urgency === 'urgent') showUrgentOverlay(data);
      else {
        showNormalBroadcastPopup(data);
        if (state.soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'broadcast' });
      }
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
      const sender = state.peers.get(String(msg.fromId || ''));
      if (!sender || !hasAdminAccess(sender.role)) return;
      showLockScreen(String(msg.message || ''));
      bus.emit(EVENTS.SCREEN_LOCKED, { fromId: msg.fromId, message: msg.message });
      return;
    }

    if (type === 'screen-unlock') {
      const sender = state.peers.get(String(msg.fromId || ''));
      if (!sender || !hasAdminAccess(sender.role)) return;
      unlockScreen();
      bus.emit(EVENTS.SCREEN_UNLOCKED, { fromId: msg.fromId });
      return;
    }

    if (type === 'chat') {
      const fromId = String(msg.fromId || '');
      const peer = state.peers.get(fromId);
      if (!peer) return;
      if (!state.chatHistory[fromId]) state.chatHistory[fromId] = [];
      const entry = { id: msg.msgId, fromId, text: msg.text, emoji: msg.emoji, timestamp: msg.timestamp, mine: false };
      state.chatHistory[fromId].push(entry);
      doSaveHistory();
      bus.emit(EVENTS.NETWORK_MESSAGE, { peerId: fromId, message: entry });
      if (state.soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'message' });
      showNotification(`${peer.username}`, String(msg.text || msg.emoji || ''));
      return;
    }

    if (type === 'chat-file') {
      const fromId = String(msg.fromId || '');
      const peer = state.peers.get(fromId);
      const attachment = msg.attachment as Record<string, unknown> | undefined;
      if (!peer || !attachment?.name || !attachment?.data) return;
      if (!state.chatHistory[fromId]) state.chatHistory[fromId] = [];
      const entry = { id: msg.msgId, fromId, timestamp: msg.timestamp, mine: false, attachment };
      state.chatHistory[fromId].push(entry);
      doSaveHistory();
      bus.emit(EVENTS.NETWORK_MESSAGE, { peerId: fromId, message: entry });
      if (state.soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'message' });
      showNotification(`File from ${peer.username}`, String(attachment.name));
      return;
    }

    if (type === 'ack') {
      const peer = state.peers.get(String(msg.fromId || ''));
      bus.emit(EVENTS.NETWORK_ACK, { fromId: msg.fromId, broadcastId: msg.broadcastId, username: peer?.username });
      return;
    }

    if (type === 'broadcast-reply') {
      const peer = state.peers.get(String(msg.fromId || ''));
      bus.emit(EVENTS.NETWORK_REPLY, { ...msg, username: peer?.username });
      if (hasAdminAccess(state.myProfile?.role)) {
        if (state.soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'message' });
        showNotification(`Reply from ${peer?.username}`, String(msg.text || ''));
      }
      return;
    }

    if (type === 'help-request') {
      const req = {
        reqId: String(msg.reqId || ''),
        fromId: String(msg.fromId || ''),
        username: String(msg.username || ''),
        machine: String(msg.machine || ''),
        description: String(msg.description || ''),
        priority: String(msg.priority || 'normal'),
        status: 'open',
        timestamp: String(msg.timestamp || new Date().toISOString()),
        screenshotB64: (msg.screenshotB64 as string | null | undefined) ?? null,
        screenshotName: (msg.screenshotName as string | null | undefined) ?? null,
        screenshotSize: Number(msg.screenshotSize || 0)
      } as HelpRequest;
      const prio = String(msg.priority || 'normal');
      helpSvc.upsertHelpRequest(state.helpRequests, req, doSaveState);
      bus.emit(EVENTS.HELP_REQUEST, req);
      if (hasAdminAccess(state.myProfile?.role)) {
        showHelpRequestPopup(req);
        showNotification(`[${prio}] ${msg.username} @ ${msg.machine}`, String(msg.description || ''));
      }
      updateTrayMenu();
      return;
    }

    if (type === 'help-ack') {
      bus.emit(EVENTS.HELP_ACKED, { reqId: msg.reqId, fromId: msg.fromId });
      return;
    }

    if (type === 'profile-update') {
      const peer = state.peers.get(String(msg.id || ''));
      if (!peer) return;
      Object.assign(peer, {
        color: msg.color,
        title: msg.title,
        username: msg.username,
        avatar: msg.avatar,
        role: msg.role || peer.role,
        systemInfo: msg.systemInfo || peer.systemInfo || null
      });
      if (hasAdminAccess(peer.role) && (peer.ws as { readyState?: number } | undefined)?.readyState === 1) {
        flushPendingHelpRequests(peer.id);
      }
      bus.emit(EVENTS.DEVICE_UPDATED, peerToSafe(peer));
    }
  }

  return { handleP2PMessage };
}
