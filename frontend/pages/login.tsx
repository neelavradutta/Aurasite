import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/router';
import axios from 'axios';
import { formatApiError, login, register } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import AurasiteIcon from '@/components/AurasiteIcon';
import PremiumLoginOverlay, { LoginOverlayOutcome } from '@/components/PremiumLoginOverlay';

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

type PendingAuth = { token: string; user: { id: number; email: string; name: string; role: string } };

function isWrongPasswordError(err: unknown): boolean {
  if (!axios.isAxiosError(err) || err.response?.status !== 401) return false;
  const code = err.response?.data?.code;
  const message = String(err.response?.data?.message || '').toLowerCase();
  return code === 'invalid_credentials' || message.includes('invalid credentials');
}
type Star = { left: string; top: string; delay: string };
type Particle = { left: string; top: string; delay: string };

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 3l18 18M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42M9.88 5.09A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a18.2 18.2 0 0 1-4.11 5.28M6.11 6.11A18.4 18.4 0 0 0 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.12-.79"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, token, hydrate } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayOutcome, setOverlayOutcome] = useState<LoginOverlayOutcome>('pending');
  const pendingAuthRef = useRef<PendingAuth | null>(null);
  const [stars, setStars] = useState<Star[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!token) return;
    if (showOverlay) return;
    router.replace('/dashboard');
  }, [token, router, showOverlay]);

  useEffect(() => {
    setStars(
      Array.from({ length: 50 }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: `${Math.random() * 1.2}s`,
      })),
    );
    setParticles(
      Array.from({ length: 10 }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: `${Math.random() * 1.5}s`,
      })),
    );
  }, []);

  function resetForm() {
    setEmail('');
    setPassword('');
    setName('');
    setShowPassword(false);
    setFieldErrors({});
  }

  function toggleMode() {
    if (showOverlay) return;
    setMode((current) => (current === 'login' ? 'register' : 'login'));
    resetForm();
  }

  function validateForm(): boolean {
    const errors: FieldErrors = {};

    if (mode === 'register' && !name.trim()) {
      errors.name = 'Name is required';
    }

    if (!email.includes('@')) {
      errors.email = 'Valid email required';
    }

    if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const handleOverlayComplete = useCallback(
    (result: 'success' | 'denied') => {
      if (result === 'success') {
        if (pendingAuthRef.current) {
          setAuth(pendingAuthRef.current.token, pendingAuthRef.current.user);
          pendingAuthRef.current = null;
        }
        router.push('/dashboard');
        return;
      }

      pendingAuthRef.current = null;
      setShowOverlay(false);
      setOverlayOutcome('pending');
      setPassword('');
    },
    [router, setAuth]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setFieldErrors({});

    if (mode === 'login') {
      flushSync(() => {
        setShowOverlay(true);
        setOverlayOutcome('pending');
      });

      try {
        const result = await login(email, password);
        pendingAuthRef.current = result;
        setOverlayOutcome('success');
      } catch (err) {
        if (isWrongPasswordError(err)) {
          pendingAuthRef.current = null;
          setOverlayOutcome('denied');
        } else {
          setShowOverlay(false);
          setOverlayOutcome('pending');
          setFieldErrors({ password: formatApiError(err, 'Authentication failed') });
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const result = await register(email, password, name);
      pendingAuthRef.current = result;
      flushSync(() => {
        setShowOverlay(true);
        setOverlayOutcome('success');
      });
    } catch (err) {
      setFieldErrors({ password: formatApiError(err, 'Authentication failed') });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`anpr-access-portal${showOverlay ? ' anpr-access-portal--overlay-active' : ''}`}>
      {showOverlay && typeof document !== 'undefined'
        ? createPortal(
            <PremiumLoginOverlay outcome={overlayOutcome} onComplete={handleOverlayComplete} />,
            document.body
          )
        : null}
      <div className="anpr-access-portal__stars" aria-hidden>
        {stars.map((star, index) => (
          <span
            key={`star-${index}`}
            className="anpr-access-portal__star"
            style={{ left: star.left, top: star.top, animationDelay: star.delay }}
          />
        ))}
      </div>

      <div className="anpr-access-portal__container">
        {particles.map((particle, index) => (
          <span
            key={`particle-${index}`}
            className="anpr-access-portal__particle"
            style={{
              left: particle.left,
              top: particle.top,
              animationDelay: particle.delay,
            }}
            aria-hidden
          />
        ))}

        <div className="anpr-access-portal__card">
          <div className={showOverlay ? 'anpr-access-portal__form--hidden' : undefined}>
          <div className="mb-3 flex justify-center">
            <AurasiteIcon size={72} />
          </div>
          <div className="anpr-access-portal__title">AURASITE</div>
          <div className="anpr-access-portal__subtitle">
            {mode === 'login'
              ? 'Sign in to manage detections and exports'
              : 'Create an operator account'}
          </div>

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="anpr-access-portal__form-group">
                <label className="anpr-access-portal__label" htmlFor="name">
                  Full name
                </label>
                <input
                  id="name"
                  className="anpr-access-portal__input"
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
                {fieldErrors.name ? (
                  <div className="anpr-access-portal__error anpr-access-portal__error--shake">
                    {fieldErrors.name}
                  </div>
                ) : null}
              </div>
            )}

            <div className="anpr-access-portal__form-group">
              <label className="anpr-access-portal__label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="anpr-access-portal__input"
                type="email"
                placeholder="admin@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              {fieldErrors.email ? (
                <div className="anpr-access-portal__error anpr-access-portal__error--shake">
                  {fieldErrors.email}
                </div>
              ) : null}
            </div>

            <div className="anpr-access-portal__form-group">
              <label className="anpr-access-portal__label" htmlFor="password">
                Password
              </label>
              <div className="anpr-access-portal__password-wrap">
                <input
                  id="password"
                  className="anpr-access-portal__input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="anpr-access-portal__password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
              {fieldErrors.password ? (
                <div className="anpr-access-portal__error anpr-access-portal__error--shake">
                  {fieldErrors.password}
                </div>
              ) : null}
            </div>

            <button
              className="anpr-access-portal__button"
              type="submit"
              disabled={loading}
            >
              {loading
                ? 'Please wait...'
                : mode === 'login'
                  ? 'Sign In'
                  : 'Register'}
            </button>

            <div className="anpr-access-portal__toggle-text">
              {mode === 'login' ? 'Need an account? ' : 'Already have an account? '}
              <button
                type="button"
                className="anpr-access-portal__toggle-link"
                onClick={toggleMode}
              >
                {mode === 'login' ? 'Register' : 'Sign in'}
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>
    </div>
  );
}
