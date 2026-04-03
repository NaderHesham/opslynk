'use strict';

function registerLifecycle({
  app,
  process,
  storage,
  state,
  getPrimaryNetworkInfo,
  getOrCreateDeviceIdentity,
  buildDefaultProfile,
  getSystemInfo,
  ensureControlProfile,
  startNetworkMonitor,
  startPeerSession,
  createMainWindow,
  createTray,
  bus,
  setRendererBridge,
  broadcastToRenderer,
  doSaveHistory,
  doSaveState
}) {
  app.whenReady().then(async () => {
    storage.ensureDirs();

    const netInfo = getPrimaryNetworkInfo();
    const deviceRecord = getOrCreateDeviceIdentity(netInfo.ip);

    const raw = storage.loadProfile();
    if (raw) {
      state.myProfile = raw;
      state.myProfile.id = deviceRecord.deviceId;
    } else {
      state.myProfile = buildDefaultProfile(deviceRecord);
    }

    state.myProfile.systemInfo = getSystemInfo();
    ensureControlProfile();
    storage.saveProfile(state.myProfile);

    const saved = storage.loadState();
    state.helpRequests = saved.helpRequests;
    state.pendingOutgoingHelpRequests = saved.pendingOutgoingHelpRequests;
    state.userGroups = saved.userGroups;
    state.soundEnabled = typeof state.myProfile.soundEnabled === 'boolean' ? state.myProfile.soundEnabled : true;

    state.chatHistory = storage.loadHistory();

    startNetworkMonitor();
    await startPeerSession();

    createMainWindow();
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
