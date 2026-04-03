import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { AdminRegistrarDeps } from './types';

export function registerAdminHandlers({
  handle,
  adminModule
}: AdminRegistrarDeps): void {
  handle(IPC_CHANNELS.admin.EXPORT_PEER_SPECS, (payload) => adminModule.run(adminModule.COMMANDS.EXPORT_PEER_SPECS, payload));
}
