import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, type ReactNode } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import { useAuthStore } from '@/store/authStore';
import { useSocket } from '@/hooks/useSocket';
import AurasiteBrandOverlay from '@/components/AurasiteBrandOverlay';
import AurasiteIconTrigger from '@/components/AurasiteIconTrigger';
import MobileNav from '@/components/MobileNav';
import { ClearNavIcon, LogoutNavIcon, navItemIcons } from '@/components/NavIcons';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/detections', label: 'Detections' },
  { href: '/vehicles', label: 'Vehicles' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/live', label: 'Live' },
] as const;

interface HeaderProps {
  detectionToolbar?: ReactNode;
  analyticsToolbar?: ReactNode;
  vehiclesToolbar?: ReactNode;
  liveToolbar?: ReactNode;
}

export default function Header({ detectionToolbar, analyticsToolbar, vehiclesToolbar, liveToolbar }: HeaderProps = {}) {
  const router = useRouter();
  const { clearDashboard } = useDashboardStore();
  const { connected } = useSocket();
  const { user, token, logout, hydrate } = useAuthStore();
  const [clearing, setClearing] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);

  const statusLabel = connected ? 'ONLINE' : 'OFFLINE';
  const statusActive = connected;
  const isDashboard = router.pathname === '/dashboard';
  const isDetections = router.pathname === '/detections';
  const isAnalytics = router.pathname === '/analytics';
  const isVehicles = router.pathname === '/vehicles';
  const isLive = router.pathname === '/live';
  const showDetectionActions = isDetections && Boolean(detectionToolbar);
  const showAnalyticsActions = isAnalytics && Boolean(analyticsToolbar);
  const showVehiclesActions = isVehicles && Boolean(vehiclesToolbar);
  const showLiveActions = isLive && Boolean(liveToolbar);
  const showPageActions =
    showDetectionActions || showAnalyticsActions || showVehiclesActions || showLiveActions;
  const reserveDashboardActions = token && !isDashboard && !showPageActions;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  async function handleClear() {
    if (clearing) return;
    setClearing(true);
    try {
      await clearDashboard();
    } catch {
      window.alert('Failed to clear session data.');
    } finally {
      setClearing(false);
    }
  }

  return (
    <header className="glass-panel sticky top-0 z-50 border-b border-cyber-cyan/20 px-6 py-4">
      <div className="header-shell mx-auto grid max-w-[1920px] grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div className="header-brand flex items-center gap-3">
          <AurasiteIconTrigger onOpen={() => setBrandOpen(true)} />
          <div>
            <h1 className="font-orbitron text-xl font-bold text-cyber-cyan neon-text">AURASITE</h1>
            <p className="text-xs text-slate-400">Next-Gen Plate Recognition Dashboard</p>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => {
              const Icon = navItemIcons[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition ${
                    router.pathname === item.href
                      ? 'bg-cyber-cyan/15 text-cyber-cyan shadow-neon'
                      : 'text-slate-300 hover:bg-white/5 hover:text-cyber-cyan'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-white" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <MobileNav />
        </div>

        <div
          className={`header-actions-slot flex items-center justify-end gap-3 text-sm ${
            showPageActions ? 'header-actions-slot--page-toolbar' : ''
          } ${reserveDashboardActions ? 'invisible pointer-events-none select-none' : ''}`}
          aria-hidden={reserveDashboardActions ? true : undefined}
        >
          {showDetectionActions ? (
            detectionToolbar
          ) : showAnalyticsActions ? (
            analyticsToolbar
          ) : showVehiclesActions ? (
            vehiclesToolbar
          ) : showLiveActions ? (
            liveToolbar
          ) : (
            <>
              <div className="header-status grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-0.5">
                {token && user?.name ? (
                  <span className="header-user-name col-start-2 text-slate-400">
                    {user.name.replace(/^System\s+/i, '')}
                  </span>
                ) : null}
                <span
                  className={`h-2.5 w-2.5 rounded-full ${statusActive ? 'bg-cyber-green live-dot' : 'bg-slate-500'} ${token && user?.name ? 'row-start-2' : 'row-start-1'}`}
                />
                <span className={token && user?.name ? 'row-start-2' : 'row-start-1'}>{statusLabel}</span>
              </div>
              {token && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={clearing}
                  className="header-clear-btn inline-flex h-9 min-w-[6rem] items-center justify-center gap-1.5 rounded-md border border-cyber-cyan/40 px-3 text-sm text-cyber-cyan transition hover:bg-cyber-cyan/10 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Clear all detections, vehicles, and alerts"
                >
                  <ClearNavIcon className="h-4 w-4 shrink-0 text-white" />
                  {clearing ? 'Clearing...' : 'Clear'}
                </button>
              )}
              {token ? (
                <button
                  onClick={() => {
                    logout();
                    router.push('/login');
                  }}
                  className="header-logout-btn inline-flex h-9 min-w-[6rem] items-center justify-center gap-1.5 rounded-md border border-cyber-pink/30 px-3 text-sm text-cyber-pink transition hover:bg-cyber-pink/10"
                >
                  <LogoutNavIcon className="h-4 w-4 shrink-0 text-white" />
                  Logout
                </button>
              ) : (
                <Link
                  href="/login"
                  className="header-login-link inline-flex h-9 min-w-[6rem] items-center justify-center rounded-md border border-cyber-cyan/40 px-3 text-sm text-cyber-cyan"
                >
                  Login
                </Link>
              )}
            </>
          )}
        </div>
      </div>
      <AurasiteBrandOverlay open={brandOpen} onClose={() => setBrandOpen(false)} />
    </header>
  );
}
