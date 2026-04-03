import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { RegistrarContext } from './types';

export function registerAppHandlers({
  handle,
  os,
  udp,
  state,
  storage,
  updateTrayMenu
}: RegistrarContext): void {
  handle(IPC_CHANNELS.app.GET_INIT_DATA, () => ({
    profile: state.myProfile,
    peers: [...state.peers.values()].map((p) => ({
      id: p.id, username: p.username, role: p.role, color: p.color, title: p.title,
      online: p.online, avatar: p.avatar || null, systemInfo: p.systemInfo || null
    })),
    history: state.chatHistory,
    helpRequests: state.helpRequests,
    userGroups: state.userGroups,
    hostname: os.hostname(),
    networkReady: !!(udp.getSocket()) && !!state.myPortRef.value,
    networkOnline: state.networkOnline
  }));

  handle(IPC_CHANNELS.app.GET_DEVICE_ID, () => {
    const devices = storage.loadDevices();
    return devices.self?.deviceId || state.myProfile?.id;
  });

  handle(IPC_CHANNELS.app.SET_SOUND, (value) => {
    state.soundEnabled = !!value;
    if (state.myProfile) state.myProfile.soundEnabled = state.soundEnabled;
    storage.saveProfile(state.myProfile);
    updateTrayMenu();
  });
}

