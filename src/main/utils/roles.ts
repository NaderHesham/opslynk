import type { PeerSession, UserRole } from '../../shared/types/runtime';

export function hasAdminAccess(role: string | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

export function isSuperAdmin(role: string | undefined): boolean {
  return role === 'super_admin';
}

export function getRoleRank(role: UserRole | string | undefined): number {
  return role === 'super_admin' ? 2 : role === 'admin' ? 1 : 0;
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
  avatar: string | null;
  systemInfo: Record<string, unknown> | null;
  identityVerified: boolean;
  identityRejected: boolean;
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
    avatar: peer.avatar || null,
    systemInfo: peer.systemInfo || null,
    identityVerified: !!peer.identityVerified,
    identityRejected: !!peer.identityRejected
  };
}

