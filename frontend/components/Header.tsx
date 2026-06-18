import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import { useAuthStore } from '@/store/authStore';
import { useSocket } from '@/hooks/useSocket';
import AurasiteIcon from '@/components/AurasiteIcon';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/detections', label: 'Detections' },
  { href: '/vehicles', label: 'Vehicles' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/live', label: 'Live' },
];

export default function Header() {
  const router = useRouter();
  const { clearDashboard } = useDashboardStore();
  const { connected } = useSocket();
  const { user, token, logout, hydrate } = useAuthStore();
  const [clearing, setClearing] = useState(false);

  const statusLabel = connected ? 'ONLINE' : 'OFFLINE';
  const statusActive = connected;

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
      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <AurasiteIcon size={44} className="h-11 w-11" />
          <div>
            <h1 className="font-orbitron text-xl font-bold text-cyber-cyan neon-text">AURASITE</h1>
            <p className="text-xs text-slate-400">Next-Gen Plate Recognition Dashboard</p>
          </div>
        </div>

        <nav className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm transition ${
                router.pathname === item.href
                  ? 'bg-cyber-cyan/15 text-cyber-cyan shadow-neon'
                  : 'text-slate-300 hover:bg-white/5 hover:text-cyber-cyan'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4 text-sm">
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-0.5">
            {token && user?.name ? (
              <span className="col-start-2 text-slate-400">
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
              className="inline-flex h-9 min-w-[6rem] items-center justify-center rounded-md border border-cyber-cyan/40 px-3 text-sm text-cyber-cyan transition hover:bg-cyber-cyan/10 disabled:cursor-not-allowed disabled:opacity-50"
              title="Clear all detections, vehicles, and alerts"
            >
              {clearing ? 'Clearing...' : 'Clear'}
            </button>
          )}
          {token ? (
            <button
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="inline-flex h-9 min-w-[6rem] items-center justify-center rounded-md border border-cyber-pink/30 px-3 text-sm text-cyber-pink transition hover:bg-cyber-pink/10"
            >
              Logout
            </button>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-9 min-w-[6rem] items-center justify-center rounded-md border border-cyber-cyan/40 px-3 text-sm text-cyber-cyan"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
