'use strict';

function hasAdminAccess(role) {
  return role === 'admin' || role === 'super_admin';
}

function isSuperAdmin(role) {
  return role === 'super_admin';
}

function getRoleRank(role) {
  return role === 'super_admin' ? 2 : role === 'admin' ? 1 : 0;
}

function peerToSafe(peer) {
  return {
    id: peer.id,
    username: peer.username,
    role: peer.role,
    color: peer.color,
    title: peer.title,
    online: peer.online,
    avatar: peer.avatar || null,
    systemInfo: peer.systemInfo || null
  };
}

module.exports = {
  hasAdminAccess,
  isSuperAdmin,
  getRoleRank,
  peerToSafe
};

