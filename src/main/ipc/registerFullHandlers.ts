import { IPC_CHANNELS, type IpcChannelMap, type IpcEventMap } from '../../shared/contracts/ipc';
import type { HandleFn, OnFn, RegisterDeps } from './types';
import { registerClientHandlers } from './registerClientHandlers';
import { registerBroadcastHandlers } from './registerBroadcastHandlers';
import { registerAdminHandlers } from './registerAdminHandlers';
import { registerGroupHandlers } from './registerGroupHandlers';
import { registerLockScreenHandlers } from './registerLockScreenHandlers';
import { registerForcedVideoHandlers } from './registerForcedVideoHandlers';
import { registerAuthHandlers } from './registerAuthHandlers';

const authService = require('../../../src/services/authService') as {
  isFirstRun:       ()                                                 => boolean;
  createSuperAdmin: (u: string, p: string)                            => Promise<{ success: boolean; error?: string; user?: unknown }>;
  login:            (u: string, p: string)                            => Promise<{ success: boolean; error?: string; user?: unknown }>;
  createUser:       (u: string, p: string, r: string)                 => Promise<{ success: boolean; error?: string; user?: unknown }>;
  updateSelfProfile:(id: string, username: string)                     => { success: boolean; error?: string; user?: unknown };
  changePassword:   (id: string, cur: string, next: string)           => Promise<{ success: boolean; error?: string }>;
  deleteUser:       (id: string, rid: string)                         => { success: boolean; error?: string };
  listUsers:        ()                                                 => unknown[];
};

export function registerFullHandlers(deps: RegisterDeps): void {
  const { ipcMain } = deps;

  // Auth handlers (admin only)
  registerAuthHandlers({
    ipcMain: deps.ipcMain,
    authService,
    onLoginSuccess: (user: unknown, options?: { rememberMe?: boolean }) => {
      const u = user as { id?: string; username?: string; role?: string } | null;
      if (u && deps.state.myProfile) {
        (deps.state.myProfile as unknown as { authUserId?: string }).authUserId = u.id;
        (deps.state.myProfile as unknown as { rememberMe?: boolean }).rememberMe = !!options?.rememberMe;
        if (u.role)     deps.state.myProfile.role     = u.role as import('../../shared/types/runtime').UserRole;
        if (u.username) deps.state.myProfile.username = u.username;
        deps.storage.saveProfile(deps.state.myProfile);
      }
      deps.updateTrayMenu();
    }
  });

  // All client-mode handlers first
  registerClientHandlers(deps);

  const handle: HandleFn = <C extends keyof IpcChannelMap>(
    channel: C,
    fn: (payload: IpcChannelMap[C]['request']) => Promise<IpcChannelMap[C]['response']> | IpcChannelMap[C]['response']
  ): void => {
    ipcMain.handle(channel, (_e, payload) => fn((payload as IpcChannelMap[C]['request']) ?? (undefined as IpcChannelMap[C]['request'])));
  };

  const on: OnFn = <C extends keyof IpcEventMap>(channel: C, fn: (payload: IpcEventMap[C]) => void): void => {
    ipcMain.on(channel, (_e, payload) => fn(payload as IpcEventMap[C]));
  };

  // Help ACK — admin-only, not included in registerClientHandlers
  handle(IPC_CHANNELS.help.ACK_HELP, (payload) =>
    deps.adminModule.run(deps.adminModule.COMMANDS.ACK_HELP, payload as Record<string, unknown>));

  // On-demand remote screenshot — admin sends request to target client
  handle(IPC_CHANNELS.admin.REQUEST_SCREENSHOT, ({ peerId }) => {
    const peer = deps.state.peers.get(peerId);
    if (!peer || !peer.online) return { success: false, error: 'Peer not found or offline.' };
    peer.screenshotRequestPending = true;
    peer.latestScreenshotRequestedAt = Date.now();
    (peer as unknown as { latestScreenshotRequestReason?: string }).latestScreenshotRequestReason = 'manual-request';
    deps.broadcastToRenderer('system:deviceUpdated', {
      id: peer.id,
      username: peer.username,
      role: peer.role,
      deviceId: peer.deviceId,
      identityFingerprint: peer.identityFingerprint,
      color: peer.color,
      title: peer.title,
      online: peer.online,
      connectionState: peer.connectionState || 'connected',
      restoredFromState: !!peer.restoredFromState,
      identityVerified: !!peer.identityVerified,
      identityRejected: !!peer.identityRejected,
      avatar: peer.avatar || null,
      systemInfo: peer.systemInfo || null,
      activityState: peer.activityState || (peer.online ? 'active' : 'offline'),
      lastInputAt: peer.lastInputAt || null,
      lastStateChangeAt: peer.lastStateChangeAt || null,
      currentSessionStartedAt: peer.currentSessionStartedAt || null,
      idleThresholdMs: peer.idleThresholdMs || null,
      activityEvents: Array.isArray(peer.activityEvents) ? peer.activityEvents.slice(-24) : [],
      latestScreenshot: peer.latestScreenshot || null,
      latestScreenshotRequestedAt: peer.latestScreenshotRequestedAt || null,
      screenshotRequestPending: !!peer.screenshotRequestPending
    });
    deps.sendToPeer(peerId, {
      type:   'screenshot-request',
      fromId: deps.state.myProfile?.id,
      reqId:  deps.uuidv4(),
      reason: 'manual-request'
    });
    return { success: true, queued: false };
  });

  // Admin-only handlers
  registerBroadcastHandlers({
    handle,
    on,
    ipcMain: deps.ipcMain,
    BrowserWindow: deps.BrowserWindow,
    state: deps.state,
    adminModule: deps.adminModule,
    sendToPeer: deps.sendToPeer,
    closeOverlayWindow: deps.closeOverlayWindow
  });
  registerAdminHandlers({ handle, adminModule: deps.adminModule });
  registerGroupHandlers({ handle, adminModule: deps.adminModule });
  registerLockScreenHandlers({ handle, adminModule: deps.adminModule });
  registerForcedVideoHandlers({
    handle,
    adminModule: deps.adminModule,
    dialog: deps.dialog,
    fs: deps.fs,
    path: deps.path
  });
}
