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
let activeHelpRequestId = null;
let pendingReplyQuoteByPeer = Object.create(null);
let userGroups = [];
let dashboardActivity = [];
let dashboardSeries = { presence: [], pressure: [] };
let counterAnimations = new Map();
let dashboardDeviceFilter = 'all';
let dashboardScreenshotFilter = 'all';
let userFilter = 'all';
let monitorGroupFilter = 'all';
let monitorActionMode = 'preview';
let monitorRemoteSession = { peerId: null, status: 'idle', requestedAt: 0 };
let monitorRemoteStatusTimer = null;
let userTimelineFilter = 'all';
let userTimelineSegments = [];
let userTimelinePeerId = null;
let userActionPeerId = null;
let helpFilter = 'all';
let _acctCurrentUserId = null;
let _screensLocked = false;
let vbcSelectedVideo = null;
let vbcActive = false;
let screenshotPolling = {
  enabled: true,
  mode: 'normal',
  pollIntervalMs: 1000,
  requestCooldownMs: 5000,
  previewRefreshMs: 5000
};

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
const verifiedSuperIconHTML = role => role === 'super_admin'
  ? '<img class="name-verified-icon" src="./verified-super-admin.png" alt="Verified Super Admin" aria-hidden="true">'
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
const getPeerFreshnessMeta = peer => {
  if (peer?.restoredFromState && !peer?.online) return { key: 'history', label: 'History only' };
  const state = getPeerConnectionState(peer);
  if (state === 'connected' && peer?.online) return { key: 'fresh', label: 'Fresh' };
  if (state === 'degraded') return { key: 'stale', label: 'Stale' };
  if (state === 'handshaking' || state === 'discovering') return { key: 'pending', label: 'Pending' };
  return { key: 'offline', label: 'Offline' };
};
const getPeerActivityState = peer => !peer?.online ? 'offline' : (peer?.activityState === 'idle' ? 'idle' : 'active');
const getPeerActivityMeta = peer => {
  const state = getPeerActivityState(peer);
  if (state === 'active') return { key: 'active', label: 'Active now' };
  if (state === 'idle') return { key: 'idle', label: 'Idle' };
  return { key: 'offline', label: 'Offline' };
};
const SCREENSHOT_FRESH_MS = 60 * 1000;
const SCREENSHOT_STALE_MS = 5 * 60 * 1000;
const getPeerScreenshotMeta = peer => {
  if (peer?.screenshotRequestPending) {
    return {
      key: 'pending',
      label: 'Preview pending',
      capturedAt: peer?.latestScreenshot?.capturedAt || null,
      ageMs: null,
      sizeText: peer?.latestScreenshot?.size ? fmtBytes(peer.latestScreenshot.size) : '-'
    };
  }
  const preview = peer?.latestScreenshot;
  if (!preview?.capturedAt) return { key: 'none', label: 'No preview', capturedAt: null, ageMs: null, sizeText: '-' };
  const ageMs = Math.max(0, Date.now() - Number(preview.capturedAt));
  if (ageMs <= SCREENSHOT_FRESH_MS) {
    return { key: 'fresh', label: 'Fresh preview', capturedAt: preview.capturedAt, ageMs, sizeText: preview.size ? fmtBytes(preview.size) : '-' };
  }
  if (ageMs <= SCREENSHOT_STALE_MS) {
    return { key: 'stale', label: 'Recent preview', capturedAt: preview.capturedAt, ageMs, sizeText: preview.size ? fmtBytes(preview.size) : '-' };
  }
  return { key: 'old', label: 'Old preview', capturedAt: preview.capturedAt, ageMs, sizeText: preview.size ? fmtBytes(preview.size) : '-' };
};
const fmtClock = ts => {
  const value = Number(ts || 0);
  if (!value) return '-';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const fmtDuration = ms => {
  const safe = Math.max(0, Number(ms || 0));
  const totalMinutes = Math.floor(safe / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};
const getStartOfToday = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.getTime();
};
const normalizeActivityEvents = peer => Array.isArray(peer?.activityEvents)
  ? peer.activityEvents
      .map(event => ({ type: event?.type, at: Number(event?.at || 0) }))
      .filter(event => event.at > 0 && ['online', 'offline', 'active', 'idle'].includes(event.type))
      .sort((a, b) => a.at - b.at)
  : [];
const buildPeerDerivedMetrics = peer => {
  const events = normalizeActivityEvents(peer);
  const startOfToday = getStartOfToday();
  const now = Date.now();
  let activeMs = 0;
  let idleMs = 0;
  let firstSeenAt = null;
  let sessionStartAt = Number(peer?.currentSessionStartedAt || 0) || null;
  let sessionsToday = 0;
  let cursorState = 'offline';
  let cursorAt = startOfToday;

  for (const event of events) {
    if (event.type === 'online' && !firstSeenAt && event.at >= startOfToday) firstSeenAt = event.at;
    if (event.type === 'online' && !sessionStartAt) sessionStartAt = event.at;
    if (event.type === 'online' && event.at >= startOfToday) sessionsToday += 1;
    if (event.at < startOfToday) {
      if (event.type === 'active' || event.type === 'idle' || event.type === 'offline') cursorState = event.type;
      continue;
    }
    const segmentStart = Math.max(cursorAt, startOfToday);
    const segmentEnd = Math.min(event.at, now);
    if (segmentEnd > segmentStart) {
      if (cursorState === 'active') activeMs += segmentEnd - segmentStart;
      if (cursorState === 'idle') idleMs += segmentEnd - segmentStart;
    }
    if (event.type === 'active' || event.type === 'idle' || event.type === 'offline') cursorState = event.type;
    cursorAt = event.at;
  }

  if (now > cursorAt) {
    if (cursorState === 'active') activeMs += now - cursorAt;
    if (cursorState === 'idle') idleMs += now - cursorAt;
  }

  const currentState = getPeerActivityState(peer);
  const currentStateDuration = peer?.lastStateChangeAt ? Math.max(0, now - Number(peer.lastStateChangeAt)) : null;
  const freshness = getPeerFreshnessMeta(peer);
  const lastSeenAt = Number(peer?.lastHeartbeat || peer?.lastSeen || 0) || null;
  const lastActiveAt = Number(peer?.lastInputAt || 0) || null;

  return {
    currentState,
    freshness,
    lastSeenAt,
    lastActiveAt,
    firstSeenAt,
    sessionStartAt,
    sessionsToday,
    activeMs,
    idleMs,
    currentStateDuration,
    idleDuration: currentState === 'idle' ? currentStateDuration : null,
    stateChangedAt: Number(peer?.lastStateChangeAt || 0) || null
  };
};
const getPeerIdleDuration = peer => buildPeerDerivedMetrics(peer).idleDuration;
const getPeerActivitySummary = peer => buildPeerDerivedMetrics(peer);
const getPeerActivityTimelineItems = (peer, limit = 6) => {
  const labels = {
    online: 'Came online',
    offline: 'Went offline',
    active: 'Became active',
    idle: 'Became idle'
  };
  return normalizeActivityEvents(peer)
    .slice(-limit)
    .reverse()
    .map(event => ({
      ...event,
      label: labels[event.type] || event.type
    }));
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
