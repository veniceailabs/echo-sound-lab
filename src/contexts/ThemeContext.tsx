import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeSkin = 'studio' | 'vinyl' | 'neon' | 'minimal';
export type ThemeMode = 'light' | 'dark' | 'amoled';

interface ThemeContextType {
  mode: ThemeMode;
  skin: ThemeSkin;
  setMode: (mode: ThemeMode) => void;
  setSkin: (skin: ThemeSkin) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const THEME_COLORS = {
  studio: {
    light: { bg: '#f8fafc', text: '#0f172a', accent: '#06b6d4' },
    dark: { bg: '#0f172a', text: '#f1f5f9', accent: '#22d3ee' },
    amoled: { bg: '#000000', text: '#ffffff', accent: '#22d3ee' },
  },
  vinyl: {
    light: { bg: '#fef5e7', text: '#2c1810', accent: '#d4a574' },
    dark: { bg: '#1a0f08', text: '#f5e6d3', accent: '#d4a574' },
    amoled: { bg: '#000000', text: '#f5e6d3', accent: '#d4a574' },
  },
  neon: {
    light: { bg: '#f0f0ff', text: '#0a0a1a', accent: '#ff00ff' },
    dark: { bg: '#0a0a1a', text: '#f0f0ff', accent: '#00ffff' },
    amoled: { bg: '#000000', text: '#f0f0ff', accent: '#00ffff' },
  },
  minimal: {
    light: { bg: '#ffffff', text: '#000000', accent: '#000000' },
    dark: { bg: '#1a1a1a', text: '#ffffff', accent: '#ffffff' },
    amoled: { bg: '#000000', text: '#ffffff', accent: '#ffffff' },
  },
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [skin, setSkin] = useState<ThemeSkin>('studio');

  // Load from localStorage on mount
  useEffect(() => {
    const savedMode = localStorage.getItem('esl:theme:mode') as ThemeMode | null;

    // Never restore 'light' — tan palette breaks UI elements and blocks controls.
    // Reset any stale 'light' entry to 'dark' so the dark studio theme always loads.
    if (savedMode === 'dark' || savedMode === 'amoled') {
      setMode(savedMode);
    } else if (savedMode === 'light') {
      localStorage.setItem('esl:theme:mode', 'dark');
    }

    // Keep the brand skin stable by default. The old skin persistence caused
    // the tan/orange vinyl look to reappear unexpectedly across sessions.
    setSkin('studio');
  }, []);

  // Persist to localStorage and apply to DOM
  useEffect(() => {
    localStorage.setItem('esl:theme:mode', mode);
    localStorage.setItem('esl:theme:skin', 'studio');

    const colors = THEME_COLORS.studio[mode];
    document.documentElement.style.setProperty('--color-bg', colors.bg);
    document.documentElement.style.setProperty('--color-text', colors.text);
    document.documentElement.style.setProperty('--color-accent', colors.accent);

    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark', 'theme-amoled');
    root.classList.add(`theme-${mode}`);

    // Tailwind dark variants still key off the `dark` class.
    if (mode === 'light') {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
  }, [mode, skin]);

  return (
    <ThemeContext.Provider value={{ mode, skin, setMode, setSkin }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
