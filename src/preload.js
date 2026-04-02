// preload.js — Secure IPC bridge between main and renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('OpsLynk', {
  // Init
  getInitData: () => ipcRenderer.invoke('get-init-data'),

  // Chat
  sendChat: (data) => ipcRenderer.invoke('send-chat', data),

  // Broadcast
  sendBroadcast: (data) => ipcRenderer.invoke('send-broadcast', data),
  sendAck: (data) => ipcRenderer.invoke('send-ack', data),
  sendBroadcastReply: (data) => ipcRenderer.invoke('send-broadcast-reply', data),

  // Help
  sendHelpRequest: (data) => ipcRenderer.invoke('send-help-request', data),
  ackHelp: (data) => ipcRenderer.invoke('ack-help', data),
  exportPeerSpecs: (data) => ipcRenderer.invoke('export-peer-specs', data),
  saveUserGroup: (data) => ipcRenderer.invoke('save-user-group', data),
  deleteUserGroup: (data) => ipcRenderer.invoke('delete-user-group', data),

  // Profile
  updateProfile: (data) => ipcRenderer.invoke('update-profile', data),
  unlockAdmin: (password) => ipcRenderer.invoke('unlock-admin', password),
  unlockSuperAdmin: (password) => ipcRenderer.invoke('unlock-super-admin', password),
  signoutAdmin: () => ipcRenderer.invoke('signout-admin'),
  selectAvatar: () => ipcRenderer.invoke('select-avatar'),

  // Screen Lock (admin only)
  lockAllScreens:   (data) => ipcRenderer.invoke('lock-all-screens', data),
  unlockAllScreens: ()     => ipcRenderer.invoke('unlock-all-screens'),

  // Device identity
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),

  // Forced video broadcast
  selectVideoBroadcastFile: () => ipcRenderer.invoke('select-video-broadcast-file'),
  sendForcedVideoBroadcast: (data) => ipcRenderer.invoke('send-forced-video-broadcast', data),
  stopForcedVideoBroadcast: (data) => ipcRenderer.invoke('stop-forced-video-broadcast', data),

  // Files
  sendFileOffer: (data) => ipcRenderer.invoke('send-file-offer', data),

  // Screenshot
  captureScreenshotPreview: () => ipcRenderer.invoke('capture-screenshot-preview'),

  // Window
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close:    () => ipcRenderer.invoke('window-close'),
  setLoginWindow: () => ipcRenderer.invoke('window-set-login-mode'),
  setMainWindow: () => ipcRenderer.invoke('window-set-main-mode'),
  setSound: (val) => ipcRenderer.invoke('set-sound', val),
  dismissBroadcastPopup: () => ipcRenderer.invoke('broadcast-popup-close'),

  // Urgent overlay
  urgentAck:   (data) => ipcRenderer.send('urgent-ack', data),
  urgentReply: (data) => ipcRenderer.send('urgent-reply', data),

  // Events from main
  on: (event, cb) => {
    ipcRenderer.on(event, (_, data) => cb(data));
    return () => ipcRenderer.removeAllListeners(event);
  },
  once: (event, cb) => ipcRenderer.once(event, (_, data) => cb(data))
});
