import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { AdminRegistrarDeps } from './types';

export function registerAdminHandlers({
  handle,
  adminModule
}: AdminRegistrarDeps): void {
  handle(IPC_CHANNELS.admin.EXPORT_PEER_SPECS, (payload) => adminModule.run(adminModule.COMMANDS.EXPORT_PEER_SPECS, payload));
  handle(IPC_CHANNELS.admin.EXECUTE_PEER_DEVICE_ACTION, (payload) =>
    adminModule.run(adminModule.COMMANDS.EXECUTE_PEER_DEVICE_ACTION, payload) as Promise<{ success: boolean; error?: string; commandId?: string; targetCount?: number }>);
}
