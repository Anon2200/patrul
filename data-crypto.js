'use strict';

const crypto = require('node:crypto');

function getKey() {
  const configured = process.env.PATRUL_DATA_ENCRYPTION_KEY || '';
  let key;
  if (/^[a-f0-9]{64}$/i.test(configured)) key = Buffer.from(configured, 'hex');
  else {
    try { key = Buffer.from(configured, 'base64url'); } catch (_) { key = Buffer.alloc(0); }
  }
  if (key.length !== 32) {
    throw new Error('PATRUL_DATA_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex or base64url characters');
  }
  return key;
}

function validateDataEncryptionKey() {
  getKey();
}

function isEncryptedData(value) {
  return !!value && typeof value === 'object' && value.__patrul_encrypted === 1 &&
    value.alg === 'A256GCM' && typeof value.iv === 'string' &&
    typeof value.tag === 'string' && typeof value.ciphertext === 'string';
}

function encryptData(value, role) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('patrul-role-data:v1:' + role, 'utf8'));
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    __patrul_encrypted: 1,
    alg: 'A256GCM',
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url')
  };
}

function decryptData(value, role) {
  if (!isEncryptedData(value)) return value;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(value.iv, 'base64url'));
  decipher.setAAD(Buffer.from('patrul-role-data:v1:' + role, 'utf8'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64url')),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

async function readRoleData(pool, role, row) {
  if (isEncryptedData(row.data)) return decryptData(row.data, role);
  const plaintext = row.data;
  const encrypted = encryptData(plaintext, role);
  // A concurrent write increments version; never overwrite a newer record.
  await pool.query(
    'UPDATE patrul_role_data SET data = $1::jsonb WHERE role = $2 AND version = $3',
    [JSON.stringify(encrypted), role, row.version]
  );
  return plaintext;
}

module.exports = {
  validateDataEncryptionKey,
  isEncryptedData,
  encryptData,
  decryptData,
  readRoleData
};
