import { useRouter } from 'next/router';
import {
  isAuthEntryRoute,
  useThemeStore,
  type AppTheme,
} from '@/store/themeStore';

export function useActiveTheme(): AppTheme {
  const router = useRouter();
  const theme = useThemeStore((state) => state.theme);
  if (isAuthEntryRoute(router.pathname)) return 'dark';
  return theme;
}

export function useTheme() {
  const theme = useThemeStore((state) => state.theme);
  const activeTheme = useActiveTheme();
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const hydrate = useThemeStore((state) => state.hydrate);
  const isDark = activeTheme === 'dark';

  return { theme, activeTheme, isDark, toggleTheme, setTheme, hydrate };
}
