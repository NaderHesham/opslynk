import type { AppRuntimeState } from '../../shared/types/runtime';

export function createAppState(chatPortBase: number): AppRuntimeState {
  return {
    myProfile: null,
    localActivity: {
      state: 'active',
      lastInputAt: Date.now(),
      lastStateChangeAt: Date.now(),
      idleThresholdMs: 300000
    },
    peers: new Map(),
    chatHistory: {},
    helpRequests: [],
    pendingOutgoingHelpRequests: [],
    pendingReliableMessages: [],
    userGroups: [],
    soundEnabled: true,
    networkOnline: false,
    isQuitting: false,
    myPortRef: { value: chatPortBase },
    tray: null,
    mainWindow: null,
    overlayWindow: null,
    overlayState: null,
    lockWindow: null,
    screenLocked: false,
    enforcedLock: {
      locked: false,
      message: '',
      lockedAt: null,
      byPeerId: null
    },
    enforcedVideo: {
      active: false,
      fromId: null,
      fromName: '',
      videoB64: '',
      mime: 'video/mp4',
      fileName: '',
      label: '',
      broadcastId: null,
      timestamp: null
    },
    forcedVideoWindow: null,
    forcedVideoActive: false,
    normalBroadcastWindows: new Set(),
    helpPopupWindows: new Map(),
    chatPopupWindows: new Map()
  };
}

