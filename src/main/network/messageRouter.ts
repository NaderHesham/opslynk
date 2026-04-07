import type { HelpRequest, NetworkRuntimeState, PeerSession } from '../../shared/types/runtime';
import type { CommandOrigin } from '../security/deviceTrust';

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
  evaluateControlMessageTrust: (params: {
    commandType: string;
    fromId: string;
    sender?: PeerSession;
    origin?: Partial<CommandOrigin>;
  }) => { trusted: boolean; reason: string; mode: 'trusted' | 'denied' };
  rememberTrustedPeer: (peerId: string, role?: string) => void;
  onTrustDecision?: (entry: Record<string, unknown>) => void;
  captureScreenshot?: () => Promise<{ base64: string; name: string; size: number } | null>;
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
  unlockScreen,
  evaluateControlMessageTrust,
  rememberTrustedPeer,
  onTrustDecision,
  captureScreenshot
}: RouterDeps): { handleP2PMessage: (ws: unknown, msg: Record<string, unknown>, remoteIp: string) => void } {
  const checkSensitiveTrust = (msg: Record<string, unknown>, commandType: string): boolean => {
    const fromId = String(msg.fromId || '');
    const sender = state.peers.get(fromId);
    const decision = evaluateControlMessageTrust({
      commandType,
      fromId,
      sender,
      origin: (msg.origin as Partial<CommandOrigin> | undefined)
    });
    if (onTrustDecision) {
      onTrustDecision({
        timestamp: new Date().toISOString(),
        type: 'incoming-control-trust',
        commandType,
        fromId,
        trusted: decision.trusted,
        mode: decision.mode,
        reason: decision.reason
      });
    }
    return decision.trusted;
  };

  function handleP2PMessage(ws: unknown, msg: Record<string, unknown>, remoteIp: string): void {
    const type = String(msg.type || '');
    console.log('[ACK-DEBUG] type:', type, 'msgId:', msg.msgId);

    for (const [, peer] of state.peers) {
      if (peer.ws === ws) {
        peer.lastSeen = Date.now();
        peer.lastHeartbeat = Date.now();
        peer.online = true;
        break;
      }
    }

    // Auto-ACK every incoming message so sender can track delivery
    if (msg.msgId && ws && type !== 'ack') {
      console.log('[ACK-DEBUG] sending ACK for:', msg.msgId);
      wsNet.safeSend(ws, { type: 'ack', msgId: msg.msgId, fromId: state.myProfile?.id });
    }

    if (type === 'hello' || type === 'hello-ack') {
      const p = msg.from as PeerSession | undefined;
      if (!p || typeof p.id !== 'string' || !p.id || p.id === state.myProfile?.id) return;
      let peer = state.peers.get(p.id);
      const wasOnline = !!peer?.online;
      if (!peer) {
        peer = {
          ...p,
          ip: remoteIp,
          port: p.port || wsNet.CHAT_PORT_BASE,
          ws,
          online: true,
          lastSeen: Date.now(),
          lastHeartbeat: Date.now()
        };
        state.peers.set(p.id, peer);
      } else {
        Object.assign(peer, {
          ...p,
          ip: remoteIp,
          ws,
          online: true,
          lastSeen: Date.now(),
          lastHeartbeat: Date.now()
        });
      }
      if (!peer) return;
      bus.emit(wasOnline ? EVENTS.DEVICE_UPDATED : EVENTS.DEVICE_JOINED, peerToSafe(peer));
      updateTrayMenu();
      if (type === 'hello') {
        wsNet.safeSend(ws, { type: 'hello-ack', from: { ...state.myProfile, port: state.myPortRef.value } });
      }
      rememberTrustedPeer(p.id, p.role);
      return;
    }

    if (type === 'broadcast') {
      if (!checkSensitiveTrust(msg, 'broadcast')) return;
      const peer = state.peers.get(String(msg.fromId || ''));
      const data = { ...msg, fromName: peer?.username ?? 'Admin' };
      bus.emit(EVENTS.NETWORK_BROADCAST, data);
      if (msg.urgency === 'urgent') showUrgentOverlay(data);
      else {
        showNormalBroadcastPopup(data);
        if (state.soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'broadcast' });
      }
      return;
    }

    if (type === 'forced-video-broadcast') {
      if (!checkSensitiveTrust(msg, 'forced-video-broadcast')) return;
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
      if (!checkSensitiveTrust(msg, 'forced-video-broadcast-stop')) return;
      closeForcedVideoWindow(true);
      return;
    }

    if (type === 'screen-lock') {
      if (!checkSensitiveTrust(msg, 'screen-lock')) return;
      const sender = state.peers.get(String(msg.fromId || ''));
      if (!sender || !hasAdminAccess(sender.role)) return;
      showLockScreen(String(msg.message || ''));
      bus.emit(EVENTS.SCREEN_LOCKED, { fromId: msg.fromId, message: msg.message });
      return;
    }

    if (type === 'screen-unlock') {
      if (!checkSensitiveTrust(msg, 'screen-unlock')) return;
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
      // Confirm delivery tracking for chat ACKs
      if (msg.msgId) {
        const { confirm } = require('../../../src/services/ackTracker') as { confirm: (id: string) => void };
        confirm(String(msg.msgId));
      }
      // Broadcast ACK (has broadcastId) — emit to renderer for the ACK list UI
      if (msg.broadcastId) {
        const peer = state.peers.get(String(msg.fromId || ''));
        bus.emit(EVENTS.NETWORK_ACK, { fromId: msg.fromId, broadcastId: msg.broadcastId, username: peer?.username });
      }
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

    if (type === 'heartbeat') {
      const fromId = String(msg.fromId || '');
      const peer   = state.peers.get(fromId);
      if (peer) {
        const wasOnline = !!peer.online;
        peer.online = true;
        peer.lastHeartbeat = Date.now();
        peer.systemInfo    = (msg.systemInfo as Record<string, unknown>) || peer.systemInfo;
        if (msg.liveMetrics) peer.liveMetrics = msg.liveMetrics as PeerSession['liveMetrics'];
        if (!wasOnline) {
          bus.emit(EVENTS.DEVICE_JOINED, peerToSafe(peer));
          updateTrayMenu();
        }
        bus.emit(EVENTS.PEER_HEARTBEAT, {
          peerId:      fromId,
          timestamp:   msg.timestamp,
          systemInfo:  peer.systemInfo,
          liveMetrics: peer.liveMetrics
        });
      }
      return;
    }

    if (type === 'screenshot-request') {
      // Only non-admin nodes respond (clients capture their own screen)
      if (hasAdminAccess(state.myProfile?.role)) return;
      // Require sender to be a known admin
      const requester = state.peers.get(String(msg.fromId || ''));
      if (!requester || !hasAdminAccess(requester.role)) return;
      const reqId = String(msg.reqId || '');
      void (async () => {
        const ss = captureScreenshot ? await captureScreenshot() : null;
        if (ss) {
          wsNet.safeSend(ws, {
            type:      'screenshot-response',
            reqId,
            fromId:    state.myProfile?.id,
            base64:    ss.base64,
            name:      ss.name,
            timestamp: new Date().toISOString()
          });
        }
      })();
      return;
    }

    if (type === 'screenshot-response') {
      const fromId = String(msg.fromId || '');
      bus.emit(EVENTS.PEER_SCREENSHOT, {
        peerId:    fromId,
        reqId:     msg.reqId,
        base64:    msg.base64,
        name:      msg.name,
        timestamp: msg.timestamp
      });
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
      updateTrayMenu();
    }
  }

  return { handleP2PMessage };
}
