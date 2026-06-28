import { create } from 'zustand';
import { bumpChartAnimationEpoch } from '@/hooks/useChartAnimationKey';

export type AppTheme = 'dark' | 'brown-cream';

const THEME_STORAGE_KEY = 'apnr_theme';

interface ThemeState {
  theme: AppTheme;
  hydrate: () => void;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

export function isAuthEntryRoute(pathname: string): boolean {
  return pathname === '/login' || pathname === '/';
}

export function applyDocumentTheme(theme: AppTheme) {
  if (typeof document === 'undefined') return;
  if (theme === 'brown-cream') {
    document.documentElement.setAttribute('data-theme', 'brown-cream');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/** Login always renders cyberpunk; elsewhere use the saved preference. */
export function syncDocumentThemeForRoute(pathname: string) {
  if (isAuthEntryRoute(pathname)) {
    applyDocumentTheme('dark');
    return;
  }
  applyDocumentTheme(useThemeStore.getState().theme);
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark',
  hydrate: () => {
    if (typeof window === 'undefined') return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      saved = null;
    }
    const theme: AppTheme = saved === 'brown-cream' ? 'brown-cream' : 'dark';
    if (saved === 'dark') {
      try {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    set({ theme });
  },
  setTheme: (theme) => {
    applyDocumentTheme(theme);
    try {
      if (theme === 'brown-cream') {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } else {
        localStorage.removeItem(THEME_STORAGE_KEY);
      }
    } catch {
      /* ignore storage failures */
    }
    bumpChartAnimationEpoch();
    set({ theme });
  },
  toggleTheme: () => {
    const next: AppTheme = get().theme === 'dark' ? 'brown-cream' : 'dark';
    get().setTheme(next);
  },
}));
