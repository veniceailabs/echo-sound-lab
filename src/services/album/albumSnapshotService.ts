import { AlbumTrackMeta } from '../../components/AlbumSequencerPanel';

export interface AlbumSnapshot {
  id: string;
  createdAt: number;
  tracks: Omit<AlbumTrackMeta, 'file'>[]; // Don't persist File objects directly
  projectMeta: {
    albumTitle: string;
    albumArtist: string;
    upc: string;
  };
}

const STORAGE_KEY = 'esl_album_snapshots';

export const albumSnapshotService = {
  saveSnapshot(snapshot: AlbumSnapshot): void {
    try {
      const existingStr = localStorage.getItem(STORAGE_KEY);
      const existing: AlbumSnapshot[] = existingStr ? JSON.parse(existingStr) : [];
      
      const updated = [snapshot, ...existing.filter(s => s.id !== snapshot.id)].slice(0, 10); // Keep last 10
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save album snapshot', err);
    }
  },

  getSnapshots(): AlbumSnapshot[] {
    try {
      const existingStr = localStorage.getItem(STORAGE_KEY);
      return existingStr ? JSON.parse(existingStr) : [];
    } catch (err) {
      console.error('Failed to parse album snapshots', err);
      return [];
    }
  },

  clearSnapshots(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
};
