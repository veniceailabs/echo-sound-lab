export interface DecodedAssetBuffer {
  duration: number;
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface AssetRegistration {
  assetId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  registeredAt: number;
}

interface AssetRecord extends AssetRegistration {
  arrayBuffer: ArrayBuffer;
  decodedBuffer: DecodedAssetBuffer | null;
}

export interface AssetRegistryDecodingContext {
  decodeAudioData(audioData: ArrayBuffer): Promise<DecodedAssetBuffer> | DecodedAssetBuffer;
}

const DB_NAME = 'echo-studio-asset-registry';
const DB_VERSION = 1;
const STORE_ASSETS = 'assets';

function cloneArrayBuffer(input: ArrayBuffer): ArrayBuffer {
  return input.slice(0);
}

function clampResolution(value: number): number {
  if (!Number.isFinite(value)) return 256;
  return Math.max(2, Math.min(8192, Math.floor(value)));
}

export class AssetRegistry {
  private readonly assets = new Map<string, AssetRecord>();
  private readonly waveformCache = new Map<string, Float32Array>();
  private previewContext: AssetRegistryDecodingContext | null = null;
  private idCounter = 0;
  private readonly hydratePromise: Promise<void>;

  constructor() {
    this.hydratePromise = this.restorePersistedAssets().catch(() => {});
  }

  private nextAssetId(fileName: string): string {
    this.idCounter += 1;
    const safeName = fileName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'asset';
    return `asset-${safeName}-${this.idCounter.toString(36)}`;
  }

  async registerFile(file: File, assetId?: string): Promise<AssetRegistration> {
    await this.whenReady();
    const arrayBuffer = await file.arrayBuffer();
    return this.registerArrayBuffer(
      arrayBuffer,
      {
        name: file.name || 'uploaded-audio',
        mimeType: file.type || 'audio/wav',
      },
      assetId
    );
  }

  registerArrayBuffer(
    arrayBuffer: ArrayBuffer,
    meta: { name: string; mimeType?: string },
    assetId?: string
  ): AssetRegistration {
    const id = assetId || this.nextAssetId(meta.name);
    const now = Date.now();
    const record: AssetRecord = {
      assetId: id,
      name: meta.name,
      mimeType: meta.mimeType || 'audio/wav',
      sizeBytes: arrayBuffer.byteLength,
      registeredAt: now,
      arrayBuffer: cloneArrayBuffer(arrayBuffer),
      decodedBuffer: null,
    };
    this.assets.set(id, record);
    void this.persistAsset(record).catch(() => {});
    return {
      assetId: record.assetId,
      name: record.name,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      registeredAt: record.registeredAt,
    };
  }

  hasAsset(assetId: string): boolean {
    return this.assets.has(assetId);
  }

  getArrayBuffer(assetId: string): ArrayBuffer | null {
    const record = this.assets.get(assetId);
    if (!record) return null;
    return cloneArrayBuffer(record.arrayBuffer);
  }

  getRegistration(assetId: string): AssetRegistration | null {
    const record = this.assets.get(assetId);
    if (!record) return null;
    return {
      assetId: record.assetId,
      name: record.name,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      registeredAt: record.registeredAt,
    };
  }

  setDecodedBuffer(assetId: string, decodedBuffer: DecodedAssetBuffer): void {
    const record = this.assets.get(assetId);
    if (!record) return;
    record.decodedBuffer = decodedBuffer;
    this.waveformCache.clear();
  }

  getDecodedBuffer(assetId: string): DecodedAssetBuffer | null {
    const record = this.assets.get(assetId);
    return record?.decodedBuffer || null;
  }

  async ensureDecodedBuffer(
    assetId: string,
    context?: AssetRegistryDecodingContext
  ): Promise<DecodedAssetBuffer | null> {
    await this.whenReady();
    const record = this.assets.get(assetId);
    if (!record) return null;
    if (record.decodedBuffer) return record.decodedBuffer;

    const decodeContext = context || this.getOrCreatePreviewContext();
    if (!decodeContext || typeof decodeContext.decodeAudioData !== 'function') return null;

    const decoded = await decodeContext.decodeAudioData(cloneArrayBuffer(record.arrayBuffer));
    if (!decoded) return null;
    record.decodedBuffer = decoded;
    return decoded;
  }

  getWaveformPeaks(assetId: string, resolution = 256): Float32Array | null {
    const normalizedResolution = clampResolution(resolution);
    const cacheKey = `${assetId}:${normalizedResolution}`;
    const cached = this.waveformCache.get(cacheKey);
    if (cached) return cached;

    const decoded = this.getDecodedBuffer(assetId);
    if (!decoded || decoded.numberOfChannels <= 0) return null;
    const channelData = decoded.getChannelData(0);
    if (!channelData || channelData.length === 0) return null;

    const output = new Float32Array(normalizedResolution);
    const windowSize = Math.max(1, Math.floor(channelData.length / normalizedResolution));

    for (let i = 0; i < normalizedResolution; i += 1) {
      const start = i * windowSize;
      const end = Math.min(channelData.length, start + windowSize);
      let peak = 0;
      for (let j = start; j < end; j += 1) {
        const abs = Math.abs(channelData[j]);
        if (abs > peak) peak = abs;
      }
      output[i] = peak;
    }

    this.waveformCache.set(cacheKey, output);
    return output;
  }

  clear(): void {
    this.assets.clear();
    this.waveformCache.clear();
    void this.clearPersistedAssets().catch(() => {});
  }

  async whenReady(): Promise<void> {
    await this.hydratePromise;
  }

  private getOrCreatePreviewContext(): AssetRegistryDecodingContext | null {
    if (this.previewContext) return this.previewContext;
    const globalScope = globalThis as unknown as {
      AudioContext?: new () => AssetRegistryDecodingContext;
      webkitAudioContext?: new () => AssetRegistryDecodingContext;
    };
    const Ctor = globalScope.AudioContext || globalScope.webkitAudioContext;
    if (!Ctor) return null;
    this.previewContext = new Ctor();
    return this.previewContext;
  }

  private async persistAsset(record: AssetRecord): Promise<void> {
    const db = await openAssetRegistryDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ASSETS, 'readwrite');
      tx.objectStore(STORE_ASSETS).put({
        assetId: record.assetId,
        name: record.name,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        registeredAt: record.registeredAt,
        arrayBuffer: cloneArrayBuffer(record.arrayBuffer),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async restorePersistedAssets(): Promise<void> {
    const db = await openAssetRegistryDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ASSETS, 'readonly');
      const req = tx.objectStore(STORE_ASSETS).getAll();
      req.onsuccess = () => {
        const records = Array.isArray(req.result) ? req.result as Array<{
          assetId: string;
          name: string;
          mimeType: string;
          sizeBytes: number;
          registeredAt: number;
          arrayBuffer: ArrayBuffer;
        }> : [];
        for (const stored of records) {
          if (!stored?.assetId || this.assets.has(stored.assetId)) continue;
          this.assets.set(stored.assetId, {
            assetId: stored.assetId,
            name: stored.name,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            registeredAt: stored.registeredAt,
            arrayBuffer: cloneArrayBuffer(stored.arrayBuffer),
            decodedBuffer: null,
          });
          this.idCounter = Math.max(this.idCounter, this.deriveCounterFromAssetId(stored.assetId));
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async clearPersistedAssets(): Promise<void> {
    const db = await openAssetRegistryDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ASSETS, 'readwrite');
      tx.objectStore(STORE_ASSETS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private deriveCounterFromAssetId(assetId: string): number {
    const match = assetId.match(/-([a-z0-9]+)$/i);
    if (!match) return this.idCounter;
    const parsed = parseInt(match[1] || '', 36);
    return Number.isFinite(parsed) ? Math.max(this.idCounter, parsed) : this.idCounter;
  }
}

export const assetRegistry = new AssetRegistry();

function openAssetRegistryDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_ASSETS, { keyPath: 'assetId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
