import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { LockScreenRegistrarDeps } from './types';

export function registerLockScreenHandlers({
  handle,
  adminModule
}: LockScreenRegistrarDeps): void {
  handle(IPC_CHANNELS.lockScreen.LOCK_ALL, (payload) =>
    adminModule.run(adminModule.COMMANDS.LOCK_ALL_SCREENS, payload));
  handle(IPC_CHANNELS.lockScreen.UNLOCK_ALL, () =>
    adminModule.run(adminModule.COMMANDS.UNLOCK_ALL_SCREENS));
}
