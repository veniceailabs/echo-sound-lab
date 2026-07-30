import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Flavor =
  | 'midnight' | 'amber' | 'neon' | 'sakura' | 'forest' | 'vapor'
  | 'spring-dark' | 'spring-light'
  | 'summer-dark' | 'summer-light'
  | 'fall-dark'   | 'fall-light'
  | 'winter-dark' | 'winter-light';

export interface FlavorMeta {
  id: Flavor;
  name: string;
  emoji: string;
  description: string;
  accent: string;
  accent2: string;
  bg: string;
  preview: string[]; // 3 swatch hex codes
  group?: 'classic' | 'spring' | 'summer' | 'fall' | 'winter';
  light?: boolean;
}

export const FLAVORS: FlavorMeta[] = [
  // ── Classic ───────────────────────────────────────────────
  {
    id: 'midnight', group: 'classic',
    name: 'Midnight', emoji: '🌑', description: 'Default dark slate',
    accent: '#FB923C', accent2: '#22d3ee', bg: '#0a0f1a',
    preview: ['#0a0f1a', '#FB923C', '#22d3ee'],
  },
  {
    id: 'amber', group: 'classic',
    name: 'Amber', emoji: '🔥', description: 'Warm studio gold',
    accent: '#F59E0B', accent2: '#FCD34D', bg: '#0d0900',
    preview: ['#0d0900', '#F59E0B', '#FCD34D'],
  },
  {
    id: 'neon', group: 'classic',
    name: 'Neon', emoji: '⚡', description: 'Matrix hacker vibes',
    accent: '#00FF88', accent2: '#00FFE0', bg: '#000000',
    preview: ['#000000', '#00FF88', '#00FFE0'],
  },
  {
    id: 'sakura', group: 'classic',
    name: 'Sakura', emoji: '🌸', description: 'Dark rose aesthetic',
    accent: '#F43F5E', accent2: '#F9A8D4', bg: '#0d0508',
    preview: ['#0d0508', '#F43F5E', '#F9A8D4'],
  },
  {
    id: 'forest', group: 'classic',
    name: 'Forest', emoji: '🌲', description: 'Deep emerald green',
    accent: '#10B981', accent2: '#6EE7B7', bg: '#020b06',
    preview: ['#020b06', '#10B981', '#6EE7B7'],
  },
  {
    id: 'vapor', group: 'classic',
    name: 'Vapor', emoji: '💜', description: 'Vaporwave purple',
    accent: '#A855F7', accent2: '#E879F9', bg: '#060308',
    preview: ['#060308', '#A855F7', '#E879F9'],
  },

  // ── Spring ────────────────────────────────────────────────
  {
    id: 'spring-dark', group: 'spring',
    name: 'Spring Night', emoji: '🌿', description: 'Cherry blossom dusk',
    accent: '#34D399', accent2: '#F9A8D4', bg: '#030d07',
    preview: ['#030d07', '#34D399', '#F9A8D4'],
  },
  {
    id: 'spring-light', group: 'spring', light: true,
    name: 'Spring Day', emoji: '🌱', description: 'Fresh morning bloom',
    accent: '#059669', accent2: '#EC4899', bg: '#f0fdf4',
    preview: ['#f0fdf4', '#059669', '#EC4899'],
  },

  // ── Summer ────────────────────────────────────────────────
  {
    id: 'summer-dark', group: 'summer',
    name: 'Summer Night', emoji: '🌊', description: 'Ocean under stars',
    accent: '#06B6D4', accent2: '#FBBF24', bg: '#00070d',
    preview: ['#00070d', '#06B6D4', '#FBBF24'],
  },
  {
    id: 'summer-light', group: 'summer', light: true,
    name: 'Summer Day', emoji: '☀️', description: 'Beach vibes, full sun',
    accent: '#0EA5E9', accent2: '#F59E0B', bg: '#f0f9ff',
    preview: ['#f0f9ff', '#0EA5E9', '#F59E0B'],
  },

  // ── Fall ──────────────────────────────────────────────────
  {
    id: 'fall-dark', group: 'fall',
    name: 'Fall Night', emoji: '🍂', description: 'Ember & woodsmoke',
    accent: '#EA580C', accent2: '#D97706', bg: '#0d0500',
    preview: ['#0d0500', '#EA580C', '#D97706'],
  },
  {
    id: 'fall-light', group: 'fall', light: true,
    name: 'Fall Day', emoji: '🍁', description: 'Golden hour leaves',
    accent: '#C2410C', accent2: '#B45309', bg: '#fffbeb',
    preview: ['#fffbeb', '#C2410C', '#B45309'],
  },

  // ── Winter ────────────────────────────────────────────────
  {
    id: 'winter-dark', group: 'winter',
    name: 'Winter Night', emoji: '❄️', description: 'Frozen midnight sky',
    accent: '#7DD3FC', accent2: '#C4B5FD', bg: '#00060d',
    preview: ['#00060d', '#7DD3FC', '#C4B5FD'],
  },
  {
    id: 'winter-light', group: 'winter', light: true,
    name: 'Winter Day', emoji: '🌨️', description: 'Fresh snow, crisp air',
    accent: '#3B82F6', accent2: '#8B5CF6', bg: '#eff6ff',
    preview: ['#eff6ff', '#3B82F6', '#8B5CF6'],
  },
];

const STORAGE_KEY = 'esl:flavor';

interface FlavorContextValue {
  flavor: Flavor;
  setFlavor: (f: Flavor) => void;
  meta: FlavorMeta;
}

const FlavorContext = createContext<FlavorContextValue>({
  flavor: 'midnight',
  setFlavor: () => {},
  meta: FLAVORS[0],
});

export const FlavorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flavor, setFlavorState] = useState<Flavor>('midnight');

  const applyFlavor = useCallback((f: Flavor) => {
    const root = document.documentElement;
    FLAVORS.forEach(fl => root.classList.remove(`flavor-${fl.id}`));
    if (f !== 'midnight') {
      root.classList.add(`flavor-${f}`);
    }
  }, []);

  useEffect(() => {
    try {
      // Normalize any previously saved flavor back to the neutral studio look.
      localStorage.setItem(STORAGE_KEY, 'midnight');
    } catch {
      // Ignore storage failures and keep the default theme in memory.
    }
    applyFlavor(flavor);
  }, [flavor, applyFlavor]);

  const setFlavor = useCallback((f: Flavor) => {
    setFlavorState(f);
    try { localStorage.setItem(STORAGE_KEY, f); } catch {}
  }, []);

  const meta = FLAVORS.find(f => f.id === flavor) ?? FLAVORS[0];

  return (
    <FlavorContext.Provider value={{ flavor, setFlavor, meta }}>
      {children}
    </FlavorContext.Provider>
  );
};

export const useFlavor = () => useContext(FlavorContext);
