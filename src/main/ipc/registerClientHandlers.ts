import { IPC_CHANNELS } from '../../shared/contracts/ipc';
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

  registerAppHandlers({ handle, os: deps.os, udp: deps.udp, state: deps.state });
  registerWindowHandlers({ handle, state: deps.state, applyWindowMode: deps.applyWindowMode });
  registerChatHandlers({
    handle,
    state: deps.state,
    uuidv4: deps.uuidv4,
    sendToPeer: deps.sendToPeer,
    doSaveHistory: deps.doSaveHistory,
    dialog: deps.dialog,
    fs: deps.fs,
    path: deps.path
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

  // Broadcast reply — client sends reply from toast.html back to admin
  handle(IPC_CHANNELS.broadcast.SEND_REPLY, ({ peerId, text, broadcastId }) => {
    deps.sendToPeer(peerId, { type: 'broadcast-reply', fromId: deps.state.myProfile?.id, text, broadcastId });
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
    const queuedRequest = { ...msg, deliveredAdminIds: [], createdAt: timestamp };
    let sent = 0;
    for (const [, peer] of deps.state.peers) {
      if (deps.hasAdminAccess(peer.role) && deps.helpSvc.deliverHelpRequestToAdmin(peer, queuedRequest, deps.sendToPeer, deps.hasAdminAccess, deps.doSaveState)) sent++;
    }
    if (sent === 0) {
      deps.state.pendingOutgoingHelpRequests.unshift(queuedRequest);
      deps.doSaveState();
    }
    return { reqId, sent, queued: sent === 0, hasScreenshot: !!screenshotB64 };
  });
}
