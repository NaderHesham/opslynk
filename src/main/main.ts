import { app, ipcMain, Notification, dialog, BrowserWindow } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { AppRuntimeState } from '../shared/types/runtime';

const storage = require('../../src/storage/storageService') as {
  saveProfile: (profile: unknown) => void;
  loadProfile: () => unknown;
  loadDevices: () => { self?: { deviceId?: string } };
};
const { getOrCreateDeviceIdentity, buildDefaultProfile } = require('../../src/services/deviceIdentity') as {
  getOrCreateDeviceIdentity: (ip: string) => { deviceId: string };
  buildDefaultProfile: (record: { deviceId: string }) => Record<string, unknown>;
};
const { createReliableTransport } = require('../../src/services/reliableTransport') as {
  createReliableTransport: (deps: {
    state: AppRuntimeState;
    sendToPeer: (peerId: string, payload: Record<string, unknown>) => unknown;
    broadcastToRenderer: (event: string, data: unknown) => void;
    doSaveState: () => void;
  }) => {
    track: (params: {
      kind: 'chat-direct' | 'help-request';
      peerId: string;
      payload: Record<string, unknown>;
      persist?: boolean;
      maxAttempts?: number;
      retryDelaysMs?: number[];
    }) => boolean;
    confirm: (msgId: string) => boolean;
    notifyPeerAvailable: (peerId: string) => void;
    hydrate: () => void;
  };
};
const {
  ensureDeviceCredentials,
  attachIdentityToProfile,
  createSignedPeerIdentity,
  verifySignedPeerIdentity
} = require('../../src/services/deviceAuth') as {
  ensureDeviceCredentials: (record: { deviceId: string }) => { deviceId: string; auth?: Record<string, string> };
  attachIdentityToProfile: (profile: Record<string, unknown>, record: { deviceId: string; auth?: Record<string, string> }) => Record<string, unknown>;
  createSignedPeerIdentity: (profile: Record<string, unknown>, port: number) => Record<string, unknown>;
  verifySignedPeerIdentity: (identity: Record<string, unknown>) => { valid: boolean; fingerprint?: string; reason?: string };
};
const { getSystemInfo, getPrimaryNetworkInfo } = require('../../src/system/systemInfo') as {
  getSystemInfo: () => Record<string, unknown>;
  getPrimaryNetworkInfo: () => { ip: string };
};
const { captureScreenshot } = require('../../src/system/screenshotService') as {
  captureScreenshot: (
    win: unknown,
    options?: { hideWindow?: boolean; persistToDisk?: boolean }
  ) => Promise<{ base64: string; name: string; size: number } | null>;
};
const wsNet = require('../../src/network/wsServer') as {
  CHAT_PORT_BASE: number;
  safeSend: (ws: unknown, payload: Record<string, unknown>) => void;
  sendToPeer: (peerId: string, payload: Record<string, unknown>, queueFn: (peerId: string, payload: Record<string, unknown>) => void) => unknown;
  broadcastToPeers: (payload: Record<string, unknown>, excludeId?: string | null) => void;
  broadcastToSelectedPeers: (peerIds: string[] | null | undefined, payload: Record<string, unknown>) => void;
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

const { CONTROL_ROLE, CONTROL_USERNAME, getWindowModeConfig, APP_MODE } = require('./config/constants') as typeof import('./config/constants');
const { createAppState } = require('./state/createAppState') as typeof import('./state/createAppState');
const { createStateOwners } = require('./state/owners') as typeof import('./state/owners');
const { hasAdminAccess, isSuperAdmin, peerToSafe } = require('./utils/roles') as typeof import('./utils/roles');
const { createPersistence } = require('../../src/main/storage/persistence');
const { createWindowManager } = require('./windows/windowManager') as typeof import('./windows/windowManager');
const { createTrayManager } = require('../../src/main/tray/trayManager');
const { createNetworkMonitor } = require('../../src/main/network/networkMonitor');
const { createMessageRouter } = require('./network/messageRouter') as typeof import('./network/messageRouter');
const { createPeerSession } = require('../../src/main/network/peerSession');
const { createScreenshotPollingManager } = require('./screenshot/screenshotPolling') as typeof import('./screenshot/screenshotPolling');
const { registerLifecycle } = require('../../src/main/bootstrap/lifecycle');
const { registerClientHandlers } = require('./ipc/registerClientHandlers') as typeof import('./ipc/registerClientHandlers');
const { registerFullHandlers } = require('./ipc/registerFullHandlers') as typeof import('./ipc/registerFullHandlers');
const { createAdminModule } = require('./admin') as typeof import('./admin');
const { createFileAuditSink } = require('./audit/fileAuditSink') as typeof import('./audit/fileAuditSink');
const { createTrustStore } = require('./security/trustStore') as typeof import('./security/trustStore');
const { createDeviceTrust } = require('./security/deviceTrust') as typeof import('./security/deviceTrust');
const authService = require('../../src/services/authService') as { isFirstRun: () => boolean; listUsers?: () => Array<{ id?: string }> };

const state: AppRuntimeState = createAppState(wsNet.CHAT_PORT_BASE);
const owners = createStateOwners(state);
const { doSaveState, doSaveHistory } = createPersistence({ storage, state: owners.recordsState });
const appSourceDir = path.resolve(__dirname, '../../src');
const auditSink = createFileAuditSink({ app, fs, path });
const trustStore = createTrustStore({ app, fs, path, hasAdminAccess });
const deviceTrust = createDeviceTrust({ hasAdminAccess, trustStore });

function ensureControlProfile(): void {
  if (!state.myProfile) return;
  if (APP_MODE === 'admin') {
    state.myProfile.role = CONTROL_ROLE;
    if (!state.myProfile.username || /^device-/i.test(state.myProfile.username)) {
      state.myProfile.username = CONTROL_USERNAME;
    }
    return;
  }

  state.myProfile.role = 'user';
  const currentTitle = String(state.myProfile.title || '').trim();
  if (
    !currentTitle ||
    ['Super Administrator', 'Administrator', 'Super Admin', 'Admin', 'User'].includes(currentTitle)
  ) {
    state.myProfile.title = 'Team Member';
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

function hasRememberedAdminSession(): boolean {
  if (APP_MODE !== 'admin') return false;
  try {
    const profile = storage.loadProfile() as { authUserId?: string; rememberMe?: boolean } | null;
    if (!profile?.rememberMe || !profile?.authUserId) return false;
    const users = authService.listUsers?.() || [];
    return users.some(user => user?.id === profile.authUserId);
  } catch {
    return false;
  }
}

function flushPendingHelpRequests(targetAdminId: string | null = null): void {
  helpSvc.flushPendingHelpRequests(
    state.pendingOutgoingHelpRequests,
    state.peers,
    sendToPeer,
    hasAdminAccess,
    doSaveState,
    targetAdminId,
    reliableTransport
  );
}

const reliableTransport = createReliableTransport({
  state,
  sendToPeer,
  broadcastToRenderer,
  doSaveState
});

const windowManager = createWindowManager({
  state: owners.windowState,
  getWindowModeConfig,
  appSourceDir,
  getStartPage: () => {
    if (APP_MODE !== 'admin') return 'index.html';
    if (authService.isFirstRun()) return 'setup.html';
    if (hasRememberedAdminSession()) return 'index.html';
    return 'login.html';
  }
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
  unlockScreen: windowManager.unlockScreen,
  buildSignedPeerIdentity: createSignedPeerIdentity,
  verifySignedPeerIdentity,
  evaluateControlMessageTrust: deviceTrust.evaluateIncomingControl,
  rememberTrustedPeer: trustStore.rememberPeer,
  reliableTransport,
  onTrustDecision: auditSink.onAuditEntry,
  captureScreenshot: (options?: { hideWindow?: boolean; persistToDisk?: boolean }) =>
    captureScreenshot(state.mainWindow, options)
});

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
  flushPendingHelpRequests,
  buildSignedPeerIdentity: createSignedPeerIdentity,
  reliableTransport
});

const { startNetworkMonitor } = createNetworkMonitor({
  state: owners.sessionState,
  bus,
  EVENTS,
  broadcastToRenderer,
  onNetworkRestored: peerSession.recoverPeers
});

const screenshotPollingManager = createScreenshotPollingManager({
  state: owners.sessionState,
  sendToPeer,
  hasAdminAccess,
  uuidv4,
  broadcastToRenderer,
  peerToSafe
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
  path,
  onAuditEntry: auditSink.onAuditEntry,
  buildCommandOrigin: (commandType: string) => deviceTrust.buildOrigin({
    issuerId: String(state.myProfile?.id || ''),
    issuerRole: String(state.myProfile?.role || ''),
    commandType
  })
});

ipcMain.handle('get-app-mode', () => APP_MODE);
ipcMain.handle('get-screenshot-polling', () => screenshotPollingManager.getSnapshot());
ipcMain.handle('set-screenshot-polling', (_event, payload: { enabled?: boolean; mode?: 'normal' | 'fast' | 'live' } = {}) => {
  if (typeof payload.enabled === 'boolean') screenshotPollingManager.setEnabled(payload.enabled);
  if (payload.mode === 'normal' || payload.mode === 'fast' || payload.mode === 'live') screenshotPollingManager.setMode(payload.mode);
  return screenshotPollingManager.getSnapshot();
});
ipcMain.handle('auth:logout', async () => {
  if (APP_MODE !== 'admin') return { success: false, error: 'Logout is only available in admin mode.' };
  const profile = storage.loadProfile() as { authUserId?: string; rememberMe?: boolean; role?: string } | null;
  if (profile && typeof profile === 'object') {
    delete profile.authUserId;
    profile.rememberMe = false;
    if (profile.role && profile.role !== 'super_admin' && profile.role !== 'admin') profile.role = 'user';
    storage.saveProfile(profile);
    if (state.myProfile) {
      delete (state.myProfile as { authUserId?: string }).authUserId;
      (state.myProfile as { rememberMe?: boolean }).rememberMe = false;
    }
  }
  trayManager.updateTrayMenu();
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    await state.mainWindow.loadFile(path.join(appSourceDir, 'renderer', 'login.html'));
    windowManager.applyWindowMode('main');
    state.mainWindow.center();
    state.mainWindow.show();
    state.mainWindow.focus();
  }
  return { success: true };
});

const _ipcDeps = {
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
  closeOverlayWindow: windowManager.closeOverlayWindow,
  broadcastToRenderer,
  reliableTransport
};

if (APP_MODE === 'admin') {
  registerFullHandlers(_ipcDeps);
  screenshotPollingManager.start();
} else {
  registerClientHandlers(_ipcDeps);
}

const { unblockInput } = require('../../src/services/inputBlocker') as { unblockInput: () => void };
app.on('before-quit', () => {
  screenshotPollingManager.stop();
  unblockInput();
  windowManager.destroyPreloadedWindows();
});

registerLifecycle({
  app,
  process,
  storage,
  state: owners.lifecycleState,
  getPrimaryNetworkInfo,
  getOrCreateDeviceIdentity,
  ensureDeviceCredentials,
  attachIdentityToProfile,
  buildDefaultProfile,
  getSystemInfo,
  ensureControlProfile,
  startNetworkMonitor,
  startPeerSession: peerSession.start,
  createMainWindow: windowManager.createMainWindow,
  initPreloadedWindows: windowManager.initPreloadedWindows,
  createTray: trayManager.createTray,
  bus,
  setRendererBridge: (bridge: (event: string, data: unknown) => void) => bus.setRendererBridge(bridge),
  broadcastToRenderer,
  doSaveHistory,
  doSaveState,
  hydrateReliableTransport: reliableTransport.hydrate
});
