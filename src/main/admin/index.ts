import type { AdminModuleApi } from '../../shared/types/runtime';
import type { AdminCommand } from '../../shared/contracts/admin';
import { ADMIN_COMMANDS } from './adminTypes';
import { createAdminPolicies } from './adminPolicies';
import { createAdminCommands } from './adminCommands';
import type { AdminCommandDeps } from './adminCommands';
import { createAdminController } from './adminController';
import { createAuthorizationBoundary } from '../auth/authorizationBoundary';
import { createAdminCommandValidators, createCommandValidation } from './commandValidation';
import { createAuditLogger } from '../audit/auditLogger';

interface AdminDeps extends AdminCommandDeps {
  hasAdminAccess: (role: string | undefined) => boolean;
  isSuperAdmin: (role: string | undefined) => boolean;
  onAuditEntry?: (entry: Record<string, unknown>) => void;
}

export function createAdminModule(deps: AdminDeps): AdminModuleApi {
  const policies = createAdminPolicies({
    state: deps.state,
    hasAdminAccess: deps.hasAdminAccess,
    isSuperAdmin: deps.isSuperAdmin
  });

  const commands = createAdminCommands(deps);
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
