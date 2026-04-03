import type { BrowserWindow, IpcMain, OpenDialogOptions } from 'electron';
import type { AppRuntimeState, AdminModuleApi } from '../../shared/types/runtime';
import { IPC_CHANNELS, IPC_EVENTS, type IpcChannelMap, type IpcEventMap } from '../../shared/contracts/ipc';

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
  const handle = <C extends keyof IpcChannelMap>(
    channel: C,
    fn: (payload: IpcChannelMap[C]['request']) => Promise<IpcChannelMap[C]['response']> | IpcChannelMap[C]['response']
  ): void => {
    ipcMain.handle(channel, (_e, payload) => fn((payload as IpcChannelMap[C]['request']) ?? (undefined as IpcChannelMap[C]['request'])));
  };

  const on = <C extends keyof IpcEventMap>(channel: C, fn: (payload: IpcEventMap[C]) => void): void => {
    ipcMain.on(channel, (_e, payload) => fn(payload as IpcEventMap[C]));
  };

  handle(IPC_CHANNELS.app.GET_INIT_DATA, () => ({
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

  handle(IPC_CHANNELS.chat.SEND_CHAT, ({ peerId, text, emoji }) => {
    const msgId = uuidv4();
    const timestamp = new Date().toISOString();
    sendToPeer(peerId, { type: 'chat', fromId: state.myProfile?.id, text, emoji, msgId, timestamp });
    const entry = { id: msgId, fromId: state.myProfile?.id, text, emoji, timestamp, mine: true };
    if (!state.chatHistory[peerId]) state.chatHistory[peerId] = [];
    state.chatHistory[peerId].push(entry);
    doSaveHistory();
    return { success: true, message: entry };
  });

  handle(IPC_CHANNELS.chat.SEND_FILE_OFFER, async ({ peerId }) => {
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

  handle(IPC_CHANNELS.broadcast.SEND_BROADCAST, ({ text, urgency, durationSeconds, peerIds = null }) =>
    adminModule.run(adminModule.COMMANDS.SEND_BROADCAST, { text, urgency, durationSeconds, peerIds }));

  handle(IPC_CHANNELS.forcedVideo.SELECT_FILE, async () => {
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

  handle(IPC_CHANNELS.forcedVideo.SEND, (payload) =>
    adminModule.run(adminModule.COMMANDS.SEND_FORCED_VIDEO_BROADCAST, payload));

  handle(IPC_CHANNELS.forcedVideo.STOP, (payload) =>
    adminModule.run(adminModule.COMMANDS.STOP_FORCED_VIDEO_BROADCAST, payload));

  handle(IPC_CHANNELS.broadcast.SEND_ACK, ({ peerId, broadcastId }) => {
    sendToPeer(peerId, { type: 'ack', fromId: state.myProfile?.id, broadcastId });
    closeOverlayWindow(true);
  });

  handle(IPC_CHANNELS.broadcast.SEND_REPLY, ({ peerId, text, broadcastId }) => {
    sendToPeer(peerId, { type: 'broadcast-reply', fromId: state.myProfile?.id, text, broadcastId });
    closeOverlayWindow(true);
  });

  handle(IPC_CHANNELS.help.SEND_HELP_REQUEST, async ({ description, priority, includeScreenshot }) => {
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

  handle(IPC_CHANNELS.help.CAPTURE_SCREENSHOT_PREVIEW, async () => {
    if (!hasAdminAccess(state.myProfile?.role)) return null;
    const ss = await captureScreenshot(state.mainWindow);
    return ss ? { base64: ss.base64, name: ss.name, size: ss.size } : null;
  });

  handle(IPC_CHANNELS.chat.SELECT_AVATAR, async () => {
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

  handle(IPC_CHANNELS.help.ACK_HELP, (payload) => adminModule.run(adminModule.COMMANDS.ACK_HELP, payload));
  handle(IPC_CHANNELS.admin.EXPORT_PEER_SPECS, (payload) => adminModule.run(adminModule.COMMANDS.EXPORT_PEER_SPECS, payload));
  handle(IPC_CHANNELS.admin.SAVE_USER_GROUP, (payload) => adminModule.run(adminModule.COMMANDS.SAVE_USER_GROUP, payload));
  handle(IPC_CHANNELS.admin.DELETE_USER_GROUP, (payload) => adminModule.run(adminModule.COMMANDS.DELETE_USER_GROUP, payload));

  handle(IPC_CHANNELS.peer.UPDATE_PROFILE, (updates) => {
    Object.assign(state.myProfile || {}, updates);
    storage.saveProfile(state.myProfile);
    broadcastToPeers({ type: 'profile-update', id: state.myProfile?.id, ...updates });
    updateTrayMenu();
    return state.myProfile;
  });

  handle(IPC_CHANNELS.app.GET_DEVICE_ID, () => {
    const devices = storage.loadDevices();
    return devices.self?.deviceId || state.myProfile?.id;
  });

  handle(IPC_CHANNELS.window.MINIMIZE, () => state.mainWindow?.minimize());
  handle(IPC_CHANNELS.window.MAXIMIZE, () => state.mainWindow?.isMaximized() ? state.mainWindow.unmaximize() : state.mainWindow?.maximize());
  handle(IPC_CHANNELS.window.CLOSE, () => state.mainWindow?.hide());
  handle(IPC_CHANNELS.window.SET_MAIN_MODE, () => { applyWindowMode('main'); return { success: true }; });
  handle(IPC_CHANNELS.app.SET_SOUND, (value) => {
    state.soundEnabled = !!value;
    if (state.myProfile) state.myProfile.soundEnabled = state.soundEnabled;
    storage.saveProfile(state.myProfile);
    updateTrayMenu();
  });

  ipcMain.handle(IPC_CHANNELS.broadcast.POPUP_CLOSE, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.close();
  });

  on(IPC_EVENTS.URGENT_ACK, (data) => {
    sendToPeer(data.peerId, { type: 'ack', fromId: state.myProfile?.id, broadcastId: data.broadcastId });
    closeOverlayWindow(true);
  });

  on(IPC_EVENTS.URGENT_REPLY, (data) => {
    sendToPeer(data.peerId, { type: 'broadcast-reply', fromId: state.myProfile?.id, text: data.text, broadcastId: data.broadcastId });
  });

  handle(IPC_CHANNELS.lockScreen.LOCK_ALL, (payload) =>
    adminModule.run(adminModule.COMMANDS.LOCK_ALL_SCREENS, payload));
  handle(IPC_CHANNELS.lockScreen.UNLOCK_ALL, () =>
    adminModule.run(adminModule.COMMANDS.UNLOCK_ALL_SCREENS));
}
