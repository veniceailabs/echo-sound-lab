import { useState, useCallback } from 'react';
import type { AudioMetrics } from '../types';

export interface BatchSession {
  sessionId: string;
  trackName: string;
  timestamp: string;
  originalLUFS: number;
  processedLUFS: number;
  improvement: number;
  dynamicRange: number;
  truePeak: number;
  stereoWidth: number;
}

export interface BatchStats {
  totalTracks: number;
  avgImprovement: number;
  avgLUFS: number;
  sessions: BatchSession[];
  createdAt: string;
}

const BATCH_STORAGE_KEY = 'esl:batch:sessions';

/**
 * Hook to manage batch mastering sessions
 */
export const useBatchMastering = () => {
  const [sessions, setSessions] = useState<BatchSession[]>(() => {
    const stored = localStorage.getItem(BATCH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  const addSession = useCallback(
    (
      trackName: string,
      originalMetrics: AudioMetrics | null,
      processedMetrics: AudioMetrics | null
    ) => {
      const originalLUFS = originalMetrics?.lufs?.integrated ?? -24;
      const processedLUFS = processedMetrics?.lufs?.integrated ?? -14;

      const newSession: BatchSession = {
        sessionId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        trackName,
        timestamp: new Date().toISOString(),
        originalLUFS,
        processedLUFS,
        improvement: Math.abs(processedLUFS - originalLUFS),
        dynamicRange: processedMetrics?.lufs?.loudnessRange ?? 0,
        truePeak: processedMetrics?.lufs?.truePeak ?? 0,
        stereoWidth: processedMetrics?.advancedMetrics?.stereoWidth ?? 0,
      };

      const updated = [newSession, ...sessions];
      setSessions(updated);
      localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify(updated));

      return newSession;
    },
    [sessions]
  );

  const removeSession = useCallback(
    (sessionId: string) => {
      const updated = sessions.filter(s => s.sessionId !== sessionId);
      setSessions(updated);
      localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify(updated));
    },
    [sessions]
  );

  const clearSessions = useCallback(() => {
    setSessions([]);
    localStorage.removeItem(BATCH_STORAGE_KEY);
  }, []);

  const getStats = useCallback((): BatchStats => {
    const totalTracks = sessions.length;
    const avgImprovement = sessions.length > 0 ? sessions.reduce((sum, s) => sum + s.improvement, 0) / totalTracks : 0;
    const avgLUFS = sessions.length > 0 ? sessions.reduce((sum, s) => sum + s.processedLUFS, 0) / totalTracks : 0;

    return {
      totalTracks,
      avgImprovement,
      avgLUFS,
      sessions,
      createdAt: new Date().toISOString(),
    };
  }, [sessions]);

  const exportStats = useCallback((): string => {
    const stats = getStats();
    return JSON.stringify(stats, null, 2);
  }, [getStats]);

  return {
    sessions,
    addSession,
    removeSession,
    clearSessions,
    getStats,
    exportStats,
  };
};
