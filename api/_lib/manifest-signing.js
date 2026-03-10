import crypto from 'node:crypto';
import { optionalEnv } from './env.js';

const DEFAULT_DEV_SIGNING_KEY = 'dev-manifest-signing-key-change-me';

function normalize(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }
  if (typeof value === 'object') {
    const sorted = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, normalize(v)]);
    return Object.fromEntries(sorted);
  }
  return String(value);
}

export function canonicalizeManifestPayload(payload) {
  return JSON.stringify(normalize(payload));
}

function getSigningKey() {
  return optionalEnv(['ESL_MANIFEST_SIGNING_KEY'], DEFAULT_DEV_SIGNING_KEY);
}

function getKeyId(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export function signManifestPayload(payload) {
  const signingKey = getSigningKey();
  const canonical = canonicalizeManifestPayload(payload);
  const signature = crypto.createHmac('sha256', signingKey).update(canonical).digest('base64url');
  const manifestHash = crypto.createHash('sha256').update(canonical).digest('hex');

  return {
    signature,
    signatureAlgorithm: 'hmac-sha256-v1',
    manifestHash,
    keyId: getKeyId(signingKey),
    signedAt: Date.now(),
  };
}
