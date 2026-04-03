import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { StorageRegistrarDeps } from './types';

export function registerStorageHandlers({
  handle,
  state,
  storage
}: StorageRegistrarDeps): void {
  handle(IPC_CHANNELS.app.GET_DEVICE_ID, () => {
    const devices = storage.loadDevices();
    return devices.self?.deviceId || state.myProfile?.id;
  });
}
