import type { IpcChannelMap, IpcEventMap } from '../../shared/contracts/ipc';
import type { HandleFn, OnFn, RegisterDeps } from './types';
import { registerAdminHandlers } from './registerAdminHandlers';
import { registerAppHandlers } from './registerAppHandlers';
import { registerBroadcastHandlers } from './registerBroadcastHandlers';
import { registerChatHandlers } from './registerChatHandlers';
import { registerForcedVideoHandlers } from './registerForcedVideoHandlers';
import { registerGroupHandlers } from './registerGroupHandlers';
import { registerHelpHandlers } from './registerHelpHandlers';
import { registerLockScreenHandlers } from './registerLockScreenHandlers';
import { registerProfileHandlers } from './registerProfileHandlers';
import { registerStorageHandlers } from './registerStorageHandlers';
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

  registerAppHandlers({
    handle,
    os: deps.os,
    udp: deps.udp,
    state: deps.state
  });

  registerWindowHandlers({
    handle,
    state: deps.state,
    applyWindowMode: deps.applyWindowMode
  });

  registerChatHandlers({
    handle,
    state: deps.state,
    uuidv4: deps.uuidv4,
    sendToPeer: deps.sendToPeer,
    doSaveHistory: deps.doSaveHistory,
    broadcastToRenderer: deps.broadcastToRenderer,
    dialog: deps.dialog,
    fs: deps.fs,
    path: deps.path
  });

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

  registerForcedVideoHandlers({
    handle,
    adminModule: deps.adminModule,
    dialog: deps.dialog,
    fs: deps.fs,
    path: deps.path
  });

  registerHelpHandlers({
    handle,
    os: deps.os,
    uuidv4: deps.uuidv4,
    captureScreenshot: deps.captureScreenshot,
    state: deps.state,
    hasAdminAccess: deps.hasAdminAccess,
    helpSvc: deps.helpSvc,
    sendToPeer: deps.sendToPeer,
    doSaveState: deps.doSaveState,
    adminModule: deps.adminModule
  });

  registerAdminHandlers({
    handle,
    adminModule: deps.adminModule
  });

  registerGroupHandlers({
    handle,
    adminModule: deps.adminModule
  });

  registerLockScreenHandlers({
    handle,
    adminModule: deps.adminModule
  });

  registerProfileHandlers({
    handle,
    state: deps.state,
    storage: deps.storage,
    broadcastToPeers: deps.broadcastToPeers,
    updateTrayMenu: deps.updateTrayMenu
  });

  registerStorageHandlers({
    handle,
    state: deps.state,
    storage: deps.storage
  });
}
