import type { AppRuntimeState } from '../../shared/types/runtime';

export function createAppState(chatPortBase: number): AppRuntimeState {
  return {
    myProfile: null,
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
    forcedVideoWindow: null,
    forcedVideoActive: false,
    normalBroadcastWindows: new Set(),
    helpPopupWindows: new Map()
  };
}

