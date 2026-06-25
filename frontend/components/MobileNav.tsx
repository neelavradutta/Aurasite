import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/detections', label: 'Detections' },
  { href: '/vehicles', label: 'Vehicles' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/live', label: 'Live' },
];

export default function MobileNav() {
  const router = useRouter();
  const { token, user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [router.pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="mobile-nav lg:hidden">
      <button
        type="button"
        className="mobile-nav__trigger"
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="mobile-nav__bars" aria-hidden />
      </button>

      {open ? (
        <button
          type="button"
          className="mobile-nav__backdrop"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <nav
        className={`mobile-nav__drawer${open ? ' mobile-nav__drawer--open' : ''}`}
        aria-hidden={!open}
      >
        <p className="mobile-nav__title font-orbitron">Navigate</p>
        <div className="mobile-nav__links">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav__link${
                router.pathname === item.href ? ' mobile-nav__link--active' : ''
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="mobile-nav__footer">
          {token && user?.name ? (
            <p className="mobile-nav__user">{user.name.replace(/^System\s+/i, '')}</p>
          ) : null}
          {token ? (
            <button
              type="button"
              className="mobile-nav__logout"
              onClick={() => {
                logout();
                void router.push('/login');
              }}
            >
              Logout
            </button>
          ) : (
            <Link href="/login" className="mobile-nav__link mobile-nav__link--active">
              Login
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
