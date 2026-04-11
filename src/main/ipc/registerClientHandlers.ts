import { IPC_CHANNELS, IPC_EVENTS } from '../../shared/contracts/ipc';
import type { RegisterDeps } from './types';
import type { HandleFn } from './types';
import { registerAppHandlers } from './registerAppHandlers';
import { registerWindowHandlers } from './registerWindowHandlers';
import { registerChatHandlers } from './registerChatHandlers';
import { registerProfileHandlers } from './registerProfileHandlers';
import { registerStorageHandlers } from './registerStorageHandlers';

export function registerClientHandlers(deps: RegisterDeps): void {
  const { ipcMain } = deps;

  const handle: HandleFn = (channel, fn) => {
    ipcMain.handle(channel, (_e, payload) => fn((payload as Parameters<typeof fn>[0]) ?? (undefined as Parameters<typeof fn>[0])));
  };

  registerAppHandlers({
    handle,
    os: deps.os,
    udp: deps.udp,
    state: deps.state,
    hasAdminAccess: deps.hasAdminAccess,
    sendToPeer: deps.sendToPeer
  });
  registerWindowHandlers({ handle, state: deps.state, applyWindowMode: deps.applyWindowMode });
  registerChatHandlers({
    handle,
    state: deps.state,
    uuidv4: deps.uuidv4,
    sendToPeer: deps.sendToPeer,
    doSaveHistory: deps.doSaveHistory,
    broadcastToRenderer: deps.broadcastToRenderer,
    dialog: deps.dialog,
    fs: deps.fs,
    path: deps.path,
    reliableTransport: deps.reliableTransport
  });
  registerProfileHandlers({
    handle,
    state: deps.state,
    storage: deps.storage,
    broadcastToPeers: deps.broadcastToPeers,
    updateTrayMenu: deps.updateTrayMenu
  });
  registerStorageHandlers({ handle, state: deps.state, storage: deps.storage });

  // Broadcast popup close — toast.html calls dismiss() → this closes the popup window
  deps.ipcMain.handle(IPC_CHANNELS.broadcast.POPUP_CLOSE, (e) => {
    const win = deps.BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.close();
  });

  deps.ipcMain.handle('chat-popup-dismiss', (e) => {
    const win = deps.BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.close();
    return { success: true };
  });

  deps.ipcMain.handle('chat-popup-open-chat', (e, payload: { peerId: string }) => {
    const peerId = String(payload?.peerId || '');
    const win = deps.BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.close();
    if (deps.state.mainWindow && !deps.state.mainWindow.isDestroyed()) {
      if (deps.state.mainWindow.isMinimized()) deps.state.mainWindow.restore();
      deps.state.mainWindow.show();
      deps.state.mainWindow.focus();
    }
    deps.broadcastToRenderer('ui:gotoTab', 'chat');
    deps.broadcastToRenderer('ui:openChatPeer', { peerId });
    return { success: true };
  });

  deps.ipcMain.handle('chat-popup-reply-intent', (e, payload: { peerId: string; replyText?: string }) => {
    const peerId = String(payload?.peerId || '');
    const replyText = String(payload?.replyText || '');
    const win = deps.BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.close();
    if (deps.state.mainWindow && !deps.state.mainWindow.isDestroyed()) {
      if (deps.state.mainWindow.isMinimized()) deps.state.mainWindow.restore();
      deps.state.mainWindow.show();
      deps.state.mainWindow.focus();
    }
    deps.broadcastToRenderer('ui:gotoTab', 'chat');
    deps.broadcastToRenderer('ui:openChatPeer', { peerId, replyText });
    return { success: true };
  });

  // Broadcast reply — client sends reply from toast.html back to admin
  handle(IPC_CHANNELS.broadcast.SEND_REPLY, ({ peerId, text, broadcastId }) => {
    deps.sendToPeer(peerId, { type: 'broadcast-reply', fromId: deps.state.myProfile?.id, text, broadcastId });
  });

  // Urgent reply — client sends reply from urgent.html overlay back to admin
  // Uses ipcRenderer.send (one-way), so must use ipcMain.on (not handle)
  deps.ipcMain.on(IPC_EVENTS.URGENT_REPLY, (_e, data: { peerId: string; text: string; broadcastId: string }) => {
    deps.sendToPeer(data.peerId, { type: 'broadcast-reply', fromId: deps.state.myProfile?.id, text: data.text, broadcastId: data.broadcastId });
  });

  // Screenshot preview — for the "include screenshot" checkbox in Ask For Help
  handle(IPC_CHANNELS.help.CAPTURE_SCREENSHOT_PREVIEW, async () => {
    const ss = await deps.captureScreenshot(deps.state.mainWindow);
    return ss ? { base64: ss.base64, name: ss.name, size: ss.size } : null;
  });

  // Help — send-only. ACK_HELP and CAPTURE_SCREENSHOT_PREVIEW are admin-only and
  // are intentionally omitted from the client handler set.
  handle(IPC_CHANNELS.help.SEND_HELP_REQUEST, async ({ description, priority, includeScreenshot }) => {
    const reqId = deps.uuidv4();
    const timestamp = new Date().toISOString();
    let screenshotB64: string | null = null;
    let screenshotName: string | null = null;
    let screenshotSize = 0;

    if (includeScreenshot) {
      const ss = await deps.captureScreenshot(deps.state.mainWindow);
      if (ss) {
        screenshotB64 = ss.base64;
        screenshotName = ss.name;
        screenshotSize = ss.size;
      }
    }

    const msg = {
      type: 'help-request',
      fromId: deps.state.myProfile?.id || '',
      username: deps.state.myProfile?.username || '',
      machine: deps.os.hostname(),
      description,
      priority,
      reqId,
      timestamp,
        screenshotB64,
        screenshotName,
        screenshotSize
    };
    const queuedRequest = { ...msg, msgId: deps.uuidv4(), deliveredAdminIds: [], createdAt: timestamp };
    const result = deps.helpSvc.enqueueOrDeliverHelpRequest(
      deps.state.peers,
      deps.state.pendingOutgoingHelpRequests,
      queuedRequest,
      deps.sendToPeer,
      deps.hasAdminAccess,
      deps.doSaveState,
      deps.reliableTransport
    );
    return { reqId, sent: result.sent, queued: result.queued, hasScreenshot: !!screenshotB64 };
  });
}
