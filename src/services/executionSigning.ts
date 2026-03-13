import { ExecutionPayload, buildExecutionSealPayload } from '../types/execution-contract';

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

export function canonicalizeExecutionPayload(payload: ExecutionPayload): string {
  return JSON.stringify(normalize(buildExecutionSealPayload(payload)));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signExecutionPayload(payload: ExecutionPayload, sessionSecret: string): Promise<string> {
  const message = canonicalizeExecutionPayload(payload);
  const secretBytes = new TextEncoder().encode(sessionSecret);
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(signature));
}

export async function verifyExecutionPayloadSignature(
  payload: ExecutionPayload,
  sessionSecret: string
): Promise<boolean> {
  const expected = await signExecutionPayload(
    {
      ...payload,
      aaContext: {
        ...payload.aaContext,
        signature: '',
      },
    },
    sessionSecret
  );

  const provided = payload.aaContext.signature || '';
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
