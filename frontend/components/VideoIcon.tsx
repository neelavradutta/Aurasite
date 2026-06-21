import { motion } from 'framer-motion';

interface Props {
  size?: number;
  className?: string;
}

export default function VideoIcon({ size = 64, className = '' }: Props) {
  return (
    <div
      className={`relative flex items-center justify-center ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <motion.div
        className="absolute inset-0 rounded-3xl bg-gradient-to-br from-red-500/10 to-transparent blur-lg"
        animate={{
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative drop-shadow-lg"
        aria-hidden
      >
        <rect x="6" y="8" width="52" height="48" rx="8" fill="#3a3a3a" />

        <rect x="10" y="15" width="4" height="4" rx="0.5" fill="#ffffff" opacity="0.9" />
        <rect x="10" y="23" width="4" height="4" rx="0.5" fill="#ffffff" opacity="0.7" />
        <rect x="10" y="31" width="4" height="4" rx="0.5" fill="#ffffff" opacity="0.9" />
        <rect x="10" y="39" width="4" height="4" rx="0.5" fill="#ffffff" opacity="0.7" />
        <rect x="10" y="47" width="4" height="4" rx="0.5" fill="#ffffff" opacity="0.9" />

        <rect x="50" y="15" width="4" height="4" rx="0.5" fill="#ffffff" opacity="0.9" />
        <rect x="50" y="23" width="4" height="4" rx="0.5" fill="#ffffff" opacity="0.7" />
        <rect x="50" y="31" width="4" height="4" rx="0.5" fill="#ffffff" opacity="0.9" />
        <rect x="50" y="39" width="4" height="4" rx="0.5" fill="#ffffff" opacity="0.7" />
        <rect x="50" y="47" width="4" height="4" rx="0.5" fill="#ffffff" opacity="0.9" />

        <motion.rect
          x="18"
          y="12"
          width="28"
          height="40"
          rx="4"
          fill="#ef4444"
          animate={{
            opacity: [0.85, 1, 0.85],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        <motion.circle
          cx="32"
          cy="32"
          r="10"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          opacity="0.4"
          animate={{
            r: [8, 12, 8],
            opacity: [0.6, 0.2, 0.6],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        <path d="M 28 26 L 36 32 L 28 38 Z" fill="#ffffff" />
      </svg>
    </div>
  );
}
