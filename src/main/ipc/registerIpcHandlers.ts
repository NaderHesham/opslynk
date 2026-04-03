import type { IpcChannelMap, IpcEventMap } from '../../shared/contracts/ipc';
import type { HandleFn, OnFn, RegisterDeps, RegistrarContext } from './types';
import { registerAdminHandlers } from './registerAdminHandlers';
import { registerAppHandlers } from './registerAppHandlers';
import { registerBroadcastHandlers } from './registerBroadcastHandlers';
import { registerChatHandlers } from './registerChatHandlers';
import { registerForcedVideoHandlers } from './registerForcedVideoHandlers';
import { registerHelpHandlers } from './registerHelpHandlers';
import { registerPeerHandlers } from './registerPeerHandlers';
import { registerWindowHandlers } from './registerWindowHandlers';

export function registerIpcHandlers(deps: RegisterDeps): void {
  const { ipcMain } = deps;

  const handle: HandleFn = <C extends keyof IpcChannelMap>(
    channel: C,
    fn: (payload: IpcChannelMap[C]['request']) => Promise<IpcChannelMap[C]['response']> | IpcChannelMap[C]['response']
  ): void => {
    ipcMain.handle(channel, (_e, payload) => fn((payload as IpcChannelMap[C]['request']) ?? (undefined as IpcChannelMap[C]['request'])));
  };

  const on: OnFn = <C extends keyof IpcEventMap>(channel: C, fn: (payload: IpcEventMap[C]) => void): void => {
    ipcMain.on(channel, (_e, payload) => fn(payload as IpcEventMap[C]));
  };

  const context: RegistrarContext = { ...deps, handle, on };

  registerAppHandlers(context);
  registerWindowHandlers(context);
  registerChatHandlers(context);
  registerBroadcastHandlers(context);
  registerForcedVideoHandlers(context);
  registerHelpHandlers(context);
  registerAdminHandlers(context);
  registerPeerHandlers(context);
}
