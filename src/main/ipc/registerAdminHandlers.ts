import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { RegistrarContext } from './types';

export function registerAdminHandlers({
  handle,
  adminModule
}: RegistrarContext): void {
  handle(IPC_CHANNELS.admin.EXPORT_PEER_SPECS, (payload) => adminModule.run(adminModule.COMMANDS.EXPORT_PEER_SPECS, payload));
  handle(IPC_CHANNELS.admin.SAVE_USER_GROUP, (payload) => adminModule.run(adminModule.COMMANDS.SAVE_USER_GROUP, payload));
  handle(IPC_CHANNELS.admin.DELETE_USER_GROUP, (payload) => adminModule.run(adminModule.COMMANDS.DELETE_USER_GROUP, payload));

  handle(IPC_CHANNELS.lockScreen.LOCK_ALL, (payload) =>
    adminModule.run(adminModule.COMMANDS.LOCK_ALL_SCREENS, payload));
  handle(IPC_CHANNELS.lockScreen.UNLOCK_ALL, () =>
    adminModule.run(adminModule.COMMANDS.UNLOCK_ALL_SCREENS));
}
