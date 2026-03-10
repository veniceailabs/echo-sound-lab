type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function normalize(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }
  if (typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, normalize(v)]);
    return Object.fromEntries(sortedEntries) as JsonValue;
  }
  return String(value);
}

export function canonicalizeManifestPayload(payload: unknown): string {
  return JSON.stringify(normalize(payload));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashManifestPayload(payload: unknown): Promise<string> {
  const canonical = canonicalizeManifestPayload(payload);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return toHex(new Uint8Array(digest));
}

export async function signManifestPayloadWithSecret(payload: unknown, signingSecret: string): Promise<string> {
  const canonical = canonicalizeManifestPayload(payload);
  const secretBytes = new TextEncoder().encode(signingSecret);
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical));
  return toBase64Url(new Uint8Array(signature));
}

export async function verifyManifestSignatureWithSecret(
  payload: unknown,
  signature: string,
  signingSecret: string
): Promise<boolean> {
  const expected = await signManifestPayloadWithSecret(payload, signingSecret);
  if (signature.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
