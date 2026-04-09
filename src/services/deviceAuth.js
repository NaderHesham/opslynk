'use strict';

const crypto = require('crypto');
const { loadDevices, saveDevices } = require('../storage/storageService');

const IDENTITY_SCOPE = 'opslynk-peer-identity-v1';
const MAX_SIGNATURE_SKEW_MS = 5 * 60 * 1000;

function toPem(keyObject) {
  return keyObject.export({ type: 'spki', format: 'pem' }).toString();
}

function toPrivatePem(keyObject) {
  return keyObject.export({ type: 'pkcs8', format: 'pem' }).toString();
}

function getFingerprint(publicKey) {
  return crypto.createHash('sha256').update(String(publicKey || ''), 'utf8').digest('hex');
}

function normalizeIdentity(identity) {
  return {
    scope: IDENTITY_SCOPE,
    id: String(identity?.id || ''),
    deviceId: String(identity?.deviceId || identity?.id || ''),
    username: String(identity?.username || ''),
    role: String(identity?.role || ''),
    port: Number(identity?.port || 0),
    publicKey: String(identity?.publicKey || ''),
    identityFingerprint: String(identity?.identityFingerprint || ''),
    signedAt: String(identity?.signedAt || '')
  };
}

function serializeIdentity(identity) {
  const normalized = normalizeIdentity(identity);
  return JSON.stringify(normalized);
}

function ensureDeviceCredentials(deviceRecord) {
  const devices = loadDevices();
  const key = 'self';
  const record = devices[key] || deviceRecord || {};
  const auth = record.auth || {};

  if (!auth.publicKey || !auth.privateKey || !auth.identityFingerprint) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    auth.publicKey = toPem(publicKey);
    auth.privateKey = toPrivatePem(privateKey);
    auth.identityFingerprint = getFingerprint(auth.publicKey);
    auth.createdAt = new Date().toISOString();
  }

  record.auth = auth;
  devices[key] = record;
  saveDevices(devices);
  return record;
}

function attachIdentityToProfile(profile, deviceRecord) {
  if (!profile) return profile;
  const auth = deviceRecord?.auth || {};
  return {
    ...profile,
    deviceId: deviceRecord?.deviceId || profile.id,
    publicKey: auth.publicKey || profile.publicKey || '',
    identityFingerprint: auth.identityFingerprint || profile.identityFingerprint || ''
  };
}

function createSignedPeerIdentity(profile, port) {
  const devices = loadDevices();
  const auth = devices?.self?.auth || {};
  if (!auth.privateKey || !auth.publicKey) {
    throw new Error('Device credentials are not initialized.');
  }

  const identity = normalizeIdentity({
    id: profile?.id,
    deviceId: profile?.deviceId || profile?.id,
    username: profile?.username,
    role: profile?.role,
    port,
    publicKey: profile?.publicKey || auth.publicKey,
    identityFingerprint: profile?.identityFingerprint || auth.identityFingerprint,
    signedAt: new Date().toISOString()
  });

  const signature = crypto.sign(null, Buffer.from(serializeIdentity(identity)), auth.privateKey).toString('base64');
  return {
    ...identity,
    color: profile?.color,
    title: profile?.title,
    avatar: profile?.avatar ?? null,
    systemInfo: profile?.systemInfo || null,
    signature
  };
}

function verifySignedPeerIdentity(identity) {
  const signature = String(identity?.signature || '');
  const publicKey = String(identity?.publicKey || '');
  if (!signature || !publicKey) return { valid: false, reason: 'identity-signature-missing' };

  const fingerprint = getFingerprint(publicKey);
  if (fingerprint !== String(identity?.identityFingerprint || '')) {
    return { valid: false, reason: 'identity-fingerprint-mismatch' };
  }

  const signedAtMs = Date.parse(String(identity?.signedAt || ''));
  if (!Number.isFinite(signedAtMs)) return { valid: false, reason: 'identity-invalid-timestamp' };
  if (Math.abs(Date.now() - signedAtMs) > MAX_SIGNATURE_SKEW_MS) {
    return { valid: false, reason: 'identity-timestamp-skew' };
  }

  try {
    const verified = crypto.verify(
      null,
      Buffer.from(serializeIdentity(identity)),
      publicKey,
      Buffer.from(signature, 'base64')
    );
    if (!verified) return { valid: false, reason: 'identity-signature-invalid' };
  } catch {
    return { valid: false, reason: 'identity-public-key-invalid' };
  }

  return { valid: true, fingerprint };
}

module.exports = {
  IDENTITY_SCOPE,
  ensureDeviceCredentials,
  attachIdentityToProfile,
  createSignedPeerIdentity,
  verifySignedPeerIdentity,
  getFingerprint
};
