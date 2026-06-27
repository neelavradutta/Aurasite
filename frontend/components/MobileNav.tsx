import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/store/authStore';
import { LogoutNavIcon, navItemIcons } from '@/components/NavIcons';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/detections', label: 'Detections' },
  { href: '/vehicles', label: 'Vehicles' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/live', label: 'Live' },
] as const;

const SWIPE_CLOSE_PX = 56;
const TAP_MOVE_PX = 10;

export default function MobileNav() {
  const router = useRouter();
  const { token, user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const triggerTouchRef = useRef({ x: 0, y: 0, moved: false });

  const closeMenu = useCallback(() => setOpen(false), []);
  const openMenu = useCallback(() => setOpen(true), []);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  function handleSwipeTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleSwipeTouchEnd(event: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (dx >= SWIPE_CLOSE_PX && Math.abs(dx) > Math.abs(dy) * 1.15) {
      closeMenu();
    }
  }

  function handleSwipeTouchCancel() {
    touchStartRef.current = null;
  }

  function handleTriggerTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    triggerTouchRef.current = { x: touch.clientX, y: touch.clientY, moved: false };
  }

  function handleTriggerTouchMove(event: React.TouchEvent) {
    const touch = event.touches[0];
    const dx = Math.abs(touch.clientX - triggerTouchRef.current.x);
    const dy = Math.abs(touch.clientY - triggerTouchRef.current.y);
    if (dx > TAP_MOVE_PX || dy > TAP_MOVE_PX) {
      triggerTouchRef.current.moved = true;
    }
  }

  function handleTriggerClick() {
    if (triggerTouchRef.current.moved) return;
    if (open) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  const swipeHandlers = {
    onTouchStart: handleSwipeTouchStart,
    onTouchEnd: handleSwipeTouchEnd,
    onTouchCancel: handleSwipeTouchCancel,
  };

  const overlay =
    mounted && open
      ? createPortal(
          <>
            <button
              type="button"
              className="mobile-nav__backdrop"
              aria-label="Close menu"
              onClick={closeMenu}
              {...swipeHandlers}
            />
            <nav
              className="mobile-nav__drawer mobile-nav__drawer--open"
              aria-hidden={false}
              {...swipeHandlers}
            >
              <p className="mobile-nav__title font-orbitron">Navigate</p>
              <div className="mobile-nav__links">
                {navItems.map((item) => {
                  const Icon = navItemIcons[item.href];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`mobile-nav__link gap-1.5${
                        router.pathname === item.href ? ' mobile-nav__link--active' : ''
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-white" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>

              <div className="mobile-nav__footer">
                {token && user?.name ? (
                  <p className="mobile-nav__user">{user.name.replace(/^System\s+/i, '')}</p>
                ) : null}
                {token ? (
                  <button
                    type="button"
                    className="mobile-nav__logout inline-flex items-center justify-center gap-1.5"
                    onClick={() => {
                      logout();
                      void router.push('/login');
                    }}
                  >
                    <LogoutNavIcon className="h-4 w-4 shrink-0 text-white" />
                    Logout
                  </button>
                ) : (
                  <Link href="/login" className="mobile-nav__link mobile-nav__link--active">
                    Login
                  </Link>
                )}
              </div>
            </nav>
          </>,
          document.body
        )
      : null;

  return (
    <div className="mobile-nav lg:hidden">
      <button
        type="button"
        className="mobile-nav__trigger"
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={handleTriggerClick}
        onTouchStart={handleTriggerTouchStart}
        onTouchMove={handleTriggerTouchMove}
      >
        <span className="mobile-nav__bars" aria-hidden />
      </button>
      {overlay}
    </div>
  );
}
