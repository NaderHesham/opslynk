import type { AdminRuntimeState } from '../../shared/types/runtime';
import { ADMIN_COMMANDS } from './adminTypes';

interface PolicyDeps {
  state: AdminRuntimeState;
  hasAdminAccess: (role: string | undefined) => boolean;
  isSuperAdmin: (role: string | undefined) => boolean;
}

export function createAdminPolicies({ state, hasAdminAccess, isSuperAdmin }: PolicyDeps): {
  check: (command: string) => { allowed: boolean; error?: string };
} {
  const superAdminCommands = new Set<string>([ADMIN_COMMANDS.LOCK_ALL_SCREENS, ADMIN_COMMANDS.UNLOCK_ALL_SCREENS]);

  function check(command: string): { allowed: boolean; error?: string } {
    if (superAdminCommands.has(command)) {
      if (!isSuperAdmin(state.myProfile?.role)) return { allowed: false, error: 'Super Admin only.' };
      return { allowed: true };
    }

    if (!hasAdminAccess(state.myProfile?.role)) return { allowed: false, error: 'Admin only.' };
    return { allowed: true };
  }

  return { check };
}
