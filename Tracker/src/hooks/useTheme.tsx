import React, { createContext, useContext, useState, useEffect } from 'react';
import { safeStorage } from '@/lib/startup-safety';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'spendova-theme';
export const LEGACY_THEME_STORAGE_KEY = 'theme';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function applyThemeColor(theme: Theme) {
  const isDark = theme === 'dark';
  const hexColor = isDark ? '#0D0B19' : '#C2BDDA';
  const root = document.documentElement;

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Remove inline background style overrides so CSS variables drive page background cleanly
  root.style.removeProperty('background-color');
  if (document.body) {
    document.body.style.removeProperty('background-color');
  }

  // Update meta theme-color content directly on existing elements without node deletion
  try {
    const metaThemeColors = document.querySelectorAll('meta[name="theme-color"]');
    if (metaThemeColors.length > 0) {
      metaThemeColors.forEach(meta => {
        meta.setAttribute('content', hexColor);
      });
    } else {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = hexColor;
      document.head.appendChild(meta);
    }
  } catch (e) {
    // Ignore DOM errors if any
  }

  // Dynamically update mobile app native status bar in Capacitor (Android APK & iOS IPA builds)
  try {
    if (Capacitor.isPluginAvailable('StatusBar')) {
      void StatusBar.setStyle({
        style: isDark ? Style.Dark : Style.Light
      });
      if (Capacitor.isNativePlatform()) {
        void StatusBar.setBackgroundColor({ color: hexColor });
      }
    }
  } catch (err) {
    console.warn('Native status bar styling not available:', err);
  }
}

export function getInitialTheme(): Theme {
  const saved = safeStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
  if (saved === 'light' || saved === 'dark') return saved;
  const legacy = safeStorage.getItem(LEGACY_THEME_STORAGE_KEY) as Theme | null;
  if (legacy === 'light' || legacy === 'dark') {
    safeStorage.setItem(THEME_STORAGE_KEY, legacy);
    safeStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    return legacy;
  }

  return 'light';
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyThemeColor(theme);
    safeStorage.setItem(THEME_STORAGE_KEY, theme);
    safeStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    const [theme, setThemeState] = useState<Theme>(getInitialTheme);
    useEffect(() => {
      applyThemeColor(theme);
    }, [theme]);
    const toggleTheme = () => setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
    const setTheme = (newTheme: Theme) => setThemeState(newTheme);
    return { theme, toggleTheme, setTheme };
  }
  return context;
}
