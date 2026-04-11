import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { AppRegistrarDeps } from './types';
import { getPeerConnectionState } from '../utils/roles';

export function registerAppHandlers({
  handle,
  os,
  udp,
  state,
  hasAdminAccess,
  sendToPeer
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
      restoredFromState: !!p.restoredFromState,
      identityVerified: !!p.identityVerified,
      identityRejected: !!p.identityRejected,
      avatar: p.avatar || null,
      systemInfo: p.systemInfo || null,
      activityState: p.activityState || (p.online ? 'active' : 'offline'),
      lastInputAt: p.lastInputAt || null,
      lastStateChangeAt: p.lastStateChangeAt || null,
      currentSessionStartedAt: p.currentSessionStartedAt || null,
      idleThresholdMs: p.idleThresholdMs || null,
      activityEvents: Array.isArray(p.activityEvents) ? p.activityEvents.slice(-24) : [],
      latestScreenshot: p.latestScreenshot || null,
      latestScreenshotRequestedAt: p.latestScreenshotRequestedAt || null,
      screenshotRequestPending: !!p.screenshotRequestPending,
      remoteLockActive: !!p.remoteLockActive,
      remoteVideoActive: !!p.remoteVideoActive,
      remoteControlUpdatedAt: Number(p.remoteControlUpdatedAt || 0) || null
    })),
    history: state.chatHistory,
    helpRequests: state.helpRequests,
    userGroups: state.userGroups,
    hostname: os.hostname(),
    networkReady: !!(udp.getSocket()) && !!state.myPortRef.value,
    networkOnline: state.networkOnline
  }));

  handle(IPC_CHANNELS.app.REPORT_ACTIVITY, ({ activity, transition }) => {
    if (!state.localActivity) {
      state.localActivity = {
        state: 'active',
        lastInputAt: Date.now(),
        lastStateChangeAt: Date.now(),
        idleThresholdMs: 300000
      };
    }

    state.localActivity = {
      state: activity?.state === 'idle' ? 'idle' : 'active',
      lastInputAt: Number(activity?.lastInputAt || state.localActivity.lastInputAt || Date.now()),
      lastStateChangeAt: Number(activity?.lastStateChangeAt || state.localActivity.lastStateChangeAt || Date.now()),
      idleThresholdMs: Number(activity?.idleThresholdMs || state.localActivity.idleThresholdMs || 300000)
    };

    if (transition?.type) {
      for (const peer of state.peers.values()) {
        if (!peer.online || !hasAdminAccess(peer.role)) continue;
        sendToPeer(peer.id, {
          type: 'activity-transition',
          fromId: state.myProfile?.id,
          transition: {
            type: transition.type,
            at: Number(transition.at || Date.now())
          },
          activity: state.localActivity
        });
      }
    }

    return { success: true };
  });
}
