import { app, ipcMain, Notification, dialog, BrowserWindow } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { AppRuntimeState } from '../shared/types/runtime';

const storage = require('../../src/storage/storageService') as {
  saveProfile: (profile: unknown) => void;
  loadDevices: () => { self?: { deviceId?: string } };
};
const { getOrCreateDeviceIdentity, buildDefaultProfile } = require('../../src/services/deviceIdentity') as {
  getOrCreateDeviceIdentity: (ip: string) => { deviceId: string };
  buildDefaultProfile: (record: { deviceId: string }) => Record<string, unknown>;
};
const { getSystemInfo, getPrimaryNetworkInfo } = require('../../src/system/systemInfo') as {
  getSystemInfo: () => Record<string, unknown>;
  getPrimaryNetworkInfo: () => { ip: string };
};
const { captureScreenshot } = require('../../src/system/screenshotService') as {
  captureScreenshot: (win: unknown) => Promise<{ base64: string; name: string; size: number } | null>;
};
const wsNet = require('../../src/network/wsServer') as {
  CHAT_PORT_BASE: number;
  safeSend: (ws: unknown, payload: Record<string, unknown>) => void;
  sendToPeer: (peerId: string, payload: Record<string, unknown>, queueFn: (peerId: string, payload: Record<string, unknown>) => void) => unknown;
  broadcastToPeers: (payload: Record<string, unknown>, excludeId?: string | null) => void;
};
const udp = require('../../src/network/udpDiscovery');
const helpSvc = require('../../src/services/helpService');
const { bus, EVENTS } = require('../../src/services/eventBus') as {
  bus: {
    setRendererBridge: (bridge: (event: string, data: unknown) => void) => void;
    emit: (event: string, payload?: unknown) => void;
  };
  EVENTS: Record<string, string>;
};

const { CONTROL_ROLE, CONTROL_USERNAME, getWindowModeConfig } = require('./config/constants') as typeof import('./config/constants');
const { createAppState } = require('./state/createAppState') as typeof import('./state/createAppState');
const { createStateOwners } = require('./state/owners') as typeof import('./state/owners');
const { hasAdminAccess, isSuperAdmin, peerToSafe } = require('./utils/roles') as typeof import('./utils/roles');
const { createPersistence } = require('../../src/main/storage/persistence');
const { createWindowManager } = require('./windows/windowManager') as typeof import('./windows/windowManager');
const { createTrayManager } = require('../../src/main/tray/trayManager');
const { createNetworkMonitor } = require('../../src/main/network/networkMonitor');
const { createMessageRouter } = require('./network/messageRouter') as typeof import('./network/messageRouter');
const { createPeerSession } = require('../../src/main/network/peerSession');
const { registerLifecycle } = require('../../src/main/bootstrap/lifecycle');
const { registerIpcHandlers } = require('./ipc/registerIpcHandlers') as typeof import('./ipc/registerIpcHandlers');
const { createAdminModule } = require('./admin') as typeof import('./admin');

const state: AppRuntimeState = createAppState(wsNet.CHAT_PORT_BASE);
const owners = createStateOwners(state);
const { doSaveState, doSaveHistory } = createPersistence({ storage, state: owners.recordsState });
const appSourceDir = path.join(process.cwd(), 'src');

function ensureControlProfile(): void {
  if (!state.myProfile) return;
  state.myProfile.role = CONTROL_ROLE;
  if (!state.myProfile.username || /^device-/i.test(state.myProfile.username)) {
    state.myProfile.username = CONTROL_USERNAME;
  }
}

function broadcastToRenderer(event: string, data: unknown): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) state.mainWindow.webContents.send(event, data);
}

function sendToPeer(peerId: string, data: Record<string, unknown>): unknown {
  return wsNet.sendToPeer(peerId, data, helpSvc.queuePeerMessage);
}

function broadcastToPeers(data: Record<string, unknown>, excludeId: string | null = null): void {
  wsNet.broadcastToPeers(data, excludeId);
}

function flushPendingHelpRequests(targetAdminId: string | null = null): void {
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
  state: owners.windowState,
  getWindowModeConfig,
  appSourceDir
});

const trayManager = createTrayManager({
  state: owners.trayState,
  bus,
  EVENTS,
  hasAdminAccess,
  showMainWindow: windowManager.showMainWindow,
  appSourceDir
});

function showNotification(title: string, body: string): void {
  if (/\[[A-Z]+\]\s.+@.+/.test(String(title || ''))) return;
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: !state.soundEnabled });
  n.on('click', windowManager.showMainWindow);
  n.show();
}

const { handleP2PMessage } = createMessageRouter({
  state: owners.networkState,
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

const { startNetworkMonitor } = createNetworkMonitor({ state: owners.sessionState, bus, EVENTS });

const peerSession = createPeerSession({
  state: owners.sessionState,
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

const adminModule = createAdminModule({
  state: owners.adminState,
  wsNet,
  helpSvc,
  hasAdminAccess,
  isSuperAdmin,
  sendToPeer,
  broadcastToPeers,
  doSaveState,
  updateTrayMenu: trayManager.updateTrayMenu,
  showMainWindow: windowManager.showMainWindow,
  closeHelpPopup: (reqId: string) => {
    const popup = state.helpPopupWindows.get(reqId);
    if (popup && !popup.isDestroyed()) popup.close();
    state.helpPopupWindows.delete(reqId);
  },
  bus,
  EVENTS,
  uuidv4,
  app,
  dialog,
  fs,
  path
});

registerIpcHandlers({
  ipcMain,
  BrowserWindow,
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
  state: owners.ipcState,
  hasAdminAccess,
  adminModule,
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
  state: owners.lifecycleState,
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
  setRendererBridge: (bridge: (event: string, data: unknown) => void) => bus.setRendererBridge(bridge),
  broadcastToRenderer,
  doSaveHistory,
  doSaveState
});
