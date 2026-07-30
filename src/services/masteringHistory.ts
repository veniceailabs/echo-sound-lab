/**
 * masteringHistory.ts — Persistent session log of mastering runs
 *
 * Stores the last 20 mastering runs in localStorage with:
 * - Settings used (platform, genre, intensity, etc.)
 * - Results (LUFS, gain applied, processing chain)
 * - Timestamp
 * - Optional user notes
 *
 * Used by MasteringHistoryPanel to show a timeline of what was done.
 */

export interface MasteringRun {
  id: string;
  timestamp: number;
  platform: string;
  genre: string;
  intensity: number;
  transparent: boolean;
  detectedGenre?: string;
  appliedLUFS?: number;
  gainApplied?: number;
  processingChain?: string[];
  durationSeconds?: number;
  note?: string;
}

const STORAGE_KEY = 'esl_mastering_history';
const MAX_RUNS = 20;

export function getMasteringHistory(): MasteringRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addMasteringRun(run: Omit<MasteringRun, 'id' | 'timestamp'>): MasteringRun {
  const entry: MasteringRun = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    timestamp: Date.now(),
    ...run,
  };
  const history = getMasteringHistory();
  const updated = [entry, ...history].slice(0, MAX_RUNS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  return entry;
}

export function updateRunNote(id: string, note: string): void {
  const history = getMasteringHistory();
  const idx = history.findIndex(r => r.id === id);
  if (idx >= 0) {
    history[idx].note = note;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch {}
  }
}

export function clearHistory(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function formatRunSummary(run: MasteringRun): string {
  const parts: string[] = [];
  if (run.detectedGenre && run.detectedGenre !== 'manual') parts.push(run.detectedGenre);
  if (run.platform) parts.push(run.platform);
  if (run.appliedLUFS) parts.push(`${run.appliedLUFS.toFixed(1)} LUFS`);
  if (run.gainApplied) parts.push(`${run.gainApplied > 0 ? '+' : ''}${run.gainApplied.toFixed(1)} dB`);
  return parts.join(' · ') || 'Custom settings';
}
