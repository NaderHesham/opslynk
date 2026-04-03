import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { PeerRegistrarDeps } from './types';

export function registerPeerHandlers({
  handle,
  state,
  storage,
  broadcastToPeers,
  updateTrayMenu
}: PeerRegistrarDeps): void {
  handle(IPC_CHANNELS.peer.UPDATE_PROFILE, (updates) => {
    Object.assign(state.myProfile || {}, updates);
    storage.saveProfile(state.myProfile);
    broadcastToPeers({ type: 'profile-update', id: state.myProfile?.id, ...updates });
    updateTrayMenu();
    return state.myProfile;
  });
}
