import { motion } from 'framer-motion';
import { useThemeStore } from '@/store/themeStore';
import { getUiPalette } from '@/theme/themeColors';

interface StatusBadgeProps {
  isScanning: boolean;
  className?: string;
}

export default function StatusBadge({ isScanning, className = '' }: StatusBadgeProps) {
  const theme = useThemeStore((state) => state.theme);
  const ui = getUiPalette(theme);
  const isCream = theme === 'brown-cream';

  return (
    <motion.div
      className={`status-badge-shell relative overflow-hidden rounded-full border border-cyan-500/20 bg-slate-900/40 px-7 py-3 shadow-2xl backdrop-blur-2xl ${className}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, type: 'spring' }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-full"
        animate={{
          opacity: isScanning ? [0.2, 0.4, 0.2] : [0.05, 0.15, 0.05],
        }}
        transition={{
          duration: isScanning ? 2.4 : 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          background: `linear-gradient(45deg, ${
            isScanning ? ui.statusScanningBg : ui.statusStandbyBg
          }, transparent)`,
          boxShadow: isScanning ? ui.statusScanningGlow : ui.statusStandbyGlow,
        }}
      />

      <div className="relative z-20 flex items-center gap-3.5">
        <div className="relative h-3.5 w-3.5">
          {isScanning ? (
            <>
              <span className="status-badge-dot-ring absolute inset-0 rounded-full border border-green-400/80" />
              <span className="status-badge-dot-ring status-badge-dot-ring-delayed absolute inset-0 rounded-full border border-green-400/50" />
              <span className="status-badge-dot-spin absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(74,222,128,0.55)_120deg,transparent_240deg)]" />
              <span className="status-badge-dot-pulse absolute inset-[1px] rounded-full bg-green-500" />
            </>
          ) : (
            <span className="status-badge-dot-standby absolute inset-0 rounded-full bg-slate-500" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <motion.span
            className="font-mono text-sm uppercase tracking-widest"
            animate={{
              color: isScanning ? ui.statusScanning : ui.statusStandby,
              textShadow:
                isScanning && !isCream
                  ? ui.statusScanningShadow
                  : isCream
                    ? 'none'
                    : ui.statusStandbyShadow,
            }}
            transition={{ duration: 0.5 }}
          >
            {isScanning ? 'SCANNING' : 'STANDBY'}
          </motion.span>

          {isScanning ? (
            <span className="status-badge-signal-bars" aria-hidden>
              <span className="status-badge-signal-bar status-badge-signal-bar-1" />
              <span className="status-badge-signal-bar status-badge-signal-bar-2" />
              <span className="status-badge-signal-bar status-badge-signal-bar-3" />
            </span>
          ) : null}
        </div>
      </div>

      <motion.div
        className="pointer-events-none absolute inset-0 rounded-full"
        animate={{
          opacity: isScanning ? [0.45, 0.85, 0.45] : [0.35, 0.65, 0.35],
        }}
        transition={{
          duration: isScanning ? 2.4 : 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          border: '1px solid',
          borderColor: isScanning ? ui.statusScanningBorder : ui.statusStandbyBorder,
          boxShadow: isScanning ? ui.statusScanningRing : ui.statusStandbyRing,
        }}
      />
    </motion.div>
  );
}

