import type { BrowserWindow, Tray } from 'electron';
import type { AdminCommand } from '../contracts/admin';

export type UserRole = 'user' | 'admin' | 'super_admin';
export type PeerStatus = 'online' | 'offline';
export type PeerConnectionState = 'discovering' | 'handshaking' | 'connected' | 'degraded' | 'offline';

export interface PeerIdentity {
  id: string;
  username: string;
  role: UserRole | string;
  deviceId?: string;
  publicKey?: string;
  identityFingerprint?: string;
  color?: string;
  title?: string;
  avatar?: string | null;
  systemInfo?: Record<string, unknown> | null;
}

export interface PeerSession extends PeerIdentity {
  ip?: string;
  port?: number;
  ws?: unknown;
  online: boolean;
  connectionState?: PeerConnectionState;
  identityVerified?: boolean;
  identityRejected?: boolean;
  identityLastVerifiedAt?: string;
  lastSeen?: number;
  lastHeartbeat?: number;
  liveMetrics?: { cpuPct: number; ramUsedPct: number; ramFreeGb: string } | null;
}

export interface FileTransferMetadata {
  name: string;
  size: number;
  mime: string;
  data: string;
}

export interface HelpRequest {
  reqId: string;
  fromId: string;
  username: string;
  machine: string;
  description: string;
  priority?: string;
  status?: string;
  timestamp: string;
  screenshotB64?: string | null;
  screenshotName?: string | null;
  screenshotSize?: number;
  deliveredAdminIds?: string[];
  createdAt?: string;
}

export interface PendingReliableMessage {
  msgId: string;
  kind: 'chat-direct' | 'help-request';
  peerId: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  retryDelaysMs: number[];
  persist: boolean;
  createdAt: string;
  lastAttemptAt: string;
}

export interface AppRuntimeState {
  myProfile: (PeerIdentity & { soundEnabled?: boolean }) | null;
  peers: Map<string, PeerSession>;
  chatHistory: Record<string, Array<Record<string, unknown>>>;
  helpRequests: HelpRequest[];
  pendingOutgoingHelpRequests: HelpRequest[];
  pendingReliableMessages: PendingReliableMessage[];
  userGroups: Array<{ id: string; name: string; memberIds: string[] }>;
  soundEnabled: boolean;
  networkOnline: boolean;
  isQuitting: boolean;
  myPortRef: { value: number };
  tray: Tray | null;
  mainWindow: BrowserWindow | null;
  overlayWindow: BrowserWindow | null;
  overlayState: { mode: string; data: unknown; broadcastId?: string } | null;
  lockWindow: BrowserWindow | null;
  screenLocked: boolean;
  forcedVideoWindow: BrowserWindow | null;
  forcedVideoActive: boolean;
  normalBroadcastWindows: Set<BrowserWindow>;
  helpPopupWindows: Map<string, BrowserWindow>;
}

export type WindowRuntimeState = Pick<
  AppRuntimeState,
  | 'mainWindow'
  | 'overlayWindow'
  | 'overlayState'
  | 'lockWindow'
  | 'screenLocked'
  | 'forcedVideoWindow'
  | 'forcedVideoActive'
  | 'normalBroadcastWindows'
  | 'helpPopupWindows'
  | 'isQuitting'
>;

export type SessionRuntimeState = Pick<
  AppRuntimeState,
  | 'myProfile'
  | 'peers'
  | 'myPortRef'
  | 'networkOnline'
>;

export type RecordsRuntimeState = Pick<
  AppRuntimeState,
  | 'chatHistory'
  | 'helpRequests'
  | 'pendingOutgoingHelpRequests'
  | 'pendingReliableMessages'
  | 'userGroups'
>;

export type AdminRuntimeState = Pick<
  AppRuntimeState,
  | 'myProfile'
  | 'peers'
  | 'helpRequests'
  | 'userGroups'
>;

export type NetworkRuntimeState = Pick<
  AppRuntimeState,
  | 'myProfile'
  | 'myPortRef'
  | 'peers'
  | 'chatHistory'
  | 'soundEnabled'
  | 'helpRequests'
>;

export type IpcRuntimeState = Pick<
  AppRuntimeState,
  | 'myProfile'
  | 'peers'
  | 'chatHistory'
  | 'helpRequests'
  | 'pendingOutgoingHelpRequests'
  | 'pendingReliableMessages'
  | 'userGroups'
  | 'networkOnline'
  | 'myPortRef'
  | 'mainWindow'
  | 'helpPopupWindows'
  | 'soundEnabled'
>;

export type TrayRuntimeState = Pick<
  AppRuntimeState,
  | 'myProfile'
  | 'peers'
  | 'helpRequests'
  | 'soundEnabled'
  | 'tray'
>;

export interface WindowManagerApi {
  createMainWindow(): void;
  initPreloadedWindows(): void;
  destroyPreloadedWindows(): void;
  applyWindowMode(modeName: string): void;
  showMainWindow(): void;
  closeOverlayWindow(force?: boolean): void;
  showNormalBroadcastPopup(data: unknown): void;
  showUrgentOverlay(data: { broadcastId?: string } & Record<string, unknown>): void;
  showHelpRequestPopup(req: unknown): void;
  showLockScreen(message: string): void;
  unlockScreen(): void;
  showForcedVideoWindow(data: Record<string, unknown>): void;
  closeForcedVideoWindow(force?: boolean): void;
  getMainWindow(): BrowserWindow | null;
}

export interface AdminModuleApi {
  COMMANDS: Record<string, AdminCommand>;
  run(command: AdminCommand, payload?: unknown): Promise<unknown>;
}
