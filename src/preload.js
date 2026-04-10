// preload.js — Secure IPC bridge between main and renderer
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('OpsLynk', {

  // ── INIT ───────────────────────────────────────────────────────────────────
  getInitData:  () => ipcRenderer.invoke('get-init-data'),
  getAppMode:   () => ipcRenderer.invoke('get-app-mode'),
  reportActivity: (data) => ipcRenderer.invoke('report-activity', data),
  getScreenshotPolling: () => ipcRenderer.invoke('get-screenshot-polling'),
  setScreenshotPolling: (data) => ipcRenderer.invoke('set-screenshot-polling', data),

  // ── CHAT ───────────────────────────────────────────────────────────────────
  sendChat:      (data) => ipcRenderer.invoke('send-chat', data),
  sendFileOffer: (data) => ipcRenderer.invoke('send-file-offer', data),

  // ── BROADCAST ──────────────────────────────────────────────────────────────
  sendBroadcast:       (data) => ipcRenderer.invoke('send-broadcast', data),
  sendAck:             (data) => ipcRenderer.invoke('send-ack', data),
  sendBroadcastReply:  (data) => ipcRenderer.invoke('send-broadcast-reply', data),

  // ── FORCED VIDEO ───────────────────────────────────────────────────────────
  selectVideoBroadcastFile: ()     => ipcRenderer.invoke('select-video-broadcast-file'),
  sendForcedVideoBroadcast: (data) => ipcRenderer.invoke('send-forced-video-broadcast', data),
  stopForcedVideoBroadcast: (data) => ipcRenderer.invoke('stop-forced-video-broadcast', data),

  // ── HELP ───────────────────────────────────────────────────────────────────
  sendHelpRequest: (data) => ipcRenderer.invoke('send-help-request', data),
  ackHelp:         (data) => ipcRenderer.invoke('ack-help', data),
  exportPeerSpecs: (data) => ipcRenderer.invoke('export-peer-specs', data),

  // ── GROUPS ─────────────────────────────────────────────────────────────────
  saveUserGroup:   (data) => ipcRenderer.invoke('save-user-group', data),
  deleteUserGroup: (data) => ipcRenderer.invoke('delete-user-group', data),

  // ── PROFILE ────────────────────────────────────────────────────────────────
  updateProfile: (data) => ipcRenderer.invoke('update-profile', data),
  selectAvatar:  ()     => ipcRenderer.invoke('select-avatar'),

  // ── SCREEN LOCK ────────────────────────────────────────────────────────────
  lockAllScreens:   (data) => ipcRenderer.invoke('lock-all-screens', data),
  unlockAllScreens: ()     => ipcRenderer.invoke('unlock-all-screens'),

  // ── SCREENSHOT ─────────────────────────────────────────────────────────────
  captureScreenshotPreview: () => ipcRenderer.invoke('capture-screenshot-preview'),
  requestPeerScreenshot:    (data) => ipcRenderer.invoke('request-peer-screenshot', data),

  // ── DEVICE ─────────────────────────────────────────────────────────────────
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),

  // ── WINDOW ─────────────────────────────────────────────────────────────────
  minimize:             ()    => ipcRenderer.invoke('window-minimize'),
  maximize:             ()    => ipcRenderer.invoke('window-maximize'),
  close:                ()    => ipcRenderer.invoke('window-close'),
  setMainWindow:        ()    => ipcRenderer.invoke('window-set-main-mode'),
  setSound:             (val) => ipcRenderer.invoke('set-sound', val),
  dismissBroadcastPopup:()    => ipcRenderer.invoke('broadcast-popup-close'),

  // ── URGENT OVERLAY ─────────────────────────────────────────────────────────
  urgentAck:   (data) => ipcRenderer.send('urgent-ack', data),
  urgentReply: (data) => ipcRenderer.send('urgent-reply', data),

  // ── AUTH ───────────────────────────────────────────────────────────────────
  auth: {
    isFirstRun:     ()     => ipcRenderer.invoke('auth:is-first-run'),
    setup:          (data) => ipcRenderer.invoke('auth:setup', data),
    login:          (data) => ipcRenderer.invoke('auth:login', data),
    logout:         ()     => ipcRenderer.invoke('auth:logout'),
    createUser:     (data) => ipcRenderer.invoke('auth:create-user', data),
    updateSelfProfile: (data) => ipcRenderer.invoke('auth:update-self-profile', data),
    changePassword: (data) => ipcRenderer.invoke('auth:change-password', data),
    deleteUser:     (data) => ipcRenderer.invoke('auth:delete-user', data),
    listUsers:      ()     => ipcRenderer.invoke('auth:list-users'),
  },

  // ── EVENTS FROM MAIN ───────────────────────────────────────────────────────
  on:   (event, cb) => {
    ipcRenderer.on(event, (_, data) => cb(data));
    return () => ipcRenderer.removeAllListeners(event);
  },
  once: (event, cb) => ipcRenderer.once(event, (_, data) => cb(data))
});
