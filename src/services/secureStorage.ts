import {
  getSignatureProvider,
  initializeSignatureProvider,
  ISignatureProvider,
} from '../../action-authority/src/action-authority/audit/SignatureProvider';

const isBrowser = typeof window !== 'undefined';

async function ensureSignatureProvider(): Promise<ISignatureProvider> {
  try {
    return getSignatureProvider();
  } catch {
    initializeSignatureProvider();
    return getSignatureProvider();
  }
}

function getStorage(): Storage | null {
  if (!isBrowser) return null;
  return window.localStorage;
}

export async function setSecureItem<T>(key: string, value: T): Promise<void> {
  const storage = getStorage();
  if (!storage) return;
  const provider = await ensureSignatureProvider();
  const payload = { key, value };
  const signature = await provider.sign(payload);
  storage.setItem(key, JSON.stringify({ value, signature }));
}

export async function getSecureItem<T>(key: string): Promise<T | null> {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { value: T; signature: any };
    if (!parsed.signature) {
      throw new Error('Missing signature');
    }

    const provider = await ensureSignatureProvider();
    const payload = { key, value: parsed.value };
    const isValid = await provider.verify(payload, parsed.signature);
    if (!isValid) {
      throw new Error('Signature verification failed');
    }
    return parsed.value;
  } catch (error) {
    console.warn(`[secureStorage] Data at ${key} failed integrity checks:`, error);
    storage.removeItem(key);
    return null;
  }
}

export async function removeSecureItem(key: string): Promise<void> {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(key);
}
