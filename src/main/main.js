'use strict';

const { app, ipcMain, Notification, dialog, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const storage = require('../storage/storageService');
const { getOrCreateDeviceIdentity, buildDefaultProfile } = require('../services/deviceIdentity');
const { getSystemInfo, getPrimaryNetworkInfo } = require('../system/systemInfo');
const { captureScreenshot } = require('../system/screenshotService');
const wsNet = require('../network/wsServer');
const udp = require('../network/udpDiscovery');
const helpSvc = require('../services/helpService');
const { bus, EVENTS } = require('../services/eventBus');

const { CONTROL_ROLE, CONTROL_USERNAME, getWindowModeConfig } = require('./config/constants');
const { createAppState } = require('./state/createAppState');
const { hasAdminAccess, isSuperAdmin, peerToSafe } = require('./utils/roles');
const { createPersistence } = require('./storage/persistence');
const { createWindowManager } = require('./windows/windowManager');
const { createTrayManager } = require('./tray/trayManager');
const { createNetworkMonitor } = require('./network/networkMonitor');
const { createMessageRouter } = require('./network/messageRouter');
const { createPeerSession } = require('./network/peerSession');
const { registerLifecycle } = require('./bootstrap/lifecycle');
const { registerIpcHandlers } = require('./ipc/registerIpcHandlers');
const { createAdminOrchestrator } = require('./admin/adminOrchestrator');

const state = createAppState(wsNet.CHAT_PORT_BASE);
const { doSaveState, doSaveHistory } = createPersistence({ storage, state });

function ensureControlProfile() {
  if (!state.myProfile) return;
  state.myProfile.role = CONTROL_ROLE;
  if (!state.myProfile.username || /^device-/i.test(state.myProfile.username)) {
    state.myProfile.username = CONTROL_USERNAME;
  }
}

function broadcastToRenderer(event, data) {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) state.mainWindow.webContents.send(event, data);
}

function sendToPeer(peerId, data) {
  return wsNet.sendToPeer(peerId, data, helpSvc.queuePeerMessage);
}

function broadcastToPeers(data, excludeId = null) {
  wsNet.broadcastToPeers(data, excludeId);
}

function flushPendingHelpRequests(targetAdminId = null) {
  helpSvc.flushPendingHelpRequests(
    state.pendingOutgoingHelpRequests,
    state.peers,
    sendToPeer,
    hasAdminAccess,
    doSaveState,
    targetAdminId
  );
}

const windowManager = createWindowManager({
  state,
  getWindowModeConfig,
  appSourceDir: path.join(__dirname, '..')
});

const trayManager = createTrayManager({
  state,
  bus,
  EVENTS,
  hasAdminAccess,
  showMainWindow: windowManager.showMainWindow,
  appSourceDir: path.join(__dirname, '..')
});

function showNotification(title, body) {
  if (/\[[A-Z]+\]\s.+@.+/.test(String(title || ''))) return;
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: !state.soundEnabled });
  n.on('click', windowManager.showMainWindow);
  n.show();
}

const { handleP2PMessage } = createMessageRouter({
  state,
  wsNet,
  helpSvc,
  bus,
  EVENTS,
  hasAdminAccess,
  peerToSafe,
  updateTrayMenu: trayManager.updateTrayMenu,
  doSaveState,
  doSaveHistory,
  flushPendingHelpRequests,
  showNotification,
  showUrgentOverlay: windowManager.showUrgentOverlay,
  showNormalBroadcastPopup: windowManager.showNormalBroadcastPopup,
  showHelpRequestPopup: windowManager.showHelpRequestPopup,
  showForcedVideoWindow: windowManager.showForcedVideoWindow,
  closeForcedVideoWindow: windowManager.closeForcedVideoWindow,
  showLockScreen: windowManager.showLockScreen,
  unlockScreen: windowManager.unlockScreen
});

const { startNetworkMonitor } = createNetworkMonitor({ state, bus, EVENTS });

const peerSession = createPeerSession({
  state,
  wsNet,
  udp,
  bus,
  EVENTS,
  peerToSafe,
  updateTrayMenu: trayManager.updateTrayMenu,
  hasAdminAccess,
  helpSvc,
  broadcastToRenderer,
  handleP2PMessage,
  flushPendingHelpRequests
});

const adminOrchestrator = createAdminOrchestrator({
  state,
  wsNet,
  helpSvc,
  hasAdminAccess,
  isSuperAdmin,
  sendToPeer,
  broadcastToPeers,
  doSaveState,
  updateTrayMenu: trayManager.updateTrayMenu,
  showMainWindow: windowManager.showMainWindow,
  closeHelpPopup: (reqId) => {
    const popup = state.helpPopupWindows.get(reqId);
    if (popup && !popup.isDestroyed()) popup.close();
    state.helpPopupWindows.delete(reqId);
  },
  bus,
  EVENTS,
  uuidv4
});

registerIpcHandlers({
  ipcMain,
  BrowserWindow,
  app,
  dialog,
  fs,
  path,
  os,
  uuidv4,
  storage,
  wsNet,
  udp,
  helpSvc,
  bus,
  EVENTS,
  captureScreenshot,
  state,
  hasAdminAccess,
  adminOrchestrator,
  sendToPeer,
  broadcastToPeers,
  doSaveHistory,
  doSaveState,
  updateTrayMenu: trayManager.updateTrayMenu,
  applyWindowMode: windowManager.applyWindowMode,
  closeOverlayWindow: windowManager.closeOverlayWindow
});

registerLifecycle({
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
  startPeerSession: peerSession.start,
  createMainWindow: windowManager.createMainWindow,
  createTray: trayManager.createTray,
  bus,
  setRendererBridge: (bridge) => bus.setRendererBridge(bridge),
  broadcastToRenderer,
  doSaveHistory,
  doSaveState
});
