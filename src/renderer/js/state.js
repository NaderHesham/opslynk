const _appModePromise = window.OpsLynk.getAppMode().catch(() => 'client');
let _appMode = 'client';

let me = null, peers = {}, history = {}, activePeerId = null;
let selUrg = 'normal', selPrio = 'low';
let pendingEmoji = '';
let ackCount = 0, helpBadge = 0;
let ssInclude = false, ssBase64 = null, ssCaptured = false;
let unread = {};
let networkReady = false;
let networkOnline = false;
let currentHostname = '';
let modalAvatar = null;
let selectedSpecPeerId = null;
let userGroups = [];
let dashboardActivity = [];
let dashboardSeries = { presence: [], pressure: [] };
let counterAnimations = new Map();
let dashboardDeviceFilter = 'all';
let userFilter = 'all';
let helpFilter = 'open';
let _acctCurrentUserId = null;
let _screensLocked = false;
let vbcSelectedVideo = null;
let vbcActive = false;

const COLORS = ['#4f8ef7', '#7c3aed', '#ec4899', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16'];
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hc = s => { let h = 0; for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0; return h; };
const fmtBytes = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const attachmentUrl = a => `data:${a?.mime || 'application/octet-stream'};base64,${a?.data || ''}`;
const roleRank = role => role === 'super_admin' ? 2 : role === 'admin' ? 1 : 0;
const hasAdminAccess = role => role === 'admin' || role === 'super_admin';
const isSuperAdminRole = role => role === 'super_admin';
const comparePeers = (a, b) => roleRank(b.role) - roleRank(a.role) || Number(b.online) - Number(a.online) || String(a.username || '').localeCompare(String(b.username || ''));
const getRoleLabel = role => role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Admin' : 'User';
const isDefaultRoleTitle = title => ['Super Administrator', 'Administrator', 'User', 'Super Admin', 'Admin'].includes(String(title || '').trim());
const getCurrentUserDisplayName = profile => {
  const displayName = String(profile?.displayName || profile?.name || '').trim();
  const username = String(profile?.username || '').trim();
  const machineLabel = String(profile?.machineLabel || profile?.hostname || currentHostname || '').trim();
  return displayName || username || machineLabel || 'OpsLynk User';
};
const getPeerDisplayTitle = peer => {
  const title = String(peer?.title || '').trim();
  return title && !isDefaultRoleTitle(title) ? title : getRoleLabel(peer?.role);
};
const roleBadgeHTML = role => role === 'super_admin'
  ? '<span class="rbadge super">Super Admin</span>'
  : role === 'admin'
    ? '<span class="rbadge admin">Admin</span>'
    : '';
const getPeerTrustState = peer => {
  if (peer?.identityRejected) return { key: 'changed', label: 'Identity Changed', shortLabel: 'CHANGED' };
  if (peer?.identityVerified) return { key: 'verified', label: 'Verified', shortLabel: 'VERIFIED' };
  return { key: 'pending', label: 'Verifying', shortLabel: 'VERIFY' };
};
const getPeerConnectionState = peer => peer?.connectionState || (peer?.online ? 'connected' : 'offline');
const getPeerConnectionMeta = peer => {
  const state = getPeerConnectionState(peer);
  if (state === 'connected') return { key: 'online', label: 'Connected', shortLabel: 'LIVE', chatLabel: 'Online', reachable: true };
  if (state === 'handshaking') return { key: 'handshaking', label: 'Handshaking', shortLabel: 'SYNC', chatLabel: 'Handshaking', reachable: false };
  if (state === 'discovering') return { key: 'discovering', label: 'Discovering', shortLabel: 'SCAN', chatLabel: 'Discovering', reachable: false };
  if (state === 'degraded') return { key: 'degraded', label: 'Degraded', shortLabel: 'DEGRADED', chatLabel: 'Degraded', reachable: false };
  return { key: 'offline', label: 'Offline', shortLabel: 'OFF', chatLabel: 'Offline', reachable: false };
};
const getSortedPeers = () => Object.values(peers).sort(comparePeers);
const getSidebarSearchValue = () => (document.getElementById('peerSearch')?.value || '').trim().toLowerCase();
const matchesPeerSearch = (peer, search) => {
  if (!search) return true;
  const bag = [
    peer.username,
    peer.title,
    peer.systemInfo?.hostname,
    peer.systemInfo?.ip,
    peer.systemInfo?.os,
    peer.systemInfo?.modelName
  ].filter(Boolean).join(' ').toLowerCase();
  return bag.includes(search);
};


function avatarHTML(person, size = 's32') {
      const name = person?.username || '?';
      const classes = `av ${size}${hasAdminAccess(person?.role) ? ' admin-frame' : ''}`;
      const bg = person?.avatar ? '' : ` style="background:${person?.color || '#666'}"`;
      const content = person?.avatar
        ? `<img src="${person.avatar}" alt="${esc(name)}">`
        : esc(name[0].toUpperCase());
      return `<div class="${classes}"${bg}>${content}</div>`;
    }

function applyAvatar(el, person) {
      if (!el) return;
      el.classList.toggle('admin-frame', hasAdminAccess(person?.role));
      el.style.background = person?.avatar ? 'transparent' : (person?.color || '#666');
      el.textContent = '';
      el.innerHTML = '';
      if (person?.avatar) {
        const img = document.createElement('img');
        img.src = person.avatar;
        img.alt = person.username || 'avatar';
        el.appendChild(img);
      } else {
        el.textContent = (person?.username || '?')[0].toUpperCase();
      }
    }
