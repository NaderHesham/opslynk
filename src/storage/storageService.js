// storage/storageService.js
// Handles all file I/O: profile, history, state, devices

const path = require('path');
const fs   = require('fs');
const { app } = require('electron');

const DATA_DIR        = path.join(app.getPath('userData'), 'opslynk');
const HISTORY_FILE    = path.join(DATA_DIR, 'history.json');
const PROFILE_FILE    = path.join(DATA_DIR, 'profile.json');
const STATE_FILE      = path.join(DATA_DIR, 'state.json');
const DEVICES_FILE    = path.join(DATA_DIR, 'devices.json');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');
const STATE_SCHEMA_VERSION = 2;

function ensureDirs() {
  [DATA_DIR, SCREENSHOTS_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

// ── PROFILE ──────────────────────────────────────────────────────────────────
function loadProfile() {
  try {
    if (fs.existsSync(PROFILE_FILE))
      return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
  } catch {}
  return null;
}

function saveProfile(p) {
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(p, null, 2));
}

// ── HISTORY ──────────────────────────────────────────────────────────────────
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE))
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveHistory(chatHistory) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
}

// ── STATE ────────────────────────────────────────────────────────────────────
function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function normalizeActivityEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map(event => ({ type: event?.type, at: toFiniteNumber(event?.at) }))
    .filter(event => event.at && ['online', 'offline', 'active', 'idle'].includes(event.type))
    .sort((a, b) => a.at - b.at);
}

function normalizeSavedPeer(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const latestScreenshot = raw.latestScreenshot && typeof raw.latestScreenshot === 'object'
    ? {
        capturedAt: toFiniteNumber(raw.latestScreenshot.capturedAt),
        name: typeof raw.latestScreenshot.name === 'string' ? raw.latestScreenshot.name : null,
        size: toFiniteNumber(raw.latestScreenshot.size),
        mime: typeof raw.latestScreenshot.mime === 'string' ? raw.latestScreenshot.mime : null
      }
    : null;
  return {
    id: raw.id,
    username: typeof raw.username === 'string' && raw.username.trim() ? raw.username : 'Unknown peer',
    role: typeof raw.role === 'string' && raw.role.trim() ? raw.role : 'user',
    deviceId: typeof raw.deviceId === 'string' && raw.deviceId.trim() ? raw.deviceId : raw.id,
    identityFingerprint: typeof raw.identityFingerprint === 'string' ? raw.identityFingerprint : undefined,
    color: typeof raw.color === 'string' ? raw.color : undefined,
    title: typeof raw.title === 'string' ? raw.title : undefined,
    avatar: typeof raw.avatar === 'string' ? raw.avatar : null,
    systemInfo: raw.systemInfo && typeof raw.systemInfo === 'object' ? raw.systemInfo : null,
    online: false,
    connectionState: 'offline',
    restoredFromState: true,
    identityVerified: !!raw.identityVerified,
    identityRejected: !!raw.identityRejected,
    lastDisconnectedAt: toFiniteNumber(raw.lastDisconnectedAt),
    lastSeen: toFiniteNumber(raw.lastSeen),
    lastHeartbeat: toFiniteNumber(raw.lastHeartbeat),
    liveMetrics: raw.liveMetrics && typeof raw.liveMetrics === 'object' ? raw.liveMetrics : null,
    activityState: ['active', 'idle', 'offline'].includes(raw.activityState) ? raw.activityState : 'offline',
    lastInputAt: toFiniteNumber(raw.lastInputAt),
    lastStateChangeAt: toFiniteNumber(raw.lastStateChangeAt),
    currentSessionStartedAt: toFiniteNumber(raw.currentSessionStartedAt),
    idleThresholdMs: toFiniteNumber(raw.idleThresholdMs) || 300000,
    activityEvents: normalizeActivityEvents(raw.activityEvents),
    latestScreenshot: latestScreenshot?.capturedAt ? latestScreenshot : null
  };
}

function normalizeStateEnvelope(parsed) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const payload = source.schemaVersion ? source.payload : source;
  const normalizedPayload = payload && typeof payload === 'object' ? payload : {};
  return {
    schemaVersion: Number(source.schemaVersion) || 1,
    helpRequests: Array.isArray(normalizedPayload.helpRequests) ? normalizedPayload.helpRequests : [],
    pendingOutgoingHelpRequests: Array.isArray(normalizedPayload.pendingOutgoingHelpRequests) ? normalizedPayload.pendingOutgoingHelpRequests : [],
    pendingReliableMessages: Array.isArray(normalizedPayload.pendingReliableMessages) ? normalizedPayload.pendingReliableMessages : [],
    userGroups: Array.isArray(normalizedPayload.userGroups) ? normalizedPayload.userGroups : [],
    savedPeers: Array.isArray(normalizedPayload.savedPeers)
      ? normalizedPayload.savedPeers.map(normalizeSavedPeer).filter(Boolean)
      : []
  };
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return normalizeStateEnvelope(parsed);
    }
  } catch {}
  return normalizeStateEnvelope({});
}

function saveState({ helpRequests, pendingOutgoingHelpRequests, pendingReliableMessages, userGroups, savedPeers }) {
  const envelope = {
    schemaVersion: STATE_SCHEMA_VERSION,
    payload: normalizeStateEnvelope({
      schemaVersion: STATE_SCHEMA_VERSION,
      payload: { helpRequests, pendingOutgoingHelpRequests, pendingReliableMessages, userGroups, savedPeers }
    })
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(envelope, null, 2));
}

// ── DEVICES (persistent identity) ────────────────────────────────────────────
function loadDevices() {
  try {
    if (fs.existsSync(DEVICES_FILE))
      return JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveDevices(devices) {
  fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
}

module.exports = {
  DATA_DIR,
  HISTORY_FILE,
  PROFILE_FILE,
  STATE_FILE,
  STATE_SCHEMA_VERSION,
  DEVICES_FILE,
  SCREENSHOTS_DIR,
  ensureDirs,
  loadProfile,
  saveProfile,
  loadHistory,
  saveHistory,
  loadState,
  saveState,
  loadDevices,
  saveDevices
};
