import { Fragment, useEffect, useRef, useState } from 'react';
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

const GLASS_LENS_SPRING = {
  type: 'spring' as const,
  damping: 20,
  stiffness: 280,
  mass: 0.9,
};

export default function TabSwitcher({ value, onChange, disabled = false, className = '' }: TabSwitcherProps) {
  const theme = useThemeStore((state) => state.theme);
  const ui = getUiPalette(theme);
  const isCream = theme === 'brown-cream';

  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Partial<Record<TabSwitcherValue, HTMLDivElement | null>>>({});
  const [positions, setPositions] = useState<Partial<Record<TabSwitcherValue, number>>>({});
  const [widths, setWidths] = useState<Partial<Record<TabSwitcherValue, number>>>({});
  const [lensTop, setLensTop] = useState(0);
  const [lensHeight, setLensHeight] = useState(0);

  useEffect(() => {
    const updatePositions = () => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newPositions: Partial<Record<TabSwitcherValue, number>> = {};
      const newWidths: Partial<Record<TabSwitcherValue, number>> = {};

      tabs.forEach((tab) => {
        const el = itemRefs.current[tab.id];
        if (!el) return;

        const elRect = el.getBoundingClientRect();
        newPositions[tab.id] = elRect.left - containerRect.left;
        newWidths[tab.id] = elRect.width;
        setLensTop(elRect.top - containerRect.top);
        setLensHeight(elRect.height);
      });

      setPositions(newPositions);
      setWidths(newWidths);
    };

    const timer = setTimeout(updatePositions, 0);
    window.addEventListener('resize', updatePositions);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePositions);
    };
  }, [value]);

  const selectedPos = positions[value] ?? 0;
  const selectedWidth = widths[value] ?? 0;

  return (
    <div
      className={`tab-switcher-shell relative overflow-hidden rounded-lg border border-cyan-500/20 bg-black/30 ${className}`}
    >
      <div ref={containerRef} className="relative flex items-center gap-0 p-0.5">
        <motion.div
          className="tab-switcher-active-bg pointer-events-none absolute rounded-md bg-gradient-to-r from-cyan-500/20 to-cyan-500/10"
          animate={{
            x: selectedPos,
            width: selectedWidth,
          }}
          transition={GLASS_LENS_SPRING}
          style={{
            left: 0,
            top: lensTop,
            height: lensHeight || undefined,
            opacity: selectedWidth > 0 ? 1 : 0,
          }}
        />

        {tabs.map((tab, index) => (
          <Fragment key={tab.id}>
            {index > 0 ? (
              <motion.div
                className="tab-switcher-divider h-6 w-px bg-gradient-to-b from-cyan-500/0 via-cyan-500/50 to-cyan-500/0"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            ) : null}
            <div
              ref={(el) => {
                itemRefs.current[tab.id] = el;
              }}
              className="relative z-10 flex-1"
            >
              <motion.button
                type="button"
                disabled={disabled}
                onClick={() => onChange(tab.id)}
                className="relative w-full px-3 py-1.5 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60"
                whileHover={disabled ? undefined : { scale: 1.02 }}
                whileTap={disabled ? undefined : { scale: 0.98 }}
              >
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
            </div>
          </Fragment>
        ))}
      </div>
      {!isCream ? (
        <motion.div
          className="tab-switcher-indicator absolute bottom-0 h-0.5 bg-gradient-to-r from-cyan-500/0 via-cyan-500 to-cyan-500/0"
          animate={{
            width: '45%',
            left: value === 'camera' ? '4px' : 'calc(50% + 4px)',
          }}
          transition={GLASS_LENS_SPRING}
          style={{ boxShadow: ui.tabBarShadow }}
        />
      ) : null}
    </div>
  );
}
