import type { AdminCommand } from '../../shared/contracts/admin';

export interface AuthorizationRequest {
  command: AdminCommand;
  payload: Record<string, unknown>;
}

export interface AuthorizationDecision {
  allowed: boolean;
  error?: string;
  mode: 'policy' | 'legacy-trust';
}

interface AuthorizationBoundaryDeps {
  checkPolicy?: (command: AdminCommand, payload: Record<string, unknown>) => { allowed: boolean; error?: string };
}

export function createAuthorizationBoundary({ checkPolicy }: AuthorizationBoundaryDeps): {
  authorize: (request: AuthorizationRequest) => AuthorizationDecision;
} {
  function authorize(request: AuthorizationRequest): AuthorizationDecision {
    if (!checkPolicy) {
      // Temporary compatibility mode. Keeps legacy behavior until explicit auth logic is introduced.
      return { allowed: true, mode: 'legacy-trust' };
    }
    const result = checkPolicy(request.command, request.payload);
    return { allowed: result.allowed, error: result.error, mode: 'policy' };
  }

  return { authorize };
}
