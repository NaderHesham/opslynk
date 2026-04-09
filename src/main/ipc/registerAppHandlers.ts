import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { AppRegistrarDeps } from './types';
import { getPeerConnectionState } from '../utils/roles';

export function registerAppHandlers({
  handle,
  os,
  udp,
  state
}: AppRegistrarDeps): void {
  handle(IPC_CHANNELS.app.GET_INIT_DATA, () => ({
    profile: state.myProfile,
    peers: [...state.peers.values()].map((p) => ({
      id: p.id,
      username: p.username,
      role: p.role,
      deviceId: p.deviceId,
      identityFingerprint: p.identityFingerprint,
      color: p.color,
      title: p.title,
      online: p.online,
      connectionState: getPeerConnectionState(p),
      identityVerified: !!p.identityVerified,
      identityRejected: !!p.identityRejected,
      avatar: p.avatar || null,
      systemInfo: p.systemInfo || null
    })),
    history: state.chatHistory,
    helpRequests: state.helpRequests,
    userGroups: state.userGroups,
    hostname: os.hostname(),
    networkReady: !!(udp.getSocket()) && !!state.myPortRef.value,
    networkOnline: state.networkOnline
  }));

}
