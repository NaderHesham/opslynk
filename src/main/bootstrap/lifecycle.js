'use strict';

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
  hydrateReliableTransport = () => {}
}) {
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
    state.soundEnabled = typeof state.myProfile.soundEnabled === 'boolean' ? state.myProfile.soundEnabled : true;

    state.chatHistory = storage.loadHistory();
    hydrateReliableTransport();

    startNetworkMonitor();
    await startPeerSession();

    createMainWindow();
    initPreloadedWindows?.();
    setRendererBridge((event, data) => broadcastToRenderer(event, data));
    createTray();

    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
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
