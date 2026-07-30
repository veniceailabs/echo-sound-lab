/**
 * studioSessionStorage — Persist AlbumStudio sessions across page refreshes
 *
 * Architecture:
 *   - Track metadata (name, color, volume, pan, fx, etc.) → localStorage as JSON
 *   - Audio blobs (takes) → IndexedDB by take ID (avoids 5MB localStorage limit)
 *   - Media pool assets → IndexedDB by media asset ID + localStorage metadata
 *   - Markers → localStorage
 *
 * Session format version: 3
 */

import type { Track, TrackRegion, Take, Marker, TrackFX, MediaPoolAsset } from '../components/AlbumStudio';

const DB_NAME = 'echo-studio-sessions';
const DB_VERSION = 1;
const STORE_BLOBS = 'take-blobs';
const LS_KEY = 'echo-studio-session-v1';

// ─── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_BLOBS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    tx.objectStore(STORE_BLOBS).put({ id, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readonly');
    const req = tx.objectStore(STORE_BLOBS).get(id);
    req.onsuccess = () => resolve(req.result?.blob ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteBlobs(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    ids.forEach(id => tx.objectStore(STORE_BLOBS).delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Serialized types ──────────────────────────────────────────────────────────

interface SerializedTake {
  id: string;
  label: string;
  durationSec: number;
  clipped: boolean;
  mimeType: string;
  waveformData: number[]; // Float32Array as plain array
}

interface SerializedMediaPoolAsset {
  id: string;
  assetId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  registeredAt: number;
  durationSec: number;
  clipped: boolean;
  sourceKind: MediaPoolAsset['sourceKind'];
  waveformData: number[];
}

interface SerializedRegion {
  id: string;
  startSec: number;
  durationSec: number;
  activeTaskIdx: number;
  gainDb: number;
  color: string;
  isTakeFolder: boolean;
  takes: SerializedTake[];
}

interface SerializedTrack {
  id: string;
  name: string;
  color: string;
  armed: boolean;
  muted: boolean;
  soloed: boolean;
  volume: number;
  pan: number;
  gainDb: number;
  inputMono: boolean;
  width: number;
  outputBusId?: string | null;
  sends?: Array<{
    sendId: string;
    targetTrackId: string;
    levelDb: number;
    preFader: boolean;
    enabled: boolean;
    mode?: 'aux' | 'sidechain';
  }>;
  fx: TrackFX;
  regions: SerializedRegion[];
}

interface SessionData {
  version: number;
  savedAt: number;
  bpm: number;
  timeSigNum: number;
  captureChannelMode: 'mono' | 'stereo';
  tracks: SerializedTrack[];
  markers: Marker[];
  mediaPool: SerializedMediaPoolAsset[];
}

// ─── Save ──────────────────────────────────────────────────────────────────────

export async function saveSession(
  tracks: Track[],
  markers: Marker[],
  mediaPool: MediaPoolAsset[],
  bpm: number,
  timeSigNum: number,
  captureChannelMode: 'mono' | 'stereo' = 'stereo'
): Promise<void> {
  const serializedTracks: SerializedTrack[] = [];
  const serializedMediaPool: SerializedMediaPoolAsset[] = [];

  for (const track of tracks) {
    const serializedRegions: SerializedRegion[] = [];

    for (const region of track.regions) {
      const serializedTakes: SerializedTake[] = [];

      for (const take of region.takes) {
        // Store blob in IndexedDB
        await putBlob(take.id, take.blob);
        serializedTakes.push({
          id: take.id,
          label: take.label,
          durationSec: take.durationSec,
          clipped: take.clipped,
          mimeType: take.blob.type,
          waveformData: Array.from(take.waveformData),
        });
      }

      serializedRegions.push({
        id: region.id,
        startSec: region.startSec,
        durationSec: region.durationSec,
        activeTaskIdx: region.activeTaskIdx,
        gainDb: region.gainDb,
        color: region.color,
        isTakeFolder: region.isTakeFolder,
        takes: serializedTakes,
      });
    }

    serializedTracks.push({
      id: track.id,
      name: track.name,
      color: track.color,
      armed: track.armed,
      muted: track.muted,
      soloed: track.soloed,
      volume: track.volume,
      pan: track.pan,
      gainDb: track.gainDb,
      inputMono: track.inputMono,
      width: track.width ?? 1.0,
      outputBusId: track.outputBusId ?? null,
      sends: Array.isArray(track.sends) ? track.sends.map((send) => ({ ...send })) : [],
      fx: track.fx,
      regions: serializedRegions,
    });
  }

  for (const asset of mediaPool) {
    await putBlob(`media:${asset.id}`, asset.blob);
    serializedMediaPool.push({
      id: asset.id,
      assetId: asset.assetId,
      name: asset.name,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      registeredAt: asset.registeredAt,
      durationSec: asset.durationSec,
      clipped: asset.clipped,
      sourceKind: asset.sourceKind,
      waveformData: Array.from(asset.waveformData),
    });
  }

  const session: SessionData = {
    version: 3,
    savedAt: Date.now(),
    bpm,
    timeSigNum,
    captureChannelMode,
    tracks: serializedTracks,
    markers,
    mediaPool: serializedMediaPool,
  };

  localStorage.setItem(LS_KEY, JSON.stringify(session));
}

// ─── Load ──────────────────────────────────────────────────────────────────────

export interface LoadedSession {
  tracks: Track[];
  markers: Marker[];
  mediaPool: MediaPoolAsset[];
  bpm: number;
  timeSigNum: number;
  captureChannelMode: 'mono' | 'stereo';
  savedAt: Date;
}

export async function loadSession(): Promise<LoadedSession | null> {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;

  let session: SessionData;
  try {
    session = JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }

  const tracks: Track[] = [];
  const mediaPool: MediaPoolAsset[] = [];

  for (const st of session.tracks) {
    const regions: TrackRegion[] = [];

    for (const sr of st.regions) {
      const takes: Take[] = [];

      for (const stk of sr.takes) {
        const blob = await getBlob(stk.id);
        if (!blob) continue; // blob missing — skip take
        const url = URL.createObjectURL(blob);
        takes.push({
          id: stk.id,
          blob,
          url,
          waveformData: new Float32Array(stk.waveformData),
          durationSec: stk.durationSec,
          label: stk.label,
          clipped: stk.clipped,
        });
      }

      if (!takes.length) continue;

      regions.push({
        id: sr.id,
        startSec: sr.startSec,
        durationSec: sr.durationSec,
        activeTaskIdx: Math.min(sr.activeTaskIdx, takes.length - 1),
        gainDb: sr.gainDb,
        color: sr.color,
        isTakeFolder: sr.isTakeFolder,
        takes,
      });
    }

    tracks.push({
      id: st.id,
      name: st.name,
      color: st.color,
      armed: st.armed,
      muted: st.muted,
      soloed: st.soloed,
      volume: st.volume,
      pan: st.pan,
      gainDb: st.gainDb,
      inputMono: st.inputMono,
      width: st.width ?? 1.0,
      outputBusId: st.outputBusId ?? null,
      sends: Array.isArray(st.sends) ? st.sends.map((send) => ({ ...send })) : [],
      fx: st.fx,
      regions,
      peakLevel: 0,
      peakHold: 0,
      peakHoldAt: 0,
      clipped: false,
    });
  }

  for (const asset of session.mediaPool || []) {
    const blob = await getBlob(`media:${asset.id}`);
    if (!blob) continue;
    mediaPool.push({
      id: asset.id,
      assetId: asset.assetId,
      name: asset.name,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      registeredAt: asset.registeredAt,
      durationSec: asset.durationSec,
      clipped: asset.clipped,
      sourceKind: asset.sourceKind,
      waveformData: new Float32Array(asset.waveformData),
      blob,
    });
  }

  return {
    tracks,
    markers: session.markers,
    mediaPool,
    bpm: session.bpm,
    timeSigNum: session.timeSigNum,
    captureChannelMode: session.captureChannelMode === 'mono' ? 'mono' : 'stereo',
    savedAt: new Date(session.savedAt),
  };
}

// ─── Clear ──────────────────────────────────────────────────────────────────────

export async function clearSession(): Promise<void> {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try {
      const session = JSON.parse(raw) as SessionData;
      const allIds = session.tracks.flatMap(t =>
        t.regions.flatMap(r => r.takes.map(tk => tk.id))
      ).concat((session.mediaPool || []).map((asset) => `media:${asset.id}`));
      await deleteBlobs(allIds);
    } catch {}
  }
  localStorage.removeItem(LS_KEY);
}

export function hasSession(): boolean {
  return !!localStorage.getItem(LS_KEY);
}

export function getSessionMeta(): { savedAt: Date; trackCount: number; regionCount: number; mediaCount: number } | null {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SessionData;
    return {
      savedAt: new Date(s.savedAt),
      trackCount: s.tracks.length,
      regionCount: s.tracks.reduce((acc, t) => acc + t.regions.length, 0),
      mediaCount: (s.mediaPool || []).length,
    };
  } catch {
    return null;
  }
}
