import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type OverlayPhase = 'loading' | 'result' | 'complete';
export type LoginOverlayOutcome = 'pending' | 'success' | 'denied';

type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
  driftX: number;
  driftY: number;
};

interface Props {
  outcome: LoginOverlayOutcome;
  onComplete: (result: 'success' | 'denied') => void;
}

const OVERLAY_BG =
  'radial-gradient(circle 1200px at 50% 50%, rgba(0, 255, 255, 0.08) 0%, rgba(10, 17, 40, 0.98) 100%)';

const OVERLAY_BG_SUCCESS =
  'radial-gradient(circle 1200px at 50% 50%, rgba(0, 255, 255, 0.05) 0%, rgba(10, 17, 40, 1) 100%)';

const OVERLAY_BG_DENIED =
  'radial-gradient(circle 1200px at 50% 50%, rgba(255, 0, 110, 0.06) 0%, rgba(10, 17, 40, 1) 100%)';

function ParticleField({ particles }: { particles: Particle[] }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-cyan-400"
          style={{
            width: particle.size,
            height: particle.size,
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            opacity: particle.opacity,
          }}
          animate={{
            y: [0, -200, -400],
            x: [0, particle.driftX, particle.driftY],
            opacity: [particle.opacity, particle.opacity, 0],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
}

function SuccessCheckmark() {
  return (
    <svg className="h-40 w-40" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="premiumLoginCheckGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00ffff" />
          <stop offset="100%" stopColor="#00ff88" />
        </linearGradient>
      </defs>

      <motion.circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="url(#premiumLoginCheckGradient)"
        strokeWidth="2"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />

      <motion.path
        d="M 30 50 L 45 65 L 70 35"
        fill="none"
        stroke="url(#premiumLoginCheckGradient)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2, ease: 'easeInOut' }}
      />
    </svg>
  );
}

function DeniedMark() {
  return (
    <svg className="h-40 w-40" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="premiumLoginDeniedGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff006e" />
          <stop offset="100%" stopColor="#ff4d8d" />
        </linearGradient>
      </defs>

      <motion.circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="url(#premiumLoginDeniedGradient)"
        strokeWidth="2"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />

      <motion.path
        d="M 34 34 L 66 66 M 66 34 L 34 66"
        fill="none"
        stroke="url(#premiumLoginDeniedGradient)"
        strokeWidth="4"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2, ease: 'easeInOut' }}
      />
    </svg>
  );
}

function GlitchText({ text }: { text: string }) {
  return (
    <div className="relative inline-block">
      <motion.div
        className="text-3xl font-bold tracking-[0.22em]"
        style={{
          background: 'linear-gradient(90deg, #00ffff, #00aaff, #00ffff)',
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
        animate={{
          backgroundPosition: ['0% 0%', '100% 0%', '0% 0%'],
        }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        {text}
      </motion.div>

      {[1, 2].map((i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute inset-0 text-3xl font-bold tracking-[0.22em]"
          style={{
            color: i === 1 ? '#00ffff' : '#00aaff',
            opacity: 0.5,
          }}
          animate={{
            x: [0, -3, 2, 0],
            y: [0, 2, -1, 0],
          }}
          transition={{
            duration: 0.2,
            delay: i * 0.05,
            repeat: Infinity,
            repeatDelay: 0.5,
          }}
        >
          {text}
        </motion.div>
      ))}
    </div>
  );
}

function RadialWaves() {
  return (
    <div className="premium-login-radial-waves pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="premium-login-radial-wave" />
      <span className="premium-login-radial-wave" />
      <span className="premium-login-radial-wave" />
    </div>
  );
}

function CornerAccents() {
  const cornerStyles = useMemo(
    () => [
      { top: 0, left: 0, bottom: 'auto', right: 'auto' },
      { top: 0, left: 'auto', bottom: 'auto', right: 0 },
      { top: 'auto', left: 0, bottom: 0, right: 'auto' },
      { top: 'auto', left: 'auto', bottom: 0, right: 0 },
    ],
    []
  );

  return (
    <>
      {cornerStyles.map((style, corner) => (
        <motion.div
          key={corner}
          className="absolute h-36 w-36 border-l border-t border-cyan-500/30"
          style={style}
          animate={{
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 3,
            delay: corner * 0.2,
            repeat: Infinity,
          }}
        />
      ))}
    </>
  );
}

function AuthenticatingOverlay({
  progress,
  particles,
}: {
  progress: number;
  particles: Particle[];
}) {
  const showProgress = progress < 1;

  return (
    <motion.div
      key="authenticating-overlay"
      className="premium-login-overlay premium-login-overlay--loading fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden"
      style={{ background: OVERLAY_BG }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <ParticleField particles={particles} />
      <div className="premium-login-auth-fx pointer-events-none absolute inset-0 overflow-hidden">
        <RadialWaves />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-5 text-center">
        <GlitchText text="AUTHENTICATING" />
        {showProgress ? (
          <>
            <div
              className="h-1.5 w-80 max-w-[85vw] overflow-hidden rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, rgba(0, 255, 255, 0.2), rgba(0, 255, 255, 0.4), rgba(0, 255, 255, 0.2))',
              }}
            >
              <div
                className="h-full"
                style={{
                  width: `${progress * 100}%`,
                  background: 'linear-gradient(90deg, #00ffff, #00aaff)',
                  boxShadow: '0 0 22px rgba(0, 255, 255, 0.8)',
                }}
              />
            </div>
            <motion.p
              className="font-mono text-sm tracking-[0.3em] text-cyan-400/70"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              {Math.round(progress * 100)}%
            </motion.p>
          </>
        ) : null}
      </div>
    </motion.div>
  );
}

function SuccessOverlay({ particles }: { particles: Particle[] }) {
  return (
    <motion.div
      key="success-overlay"
      className="premium-login-overlay premium-login-overlay--success fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden"
      style={{ background: OVERLAY_BG_SUCCESS }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <ParticleField particles={particles} />

      <div className="relative z-10 flex flex-col items-center gap-14">
        <motion.div
          className="relative"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            duration: 0.6,
            ease: [0.34, 1.56, 0.64, 1],
          }}
        >
          <SuccessCheckmark />
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(0, 255, 136, 0.4) 0%, transparent 70%)',
            }}
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.6, 0.2, 0.6],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </motion.div>

        <motion.div
          className="space-y-4 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="bg-gradient-to-r from-cyan-400 to-green-400 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
            ACCESS VERIFIED
          </h2>
          <SequentialDots tone="success" />
        </motion.div>
      </div>

      <CornerAccents />
    </motion.div>
  );
}

function SequentialDots({ tone }: { tone: 'success' | 'denied' }) {
  const colorClass = tone === 'success' ? 'text-green-400' : 'text-rose-400';

  return (
    <div className="premium-login-sequential-dots flex justify-center gap-2.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`premium-login-sequential-dot text-xl ${colorClass}`}>
          ●
        </span>
      ))}
    </div>
  );
}

function DeniedOverlay({ particles }: { particles: Particle[] }) {
  return (
    <motion.div
      key="denied-overlay"
      className="premium-login-overlay premium-login-overlay--denied fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden"
      style={{ background: OVERLAY_BG_DENIED }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <ParticleField particles={particles} />

      <div className="relative z-10 flex flex-col items-center gap-14">
        <motion.div
          className="relative"
          initial={{ scale: 0, rotate: 180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            duration: 0.6,
            ease: [0.34, 1.56, 0.64, 1],
          }}
        >
          <DeniedMark />
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(255, 0, 110, 0.35) 0%, transparent 70%)',
            }}
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.6, 0.2, 0.6],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </motion.div>

        <motion.div
          className="space-y-4 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="bg-gradient-to-r from-rose-400 to-pink-500 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
            ACCESS DENIED
          </h2>
          <p className="font-mono text-sm tracking-[0.22em] text-rose-300/90 md:text-base">
            Incorrect password
          </p>
          <SequentialDots tone="denied" />
        </motion.div>
      </div>

      <CornerAccents />
    </motion.div>
  );
}

function createParticles(): Particle[] {
  return Array.from({ length: 80 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 20 + 20,
    delay: Math.random() * 5,
    opacity: Math.random() * 0.5 + 0.2,
    driftX: Math.random() * 100 - 50,
    driftY: Math.random() * 100 - 50,
  }));
}

export default function PremiumLoginOverlay({ outcome, onComplete }: Props) {
  const [phase, setPhase] = useState<OverlayPhase>('loading');
  const [progress, setProgress] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const resolvedOutcome = outcome === 'pending' ? null : outcome;

  useEffect(() => {
    setParticles(createParticles());
  }, []);

  useEffect(() => {
    if (phase !== 'loading') return;

    const interval = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 1) return 1;
        return prev + 0.02;
      });
    }, 30);

    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'loading' || progress < 1 || resolvedOutcome === null) return;
    setPhase('result');
  }, [phase, progress, resolvedOutcome]);

  useEffect(() => {
    if (phase !== 'result' || resolvedOutcome === null) return;

    const timer = window.setTimeout(() => setPhase('complete'), 3000);
    return () => window.clearTimeout(timer);
  }, [phase, resolvedOutcome]);

  useEffect(() => {
    if (phase !== 'complete' || resolvedOutcome === null) return;
    onComplete(resolvedOutcome);
  }, [phase, resolvedOutcome, onComplete]);

  return (
    <AnimatePresence mode="wait">
      {phase === 'loading' ? (
        <AuthenticatingOverlay key="auth" progress={progress} particles={particles} />
      ) : null}
      {phase === 'result' && resolvedOutcome === 'success' ? (
        <SuccessOverlay key="success" particles={particles} />
      ) : null}
      {phase === 'result' && resolvedOutcome === 'denied' ? (
        <DeniedOverlay key="denied" particles={particles} />
      ) : null}
    </AnimatePresence>
  );
}
