import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { ProfileRegistrarDeps } from './types';

export function registerProfileHandlers({
  handle,
  state,
  storage,
  broadcastToPeers,
  updateTrayMenu
}: ProfileRegistrarDeps): void {
  handle(IPC_CHANNELS.peer.UPDATE_PROFILE, (updates) => {
    Object.assign(state.myProfile || {}, updates);
    storage.saveProfile(state.myProfile);
    broadcastToPeers({ type: 'profile-update', id: state.myProfile?.id, ...updates });
    updateTrayMenu();
    return state.myProfile;
  });

  handle(IPC_CHANNELS.app.SET_SOUND, (value) => {
    state.soundEnabled = !!value;
    if (state.myProfile) state.myProfile.soundEnabled = state.soundEnabled;
    storage.saveProfile(state.myProfile);
    updateTrayMenu();
  });
}
