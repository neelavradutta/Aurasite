import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/router';
import { login, register } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import AurasiteIcon from '@/components/AurasiteIcon';

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

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
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [successKey, setSuccessKey] = useState(0);
  const redirectTimeoutRef = useRef<number | null>(null);
  const [stars, setStars] = useState<Star[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!token) {
      setLoginSuccess(false);
      return;
    }
    if (loginSuccess) return;
    router.replace('/dashboard');
  }, [token, router, loginSuccess]);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current !== null) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

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
    if (loginSuccess) return;
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);

    try {
      const result =
        mode === 'login'
          ? await login(email, password)
          : await register(email, password, name);

      flushSync(() => {
        setLoginSuccess(true);
        setSuccessKey((current) => current + 1);
      });
      setAuth(result.token, result.user);

      if (redirectTimeoutRef.current !== null) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
      redirectTimeoutRef.current = window.setTimeout(() => {
        router.push('/dashboard');
      }, 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setFieldErrors({ password: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="anpr-access-portal">
      <div className="anpr-access-portal__stars" aria-hidden>
        {stars.map((star, index) => (
          <span
            key={`star-${index}`}
            className="anpr-access-portal__star"
            style={{ left: star.left, top: star.top, animationDelay: star.delay }}
          />
        ))}
      </div>

      <div className="anpr-access-portal__grid-bg" aria-hidden />
      <div className="anpr-access-portal__orbit anpr-access-portal__orbit--1" aria-hidden />
      <div className="anpr-access-portal__orbit anpr-access-portal__orbit--2" aria-hidden />
      <div className="anpr-access-portal__orbit anpr-access-portal__orbit--3" aria-hidden />

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

        <div
          className={`anpr-access-portal__card${
            loginSuccess ? ' anpr-access-portal__card--success' : ''
          }`}
        >
          {loginSuccess ? (
            <div
              key={`success-${successKey}`}
              className="anpr-access-portal__success"
              role="status"
              aria-live="polite"
            >
              <div className="anpr-access-portal__success-icon">✓</div>
              <p className="anpr-access-portal__success-title">
                {mode === 'login' ? 'Login Successful' : 'Registration Successful'}
              </p>
              <p className="anpr-access-portal__success-subtitle">Redirecting to dashboard...</p>
            </div>
          ) : null}

          <div className={loginSuccess ? 'anpr-access-portal__form--hidden' : undefined}>
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
