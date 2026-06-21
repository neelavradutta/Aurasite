import { motion } from 'framer-motion';

interface Props {
  size?: number;
  className?: string;
}

export default function ImageIcon({ size = 64, className = '' }: Props) {
  return (
    <div
      className={`relative flex items-center justify-center ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <motion.div
        className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-400/15 via-cyan-400/10 to-purple-400/15 blur-xl"
        animate={{
          opacity: [0.4, 0.7, 0.4],
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="relative h-full w-full"
        animate={{
          y: [0, -1.5, 0],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative drop-shadow-lg"
          aria-hidden
        >
          <rect
            x="6"
            y="6"
            width="52"
            height="52"
            rx="8"
            fill="none"
            stroke="#0c3d66"
            strokeWidth="2.5"
          />

          <rect x="8" y="8" width="48" height="48" rx="7" fill="#fbbf24" />

          <rect
            x="14"
            y="14"
            width="36"
            height="30"
            rx="3"
            fill="#5eead4"
            stroke="#0c5460"
            strokeWidth="1.5"
          />

          <motion.path
            d="M 18 38 L 30 24 L 38 32 Z"
            fill="none"
            stroke="#1e3a5f"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{
              opacity: [0.7, 1, 0.7],
              pathLength: [0.9, 1, 0.9],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          <motion.path
            d="M 18 38 L 30 24 L 38 32 L 38 38 Z"
            fill="#e5e7eb"
            fillOpacity="0.85"
            animate={{
              fillOpacity: [0.7, 0.9, 0.7],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 0.2,
            }}
          />

          <motion.path
            d="M 36 38 L 46 22 L 54 35 Z"
            fill="none"
            stroke="#1e3a5f"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{
              opacity: [0.7, 1, 0.7],
              pathLength: [0.85, 1, 0.85],
            }}
            transition={{
              duration: 3.2,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 0.1,
            }}
          />

          <motion.path
            d="M 36 38 L 46 22 L 54 35 L 54 38 Z"
            fill="#d1d5db"
            fillOpacity="0.85"
            animate={{
              fillOpacity: [0.7, 0.9, 0.7],
            }}
            transition={{
              duration: 3.2,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 0.3,
            }}
          />

          <motion.circle
            cx="48"
            cy="22"
            r="4.5"
            fill="#fbbf24"
            stroke="#d97706"
            strokeWidth="1.5"
            animate={{
              scale: [1, 1.25, 1],
              opacity: [0.8, 1, 0.8],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          <motion.circle
            cx="48"
            cy="22"
            r="6"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1"
            opacity="0.4"
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.6, 0.1, 0.6],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          <motion.line
            x1="16"
            y1="46"
            x2="50"
            y2="46"
            stroke="#0c5460"
            strokeWidth="1"
            opacity="0.5"
            animate={{
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          <motion.circle
            cx="52"
            cy="16"
            r="2"
            fill="#22d3ee"
            opacity="0.6"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.4, 0.8, 0.4],
            }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </svg>
      </motion.div>
    </div>
  );
}
