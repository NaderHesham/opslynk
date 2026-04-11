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

function registerLifecycle({
  app,
  process,
  storage,
  state,
  getPrimaryNetworkInfo,
  getOrCreateDeviceIdentity,
  ensureDeviceCredentials = (record) => record,
  attachIdentityToProfile = (profile) => profile,
  buildDefaultProfile,
  getSystemInfo,
  ensureControlProfile,
  startNetworkMonitor,
  startPeerSession,
  createMainWindow,
  initPreloadedWindows,
  createTray,
  bus,
  setRendererBridge,
  broadcastToRenderer,
  doSaveHistory,
  doSaveState,
  hydrateReliableTransport = () => {},
  restorePersistentLock = () => {},
  restorePersistentForcedVideo = () => {}
}) {
  function appendRestoreOfflineEvent(raw, now) {
    const events = pruneActivityEvents(raw.activityEvents, now);
    const last = events[events.length - 1];
    if (raw.currentSessionStartedAt && (!last || last.type !== 'offline')) {
      events.push({ type: 'offline', at: now });
    }
    return pruneActivityEvents(events, now);
  }

  function restoreSavedPeers(state, savedPeers) {
    if (!Array.isArray(savedPeers)) return;
    const restoredAt = Date.now();
    for (const raw of savedPeers) {
      if (!raw || typeof raw.id !== 'string' || !raw.id) continue;
      state.peers.set(raw.id, {
        id: raw.id,
        username: raw.username || 'Unknown peer',
        role: raw.role || 'user',
        deviceId: raw.deviceId || raw.id,
        identityFingerprint: raw.identityFingerprint,
        color: raw.color,
        title: raw.title,
        avatar: raw.avatar || null,
        systemInfo: raw.systemInfo || null,
        online: false,
        connectionState: 'offline',
        restoredFromState: true,
        identityVerified: !!raw.identityVerified,
        identityRejected: !!raw.identityRejected,
        lastDisconnectedAt: Number(raw.lastDisconnectedAt || 0) || restoredAt,
        lastSeen: Number(raw.lastSeen || 0) || null,
        lastHeartbeat: Number(raw.lastHeartbeat || 0) || null,
        liveMetrics: raw.liveMetrics || null,
        activityState: raw.activityState || 'offline',
        lastInputAt: Number(raw.lastInputAt || 0) || null,
        lastStateChangeAt: Number(raw.lastStateChangeAt || 0) || restoredAt,
        currentSessionStartedAt: null,
        idleThresholdMs: Number(raw.idleThresholdMs || 0) || 300000,
        activityEvents: appendRestoreOfflineEvent(raw, restoredAt),
        latestScreenshot: raw.latestScreenshot || null,
        remoteLockActive: !!raw.remoteLockActive,
        remoteVideoActive: !!raw.remoteVideoActive,
        remoteControlUpdatedAt: Number(raw.remoteControlUpdatedAt || 0) || null
      });
    }
  }

  app.whenReady().then(async () => {
    storage.ensureDirs();

    const netInfo = getPrimaryNetworkInfo();
    const deviceRecord = ensureDeviceCredentials(getOrCreateDeviceIdentity(netInfo.ip));

    const raw = storage.loadProfile();
    if (raw) {
      state.myProfile = raw;
      state.myProfile.id = deviceRecord.deviceId;
    } else {
      state.myProfile = buildDefaultProfile(deviceRecord);
    }

    const preservedUsername = raw?.username;
    state.myProfile = attachIdentityToProfile(state.myProfile, deviceRecord);
    state.myProfile.systemInfo = getSystemInfo();
    ensureControlProfile();
    if (preservedUsername) state.myProfile.username = preservedUsername;
    storage.saveProfile(state.myProfile);

    const saved = storage.loadState();
    state.helpRequests = saved.helpRequests;
    state.pendingOutgoingHelpRequests = saved.pendingOutgoingHelpRequests;
    state.pendingReliableMessages = saved.pendingReliableMessages || [];
    state.userGroups = saved.userGroups;
    state.enforcedLock = saved.enforcedLock || { locked: false, message: '', lockedAt: null, byPeerId: null };
    state.enforcedVideo = saved.enforcedVideo || { active: false, fromId: null, fromName: '', videoB64: '', mime: 'video/mp4', fileName: '', label: '', broadcastId: null, timestamp: null };
    restoreSavedPeers(state, saved.savedPeers);
    state.soundEnabled = typeof state.myProfile.soundEnabled === 'boolean' ? state.myProfile.soundEnabled : true;

    state.chatHistory = storage.loadHistory();
    hydrateReliableTransport();

    startNetworkMonitor();
    await startPeerSession();

    createMainWindow();
    initPreloadedWindows?.();
    if (state.enforcedLock?.locked) {
      setTimeout(() => {
        restorePersistentLock(String(state.enforcedLock.message || 'Your screen has been locked by the administrator.'));
      }, 200);
    }
    if (state.enforcedVideo?.active && state.enforcedVideo.videoB64) {
      setTimeout(() => {
        restorePersistentForcedVideo({ ...state.enforcedVideo });
      }, 260);
    }
    setRendererBridge((event, data) => broadcastToRenderer(event, data));
    createTray();

    const appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : '';
    const loginItem = app.isPackaged
      ? { openAtLogin: true, path: process.execPath, enabled: true }
      : { openAtLogin: true, path: process.execPath, args: appPath ? [appPath] : [], enabled: true };
    app.setLoginItemSettings(loginItem);
  });

  app.on('window-all-closed', (e) => e.preventDefault());
  app.on('before-quit', () => {
    state.isQuitting = true;
    doSaveHistory();
    storage.saveProfile(state.myProfile);
    doSaveState();
  });
}

module.exports = { registerLifecycle };
