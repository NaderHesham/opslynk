// storage/storageService.js
// Handles all file I/O: profile, history, state, devices

const path = require('path');
const fs   = require('fs');
const { app } = require('electron');

const DATA_DIR       = path.join(app.getPath('userData'), 'opslynk');
const HISTORY_FILE   = path.join(DATA_DIR, 'history.json');
const PROFILE_FILE   = path.join(DATA_DIR, 'profile.json');
const STATE_FILE     = path.join(DATA_DIR, 'state.json');
const DEVICES_FILE   = path.join(DATA_DIR, 'devices.json');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');

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
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        helpRequests:                Array.isArray(parsed.helpRequests)                ? parsed.helpRequests                : [],
        pendingOutgoingHelpRequests: Array.isArray(parsed.pendingOutgoingHelpRequests) ? parsed.pendingOutgoingHelpRequests : [],
        userGroups:                  Array.isArray(parsed.userGroups)                  ? parsed.userGroups                  : []
      };
    }
  } catch {}
  return { helpRequests: [], pendingOutgoingHelpRequests: [], userGroups: [] };
}

function saveState({ helpRequests, pendingOutgoingHelpRequests, userGroups }) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(
    { helpRequests, pendingOutgoingHelpRequests, userGroups },
    null, 2
  ));
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
