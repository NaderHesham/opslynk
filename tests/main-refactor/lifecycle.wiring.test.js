'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { registerLifecycle } = require('../../src/main/bootstrap/lifecycle');

function createAppMock() {
  const events = new Map();
  let readyCallback = null;
  const app = {
    whenReady: () => ({ then: (cb) => { readyCallback = cb; } }),
    on: (event, cb) => events.set(event, cb),
    setLoginItemSettings: (settings) => { app.settings = settings; },
    events,
    getReadyCallback: () => readyCallback
  };
  return app;
}

test('lifecycle startup wires renderer bridge and startup sequence', async () => {
  const app = createAppMock();
  const calls = [];
  const state = { myProfile: null, isQuitting: false };
  let bridgeFn = null;

  registerLifecycle({
    app,
    process: { execPath: 'C:\\Ops\\OpsLynk.exe' },
    storage: {
      ensureDirs: () => calls.push('ensureDirs'),
      loadProfile: () => null,
      saveProfile: () => calls.push('saveProfile'),
      loadState: () => ({ helpRequests: [], pendingOutgoingHelpRequests: [], userGroups: [] }),
      loadHistory: () => ({})
    },
    state,
    getPrimaryNetworkInfo: () => ({ ip: '10.0.0.10' }),
    getOrCreateDeviceIdentity: () => ({ deviceId: 'dev-1' }),
    buildDefaultProfile: () => ({ id: 'dev-1', username: 'Device-1' }),
    getSystemInfo: () => ({ os: 'win' }),
    ensureControlProfile: () => { state.myProfile.role = 'super_admin'; },
    startNetworkMonitor: () => calls.push('startNetworkMonitor'),
    startPeerSession: async () => calls.push('startPeerSession'),
    createMainWindow: () => calls.push('createMainWindow'),
    createTray: () => calls.push('createTray'),
    bus: {},
    setRendererBridge: (fn) => { bridgeFn = fn; },
    broadcastToRenderer: (event, payload) => calls.push(`bridge:${event}:${payload}`),
    doSaveHistory: () => calls.push('saveHistory'),
    doSaveState: () => calls.push('saveState')
  });

  await app.getReadyCallback()();
  assert.equal(state.myProfile.id, 'dev-1');
  assert.equal(state.myProfile.role, 'super_admin');
  assert.ok(typeof bridgeFn === 'function');
  bridgeFn('evt', 'payload');
  assert.ok(calls.includes('startNetworkMonitor'));
  assert.ok(calls.includes('startPeerSession'));
  assert.ok(calls.includes('createMainWindow'));
  assert.ok(calls.includes('createTray'));
  assert.ok(calls.includes('bridge:evt:payload'));
});

test('lifecycle quit/close handlers preserve cleanup behavior', () => {
  const app = createAppMock();
  const calls = [];
  const state = { myProfile: { id: 'x' }, isQuitting: false };

  registerLifecycle({
    app,
    process: { execPath: 'C:\\Ops\\OpsLynk.exe' },
    storage: {
      ensureDirs: () => {},
      loadProfile: () => ({ id: 'x' }),
      saveProfile: () => calls.push('saveProfile'),
      loadState: () => ({ helpRequests: [], pendingOutgoingHelpRequests: [], userGroups: [] }),
      loadHistory: () => ({})
    },
    state,
    getPrimaryNetworkInfo: () => ({ ip: '10.0.0.10' }),
    getOrCreateDeviceIdentity: () => ({ deviceId: 'dev-1' }),
    buildDefaultProfile: () => ({ id: 'dev-1' }),
    getSystemInfo: () => ({}),
    ensureControlProfile: () => {},
    startNetworkMonitor: () => {},
    startPeerSession: async () => {},
    createMainWindow: () => {},
    createTray: () => {},
    bus: {},
    setRendererBridge: () => {},
    broadcastToRenderer: () => {},
    doSaveHistory: () => calls.push('saveHistory'),
    doSaveState: () => calls.push('saveState')
  });

  const closeEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  app.events.get('window-all-closed')(closeEvent);
  assert.equal(closeEvent.prevented, true);

  app.events.get('before-quit')();
  assert.equal(state.isQuitting, true);
  assert.deepEqual(calls, ['saveHistory', 'saveProfile', 'saveState']);
});
