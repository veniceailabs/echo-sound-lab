import { useEffect, useState } from 'react';

interface StreakData {
  count: number;
  lastDate: string; // YYYY-MM-DD
  totalTracks: number;
  milestones: number[]; // [5, 25, 100, 500]
  currentMilestone: number;
}

const MILESTONES = [5, 25, 100, 500];

export const useStreak = () => {
  const [streak, setStreak] = useState<StreakData>({
    count: 0,
    lastDate: '',
    totalTracks: 0,
    milestones: MILESTONES,
    currentMilestone: 0,
  });

  useEffect(() => {
    const stored = localStorage.getItem('esl:streak');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setStreak(data);
      } catch {
        // Fallback to defaults
      }
    }
  }, []);

  const recordTrackMastered = () => {
    const today = new Date().toISOString().split('T')[0];

    setStreak(prev => {
      const isNewDay = prev.lastDate !== today;
      const isConsecutive = prev.lastDate === new Date(Date.now() - 86400000).toISOString().split('T')[0];

      const newCount = isConsecutive ? prev.count + 1 : 1;
      const newTotal = prev.totalTracks + 1;
      const newMilestone = MILESTONES.find(m => m <= newTotal) || 0;

      const updated = {
        count: isNewDay ? newCount : prev.count,
        lastDate: today,
        totalTracks: newTotal,
        milestones: MILESTONES,
        currentMilestone: newMilestone,
      };

      localStorage.setItem('esl:streak', JSON.stringify(updated));
      return updated;
    });
  };

  const getMilestoneLabel = (total: number): string => {
    if (total >= 500) return '🎖️ 500 Tracks';
    if (total >= 100) return '⭐ 100 Tracks';
    if (total >= 25) return '✨ 25 Tracks';
    if (total >= 5) return '🔥 5 Tracks';
    if (total === 1) return '🎯 First Track';
    return '';
  };

  const getStreakLabel = (count: number): string => {
    if (count === 0) return '';
    return `🔥 ${count}-Track Streak`;
  };

  return {
    streak,
    recordTrackMastered,
    getMilestoneLabel,
    getStreakLabel,
  };
};
