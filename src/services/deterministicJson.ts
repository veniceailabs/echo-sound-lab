type StableJsonPrimitive = string | number | boolean | null;
type StableJsonValue = StableJsonPrimitive | StableJsonValue[] | { [key: string]: StableJsonValue };

function normalizeStable(value: unknown): StableJsonValue {
  if (value === null || value === undefined) return null;

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeStable(item));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => [key, normalizeStable(entryValue)]);
    return Object.fromEntries(entries) as StableJsonValue;
  }

  return String(value);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeStable(value));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

// Fallback deterministic digest for environments without SubtleCrypto.
function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i) & 0xff);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, '0');
}

export async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return bytesToHex(new Uint8Array(digest));
  }
  const fallback = fnv1a64Hex(input);
  return `${fallback}${fallback}${fallback}${fallback}`;
}

export function deterministicId(prefix: string, payload: unknown): string {
  const canonical = stableStringify(payload);
  const digest = fnv1a64Hex(canonical).slice(0, 12);
  return `${prefix}-${digest}`;
}
