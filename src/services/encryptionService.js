'use strict';

const crypto = require('crypto');

const CURVE = 'prime256v1';

function generateKeyPair() {
  const ecdh = crypto.createECDH(CURVE);
  ecdh.generateKeys();
  return ecdh;
}

function deriveSharedKey(ecdh, remotePubKeyHex) {
  const secret = ecdh.computeSecret(Buffer.from(remotePubKeyHex, 'hex'));
  return crypto.createHash('sha256').update(secret).digest(); // 32-byte AES key
}

function encrypt(key, obj) {
  const iv         = crypto.randomBytes(12);
  const cipher     = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain      = Buffer.from(JSON.stringify(obj));
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag        = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function decrypt(key, blob) {
  const [ivHex, tagHex, ctHex] = blob.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key,
    Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ctHex, 'hex')),
    decipher.final()
  ]);
  return JSON.parse(plain.toString());
}

module.exports = { generateKeyPair, deriveSharedKey, encrypt, decrypt };
