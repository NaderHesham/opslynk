'use strict';

function createAppState(chatPortBase) {
  return {
    myProfile: null,
    peers: new Map(),
    chatHistory: {},
    helpRequests: [],
    pendingOutgoingHelpRequests: [],
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

module.exports = { createAppState };

