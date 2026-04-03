import type { BrowserWindow, Tray } from 'electron';
import type { AdminCommand } from '../contracts/admin';

export type UserRole = 'user' | 'admin' | 'super_admin';
export type PeerStatus = 'online' | 'offline';

export interface PeerIdentity {
  id: string;
  username: string;
  role: UserRole | string;
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
  lastSeen?: number;
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

export interface AppRuntimeState {
  myProfile: (PeerIdentity & { soundEnabled?: boolean }) | null;
  peers: Map<string, PeerSession>;
  chatHistory: Record<string, Array<Record<string, unknown>>>;
  helpRequests: HelpRequest[];
  pendingOutgoingHelpRequests: HelpRequest[];
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

export interface WindowManagerApi {
  createMainWindow(): void;
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
