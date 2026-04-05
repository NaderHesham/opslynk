import type { BrowserWindow, IpcMain, OpenDialogOptions } from 'electron';
import type { AdminModuleApi, IpcRuntimeState } from '../../shared/types/runtime';
import type { IpcChannelMap, IpcEventMap } from '../../shared/contracts/ipc';

export interface RegisterDeps {
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
  state: IpcRuntimeState;
  hasAdminAccess: (role: string | undefined) => boolean;
  adminModule: AdminModuleApi;
  sendToPeer: (peerId: string, payload: Record<string, unknown>) => void;
  broadcastToPeers: (payload: Record<string, unknown>) => void;
  doSaveHistory: () => void;
  doSaveState: () => void;
  updateTrayMenu: () => void;
  applyWindowMode: (modeName: string) => void;
  closeOverlayWindow: (force?: boolean) => void;
  broadcastToRenderer: (event: string, data: unknown) => void;
}

export type HandleFn = <C extends keyof IpcChannelMap>(
  channel: C,
  fn: (payload: IpcChannelMap[C]['request']) => Promise<IpcChannelMap[C]['response']> | IpcChannelMap[C]['response']
) => void;

export type OnFn = <C extends keyof IpcEventMap>(channel: C, fn: (payload: IpcEventMap[C]) => void) => void;

export interface AppRegistrarDeps extends Pick<RegisterDeps, 'os' | 'udp' | 'state'> {
  handle: HandleFn;
}

export interface WindowRegistrarDeps extends Pick<RegisterDeps, 'state' | 'applyWindowMode'> {
  handle: HandleFn;
}

export interface ChatRegistrarDeps extends Pick<RegisterDeps, 'state' | 'uuidv4' | 'sendToPeer' | 'doSaveHistory' | 'dialog' | 'fs' | 'path' | 'broadcastToRenderer'> {
  handle: HandleFn;
}

export interface BroadcastRegistrarDeps extends Pick<RegisterDeps, 'ipcMain' | 'BrowserWindow' | 'state' | 'adminModule' | 'sendToPeer' | 'closeOverlayWindow'> {
  handle: HandleFn;
  on: OnFn;
}

export interface ForcedVideoRegistrarDeps extends Pick<RegisterDeps, 'adminModule' | 'dialog' | 'fs' | 'path'> {
  handle: HandleFn;
}

export interface HelpRegistrarDeps extends Pick<RegisterDeps, 'os' | 'uuidv4' | 'captureScreenshot' | 'state' | 'hasAdminAccess' | 'helpSvc' | 'sendToPeer' | 'doSaveState' | 'adminModule'> {
  handle: HandleFn;
}

export interface AdminRegistrarDeps extends Pick<RegisterDeps, 'adminModule'> {
  handle: HandleFn;
}

export interface LockScreenRegistrarDeps extends Pick<RegisterDeps, 'adminModule'> {
  handle: HandleFn;
}

export interface ProfileRegistrarDeps extends Pick<RegisterDeps, 'state' | 'storage' | 'broadcastToPeers' | 'updateTrayMenu'> {
  handle: HandleFn;
}

export interface StorageRegistrarDeps extends Pick<RegisterDeps, 'state' | 'storage'> {
  handle: HandleFn;
}

export interface GroupRegistrarDeps extends Pick<RegisterDeps, 'adminModule'> {
  handle: HandleFn;
}
