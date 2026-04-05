import { IPC_CHANNELS, type IpcChannelMap, type IpcEventMap } from '../../shared/contracts/ipc';
import type { HandleFn, OnFn, RegisterDeps } from './types';
import { registerClientHandlers } from './registerClientHandlers';
import { registerBroadcastHandlers } from './registerBroadcastHandlers';
import { registerAdminHandlers } from './registerAdminHandlers';
import { registerGroupHandlers } from './registerGroupHandlers';
import { registerLockScreenHandlers } from './registerLockScreenHandlers';
import { registerForcedVideoHandlers } from './registerForcedVideoHandlers';

export function registerFullHandlers(deps: RegisterDeps): void {
  const { ipcMain } = deps;

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
