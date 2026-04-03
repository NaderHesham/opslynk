import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { GroupRegistrarDeps } from './types';

export function registerGroupHandlers({
  handle,
  adminModule
}: GroupRegistrarDeps): void {
  handle(IPC_CHANNELS.admin.SAVE_USER_GROUP, (payload) => adminModule.run(adminModule.COMMANDS.SAVE_USER_GROUP, payload));
  handle(IPC_CHANNELS.admin.DELETE_USER_GROUP, (payload) => adminModule.run(adminModule.COMMANDS.DELETE_USER_GROUP, payload));
}
