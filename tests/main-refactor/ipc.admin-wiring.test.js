'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { registerIpcHandlers } = require('../../src/main/ipc/registerIpcHandlers');

function createIpcMainMock() {
  const handles = new Map();
  const listeners = new Map();
  return {
    handle: (channel, fn) => handles.set(channel, fn),
    on: (channel, fn) => listeners.set(channel, fn),
    handles,
    listeners
  };
}

function createDeps() {
  const ipcMain = createIpcMainMock();
  const adminCalls = [];
  const sent = [];
  let overlayClosed = false;

  const state = {
    myProfile: { id: 'self-1', role: 'super_admin', username: 'Operator', soundEnabled: true },
    peers: new Map(),
    chatHistory: {},
    helpRequests: [],
    userGroups: [],
    myPortRef: { value: 4100 },
    networkOnline: true,
    pendingOutgoingHelpRequests: [],
    mainWindow: { minimize: () => {}, isMaximized: () => false, maximize: () => {}, hide: () => {} },
    soundEnabled: true
  };

  const deps = {
    ipcMain,
    BrowserWindow: { fromWebContents: () => ({ isDestroyed: () => false, close: () => {} }) },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    fs: { statSync: () => ({ size: 1 }), readFileSync: () => Buffer.from('x') },
    path: require('path'),
    os: { hostname: () => 'host-1' },
    uuidv4: () => 'uuid-1',
    storage: { saveProfile: () => {}, loadDevices: () => ({ self: { deviceId: 'dev-1' } }) },
    wsNet: {},
    udp: { getSocket: () => ({}) },
    helpSvc: { deliverHelpRequestToAdmin: () => false },
    bus: { emit: () => {} },
    EVENTS: { GOTO_TAB: 'goto', FOCUS_HELP: 'focus' },
    captureScreenshot: async () => null,
    state,
    hasAdminAccess: () => true,
    adminModule: {
      COMMANDS: {
        SEND_BROADCAST: 'send_broadcast',
        SEND_FORCED_VIDEO_BROADCAST: 'send_forced_video_broadcast',
        STOP_FORCED_VIDEO_BROADCAST: 'stop_forced_video_broadcast',
        ACK_HELP: 'ack_help',
        LOCK_ALL_SCREENS: 'lock_all_screens',
        UNLOCK_ALL_SCREENS: 'unlock_all_screens'
      },
      run: async (command, payload) => {
        adminCalls.push({ command, payload });
        return { success: true };
      }
    },
    sendToPeer: (peerId, payload) => sent.push({ peerId, payload }),
    broadcastToPeers: () => {},
    doSaveHistory: () => {},
    doSaveState: () => {},
    updateTrayMenu: () => {},
    applyWindowMode: () => {},
    closeOverlayWindow: (force) => { overlayClosed = force === true; },
    adminCalls,
    sent,
    get overlayClosed() { return overlayClosed; }
  };

  return deps;
}

test('admin IPC channels are registered and routed to admin module', async () => {
  const deps = createDeps();
  registerIpcHandlers(deps);

  assert.ok(deps.ipcMain.handles.has('send-broadcast'));
  assert.ok(deps.ipcMain.handles.has('send-forced-video-broadcast'));
  assert.ok(deps.ipcMain.handles.has('stop-forced-video-broadcast'));
  assert.ok(deps.ipcMain.handles.has('lock-all-screens'));
  assert.ok(deps.ipcMain.handles.has('unlock-all-screens'));
  assert.ok(deps.ipcMain.handles.has('ack-help'));

  await deps.ipcMain.handles.get('send-broadcast')(null, { text: 'x', urgency: 'urgent', durationSeconds: 10 });
  await deps.ipcMain.handles.get('lock-all-screens')(null, { message: 'L' });

  assert.equal(deps.adminCalls[0].command, 'send_broadcast');
  assert.equal(deps.adminCalls[1].command, 'lock_all_screens');
});

test('urgent reply/ack listeners keep transport behavior', () => {
  const deps = createDeps();
  registerIpcHandlers(deps);

  deps.ipcMain.listeners.get('urgent-ack')(null, { peerId: 'p1', broadcastId: 'b1' });
  deps.ipcMain.listeners.get('urgent-reply')(null, { peerId: 'p1', text: 'ok', broadcastId: 'b1' });

  assert.equal(deps.sent[0].payload.type, 'ack');
  assert.equal(deps.sent[1].payload.type, 'broadcast-reply');
  assert.equal(deps.overlayClosed, true);
});
