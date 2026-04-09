'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const helpSvc = require('../../src/services/helpService');

function createRequest() {
  return {
    reqId: 'req-1',
    msgId: 'msg-1',
    fromId: 'client-1',
    username: 'Client One',
    machine: 'PC-1',
    description: 'Need help',
    priority: 'high',
    timestamp: '2026-04-09T10:00:00.000Z',
    deliveredAdminIds: []
  };
}

test('enqueueOrDeliverHelpRequest uses transport for known admin peers even if they are offline', () => {
  const req = createRequest();
  const peers = new Map([
    ['admin-1', { id: 'admin-1', role: 'admin', online: false, ws: null }]
  ]);
  const pendingOutgoingHelpRequests = [];
  const tracked = [];
  let saveCalls = 0;

  const result = helpSvc.enqueueOrDeliverHelpRequest(
    peers,
    pendingOutgoingHelpRequests,
    req,
    () => false,
    (role) => role === 'admin' || role === 'super_admin',
    () => { saveCalls += 1; },
    {
      track: (entry) => {
        tracked.push(entry);
        return true;
      }
    }
  );

  assert.deepEqual(result, { sent: 1, queued: false });
  assert.equal(tracked.length, 1);
  assert.equal(tracked[0].kind, 'help-request');
  assert.equal(tracked[0].peerId, 'admin-1');
  assert.deepEqual(req.deliveredAdminIds, ['admin-1']);
  assert.equal(pendingOutgoingHelpRequests.length, 0);
  assert.equal(saveCalls, 1);
});

test('enqueueOrDeliverHelpRequest falls back to legacy pending queue when no admin peers are known', () => {
  const req = createRequest();
  const peers = new Map();
  const pendingOutgoingHelpRequests = [];
  let saveCalls = 0;

  const result = helpSvc.enqueueOrDeliverHelpRequest(
    peers,
    pendingOutgoingHelpRequests,
    req,
    () => false,
    () => false,
    () => { saveCalls += 1; },
    null
  );

  assert.deepEqual(result, { sent: 0, queued: true });
  assert.equal(pendingOutgoingHelpRequests.length, 1);
  assert.equal(pendingOutgoingHelpRequests[0], req);
  assert.equal(saveCalls, 1);
});
