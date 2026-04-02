// services/deviceIdentity.js
// Persistent device identity — survives profile resets and app reinstalls
// deviceId is stored in devices.json and NEVER regenerated once created

const os   = require('os');
const { v4: uuidv4 } = require('uuid');
const { loadDevices, saveDevices } = require('../storage/storageService');

const COLORS = ['#4f8ef7', '#7c3aed', '#ec4899', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16'];

function hashCode(s) {
  let h = 0;
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return h;
}

function pickColor(name) {
  return COLORS[Math.abs(hashCode(name)) % COLORS.length];
}

/**
 * Returns the persistent device record.
 * Creates one on first run and never changes the deviceId afterward.
 *
 * Shape:
 * {
 *   deviceId    : string   — permanent UUID
 *   deviceName  : string   — hostname at creation time
 *   createdAt   : ISO string
 *   lastSeen    : ISO string  — updated on every app start
 *   ipHistory   : string[]    — last 10 distinct IPs seen
 * }
 */
function getOrCreateDeviceIdentity(currentIp) {
  const devices = loadDevices();
  const key     = 'self';

  let record = devices[key];

  if (!record || !record.deviceId) {
    // First run — create permanent identity
    record = {
      deviceId  : uuidv4(),
      deviceName: os.hostname(),
      createdAt : new Date().toISOString(),
      lastSeen  : new Date().toISOString(),
      ipHistory : currentIp ? [currentIp] : []
    };
  } else {
    // Update lastSeen and rolling IP history
    record.lastSeen = new Date().toISOString();
    if (currentIp && !record.ipHistory.includes(currentIp)) {
      record.ipHistory = [currentIp, ...record.ipHistory].slice(0, 10);
    }
  }

  devices[key] = record;
  saveDevices(devices);
  return record;
}

/**
 * Builds the initial profile object for a new user.
 * Uses deviceId as the persistent id so it never drifts.
 */
function buildDefaultProfile(deviceIdentity) {
  const winUser = process.env.USERNAME || os.userInfo().username || 'User';
  return {
    id          : deviceIdentity.deviceId,   // ← permanent, from devices.json
    username    : winUser,
    role        : 'user',
    color       : pickColor(winUser),
    title       : '',
    soundEnabled: true,
    avatar      : null
  };
}

module.exports = {
  pickColor,
  hashCode,
  getOrCreateDeviceIdentity,
  buildDefaultProfile
};
