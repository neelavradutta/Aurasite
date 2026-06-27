import { useThemeStore } from '@/store/themeStore';

export function useTheme() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const hydrate = useThemeStore((state) => state.hydrate);
  const isDark = theme === 'dark';

  return { theme, isDark, toggleTheme, setTheme, hydrate };
}
