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

function keyId(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function isEncryptedData(value) {
  return !!value && typeof value === 'object' && value.__patrul_encrypted === 1 &&
    value.alg === 'A256GCM' && typeof value.kid === 'string' && typeof value.iv === 'string' &&
    typeof value.tag === 'string' && typeof value.ciphertext === 'string';
}

function encryptData(value, role) {
  const key = getKey();
  const kid = keyId(key);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('patrul-role-data:v1:' + role, 'utf8'));
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    __patrul_encrypted: 1,
    alg: 'A256GCM',
    kid,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url')
  };
}

function decryptData(value, role) {
  if (value && typeof value === 'object' && value.__patrul_encrypted === 1 && !isEncryptedData(value)) {
    throw new Error('Malformed encrypted role data envelope');
  }
  if (!isEncryptedData(value)) return value;
  const key = getKey();
  if (value.kid !== keyId(key)) throw new Error('PATRUL_DATA_ENCRYPTION_KEY does not match stored data');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64url'));
  decipher.setAAD(Buffer.from('patrul-role-data:v1:' + role, 'utf8'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64url')),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

async function migratePlaintextRows(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query('SELECT role, data, version FROM patrul_role_data FOR UPDATE');
    let migrated = 0;
    for (const row of rows.rows) {
      const plaintext = decryptData(row.data, row.role);
      if (isEncryptedData(row.data)) continue;
      const encrypted = encryptData(plaintext, row.role);
      await client.query(
        'UPDATE patrul_role_data SET data = $1::jsonb WHERE role = $2 AND version = $3',
        [JSON.stringify(encrypted), row.role, row.version]
      );
      migrated += 1;
    }
    await client.query('COMMIT');
    return migrated;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function readRoleData(pool, role, row) {
  const plaintext = decryptData(row.data, role);
  if (isEncryptedData(row.data)) return plaintext;
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
  readRoleData,
  migratePlaintextRows
};
