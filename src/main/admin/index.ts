import type { AdminModuleApi, AdminRuntimeState } from '../../shared/types/runtime';
import type { AdminCommand } from '../../shared/contracts/admin';
import type { CommandOrigin } from '../security/deviceTrust';
import { ADMIN_COMMANDS } from './adminTypes';
import { createAdminPolicies } from './adminPolicies';
import { createAdminCommands } from './adminCommands';
import { createAdminController } from './adminController';
import { createAuthorizationBoundary } from '../auth/authorizationBoundary';
import { createAdminCommandValidators, createCommandValidation } from './commandValidation';
import { createAuditLogger } from '../audit/auditLogger';

interface AdminDeps {
  state: AdminRuntimeState;
  hasAdminAccess: (role: string | undefined) => boolean;
  isSuperAdmin: (role: string | undefined) => boolean;
  onAuditEntry?: (entry: Record<string, unknown>) => void;
  buildCommandOrigin: (commandType: string) => CommandOrigin;
  [key: string]: unknown;
}

export function createAdminModule(deps: AdminDeps): AdminModuleApi {
  const policies = createAdminPolicies({
    state: deps.state,
    hasAdminAccess: deps.hasAdminAccess,
    isSuperAdmin: deps.isSuperAdmin
  });

  const commands = createAdminCommands(deps as never);
  const checkPolicy = (command: AdminCommand, payload: Record<string, unknown>): { allowed: boolean; error?: string } =>
    policies.check(command, payload);
  const authorization = createAuthorizationBoundary({
    checkPolicy
  });
  const validation = createCommandValidation({ validators: createAdminCommandValidators() });
  const auditLogger = createAuditLogger({ onEntry: deps.onAuditEntry });

  const controller = createAdminController({
    commands,
    policies: policies as { check: (command: AdminCommand, payload?: Record<string, unknown>) => { allowed: boolean; error?: string } },
    authorization,
    validation,
    auditLogger,
    hooks: {
      onDenied: () => {},
      onBeforeExecute: () => {},
      onAfterExecute: () => {}
    }
  });

  return {
    COMMANDS: ADMIN_COMMANDS,
    run: controller.run
  };
}
