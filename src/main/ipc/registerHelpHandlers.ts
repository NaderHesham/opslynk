import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { HelpRegistrarDeps } from './types';

export function registerHelpHandlers({
  handle,
  os,
  uuidv4,
  captureScreenshot,
  state,
  hasAdminAccess,
  helpSvc,
  sendToPeer,
  doSaveState,
  adminModule
}: HelpRegistrarDeps): void {
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

  handle(IPC_CHANNELS.help.ACK_HELP, (payload) => adminModule.run(adminModule.COMMANDS.ACK_HELP, payload));
}
