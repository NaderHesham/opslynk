import type { AdminModuleApi, AppRuntimeState } from '../../shared/types/runtime';
import type { AdminCommand } from '../../shared/contracts/admin';
import { ADMIN_COMMANDS } from './adminTypes';
import { createAdminPolicies } from './adminPolicies';
import { createAdminCommands } from './adminCommands';
import { createAdminController } from './adminController';

interface AdminDeps {
  state: AppRuntimeState;
  hasAdminAccess: (role: string | undefined) => boolean;
  isSuperAdmin: (role: string | undefined) => boolean;
  [key: string]: unknown;
}

export function createAdminModule(deps: AdminDeps): AdminModuleApi {
  const policies = createAdminPolicies({
    state: deps.state,
    hasAdminAccess: deps.hasAdminAccess,
    isSuperAdmin: deps.isSuperAdmin
  });

  const commands = createAdminCommands(deps as never);

  const controller = createAdminController({
    commands,
    policies: policies as { check: (command: AdminCommand, payload?: Record<string, unknown>) => { allowed: boolean; error?: string } },
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

