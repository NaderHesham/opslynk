import type { BrowserWindow, IpcMain, OpenDialogOptions } from 'electron';
import type { AppRuntimeState, AdminModuleApi } from '../../shared/types/runtime';
import type { IpcChannelMap } from '../../shared/contracts/ipc';

type IpcHandle = keyof IpcChannelMap | string;

interface RegisterDeps {
  ipcMain: IpcMain;
  BrowserWindow: typeof BrowserWindow;
  dialog: {
    showOpenDialog: (opts: OpenDialogOptions) => Promise<{ canceled: boolean; filePaths: string[] }>;
  };
  fs: {
    statSync: (p: string) => { size: number };
    readFileSync: (p: string) => Buffer;
  };
  path: {
    basename: (p: string) => string;
    extname: (p: string) => string;
  };
  os: { hostname: () => string };
  uuidv4: () => string;
  storage: {
    saveProfile: (profile: unknown) => void;
    loadDevices: () => { self?: { deviceId?: string } };
  };
  wsNet: unknown;
  udp: { getSocket: () => unknown };
  helpSvc: {
    deliverHelpRequestToAdmin: (...args: unknown[]) => boolean;
  };
  bus: { emit: (event: string, payload?: unknown) => void };
  EVENTS: Record<string, string>;
  captureScreenshot: (win: unknown) => Promise<{ base64: string; name: string; size: number } | null>;
  state: AppRuntimeState;
  hasAdminAccess: (role: string | undefined) => boolean;
  adminModule: AdminModuleApi;
  sendToPeer: (peerId: string, payload: Record<string, unknown>) => void;
  broadcastToPeers: (payload: Record<string, unknown>) => void;
  doSaveHistory: () => void;
  doSaveState: () => void;
  updateTrayMenu: () => void;
  applyWindowMode: (modeName: string) => void;
  closeOverlayWindow: (force?: boolean) => void;
}

export function registerIpcHandlers({
  ipcMain,
  BrowserWindow,
  dialog,
  fs,
  path,
  os,
  uuidv4,
  storage,
  udp,
  helpSvc,
  captureScreenshot,
  state,
  hasAdminAccess,
  adminModule,
  sendToPeer,
  broadcastToPeers,
  doSaveHistory,
  doSaveState,
  updateTrayMenu,
  applyWindowMode,
  closeOverlayWindow
}: RegisterDeps): void {
  ipcMain.handle('get-init-data' as IpcHandle, () => ({
    profile: state.myProfile,
    peers: [...state.peers.values()].map((p) => ({
      id: p.id, username: p.username, role: p.role, color: p.color, title: p.title,
      online: p.online, avatar: p.avatar || null, systemInfo: p.systemInfo || null
    })),
    history: state.chatHistory,
    helpRequests: state.helpRequests,
    userGroups: state.userGroups,
    hostname: os.hostname(),
    networkReady: !!(udp.getSocket()) && !!state.myPortRef.value,
    networkOnline: state.networkOnline
  }));

  ipcMain.handle('send-chat' as IpcHandle, (_e, { peerId, text, emoji }) => {
    const msgId = uuidv4();
    const timestamp = new Date().toISOString();
    sendToPeer(peerId, { type: 'chat', fromId: state.myProfile?.id, text, emoji, msgId, timestamp });
    const entry = { id: msgId, fromId: state.myProfile?.id, text, emoji, timestamp, mine: true };
    if (!state.chatHistory[peerId]) state.chatHistory[peerId] = [];
    state.chatHistory[peerId].push(entry);
    doSaveHistory();
    return { success: true, message: entry };
  });

  ipcMain.handle('send-file-offer' as IpcHandle, async (_e, { peerId }) => {
    const peer = state.peers.get(peerId);
    if (!peer) return { success: false, error: 'Peer not found.' };
    const result = await dialog.showOpenDialog({ title: 'Choose a file to send', properties: ['openFile'] });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    const filePath = result.filePaths[0];
    const stat = fs.statSync(filePath);
    if (stat.size > 10 * 1024 * 1024) return { success: false, error: 'Files larger than 10 MB are not supported yet.' };
    const attachment = {
      name: path.basename(filePath),
      size: stat.size,
      mime: 'application/octet-stream',
      data: fs.readFileSync(filePath).toString('base64')
    };
    const msgId = uuidv4();
    const timestamp = new Date().toISOString();
    sendToPeer(peerId, { type: 'chat-file', fromId: state.myProfile?.id, msgId, timestamp, attachment });
    const entry = { id: msgId, fromId: state.myProfile?.id, timestamp, mine: true, attachment };
    if (!state.chatHistory[peerId]) state.chatHistory[peerId] = [];
    state.chatHistory[peerId].push(entry);
    doSaveHistory();
    return { success: true, message: entry };
  });

  ipcMain.handle('send-broadcast' as IpcHandle, (_e, { text, urgency, durationSeconds, peerIds = null }) =>
    adminModule.run(adminModule.COMMANDS.SEND_BROADCAST, { text, urgency, durationSeconds, peerIds }));

  ipcMain.handle('select-video-broadcast-file' as IpcHandle, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose video for forced playback',
      properties: ['openFile'],
      filters: [{ name: 'Video Files', extensions: ['mp4', 'webm', 'm4v', 'mov'] }]
    });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    const filePath = result.filePaths[0];
    const stat = fs.statSync(filePath);
    if (stat.size > 30 * 1024 * 1024) return { success: false, error: 'Video must be 30 MB or smaller.' };
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'video/mp4';
    return { success: true, fileName: path.basename(filePath), size: stat.size, mime, data: fs.readFileSync(filePath).toString('base64') };
  });

  ipcMain.handle('send-forced-video-broadcast' as IpcHandle, (_e, payload) =>
    adminModule.run(adminModule.COMMANDS.SEND_FORCED_VIDEO_BROADCAST, payload));

  ipcMain.handle('stop-forced-video-broadcast' as IpcHandle, (_e, payload = {}) =>
    adminModule.run(adminModule.COMMANDS.STOP_FORCED_VIDEO_BROADCAST, payload));

  ipcMain.handle('send-ack' as IpcHandle, (_e, { peerId, broadcastId }) => {
    sendToPeer(peerId, { type: 'ack', fromId: state.myProfile?.id, broadcastId });
    closeOverlayWindow(true);
  });

  ipcMain.handle('send-broadcast-reply' as IpcHandle, (_e, { peerId, text, broadcastId }) => {
    sendToPeer(peerId, { type: 'broadcast-reply', fromId: state.myProfile?.id, text, broadcastId });
    closeOverlayWindow(true);
  });

  ipcMain.handle('send-help-request' as IpcHandle, async (_e, { description, priority, includeScreenshot }) => {
    const reqId = uuidv4();
    const timestamp = new Date().toISOString();
    let screenshotB64: string | null = null;
    let screenshotName: string | null = null;
    let screenshotSize = 0;

    if (includeScreenshot) {
      const ss = await captureScreenshot(state.mainWindow);
      if (ss) {
        screenshotB64 = ss.base64;
        screenshotName = ss.name;
        screenshotSize = ss.size;
      }
    }

    const msg = {
      type: 'help-request',
      fromId: state.myProfile?.id || '',
      username: state.myProfile?.username || '',
      machine: os.hostname(),
      description,
      priority,
      reqId,
      timestamp,
      screenshotB64,
      screenshotName,
      screenshotSize
    };
    const queuedRequest = { ...msg, deliveredAdminIds: [], createdAt: timestamp };
    let sent = 0;
    for (const [, peer] of state.peers) {
      if (hasAdminAccess(peer.role) && helpSvc.deliverHelpRequestToAdmin(peer, queuedRequest, sendToPeer, hasAdminAccess, doSaveState)) sent++;
    }
    if (sent === 0) {
      state.pendingOutgoingHelpRequests.unshift(queuedRequest);
      doSaveState();
    }
    return { reqId, sent, queued: sent === 0, hasScreenshot: !!screenshotB64 };
  });

  ipcMain.handle('capture-screenshot-preview' as IpcHandle, async () => {
    if (!hasAdminAccess(state.myProfile?.role)) return null;
    const ss = await captureScreenshot(state.mainWindow);
    return ss ? { base64: ss.base64, name: ss.name, size: ss.size } : null;
  });

  ipcMain.handle('select-avatar' as IpcHandle, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose profile picture',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
    });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    const filePath = result.filePaths[0];
    if (fs.statSync(filePath).size > 4 * 1024 * 1024) return { success: false, error: 'Profile image must be 4 MB or smaller.' };
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.bmp' ? 'image/bmp' : 'image/png';
    return { success: true, avatar: `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}` };
  });

  ipcMain.handle('ack-help' as IpcHandle, (_e, payload) => adminModule.run(adminModule.COMMANDS.ACK_HELP, payload));
  ipcMain.handle('export-peer-specs' as IpcHandle, (_e, payload) => adminModule.run(adminModule.COMMANDS.EXPORT_PEER_SPECS, payload));
  ipcMain.handle('save-user-group' as IpcHandle, (_e, payload) => adminModule.run(adminModule.COMMANDS.SAVE_USER_GROUP, payload));
  ipcMain.handle('delete-user-group' as IpcHandle, (_e, payload) => adminModule.run(adminModule.COMMANDS.DELETE_USER_GROUP, payload));

  ipcMain.handle('update-profile' as IpcHandle, (_e, updates) => {
    Object.assign(state.myProfile || {}, updates);
    storage.saveProfile(state.myProfile);
    broadcastToPeers({ type: 'profile-update', id: state.myProfile?.id, ...updates });
    updateTrayMenu();
    return state.myProfile;
  });

  ipcMain.handle('get-device-id' as IpcHandle, () => {
    const devices = storage.loadDevices();
    return devices.self?.deviceId || state.myProfile?.id;
  });

  ipcMain.handle('window-minimize' as IpcHandle, () => state.mainWindow?.minimize());
  ipcMain.handle('window-maximize' as IpcHandle, () => state.mainWindow?.isMaximized() ? state.mainWindow.unmaximize() : state.mainWindow?.maximize());
  ipcMain.handle('window-close' as IpcHandle, () => state.mainWindow?.hide());
  ipcMain.handle('window-set-main-mode' as IpcHandle, () => { applyWindowMode('main'); return { success: true }; });
  ipcMain.handle('set-sound' as IpcHandle, (_e, value) => {
    state.soundEnabled = !!value;
    if (state.myProfile) state.myProfile.soundEnabled = state.soundEnabled;
    storage.saveProfile(state.myProfile);
    updateTrayMenu();
  });

  ipcMain.handle('broadcast-popup-close' as IpcHandle, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.close();
  });

  ipcMain.on('urgent-ack', (_e, data) => {
    sendToPeer(data.peerId, { type: 'ack', fromId: state.myProfile?.id, broadcastId: data.broadcastId });
    closeOverlayWindow(true);
  });

  ipcMain.on('urgent-reply', (_e, data) => {
    sendToPeer(data.peerId, { type: 'broadcast-reply', fromId: state.myProfile?.id, text: data.text, broadcastId: data.broadcastId });
  });

  ipcMain.handle('lock-all-screens' as IpcHandle, (_e, payload = {}) =>
    adminModule.run(adminModule.COMMANDS.LOCK_ALL_SCREENS, payload));
  ipcMain.handle('unlock-all-screens' as IpcHandle, () =>
    adminModule.run(adminModule.COMMANDS.UNLOCK_ALL_SCREENS));
}
