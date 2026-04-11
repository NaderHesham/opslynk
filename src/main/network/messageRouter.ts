import type { ActivityEvent, ActivitySnapshot, HelpRequest, NetworkRuntimeState, PeerActivityEventType, PeerActivityState, PeerSession } from '../../shared/types/runtime';
import type { CommandOrigin } from '../security/deviceTrust';
import { executeDeviceAction } from '../system/deviceActionService';

const ACTIVITY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACTIVITY_EVENTS_PER_PEER = 200;

function pruneActivityEvents(
  events: Array<{ type: string; at: number }> | undefined,
  now = Date.now()
): Array<{ type: 'online' | 'offline' | 'active' | 'idle'; at: number }> {
  if (!Array.isArray(events) || !events.length) return [];
  const cutoff = now - ACTIVITY_RETENTION_MS;
  return events
    .map((event) => ({ type: event?.type, at: Number(event?.at || 0) }))
    .filter((event): event is { type: 'online' | 'offline' | 'active' | 'idle'; at: number } =>
      event.at > 0 &&
      event.at >= cutoff &&
      ['online', 'offline', 'active', 'idle'].includes(event.type))
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_ACTIVITY_EVENTS_PER_PEER);
}

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
  showChatMessagePopup?: (payload: { peerId: string; username?: string; text?: string; timestamp?: string }) => void;
  shouldShowChatPopup?: () => boolean;
  showUrgentOverlay: (data: Record<string, unknown>) => void;
  showNormalBroadcastPopup: (data: Record<string, unknown>) => void;
  showHelpRequestPopup: (req: unknown) => void;
  showForcedVideoWindow: (data: Record<string, unknown>) => void;
  closeForcedVideoWindow: (force?: boolean) => void;
  showLockScreen: (message: string) => void;
  unlockScreen: () => void;
  buildSignedPeerIdentity: (profile: Record<string, unknown>, port: number) => Record<string, unknown>;
  verifySignedPeerIdentity: (identity: Record<string, unknown>) => { valid: boolean; fingerprint?: string; reason?: string };
  evaluateControlMessageTrust: (params: {
    commandType: string;
    fromId: string;
    sender?: PeerSession;
    origin?: Partial<CommandOrigin>;
  }) => { trusted: boolean; reason: string; mode: 'trusted' | 'denied' };
  rememberTrustedPeer: (peerId: string, role?: string, fingerprint?: string) => {
    trusted: boolean;
    reason: string;
    mode: 'trusted' | 'newly-trusted' | 'denied';
  };
  reliableTransport?: { confirm: (msgId: string) => boolean };
  onTrustDecision?: (entry: Record<string, unknown>) => void;
  captureScreenshot?: (options?: { hideWindow?: boolean }) => Promise<{ base64: string; name: string; size: number } | null>;
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
  showChatMessagePopup,
  shouldShowChatPopup,
  showUrgentOverlay,
  showNormalBroadcastPopup,
  showHelpRequestPopup,
  showForcedVideoWindow,
  closeForcedVideoWindow,
  showLockScreen,
  unlockScreen,
  buildSignedPeerIdentity,
  verifySignedPeerIdentity,
  evaluateControlMessageTrust,
  rememberTrustedPeer,
  reliableTransport,
  onTrustDecision,
  captureScreenshot
}: RouterDeps): { handleP2PMessage: (ws: unknown, msg: Record<string, unknown>, remoteIp: string) => void } {
  const debugLog = (..._args: unknown[]): void => {};

  const emitPeerActivity = (peer: PeerSession, transitionType: PeerActivityEventType, at: number, source: string): void => {
    bus.emit(EVENTS.PEER_ACTIVITY, {
      peerId: peer.id,
      state: peer.activityState || (peer.online ? 'active' : 'offline'),
      at,
      source,
      transition: { type: transitionType, at },
      lastInputAt: peer.lastInputAt || null,
      lastStateChangeAt: peer.lastStateChangeAt || null,
      currentSessionStartedAt: peer.currentSessionStartedAt || null,
      activityEvents: Array.isArray(peer.activityEvents) ? peer.activityEvents.slice(-24) : []
    });
  };

  const ensureActivityShape = (peer: PeerSession): void => {
    if (!Array.isArray(peer.activityEvents)) peer.activityEvents = [];
    if (!peer.activityState) peer.activityState = peer.online ? 'active' : 'offline';
    if (!Number.isFinite(peer.lastStateChangeAt)) peer.lastStateChangeAt = Date.now();
    if (!Number.isFinite(peer.lastInputAt) && peer.activityState !== 'offline') peer.lastInputAt = peer.lastStateChangeAt;
    if (!Number.isFinite(peer.idleThresholdMs)) peer.idleThresholdMs = 300000;
    if (peer.online && !Number.isFinite(peer.currentSessionStartedAt || undefined)) peer.currentSessionStartedAt = peer.lastSeen || Date.now();
  };

  const isOutOfOrderStateChange = (peer: PeerSession, at: number): boolean => {
    const safeAt = Number(at || 0);
    const knownAt = Number(peer.lastStateChangeAt || 0);
    return safeAt > 0 && knownAt > 0 && safeAt < knownAt;
  };

  const shouldAcceptSnapshot = (peer: PeerSession, snapshot: ActivitySnapshot): boolean => {
    const snapshotAt = Number(snapshot.lastStateChangeAt || 0);
    const knownAt = Number(peer.lastStateChangeAt || 0);
    if (snapshotAt && knownAt && snapshotAt < knownAt) return false;
    const snapshotInputAt = Number(snapshot.lastInputAt || 0);
    const knownInputAt = Number(peer.lastInputAt || 0);
    if (snapshotInputAt && knownInputAt && snapshotInputAt < knownInputAt && snapshotAt <= knownAt) return false;
    return true;
  };

  const appendActivityEvent = (peer: PeerSession, type: PeerActivityEventType, at: number): void => {
    ensureActivityShape(peer);
    const safeAt = Number(at || Date.now());
    const last = peer.activityEvents?.[peer.activityEvents.length - 1];
    if (last && last.type === type && Math.abs(last.at - safeAt) < 1000) return;
    peer.activityEvents!.push({ type, at: safeAt } as ActivityEvent);
    peer.activityEvents = pruneActivityEvents(peer.activityEvents!, safeAt) as ActivityEvent[];
  };

  const updateActivityState = (peer: PeerSession, nextState: PeerActivityState, at: number, source: string): void => {
    ensureActivityShape(peer);
    const safeAt = Number(at || Date.now());
    if (isOutOfOrderStateChange(peer, safeAt)) return;
    if (peer.activityState === nextState) {
      peer.lastStateChangeAt = Math.max(Number(peer.lastStateChangeAt || 0), safeAt);
      if (nextState === 'active') peer.lastInputAt = Math.max(Number(peer.lastInputAt || 0), safeAt);
      return;
    }
    peer.activityState = nextState;
    peer.lastStateChangeAt = safeAt;
    if (nextState === 'active') peer.lastInputAt = Math.max(Number(peer.lastInputAt || 0), safeAt);
    appendActivityEvent(peer, nextState, safeAt);
    emitPeerActivity(peer, nextState, safeAt, source);
  };

  const normalizeActivity = (raw: unknown, fallbackAt: number): ActivitySnapshot | null => {
    const data = raw as Partial<ActivitySnapshot> | null | undefined;
    if (!data || (data.state !== 'active' && data.state !== 'idle')) return null;
    return {
      state: data.state,
      lastInputAt: Number(data.lastInputAt || fallbackAt),
      lastStateChangeAt: Number(data.lastStateChangeAt || fallbackAt),
      idleThresholdMs: Number(data.idleThresholdMs || 300000)
    };
  };

  const applyActivitySnapshot = (peer: PeerSession, raw: unknown, fallbackAt: number, source: string): void => {
    const snapshot = normalizeActivity(raw, fallbackAt);
    if (!snapshot) return;
    ensureActivityShape(peer);
    if (!shouldAcceptSnapshot(peer, snapshot)) return;
    peer.idleThresholdMs = snapshot.idleThresholdMs;
    peer.lastInputAt = Math.max(Number(peer.lastInputAt || 0), Number(snapshot.lastInputAt || 0)) || snapshot.lastInputAt;
    peer.lastStateChangeAt = Math.max(Number(peer.lastStateChangeAt || 0), Number(snapshot.lastStateChangeAt || 0)) || snapshot.lastStateChangeAt;
    if (peer.online && !peer.currentSessionStartedAt) peer.currentSessionStartedAt = fallbackAt;
    updateActivityState(peer, snapshot.state, snapshot.lastStateChangeAt || fallbackAt, source);
  };

  const markPeerOnline = (peer: PeerSession, at: number, source: string): void => {
    ensureActivityShape(peer);
    if (!peer.currentSessionStartedAt) peer.currentSessionStartedAt = at;
    const last = peer.activityEvents?.[peer.activityEvents.length - 1];
    if (!last || last.type !== 'online') {
      appendActivityEvent(peer, 'online', at);
    }
  };

  const markPeerOffline = (peer: PeerSession, at: number, source: string): void => {
    ensureActivityShape(peer);
    updateActivityState(peer, 'offline', at, source);
    peer.currentSessionStartedAt = null;
  };

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

  const buildLocalControlState = (): { lockActive: boolean; videoActive: boolean; updatedAt: number } => ({
    lockActive: !!state.enforcedLock?.locked,
    videoActive: !!state.enforcedVideo?.active,
    updatedAt: Date.now()
  });

  const applyPeerControlState = (peer: PeerSession, raw: unknown): boolean => {
    const data = raw as { lockActive?: unknown; videoActive?: unknown; updatedAt?: unknown } | null | undefined;
    if (!data || typeof data !== 'object') return false;
    const nextLock = !!data.lockActive;
    const nextVideo = !!data.videoActive;
    const nextUpdatedAt = Number(data.updatedAt || Date.now()) || Date.now();
    const changed = (
      !!peer.remoteLockActive !== nextLock
      || !!peer.remoteVideoActive !== nextVideo
      || Number(peer.remoteControlUpdatedAt || 0) !== nextUpdatedAt
    );
    peer.remoteLockActive = nextLock;
    peer.remoteVideoActive = nextVideo;
    peer.remoteControlUpdatedAt = nextUpdatedAt;
    return changed;
  };

  const broadcastLocalControlStateToAdmins = (): void => {
    const payload = {
      type: 'control-state',
      fromId: state.myProfile?.id,
      controlState: buildLocalControlState()
    };
    for (const [, peer] of state.peers) {
      if (!peer?.online || !hasAdminAccess(peer.role)) continue;
      const ws = peer.ws as { readyState?: number } | null | undefined;
      if (!ws || ws.readyState !== 1) continue;
      wsNet.safeSend(ws, payload);
    }
  };

  function handleP2PMessage(ws: unknown, msg: Record<string, unknown>, remoteIp: string): void {
    const type = String(msg.type || '');
    debugLog('[ACK-DEBUG] type:', type, 'msgId:', msg.msgId);

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
      debugLog('[ACK-DEBUG] sending ACK for:', msg.msgId);
      wsNet.safeSend(ws, { type: 'ack', msgId: msg.msgId, fromId: state.myProfile?.id });
    }

    if (type === 'hello' || type === 'hello-ack') {
      const p = msg.from as PeerSession | undefined;
      if (!p || typeof p.id !== 'string' || !p.id || p.id === state.myProfile?.id) return;
      const existingPeer = state.peers.get(p.id);
      const identityCheck = verifySignedPeerIdentity(p as unknown as Record<string, unknown>);
      if (!identityCheck.valid || !identityCheck.fingerprint) {
        if (existingPeer) {
          existingPeer.identityVerified = false;
          existingPeer.identityRejected = true;
          existingPeer.online = false;
          existingPeer.connectionState = 'degraded';
        }
        if (typeof (ws as { close?: () => void } | undefined)?.close === 'function') {
          (ws as { close: () => void }).close();
        }
        if (onTrustDecision) {
          onTrustDecision({
            timestamp: new Date().toISOString(),
            type: 'incoming-peer-identity',
            fromId: p.id,
            trusted: false,
            mode: 'denied',
            reason: identityCheck.reason || 'identity-invalid'
          });
        }
        return;
      }
      const trustDecision = rememberTrustedPeer(p.id, p.role, identityCheck.fingerprint);
      if (!trustDecision.trusted) {
        if (existingPeer) {
          existingPeer.identityVerified = false;
          existingPeer.identityRejected = true;
          existingPeer.online = false;
          existingPeer.connectionState = 'degraded';
        }
        if (typeof (ws as { close?: () => void } | undefined)?.close === 'function') {
          (ws as { close: () => void }).close();
        }
        if (onTrustDecision) {
          onTrustDecision({
            timestamp: new Date().toISOString(),
            type: 'incoming-peer-identity',
            fromId: p.id,
            trusted: false,
            mode: trustDecision.mode,
            reason: trustDecision.reason
          });
        }
        return;
      }
      let peer = existingPeer;
      const wasOnline = !!peer?.online;
      if (!peer) {
        peer = {
          ...p,
          deviceId: p.deviceId || p.id,
          identityFingerprint: identityCheck.fingerprint,
          ip: remoteIp,
          port: p.port || wsNet.CHAT_PORT_BASE,
          ws,
          online: true,
          connectionState: 'connected',
          restoredFromState: false,
          identityVerified: true,
          identityRejected: false,
          identityLastVerifiedAt: new Date().toISOString(),
          lastSeen: Date.now(),
          lastHeartbeat: Date.now(),
          activityState: 'active',
          activityEvents: []
        };
        state.peers.set(p.id, peer);
      } else {
        Object.assign(peer, {
          ...p,
          deviceId: p.deviceId || p.id,
          identityFingerprint: identityCheck.fingerprint,
          ip: remoteIp,
          ws,
          online: true,
          connectionState: 'connected',
          restoredFromState: false,
          identityVerified: true,
          identityRejected: false,
          identityLastVerifiedAt: new Date().toISOString(),
          lastSeen: Date.now(),
          lastHeartbeat: Date.now()
        });
      }
      if (!peer) return;
      markPeerOnline(peer, Date.now(), 'hello');
      applyActivitySnapshot(peer, (p as unknown as { activity?: unknown }).activity, Date.now(), 'hello');
      applyPeerControlState(peer, (p as unknown as { controlState?: unknown }).controlState);
      bus.emit(wasOnline ? EVENTS.DEVICE_UPDATED : EVENTS.DEVICE_JOINED, peerToSafe(peer));
      if (!wasOnline) emitPeerActivity(peer, 'online', Date.now(), 'hello');
      updateTrayMenu();
      if (type === 'hello') {
        wsNet.safeSend(ws, {
          type: 'hello-ack',
          from: {
            ...buildSignedPeerIdentity(state.myProfile as unknown as Record<string, unknown>, state.myPortRef.value),
            controlState: buildLocalControlState()
          }
        });
      }
      if (onTrustDecision) {
        onTrustDecision({
          timestamp: new Date().toISOString(),
          type: 'incoming-peer-identity',
          fromId: p.id,
          trusted: true,
          mode: trustDecision.mode,
          reason: trustDecision.reason,
          fingerprint: identityCheck.fingerprint
        });
      }
      return;
    }

    const fromId = String(msg.fromId || '');
    const verifiedSender = fromId ? state.peers.get(fromId) : undefined;
    if (
      fromId &&
      (!verifiedSender || verifiedSender.ws !== ws || !verifiedSender.identityVerified)
    ) {
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
      const payload = {
        fromId: msg.fromId,
        fromName: msg.fromName || 'Admin',
        videoB64: msg.videoB64,
        mime: msg.mime || 'video/mp4',
        fileName: msg.fileName || 'broadcast-video',
        label: msg.label || '',
        broadcastId: msg.broadcastId,
        timestamp: msg.timestamp
      };
      showForcedVideoWindow(payload);
      state.enforcedVideo = {
        active: true,
        fromId: typeof payload.fromId === 'string' ? payload.fromId : null,
        fromName: String(payload.fromName || 'Admin'),
        videoB64: String(payload.videoB64 || ''),
        mime: String(payload.mime || 'video/mp4'),
        fileName: String(payload.fileName || 'broadcast-video'),
        label: String(payload.label || ''),
        broadcastId: typeof payload.broadcastId === 'string' ? payload.broadcastId : null,
        timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : null
      };
      doSaveState();
      broadcastLocalControlStateToAdmins();
      return;
    }

    if (type === 'forced-video-broadcast-stop') {
      if (!checkSensitiveTrust(msg, 'forced-video-broadcast-stop')) return;
      closeForcedVideoWindow(true);
      state.enforcedVideo = {
        active: false,
        fromId: null,
        fromName: '',
        videoB64: '',
        mime: 'video/mp4',
        fileName: '',
        label: '',
        broadcastId: null,
        timestamp: null
      };
      doSaveState();
      broadcastLocalControlStateToAdmins();
      return;
    }

    if (type === 'screen-lock') {
      if (!checkSensitiveTrust(msg, 'screen-lock')) return;
      const sender = state.peers.get(String(msg.fromId || ''));
      if (!sender || !hasAdminAccess(sender.role)) return;
      const lockMessage = String(msg.message || 'Your screen has been locked by the administrator.');
      showLockScreen(lockMessage);
      state.enforcedLock = {
        locked: true,
        message: lockMessage,
        lockedAt: new Date().toISOString(),
        byPeerId: String(msg.fromId || '') || null
      };
      doSaveState();
      broadcastLocalControlStateToAdmins();
      bus.emit(EVENTS.SCREEN_LOCKED, { fromId: msg.fromId, message: msg.message });
      return;
    }

    if (type === 'screen-unlock') {
      if (!checkSensitiveTrust(msg, 'screen-unlock')) return;
      const sender = state.peers.get(String(msg.fromId || ''));
      if (!sender || !hasAdminAccess(sender.role)) return;
      unlockScreen();
      state.enforcedLock = {
        locked: false,
        message: '',
        lockedAt: null,
        byPeerId: null
      };
      doSaveState();
      broadcastLocalControlStateToAdmins();
      bus.emit(EVENTS.SCREEN_UNLOCKED, { fromId: msg.fromId });
      return;
    }

    if (type === 'device-command') {
      if (!checkSensitiveTrust(msg, 'device-command')) return;
      const sender = state.peers.get(String(msg.fromId || ''));
      if (!sender || !hasAdminAccess(sender.role)) return;
      const action = String(msg.action || '');
      const commandId = String(msg.commandId || '');
      const script = typeof msg.script === 'string' ? msg.script : '';
      void (async () => {
        let result: { success: boolean; message: string };
        if (action === 'lock_device') {
          const lockMessage = 'Your screen has been locked by the administrator.';
          showLockScreen(lockMessage);
          state.enforcedLock = {
            locked: true,
            message: lockMessage,
            lockedAt: new Date().toISOString(),
            byPeerId: String(msg.fromId || '') || null
          };
          doSaveState();
          broadcastLocalControlStateToAdmins();
          bus.emit(EVENTS.SCREEN_LOCKED, { fromId: msg.fromId, message: 'Locked by admin action.' });
          result = { success: true, message: 'Device locked.' };
        } else if (action === 'unlock_device') {
          unlockScreen();
          state.enforcedLock = {
            locked: false,
            message: '',
            lockedAt: null,
            byPeerId: null
          };
          doSaveState();
          broadcastLocalControlStateToAdmins();
          bus.emit(EVENTS.SCREEN_UNLOCKED, { fromId: msg.fromId });
          result = { success: true, message: 'Device unlocked.' };
        } else {
          result = await executeDeviceAction(action, script);
        }
        wsNet.safeSend(ws, {
          type: 'device-command-result',
          fromId: state.myProfile?.id,
          commandId,
          action,
          success: !!result.success,
          message: String(result.message || '')
        });
      })();
      return;
    }

    if (type === 'device-command-result') {
      const peer = state.peers.get(String(msg.fromId || ''));
      bus.emit(EVENTS.DEVICE_COMMAND_RESULT, {
        fromId: msg.fromId,
        username: peer?.username || 'Peer',
        commandId: String(msg.commandId || ''),
        action: String(msg.action || ''),
        success: !!msg.success,
        message: String(msg.message || '')
      });
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
      if (!shouldShowChatPopup || shouldShowChatPopup()) {
        showChatMessagePopup?.({
          peerId: fromId,
          username: peer.username,
          text: String(msg.text || msg.emoji || ''),
          timestamp: String(msg.timestamp || new Date().toISOString())
        });
      }
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
      if (!shouldShowChatPopup || shouldShowChatPopup()) {
        showChatMessagePopup?.({
          peerId: fromId,
          username: peer.username,
          text: `File: ${String(attachment.name)}`,
          timestamp: String(msg.timestamp || new Date().toISOString())
        });
      }
      return;
    }

    if (type === 'ack') {
      // Confirm delivery tracking for chat ACKs
      if (msg.msgId) {
        reliableTransport?.confirm(String(msg.msgId));
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
        const heartbeatAt = Number(msg.timestamp || Date.now());
        peer.online = true;
        peer.connectionState = 'connected';
        peer.restoredFromState = false;
        peer.screenshotRequestPending = false;
        peer.lastHeartbeat = Date.now();
        peer.systemInfo    = (msg.systemInfo as Record<string, unknown>) || peer.systemInfo;
        if (msg.liveMetrics) peer.liveMetrics = msg.liveMetrics as PeerSession['liveMetrics'];
        markPeerOnline(peer, heartbeatAt, 'heartbeat');
        applyActivitySnapshot(peer, msg.activity, heartbeatAt, 'heartbeat');
        applyPeerControlState(peer, msg.controlState);
        if (!wasOnline) {
          bus.emit(EVENTS.DEVICE_JOINED, peerToSafe(peer));
          emitPeerActivity(peer, 'online', heartbeatAt, 'heartbeat');
          updateTrayMenu();
        } else {
          bus.emit(EVENTS.DEVICE_UPDATED, peerToSafe(peer));
        }
        bus.emit(EVENTS.PEER_HEARTBEAT, {
          peerId:      fromId,
          timestamp:   msg.timestamp,
          systemInfo:  peer.systemInfo,
          liveMetrics: peer.liveMetrics,
          activity: {
            state: peer.activityState || 'active',
            lastInputAt: peer.lastInputAt || null,
            lastStateChangeAt: peer.lastStateChangeAt || null,
            currentSessionStartedAt: peer.currentSessionStartedAt || null
          }
        });
      }
      return;
    }

    if (type === 'activity-transition') {
      const fromId = String(msg.fromId || '');
      const peer = state.peers.get(fromId);
      if (!peer) return;
      const transition = msg.transition as { type?: PeerActivityEventType; at?: number } | undefined;
      const transitionType = transition?.type;
      const at = Number(transition?.at || Date.now());
      if (transitionType === 'active' || transitionType === 'idle') {
        peer.online = true;
        peer.connectionState = 'connected';
        peer.restoredFromState = false;
        peer.screenshotRequestPending = false;
        markPeerOnline(peer, at, 'transition');
        applyActivitySnapshot(peer, msg.activity, at, 'transition');
        updateActivityState(peer, transitionType, at, 'transition');
        bus.emit(EVENTS.DEVICE_UPDATED, peerToSafe(peer));
      }
      return;
    }

    if (type === 'screenshot-request') {
      // Only non-admin nodes respond (clients capture their own screen)
      if (hasAdminAccess(state.myProfile?.role)) return;
      // Require sender to be a known admin
      const requester = state.peers.get(String(msg.fromId || ''));
      if (!requester || !hasAdminAccess(requester.role) || !requester.identityVerified) return;
      const reqId = String(msg.reqId || '');
      const isPreviewPoll = String(msg.reason || '') === 'preview-poll';
      void (async () => {
        const ss = captureScreenshot ? await captureScreenshot({ hideWindow: !isPreviewPoll }) : null;
        if (ss) {
          wsNet.safeSend(ws, {
            type:      'screenshot-response',
            reqId,
            fromId:    state.myProfile?.id,
            base64:    ss.base64,
            name:      ss.name,
            timestamp: new Date().toISOString(),
            reason:    isPreviewPoll ? 'preview-poll' : 'manual-request'
          });
        }
      })();
      return;
    }

    if (type === 'screenshot-response') {
      const fromId = String(msg.fromId || '');
      const peer = state.peers.get(fromId);
      const capturedAt = Date.parse(String(msg.timestamp || '')) || Date.now();
      const requestReason = peer
        ? String((peer as unknown as { latestScreenshotRequestReason?: string }).latestScreenshotRequestReason || msg.reason || '')
        : String(msg.reason || '');
      if (peer) {
        peer.screenshotRequestPending = false;
        (peer as unknown as { latestScreenshotRequestReason?: string }).latestScreenshotRequestReason = '';
        peer.latestScreenshot = {
          capturedAt,
          name: typeof msg.name === 'string' ? msg.name : null,
          size: typeof msg.base64 === 'string' ? Math.round((msg.base64.length * 3) / 4) : null,
          mime: 'image/png'
        };
        bus.emit(EVENTS.DEVICE_UPDATED, peerToSafe(peer));
      }
      bus.emit(EVENTS.PEER_SCREENSHOT, {
        peerId:    fromId,
        reqId:     msg.reqId,
        base64:    msg.base64,
        name:      msg.name,
        timestamp: msg.timestamp,
        reason:    requestReason
      });
      return;
    }

    if (type === 'profile-update') {
      const peer = state.peers.get(String(msg.id || ''));
      if (!peer || peer.ws !== ws || !peer.identityVerified) return;
      Object.assign(peer, {
        color: msg.color,
        title: msg.title,
        username: msg.username,
        avatar: msg.avatar,
        role: msg.role || peer.role,
        deviceId: String(msg.deviceId || peer.deviceId || peer.id),
        publicKey: typeof msg.publicKey === 'string' && msg.publicKey ? msg.publicKey : peer.publicKey,
        identityFingerprint: typeof msg.identityFingerprint === 'string' && msg.identityFingerprint ? msg.identityFingerprint : peer.identityFingerprint,
        systemInfo: msg.systemInfo || peer.systemInfo || null,
        connectionState: peer.online ? 'connected' : peer.connectionState
      });
      if (hasAdminAccess(peer.role) && (peer.ws as { readyState?: number } | undefined)?.readyState === 1) {
        flushPendingHelpRequests(peer.id);
      }
      bus.emit(EVENTS.DEVICE_UPDATED, peerToSafe(peer));
      updateTrayMenu();
      return;
    }

    if (type === 'control-state') {
      const fromId = String(msg.fromId || '');
      const peer = state.peers.get(fromId);
      if (!peer) return;
      const changed = applyPeerControlState(peer, msg.controlState);
      if (changed) bus.emit(EVENTS.DEVICE_UPDATED, peerToSafe(peer));
      return;
    }

    if (type === 'group-sync') {
      if (!checkSensitiveTrust(msg, 'group-sync')) return;
      if (!hasAdminAccess(state.myProfile?.role)) return;
      const sender = state.peers.get(String(msg.fromId || ''));
      if (!sender || !hasAdminAccess(sender.role)) return;
      const incoming = Array.isArray(msg.groups) ? msg.groups : [];
      const sanitized = incoming
        .map((item) => {
          const group = item as { id?: unknown; name?: unknown; memberIds?: unknown };
          const id = typeof group.id === 'string' ? group.id.trim() : '';
          const name = typeof group.name === 'string' ? group.name.trim() : '';
          const memberIds = Array.isArray(group.memberIds)
            ? [...new Set(group.memberIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0))]
            : [];
          if (!id || !name) return null;
          return { id, name, memberIds };
        })
        .filter((group): group is { id: string; name: string; memberIds: string[] } => !!group);
      state.userGroups = sanitized.sort((a, b) => a.name.localeCompare(b.name));
      doSaveState();
      bus.emit(EVENTS.USER_GROUPS_UPDATED, { groups: state.userGroups });
      return;
    }
  }

  return { handleP2PMessage };
}
