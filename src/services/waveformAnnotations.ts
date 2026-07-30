/**
 * waveformAnnotations.ts — Timestamped markers for the waveform
 *
 * Stores and retrieves named markers per session.
 * Used by WaveformAnnotationPanel to let engineers mark
 * important moments (chorus, verse, fix points, cue points).
 */

export type MarkerColor = 'cyan' | 'amber' | 'red' | 'emerald' | 'purple' | 'orange';

export interface WaveformMarker {
  id: string;
  time: number;        // seconds from start
  label: string;
  color: MarkerColor;
  note?: string;
}

const STORAGE_KEY = 'esl_waveform_markers';

export function getMarkers(): WaveformMarker[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addMarker(marker: Omit<WaveformMarker, 'id'>): WaveformMarker {
  const m: WaveformMarker = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
    ...marker,
  };
  const markers = [...getMarkers(), m].sort((a, b) => a.time - b.time);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(markers)); } catch {}
  return m;
}

export function updateMarker(id: string, changes: Partial<WaveformMarker>): void {
  const markers = getMarkers().map(m => m.id === id ? { ...m, ...changes } : m);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(markers)); } catch {}
}

export function deleteMarker(id: string): void {
  const markers = getMarkers().filter(m => m.id !== id);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(markers)); } catch {}
}

export function clearMarkers(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}
