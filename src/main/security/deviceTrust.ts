import type { PeerSession } from '../../shared/types/runtime';

export interface CommandOrigin {
  issuerId: string;
  issuerDeviceId: string;
  issuerRole: string;
  issuedAt: string;
  commandType: string;
}

interface DeviceTrustDeps {
  hasAdminAccess: (role: string | undefined) => boolean;
  trustStore: {
    isTrustedPeer: (peerId: string, role?: string) => boolean;
    rememberPeer: (peerId: string, role?: string) => void;
    isBlockedPeer: (peerId: string) => boolean;
  };
  maxClockSkewMs?: number;
}

export function createDeviceTrust({
  hasAdminAccess,
  trustStore,
  maxClockSkewMs = 10 * 60 * 1000
}: DeviceTrustDeps): {
  buildOrigin: (params: { issuerId: string; issuerRole: string; commandType: string }) => CommandOrigin;
  evaluateIncomingControl: (params: {
    commandType: string;
    fromId: string;
    sender?: PeerSession;
    origin?: Partial<CommandOrigin>;
  }) => { trusted: boolean; reason: string; mode: 'trusted' | 'denied' };
} {
  const buildOrigin = ({ issuerId, issuerRole, commandType }: { issuerId: string; issuerRole: string; commandType: string }): CommandOrigin => ({
    issuerId,
    issuerDeviceId: issuerId,
    issuerRole,
    issuedAt: new Date().toISOString(),
    commandType
  });

  const evaluateIncomingControl = ({
    commandType,
    fromId,
    sender,
    origin
  }: {
    commandType: string;
    fromId: string;
    sender?: PeerSession;
    origin?: Partial<CommandOrigin>;
  }): { trusted: boolean; reason: string; mode: 'trusted' | 'denied' } => {
    if (!sender) return { trusted: false, reason: 'unknown-sender', mode: 'denied' };
    if (!hasAdminAccess(sender.role)) return { trusted: false, reason: 'sender-not-admin', mode: 'denied' };
    if (trustStore.isBlockedPeer(sender.id)) return { trusted: false, reason: 'sender-blocked', mode: 'denied' };
    if (!trustStore.isTrustedPeer(sender.id, sender.role)) return { trusted: false, reason: 'sender-not-trusted', mode: 'denied' };
    trustStore.rememberPeer(sender.id, sender.role);

    if (!origin) return { trusted: false, reason: 'origin-missing', mode: 'denied' };
    if (origin.commandType !== commandType) return { trusted: false, reason: 'origin-command-mismatch', mode: 'denied' };
    if (origin.issuerId !== fromId || origin.issuerDeviceId !== fromId) return { trusted: false, reason: 'origin-issuer-mismatch', mode: 'denied' };
    if (!hasAdminAccess(origin.issuerRole)) return { trusted: false, reason: 'origin-role-not-admin', mode: 'denied' };

    const issuedAtMs = Date.parse(String(origin.issuedAt || ''));
    if (!Number.isFinite(issuedAtMs)) return { trusted: false, reason: 'origin-invalid-timestamp', mode: 'denied' };
    if (Math.abs(Date.now() - issuedAtMs) > maxClockSkewMs) return { trusted: false, reason: 'origin-timestamp-skew', mode: 'denied' };

    return { trusted: true, reason: 'trusted-origin', mode: 'trusted' };
  };

  return { buildOrigin, evaluateIncomingControl };
}
