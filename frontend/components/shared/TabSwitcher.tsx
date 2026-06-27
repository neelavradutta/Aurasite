import { Fragment } from 'react';
import { motion } from 'framer-motion';
import { useThemeStore } from '@/store/themeStore';
import { getUiPalette } from '@/theme/themeColors';

export type TabSwitcherValue = 'camera' | 'source';

interface TabSwitcherProps {
  value: TabSwitcherValue;
  onChange: (tab: TabSwitcherValue) => void;
  disabled?: boolean;
  className?: string;
}

const tabs: { id: TabSwitcherValue; label: string }[] = [
  { id: 'camera', label: 'Camera' },
  { id: 'source', label: 'Source' },
];

export default function TabSwitcher({ value, onChange, disabled = false, className = '' }: TabSwitcherProps) {
  const theme = useThemeStore((state) => state.theme);
  const ui = getUiPalette(theme);
  const isCream = theme === 'brown-cream';

  return (
    <div
      className={`tab-switcher-shell relative overflow-hidden rounded-lg border border-cyan-500/20 bg-black/30 ${className}`}
    >
      <div className="relative flex items-center gap-0 p-0.5">
        {tabs.map((tab, index) => (
          <Fragment key={tab.id}>
            {index > 0 ? (
              <motion.div
                className="tab-switcher-divider h-6 w-px bg-gradient-to-b from-cyan-500/0 via-cyan-500/50 to-cyan-500/0"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            ) : null}
            <motion.button
              type="button"
              disabled={disabled}
              onClick={() => onChange(tab.id)}
              className="relative flex-1 px-3 py-1.5 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60"
              whileHover={disabled ? undefined : { scale: 1.02 }}
              whileTap={disabled ? undefined : { scale: 0.98 }}
            >
              {value === tab.id ? (
                <motion.div
                  className="tab-switcher-active-bg absolute inset-0 rounded-md bg-gradient-to-r from-cyan-500/20 to-cyan-500/10"
                  layoutId="liveModeTab"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              ) : null}
              <motion.span
                className="relative z-20 font-mono text-xs uppercase tracking-widest"
                animate={{
                  color: value === tab.id ? ui.tabActive : ui.tabInactive,
                  textShadow:
                    value === tab.id && !isCream ? ui.tabActiveShadow : '0 0 0px rgba(0, 0, 0, 0)',
                }}
                transition={{ duration: 0.3 }}
              >
                {tab.label}
              </motion.span>
            </motion.button>
          </Fragment>
        ))}
      </div>
      <motion.div
        className="tab-switcher-indicator absolute bottom-0 h-0.5 bg-gradient-to-r from-cyan-500/0 via-cyan-500 to-cyan-500/0"
        animate={{
          width: '45%',
          left: value === 'camera' ? '4px' : 'calc(50% + 4px)',
        }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        style={{ boxShadow: isCream ? ui.tabBarShadow : ui.tabBarShadow }}
      />
    </div>
  );
}

