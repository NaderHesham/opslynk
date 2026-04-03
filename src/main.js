// OpsLynk — Main Process (Sprint 0 refactored)
// Bootstrap only: app lifecycle, windows, tray, IPC.
// All business logic lives in src/services / network / storage / system.

const {
  app, BrowserWindow, Tray, Menu, nativeImage,
  ipcMain, Notification, dialog, screen
} = require('electron');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { v4: uuidv4 } = require('uuid');

// ── SERVICES ──────────────────────────────────────────────────────────────────
const storage       = require('./storage/storageService');
const { getOrCreateDeviceIdentity, buildDefaultProfile } = require('./services/deviceIdentity');
const { getSystemInfo, getPrimaryNetworkInfo }                      = require('./system/systemInfo');
const { captureScreenshot }                                         = require('./system/screenshotService');
const wsNet         = require('./network/wsServer');
const udp           = require('./network/udpDiscovery');
const helpSvc       = require('./services/helpService');
const { bus, EVENTS }  = require('./services/eventBus');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const CONTROL_ROLE = 'super_admin';
const CONTROL_USERNAME = 'Local Operator';

// ── STATE ─────────────────────────────────────────────────────────────────────
let myProfile    = null;
const peers      = new Map();
let chatHistory  = {};
let helpRequests = [];
let pendingOutgoingHelpRequests = [];
let userGroups   = [];
let soundEnabled = true;
let networkOnline = false;
let isQuitting   = false;

// mutable port ref — wsServer writes back to this
const myPortRef  = { value: wsNet.CHAT_PORT_BASE };

// windows
let tray                  = null;
let mainWindow            = null;
let overlayWindow         = null;
let overlayState          = null;
let lockWindow            = null;
let screenLocked          = false;
let forcedVideoWindow     = null;
let forcedVideoActive     = false;
const normalBroadcastWindows = new Set();
const helpPopupWindows       = new Map();

const WINDOW_MODES = {
  main:  { width: 1180, height: 740, minWidth: 920, minHeight: 600, resizable: true }
};

function getWindowModeConfig(modeName) {
  return WINDOW_MODES[modeName] || null;
}

// ── ROLE HELPERS ──────────────────────────────────────────────────────────────
function hasAdminAccess(role) { return role === 'admin' || role === 'super_admin'; }
function isSuperAdmin(role)   { return role === 'super_admin'; }
function getRoleRank(role)    { return role === 'super_admin' ? 2 : role === 'admin' ? 1 : 0; }

function peerToSafe(p) {
  return { id: p.id, username: p.username, role: p.role, color: p.color,
           title: p.title, online: p.online, avatar: p.avatar || null,
           systemInfo: p.systemInfo || null };
}

function ensureControlProfile() {
  if (!myProfile) return;
  myProfile.role = CONTROL_ROLE;
  if (!myProfile.username || /^device-/i.test(myProfile.username)) {
    myProfile.username = CONTROL_USERNAME;
  }
}

// ── RENDERER BRIDGE ───────────────────────────────────────────────────────────
// Keep legacy broadcastToRenderer for direct sends not going through the bus
function broadcastToRenderer(event, data) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(event, data);
}

// ── SAVE HELPERS ──────────────────────────────────────────────────────────────
function doSaveState() {
  storage.saveState({ helpRequests, pendingOutgoingHelpRequests, userGroups });
}
function doSaveHistory() { storage.saveHistory(chatHistory); }

// ── SEND WRAPPERS (bound to state) ────────────────────────────────────────────
function sendToPeer(peerId, data) {
  return wsNet.sendToPeer(peerId, data, helpSvc.queuePeerMessage);
}
function broadcastToPeers(data, excludeId = null) {
  wsNet.broadcastToPeers(data, excludeId);
}

// ── HELP FLUSH ────────────────────────────────────────────────────────────────
function flushPendingHelpRequests(targetAdminId = null) {
  helpSvc.flushPendingHelpRequests(
    pendingOutgoingHelpRequests, peers, sendToPeer,
    hasAdminAccess, doSaveState, targetAdminId
  );
}

// ── P2P MESSAGE HANDLER ───────────────────────────────────────────────────────
function handleP2PMessage(ws, msg, remoteIp) {
  const { type } = msg;

  // update lastSeen for sender
  for (const [, peer] of peers) {
    if (peer.ws === ws) { peer.lastSeen = Date.now(); peer.online = true; break; }
  }

  if (type === 'hello' || type === 'hello-ack') {
    const p = msg.from;
    if (!p || p.id === myProfile.id) return;
    let peer = peers.get(p.id);
    if (!peer) {
      peer = { ...p, ip: remoteIp, port: p.port || wsNet.CHAT_PORT_BASE, ws, online: true, lastSeen: Date.now() };
      peers.set(p.id, peer);
    } else {
      Object.assign(peer, { ...p, ip: remoteIp, ws, online: true, lastSeen: Date.now() });
    }
    bus.emit(EVENTS.DEVICE_UPDATED, peerToSafe(peer));
    updateTrayMenu();
    if (type === 'hello') wsNet.safeSend(ws, { type: 'hello-ack', from: { ...myProfile, port: myPortRef.value } });
  }

  else if (type === 'chat') {
    const { fromId, text, emoji, msgId, timestamp } = msg;
    const peer = peers.get(fromId);
    if (!peer) return;
    if (!chatHistory[fromId]) chatHistory[fromId] = [];
    const entry = { id: msgId, fromId, text, emoji, timestamp, mine: false };
    chatHistory[fromId].push(entry);
    doSaveHistory();
    bus.emit(EVENTS.NETWORK_MESSAGE, { peerId: fromId, message: entry });
    if (soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'message' });
    showNotification(`${peer.username}`, text || emoji || '');
  }

  else if (type === 'chat-file') {
    const { fromId, msgId, timestamp, attachment } = msg;
    const peer = peers.get(fromId);
    if (!peer || !attachment?.name || !attachment?.data) return;
    if (!chatHistory[fromId]) chatHistory[fromId] = [];
    const entry = { id: msgId, fromId, timestamp, mine: false, attachment };
    chatHistory[fromId].push(entry);
    doSaveHistory();
    bus.emit(EVENTS.NETWORK_MESSAGE, { peerId: fromId, message: entry });
    if (soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'message' });
    showNotification(`File from ${peer.username}`, attachment.name);
  }

  else if (type === 'broadcast') {
    const peer = peers.get(msg.fromId) || { username: 'Admin' };
    const data = { ...msg, fromName: peer.username };
    bus.emit(EVENTS.NETWORK_BROADCAST, data);
    if (msg.urgency === 'urgent') showUrgentOverlay(data);
    else {
      showNormalBroadcastPopup(data);
      if (soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'broadcast' });
    }
  }

  else if (type === 'ack') {
    const peer = peers.get(msg.fromId);
    bus.emit(EVENTS.NETWORK_ACK, { fromId: msg.fromId, broadcastId: msg.broadcastId, username: peer?.username });
  }

  else if (type === 'broadcast-reply') {
    const peer = peers.get(msg.fromId);
    bus.emit(EVENTS.NETWORK_REPLY, { ...msg, username: peer?.username });
    if (hasAdminAccess(myProfile.role)) {
      if (soundEnabled) bus.emit(EVENTS.PLAY_SOUND, { type: 'message' });
      showNotification(`Reply from ${peer?.username}`, msg.text);
    }
  }

  else if (type === 'help-request') {
    const req  = { ...msg, status: 'open' };
    const prio = msg.priority || 'normal';
    helpSvc.upsertHelpRequest(helpRequests, req, doSaveState);
    bus.emit(EVENTS.HELP_REQUEST, req);
    if (hasAdminAccess(myProfile.role)) {
      showHelpRequestPopup(req);
      showNotification(`[${prio}] ${msg.username} @ ${msg.machine}`, msg.description);
    }
    updateTrayMenu();
  }

  else if (type === 'help-ack') {
    bus.emit(EVENTS.HELP_ACKED, { reqId: msg.reqId, fromId: msg.fromId });
  }

  else if (type === 'profile-update') {
    const peer = peers.get(msg.id);
    if (peer) {
      Object.assign(peer, {
        color     : msg.color,
        title     : msg.title,
        username  : msg.username,
        avatar    : msg.avatar,
        role      : msg.role      || peer.role,
        systemInfo: msg.systemInfo || peer.systemInfo || null
      });
      if (hasAdminAccess(peer.role) && peer.ws?.readyState === 1) flushPendingHelpRequests(peer.id);
      bus.emit(EVENTS.DEVICE_UPDATED, peerToSafe(peer));
    }
  }

  else if (type === 'forced-video-broadcast') {
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
  }

  else if (type === 'forced-video-broadcast-stop') {
    closeForcedVideoWindow(true);
  }

  else if (type === 'screen-lock') {
    const sender = peers.get(msg.fromId);
    if (!sender || !hasAdminAccess(sender.role)) return;
    showLockScreen(msg.message || '');
    bus.emit(EVENTS.SCREEN_LOCKED, { fromId: msg.fromId, message: msg.message });
  }

  else if (type === 'screen-unlock') {
    const sender = peers.get(msg.fromId);
    if (!sender || !hasAdminAccess(sender.role)) return;
    unlockScreen();
    bus.emit(EVENTS.SCREEN_UNLOCKED, { fromId: msg.fromId });
  }
}

// ── NETWORK STATUS ────────────────────────────────────────────────────────────
function hasLiveNetwork() {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface || []) {
      if (!addr.internal && (addr.family === 'IPv4' || addr.family === 4 ||
                              addr.family === 'IPv6' || addr.family === 6)) return true;
    }
  }
  return false;
}

function startNetworkMonitor() {
  networkOnline = hasLiveNetwork();
  setInterval(() => {
    const next = hasLiveNetwork();
    if (next === networkOnline) return;
    networkOnline = next;
    bus.emit(EVENTS.NETWORK_STATUS, { online: networkOnline });
  }, 2500);
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
function showNotification(title, body) {
  if (/\[[A-Z]+\]\s.+@.+/.test(String(title || ''))) return;
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: !soundEnabled });
  n.on('click', showMainWindow);
  n.show();
}

// ── TRAY ──────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray.png');
  let icon;
  try { icon = nativeImage.createFromPath(iconPath); } catch { icon = nativeImage.createEmpty(); }
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJUlEQVQ4jWNgYGD4z0ABYBo1gHoAAAAAAP//AwBkAAH/AAAAAElFTkSuQmCC'
    );
  }
  tray = new Tray(icon);
  tray.setToolTip('OpsLynk');
  updateTrayMenu();
  tray.on('double-click', showMainWindow);
  tray.on('click', showMainWindow);
}

function updateTrayMenu() {
  const online      = [...peers.values()].filter(p => p.online).length;
  const pendingHelp = helpRequests.filter(r => r.status === 'open').length;
  const items = [
    { label: `OpsLynk - ${myProfile?.username || '...'}`, enabled: false },
    { label: `${online} peer${online !== 1 ? 's' : ''} online`, enabled: false },
    { type: 'separator' }
  ];
  if (hasAdminAccess(myProfile?.role)) {
    items.push({ label: `Help Requests${pendingHelp ? ` (${pendingHelp})` : ''}`, click: () => { showMainWindow(); setTimeout(() => bus.emit(EVENTS.GOTO_TAB, 'help'), 400); } });
    items.push({ label: 'Send Broadcast', click: () => { showMainWindow(); setTimeout(() => bus.emit(EVENTS.GOTO_TAB, 'broadcast'), 400); } });
    items.push({ label: 'Open Chat', click: showMainWindow });
  } else {
    items.push({ label: 'Ask For Help', click: () => { showMainWindow(); setTimeout(() => bus.emit(EVENTS.GOTO_TAB, 'ask'), 400); } });
    items.push({ label: 'Open Chat', click: showMainWindow });
  }
  items.push({ type: 'separator' });
  items.push({ label: soundEnabled ? 'Sound ON' : 'Sound OFF', click: () => { soundEnabled = !soundEnabled; updateTrayMenu(); } });
  items.push({ type: 'separator' });
  items.push({ label: 'Quit OpsLynk', click: () => app.quit() });

  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.setToolTip(
    pendingHelp > 0 && hasAdminAccess(myProfile?.role)
      ? `OpsLynk - ${pendingHelp} help request${pendingHelp > 1 ? 's' : ''} pending`
      : `OpsLynk - ${online} online`
  );
}

// ── WINDOWS ───────────────────────────────────────────────────────────────────
function createMainWindow() {
  const mode = getWindowModeConfig('main');
  mainWindow = new BrowserWindow({
    width: mode.width, height: mode.height, minWidth: mode.minWidth, minHeight: mode.minHeight,
    frame: false, transparent: false, backgroundColor: '#0b0d12',
    show: false,
    resizable: mode.resizable,
    maximizable: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => { mainWindow.center(); mainWindow.show(); });
  mainWindow.on('close', e => { if (isQuitting) return; e.preventDefault(); mainWindow.hide(); });
}

function applyWindowMode(modeName) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const mode = getWindowModeConfig(modeName);
  if (!mode) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  mainWindow.setResizable(mode.resizable);
  mainWindow.setMinimumSize(mode.minWidth, mode.minHeight);
  mainWindow.setSize(mode.width, mode.height);
  mainWindow.center();
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function closeOverlayWindow(force = false) {
  if (!overlayWindow || overlayWindow.isDestroyed()) { overlayWindow = null; overlayState = null; return; }
  const win = overlayWindow;
  overlayWindow = null; overlayState = null;
  if (force) { try { win.removeAllListeners('close'); } catch {} try { win.destroy(); } catch {} return; }
  win.close();
}

function showNormalBroadcastPopup(data) {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 360, height = 188;
  const gap   = 16;
  const x = Math.round(workArea.x + workArea.width  - width  - 18);
  const y = Math.round(workArea.y + workArea.height - height - 18 - normalBroadcastWindows.size * (height + gap));
  const popup = new BrowserWindow({
    width, height, x, y, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false,
    transparent: true, backgroundColor: '#00000000',
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  normalBroadcastWindows.add(popup);
  popup.loadFile(path.join(__dirname, 'renderer', 'toast.html'));
  popup.once('ready-to-show', () => { popup.showInactive(); popup.webContents.send('broadcast-popup-data', data); });
  popup.on('closed', () => normalBroadcastWindows.delete(popup));
}

function showUrgentOverlay(data) {
  if (overlayWindow) closeOverlayWindow(true);
  overlayState = { mode: 'urgent', data, broadcastId: data.broadcastId };
  const { bounds } = screen.getPrimaryDisplay();
  overlayWindow = new BrowserWindow({
    width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y,
    frame: false, alwaysOnTop: true, skipTaskbar: true, fullscreen: true,
    movable: false, minimizable: false, maximizable: false, closable: false,
    backgroundColor: 'rgba(0,0,0,0.88)', transparent: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'urgent.html'));
  overlayWindow.once('ready-to-show', () => {
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.show(); overlayWindow.focus(); overlayWindow.moveTop();
    overlayWindow.webContents.send('urgent-data', data);
  });
  overlayWindow.on('closed', () => { overlayWindow = null; overlayState = null; });
}

function showHelpRequestPopup(req) {
  const existing = helpPopupWindows.get(req.reqId);
  if (existing && !existing.isDestroyed()) existing.close();
  helpPopupWindows.delete(req.reqId);

  const { workArea } = screen.getPrimaryDisplay();
  const width = 400, height = 260, gap = 16;
  const x = Math.round(workArea.x + workArea.width  - width  - 18);
  const y = Math.round(workArea.y + workArea.height - height - 18 - helpPopupWindows.size * (height + gap));
  const popup = new BrowserWindow({
    width, height, x, y, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false,
    transparent: true, backgroundColor: '#00000000',
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  helpPopupWindows.set(req.reqId, popup);
  popup.loadFile(path.join(__dirname, 'renderer', 'help-popup.html'));
  popup.once('ready-to-show', () => { popup.showInactive(); popup.webContents.send('help-popup-data', req); });
  popup.on('closed', () => helpPopupWindows.delete(req.reqId));
}

function showLockScreen(message) {
  if (lockWindow && !lockWindow.isDestroyed()) return;
  const { bounds } = screen.getPrimaryDisplay();
  lockWindow = new BrowserWindow({
    width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y,
    frame: false, fullscreen: false, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    closable: false, kiosk: true, backgroundColor: '#05070d',
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  lockWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  lockWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  lockWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  lockWindow.on('close', e => { if (screenLocked) e.preventDefault(); });
  lockWindow.on('move',   () => { if (screenLocked) lockWindow.setBounds(bounds); });
  lockWindow.on('resize', () => { if (screenLocked) lockWindow.setBounds(bounds); });
  lockWindow.loadFile(path.join(__dirname, 'renderer', 'lockscreen.html'));
  lockWindow.once('ready-to-show', () => {
    lockWindow.show();
    lockWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    lockWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    lockWindow.focus(); lockWindow.moveTop();
    lockWindow.webContents.send('lockscreen-data', {
      message  : message || 'Your screen has been locked by the administrator.',
      lockedAt : new Date().toISOString()
    });
  });
  lockWindow.on('closed', () => { lockWindow = null; });
  screenLocked = true;
}

function unlockScreen() {
  screenLocked = false;
  if (lockWindow && !lockWindow.isDestroyed()) {
    try { lockWindow.removeAllListeners('close'); } catch {}
    try { lockWindow.destroy(); } catch {}
    lockWindow = null;
  }
}

function showForcedVideoWindow(data) {
  forcedVideoActive = true;
  if (forcedVideoWindow && !forcedVideoWindow.isDestroyed()) {
    forcedVideoWindow.webContents.send('forced-video-data', data);
    forcedVideoWindow.show();
    forcedVideoWindow.focus();
    forcedVideoWindow.moveTop();
    return;
  }
  const { bounds } = screen.getPrimaryDisplay();
  forcedVideoWindow = new BrowserWindow({
    width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y,
    frame: false, fullscreen: true, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    closable: false, kiosk: false, backgroundColor: '#03060c',
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  forcedVideoWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  forcedVideoWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  forcedVideoWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  forcedVideoWindow.on('close', e => { if (forcedVideoActive) e.preventDefault(); });
  forcedVideoWindow.on('move', () => { if (forcedVideoActive) forcedVideoWindow.setBounds(bounds); });
  forcedVideoWindow.on('resize', () => { if (forcedVideoActive) forcedVideoWindow.setBounds(bounds); });
  forcedVideoWindow.loadFile(path.join(__dirname, 'renderer', 'forced-video.html'));
  forcedVideoWindow.once('ready-to-show', () => {
    forcedVideoWindow.show();
    forcedVideoWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    forcedVideoWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    forcedVideoWindow.focus();
    forcedVideoWindow.moveTop();
    forcedVideoWindow.webContents.send('forced-video-data', data);
  });
  forcedVideoWindow.on('closed', () => { forcedVideoWindow = null; forcedVideoActive = false; });
}

function closeForcedVideoWindow(force = false) {
  forcedVideoActive = false;
  if (forcedVideoWindow && !forcedVideoWindow.isDestroyed()) {
    try { forcedVideoWindow.webContents.send('forced-video-stop'); } catch {}
    if (force) {
      try { forcedVideoWindow.removeAllListeners('close'); } catch {}
      try { forcedVideoWindow.destroy(); } catch {}
      forcedVideoWindow = null;
    } else {
      forcedVideoWindow.close();
    }
  }
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('get-init-data', () => ({
  profile      : myProfile,
  peers        : [...peers.values()].map(peerToSafe),
  history      : chatHistory,
  helpRequests,
  userGroups,
  hostname     : os.hostname(),
  networkReady : !!(udp.getSocket()) && !!myPortRef.value,
  networkOnline
}));

ipcMain.handle('send-chat', (e, { peerId, text, emoji }) => {
  const msgId     = uuidv4();
  const timestamp = new Date().toISOString();
  sendToPeer(peerId, { type: 'chat', fromId: myProfile.id, text, emoji, msgId, timestamp });
  const entry = { id: msgId, fromId: myProfile.id, text, emoji, timestamp, mine: true };
  if (!chatHistory[peerId]) chatHistory[peerId] = [];
  chatHistory[peerId].push(entry);
  doSaveHistory();
  return { success: true, message: entry };
});

ipcMain.handle('send-file-offer', async (e, { peerId }) => {
  const peer = peers.get(peerId);
  if (!peer) return { success: false, error: 'Peer not found.' };
  const result = await dialog.showOpenDialog({ title: 'Choose a file to send', properties: ['openFile'] });
  if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
  const filePath = result.filePaths[0];
  const stat     = fs.statSync(filePath);
  if (stat.size > 10 * 1024 * 1024) return { success: false, error: 'Files larger than 10 MB are not supported yet.' };
  const attachment = {
    name: path.basename(filePath),
    size: stat.size,
    mime: 'application/octet-stream',
    data: fs.readFileSync(filePath).toString('base64')
  };
  const msgId     = uuidv4();
  const timestamp = new Date().toISOString();
  sendToPeer(peerId, { type: 'chat-file', fromId: myProfile.id, msgId, timestamp, attachment });
  const entry = { id: msgId, fromId: myProfile.id, timestamp, mine: true, attachment };
  if (!chatHistory[peerId]) chatHistory[peerId] = [];
  chatHistory[peerId].push(entry);
  doSaveHistory();
  return { success: true, message: entry };
});

ipcMain.handle('send-broadcast', (e, { text, urgency, durationSeconds, peerIds = null }) => {
  if (!hasAdminAccess(myProfile.role)) return { success: false, error: 'Admin only.' };
  const broadcastId = uuidv4();
  const timestamp   = new Date().toISOString();
  const targetPeers = helpSvc.getTargetPeers(peers, peerIds);
  wsNet.broadcastToSelectedPeers(peerIds, { type: 'broadcast', fromId: myProfile.id, text, urgency, durationSeconds, broadcastId, timestamp });
  return { broadcastId, targetCount: targetPeers.length };
});

ipcMain.handle('select-video-broadcast-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose video for forced playback',
    properties: ['openFile'],
    filters: [{ name: 'Video Files', extensions: ['mp4', 'webm', 'm4v', 'mov'] }]
  });
  if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
  const filePath = result.filePaths[0];
  const stat = fs.statSync(filePath);
  if (stat.size > 30 * 1024 * 1024) {
    return { success: false, error: 'Video must be 30 MB or smaller.' };
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.webm' ? 'video/webm'
    : ext === '.mov' ? 'video/quicktime'
    : ext === '.m4v' ? 'video/mp4'
    : 'video/mp4';
  return {
    success: true,
    fileName: path.basename(filePath),
    size: stat.size,
    mime,
    data: fs.readFileSync(filePath).toString('base64')
  };
});

ipcMain.handle('send-forced-video-broadcast', (e, { videoB64, mime, fileName, label, peerIds = null }) => {
  if (!hasAdminAccess(myProfile.role)) return { success: false, error: 'Admin only.' };
  if (!videoB64) return { success: false, error: 'No video selected.' };
  const broadcastId = uuidv4();
  const timestamp = new Date().toISOString();
  wsNet.broadcastToSelectedPeers(peerIds, {
    type: 'forced-video-broadcast',
    fromId: myProfile.id,
    fromName: myProfile.username,
    videoB64,
    mime: mime || 'video/mp4',
    fileName: fileName || 'broadcast-video',
    label: label || '',
    broadcastId,
    timestamp
  });
  const targetPeers = helpSvc.getTargetPeers(peers, peerIds);
  return { success: true, broadcastId, targetCount: targetPeers.length };
});

ipcMain.handle('stop-forced-video-broadcast', (e, { broadcastId, peerIds = null } = {}) => {
  if (!hasAdminAccess(myProfile.role)) return { success: false, error: 'Admin only.' };
  wsNet.broadcastToSelectedPeers(peerIds, {
    type: 'forced-video-broadcast-stop',
    fromId: myProfile.id,
    broadcastId: broadcastId || null,
    timestamp: new Date().toISOString()
  });
  return { success: true };
});

ipcMain.handle('send-ack', (e, { peerId, broadcastId }) => {
  sendToPeer(peerId, { type: 'ack', fromId: myProfile.id, broadcastId });
  closeOverlayWindow(true);
});

ipcMain.handle('send-broadcast-reply', (e, { peerId, text, broadcastId }) => {
  sendToPeer(peerId, { type: 'broadcast-reply', fromId: myProfile.id, text, broadcastId });
  closeOverlayWindow(true);
});

ipcMain.handle('send-help-request', async (e, { description, priority, includeScreenshot }) => {
  const reqId     = uuidv4();
  const timestamp = new Date().toISOString();
  let screenshotB64 = null, screenshotName = null, screenshotSize = 0;
  if (includeScreenshot) {
    const ss = await captureScreenshot(mainWindow);
    if (ss) { screenshotB64 = ss.base64; screenshotName = ss.name; screenshotSize = ss.size; }
  }
  const msg = {
    type: 'help-request',
    fromId: myProfile.id, username: myProfile.username, machine: os.hostname(),
    description, priority, reqId, timestamp,
    screenshotB64, screenshotName, screenshotSize
  };
  const queuedRequest = { ...msg, deliveredAdminIds: [], createdAt: timestamp };
  let sent = 0;
  for (const [, peer] of peers) {
    if (hasAdminAccess(peer.role) && helpSvc.deliverHelpRequestToAdmin(peer, queuedRequest, sendToPeer, hasAdminAccess, doSaveState)) sent++;
  }
  if (sent === 0) { pendingOutgoingHelpRequests.unshift(queuedRequest); doSaveState(); }
  return { reqId, sent, queued: sent === 0, hasScreenshot: !!screenshotB64 };
});

ipcMain.handle('capture-screenshot-preview', async () => {
  if (!hasAdminAccess(myProfile.role)) return null;
  const ss = await captureScreenshot(mainWindow);
  return ss ? { base64: ss.base64, name: ss.name, size: ss.size } : null;
});

ipcMain.handle('select-avatar', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose profile picture', properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
  });
  if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
  const filePath = result.filePaths[0];
  if (fs.statSync(filePath).size > 4 * 1024 * 1024) return { success: false, error: 'Profile image must be 4 MB or smaller.' };
  const ext  = path.extname(filePath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
             : ext === '.webp' ? 'image/webp'
             : ext === '.bmp'  ? 'image/bmp'
             : 'image/png';
  return { success: true, avatar: `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}` };
});

ipcMain.handle('ack-help', (e, { peerId, reqId }) => {
  if (!hasAdminAccess(myProfile.role)) return { success: false, error: 'Admin only.' };
  sendToPeer(peerId, { type: 'help-ack', fromId: myProfile.id, reqId });
  const req = helpRequests.find(r => r.reqId === reqId);
  if (req) req.status = 'acked';
  const popup = helpPopupWindows.get(reqId);
  if (popup && !popup.isDestroyed()) popup.close();
  helpPopupWindows.delete(reqId);
  doSaveState();
  showMainWindow();
  setTimeout(() => { bus.emit(EVENTS.GOTO_TAB, 'help'); bus.emit(EVENTS.FOCUS_HELP, { reqId }); }, 250);
  updateTrayMenu();
});

ipcMain.handle('export-peer-specs', async (e, { peerId, format = 'txt' }) => {
  if (!hasAdminAccess(myProfile.role)) return { success: false, error: 'Admin only.' };
  const peer = peers.get(peerId);
  if (!peer) return { success: false, error: 'Peer not found.' };
  const safeFormat  = format === 'json' ? 'json' : 'txt';
  const defaultPath = path.join(app.getPath('documents'), `${(peer.username || 'user').replace(/[^\w.-]+/g, '_')}-specs.${safeFormat}`);
  const result = await dialog.showSaveDialog({
    title: 'Export user specs', defaultPath,
    filters: safeFormat === 'json' ? [{ name: 'JSON', extensions: ['json'] }] : [{ name: 'Text', extensions: ['txt'] }]
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  const content = safeFormat === 'json'
    ? JSON.stringify(helpSvc.getPeerExportPayload(peer), null, 2)
    : helpSvc.formatPeerSpecsText(peer);
  fs.writeFileSync(result.filePath, content, 'utf8');
  return { success: true, path: result.filePath };
});

ipcMain.handle('save-user-group', (e, group) => {
  if (!hasAdminAccess(myProfile.role)) return { success: false, error: 'Admin only.' };
  const name      = String(group?.name || '').trim();
  const memberIds = [...new Set(Array.isArray(group?.memberIds) ? group.memberIds.filter(Boolean) : [])];
  if (!name) return { success: false, error: 'Group name is required.' };
  const duplicate = userGroups.find(item => item.name.toLowerCase() === name.toLowerCase() && item.id !== group?.id);
  if (duplicate) return { success: false, error: 'A group with this name already exists.' };
  const id   = group?.id || uuidv4();
  const next = { id, name, memberIds };
  const idx  = userGroups.findIndex(item => item.id === id);
  if (idx >= 0) userGroups[idx] = next; else userGroups.push(next);
  userGroups.sort((a, b) => a.name.localeCompare(b.name));
  doSaveState();
  return { success: true, groups: userGroups };
});

ipcMain.handle('delete-user-group', (e, { id }) => {
  if (!hasAdminAccess(myProfile.role)) return { success: false, error: 'Admin only.' };
  userGroups = userGroups.filter(g => g.id !== id);
  doSaveState();
  return { success: true, groups: userGroups };
});

ipcMain.handle('update-profile', (e, updates) => {
  Object.assign(myProfile, updates);
  storage.saveProfile(myProfile);
  broadcastToPeers({ type: 'profile-update', id: myProfile.id, ...updates });
  updateTrayMenu();
  return myProfile;
});

ipcMain.handle('get-device-id', () => {
  const devices = storage.loadDevices();
  return devices['self']?.deviceId || myProfile.id;
});

ipcMain.handle('window-minimize', () => mainWindow?.minimize());
ipcMain.handle('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.handle('window-close',    () => mainWindow?.hide());
ipcMain.handle('window-set-main-mode', () => {
  applyWindowMode('main');
  return { success: true };
});
ipcMain.handle('set-sound', (e, v) => {
  soundEnabled = !!v;
  myProfile.soundEnabled = soundEnabled;
  storage.saveProfile(myProfile);
  updateTrayMenu();
});
ipcMain.handle('broadcast-popup-close', e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && !win.isDestroyed()) win.close();
});
ipcMain.on('urgent-ack', (e, d) => {
  sendToPeer(d.peerId, { type: 'ack', fromId: myProfile.id, broadcastId: d.broadcastId });
  closeOverlayWindow(true);
});
ipcMain.on('urgent-reply', (e, d) => {
  sendToPeer(d.peerId, { type: 'broadcast-reply', fromId: myProfile.id, text: d.text, broadcastId: d.broadcastId });
});
ipcMain.handle('lock-all-screens', (e, { message } = {}) => {
  if (!isSuperAdmin(myProfile.role)) return { success: false, error: 'Super Admin only.' };
  const msg = String(message || '').trim() || 'Your screen has been locked by the administrator.';
  broadcastToPeers({ type: 'screen-lock', fromId: myProfile.id, message: msg });
  return { success: true, targetCount: peers.size };
});
ipcMain.handle('unlock-all-screens', () => {
  if (!isSuperAdmin(myProfile.role)) return { success: false, error: 'Super Admin only.' };
  broadcastToPeers({ type: 'screen-unlock', fromId: myProfile.id });
  return { success: true };
});

// ── APP LIFECYCLE ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  storage.ensureDirs();

  // 1. Persistent device identity
  const netInfo      = getPrimaryNetworkInfo();
  const deviceRecord = getOrCreateDeviceIdentity(netInfo.ip);

  // 2. Profile — use deviceId as the stable id
  const raw = storage.loadProfile();
  if (raw) {
    myProfile = raw;
    myProfile.id = deviceRecord.deviceId;   // ensure id always matches devices.json
  } else {
    myProfile = buildDefaultProfile(deviceRecord);
  }
  myProfile.systemInfo = getSystemInfo();
  ensureControlProfile();
  storage.saveProfile(myProfile);

  // 3. State
  const saved = storage.loadState();
  helpRequests                = saved.helpRequests;
  pendingOutgoingHelpRequests = saved.pendingOutgoingHelpRequests;
  userGroups                  = saved.userGroups;
  soundEnabled = typeof myProfile.soundEnabled === 'boolean' ? myProfile.soundEnabled : true;

  // 4. History
  chatHistory = storage.loadHistory();

  // 5. Wire up wsServer dependencies
  wsNet.init({
    peers,
    myProfile       : () => myProfile,
    myPortRef,
    onMessage       : handleP2PMessage,
    onPeerOnline    : peer => { bus.emit(EVENTS.DEVICE_JOINED,  peerToSafe(peer)); updateTrayMenu(); },
    onPeerOffline   : id   => { bus.emit(EVENTS.DEVICE_LEFT,   { id });          updateTrayMenu(); },
    getPendingMsgs  : helpSvc.getPendingMessages,
    clearPendingMsgs: helpSvc.clearPendingMessages,
    hasAdminAccess,
    flushHelpRequests: flushPendingHelpRequests
  });

  // 6. Wire up UDP dependencies
  udp.init({
    peers,
    myProfile    : () => myProfile,
    myPortRef,
    connectToPeer: wsNet.connectToPeer,
    onPeerOnline : peer => { bus.emit(EVENTS.DEVICE_JOINED, peerToSafe(peer)); updateTrayMenu(); },
    onPeerOffline: id   => { bus.emit(EVENTS.DEVICE_LEFT,  { id });         updateTrayMenu(); },
    broadcastToRenderer
  });

  // 7. Start network
  startNetworkMonitor();
  await wsNet.startWsServer(wsNet.CHAT_PORT_BASE);
  udp.startUdpDiscovery();

  // 8. UI
  createMainWindow();
  // Wire event bus → renderer bridge now that mainWindow exists
  bus.setRendererBridge((event, data) => broadcastToRenderer(event, data));
  createTray();

  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
});

app.on('window-all-closed', e => e.preventDefault());
app.on('before-quit', () => {
  isQuitting = true;
  doSaveHistory();
  storage.saveProfile(myProfile);
  doSaveState();
});
