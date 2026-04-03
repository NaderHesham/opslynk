import type { AdminCommand } from '../../shared/contracts/admin';
import { ADMIN_COMMANDS } from '../admin/adminTypes';

export interface AuthorizationRequest {
  command: AdminCommand;
  payload: Record<string, unknown>;
}

export interface AuthorizationDecision {
  allowed: boolean;
  error?: string;
  mode: 'policy' | 'legacy-trust' | 'hard-deny';
}

interface AuthorizationBoundaryDeps {
  checkPolicy?: (command: AdminCommand, payload: Record<string, unknown>) => { allowed: boolean; error?: string };
}

const SENSITIVE_COMMANDS = new Set<AdminCommand>([
  ADMIN_COMMANDS.SEND_BROADCAST,
  ADMIN_COMMANDS.SEND_FORCED_VIDEO_BROADCAST,
  ADMIN_COMMANDS.STOP_FORCED_VIDEO_BROADCAST,
  ADMIN_COMMANDS.LOCK_ALL_SCREENS,
  ADMIN_COMMANDS.UNLOCK_ALL_SCREENS,
  ADMIN_COMMANDS.ACK_HELP,
  ADMIN_COMMANDS.EXPORT_PEER_SPECS,
  ADMIN_COMMANDS.SAVE_USER_GROUP,
  ADMIN_COMMANDS.DELETE_USER_GROUP
]);

export function createAuthorizationBoundary({ checkPolicy }: AuthorizationBoundaryDeps): {
  authorize: (request: AuthorizationRequest) => AuthorizationDecision;
} {
  function authorize(request: AuthorizationRequest): AuthorizationDecision {
    if (!checkPolicy) {
      if (SENSITIVE_COMMANDS.has(request.command)) {
        return { allowed: false, error: 'Authorization policy is not configured.', mode: 'hard-deny' };
      }
      return { allowed: true, mode: 'legacy-trust' };
    }
    const result = checkPolicy(request.command, request.payload);
    return { allowed: result.allowed, error: result.error, mode: 'policy' };
  }

  return { authorize };
}
