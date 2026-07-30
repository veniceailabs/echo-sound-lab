import { useState, useCallback, useEffect } from 'react';

export type MasteringCharacter = 'warm' | 'aggressive' | 'dynamic' | 'bright' | 'neutral';

export interface MasteringTag {
  character: MasteringCharacter;
  timestamp: string;
  trackName: string;
  lufs: number;
  feedback?: string;
}

export interface AIProfile {
  tags: MasteringTag[];
  preferredLUFS: number; // average of tagged sessions
  preferredCharacters: Record<MasteringCharacter, number>; // frequency count
  totalSessions: number;
  created: string;
  lastUpdated: string;
}

const PROFILE_KEY = 'esl:ai:profile';

export const useAIProfile = () => {
  const [profile, setProfile] = useState<AIProfile | null>(null);

  // Load profile on mount
  useEffect(() => {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (stored) {
      try {
        setProfile(JSON.parse(stored));
      } catch {
        // Fallback to defaults
      }
    }
  }, []);

  const addTag = useCallback(
    (character: MasteringCharacter, trackName: string, lufs: number, feedback?: string) => {
      const newTag: MasteringTag = {
        character,
        timestamp: new Date().toISOString(),
        trackName,
        lufs,
        feedback,
      };

      const updated: AIProfile = profile
        ? {
            ...profile,
            tags: [newTag, ...profile.tags],
            preferredLUFS: calculateAverageLUFS([newTag, ...profile.tags]),
            preferredCharacters: updateCharacterFrequency(
              profile.preferredCharacters,
              character
            ),
            totalSessions: profile.totalSessions + 1,
            lastUpdated: new Date().toISOString(),
          }
        : {
            tags: [newTag],
            preferredLUFS: lufs,
            preferredCharacters: { [character]: 1 } as Record<MasteringCharacter, number>,
            totalSessions: 1,
            created: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          };

      setProfile(updated);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
      return updated;
    },
    [profile]
  );

  const getRecommendedCharacter = useCallback((): MasteringCharacter | null => {
    if (!profile || profile.tags.length === 0) return null;
    // Return most common character
    const chars = Object.entries(profile.preferredCharacters) as Array<[MasteringCharacter, number]>;
    if (chars.length === 0) return null;
    return chars.sort((a, b) => b[1] - a[1])[0][0] as MasteringCharacter;
  }, [profile]);

  const getRecommendedLUFS = useCallback((): number => {
    return profile?.preferredLUFS ?? -14;
  }, [profile]);

  const clearProfile = useCallback(() => {
    setProfile(null);
    localStorage.removeItem(PROFILE_KEY);
  }, []);

  const getProfileStrength = useCallback((): 'weak' | 'learning' | 'strong' => {
    if (!profile || profile.tags.length < 3) return 'weak';
    if (profile.tags.length < 8) return 'learning';
    return 'strong';
  }, [profile]);

  return {
    profile,
    addTag,
    getRecommendedCharacter,
    getRecommendedLUFS,
    getProfileStrength,
    clearProfile,
  };
};

// Helper functions
const calculateAverageLUFS = (tags: MasteringTag[]): number => {
  if (tags.length === 0) return -14;
  return tags.reduce((sum, tag) => sum + tag.lufs, 0) / tags.length;
};

const updateCharacterFrequency = (
  freq: Record<MasteringCharacter, number>,
  character: MasteringCharacter
): Record<MasteringCharacter, number> => {
  return {
    ...freq,
    [character]: (freq[character] || 0) + 1,
  };
};
