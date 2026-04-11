import type { PeerConnectionState, PeerSession, UserRole } from '../../shared/types/runtime';

export function hasAdminAccess(role: string | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

export function isSuperAdmin(role: string | undefined): boolean {
  return role === 'super_admin';
}

export function getRoleRank(role: UserRole | string | undefined): number {
  return role === 'super_admin' ? 2 : role === 'admin' ? 1 : 0;
}

export function getPeerConnectionState(peer: PeerSession): PeerConnectionState {
  if (peer.identityRejected) return 'degraded';
  if (peer.connectionState) return peer.connectionState;
  return peer.online ? 'connected' : 'offline';
}

export function peerToSafe(peer: PeerSession): {
  id: string;
  username: string;
  role: string;
  deviceId?: string;
  identityFingerprint?: string;
  color?: string;
  title?: string;
  online: boolean;
  connectionState: PeerConnectionState;
  restoredFromState: boolean;
  avatar: string | null;
  systemInfo: Record<string, unknown> | null;
  identityVerified: boolean;
  identityRejected: boolean;
  activityState: 'active' | 'idle' | 'offline';
  lastInputAt: number | null;
  lastStateChangeAt: number | null;
  currentSessionStartedAt: number | null;
  idleThresholdMs: number | null;
  activityEvents: Array<{ type: 'online' | 'offline' | 'active' | 'idle'; at: number }>;
  latestScreenshot: { capturedAt: number; name?: string | null; size?: number | null; mime?: string | null } | null;
  latestScreenshotRequestedAt: number | null;
  screenshotRequestPending: boolean;
  remoteLockActive: boolean;
  remoteVideoActive: boolean;
  remoteControlUpdatedAt: number | null;
} {
  return {
    id: peer.id,
    username: peer.username,
    role: peer.role,
    deviceId: peer.deviceId,
    identityFingerprint: peer.identityFingerprint,
    color: peer.color,
    title: peer.title,
    online: peer.online,
    connectionState: getPeerConnectionState(peer),
    restoredFromState: !!peer.restoredFromState,
    avatar: peer.avatar || null,
    systemInfo: peer.systemInfo || null,
    identityVerified: !!peer.identityVerified,
    identityRejected: !!peer.identityRejected,
    activityState: peer.activityState || (peer.online ? 'active' : 'offline'),
    lastInputAt: peer.lastInputAt || null,
    lastStateChangeAt: peer.lastStateChangeAt || null,
    currentSessionStartedAt: peer.currentSessionStartedAt || null,
    idleThresholdMs: peer.idleThresholdMs || null,
    activityEvents: Array.isArray(peer.activityEvents) ? peer.activityEvents.slice(-24) : [],
    latestScreenshot: peer.latestScreenshot || null,
    latestScreenshotRequestedAt: peer.latestScreenshotRequestedAt || null,
    screenshotRequestPending: !!peer.screenshotRequestPending,
    remoteLockActive: !!peer.remoteLockActive,
    remoteVideoActive: !!peer.remoteVideoActive,
    remoteControlUpdatedAt: Number(peer.remoteControlUpdatedAt || 0) || null
  };
}

