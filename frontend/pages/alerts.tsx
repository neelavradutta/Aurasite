import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import PageTitle from '@/components/shared/PageTitle';
import Badge from '@/components/shared/Badge';
import Button from '@/components/shared/Button';
import { fetchAlerts, resolveAlert } from '@/services/api';
import { Alert } from '@/types/analytics';
import { useDashboardStore } from '@/store/dashboardStore';
import { formatDateTime } from '@/utils/dateFormat';

export default function AlertsPage() {
  const sessionVersion = useDashboardStore((state) => state.sessionVersion);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  async function load() {
    const data = await fetchAlerts();
    setAlerts(data || []);
  }

  useEffect(() => {
    load();
  }, [sessionVersion]);

  async function handleResolve(id: number) {
    await resolveAlert(id);
    load();
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mobile-page-main mx-auto max-w-[1200px] space-y-4 px-6 py-6">
        <PageTitle title="Alert Management" subtitle="Review and resolve system alerts" />
        {alerts.map((alert) => (
          <div key={alert.id} className="glass-panel flex items-center justify-between rounded-xl p-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone={alert.severity === 'high' || alert.severity === 'critical' ? 'pink' : 'purple'}>
                  {alert.severity}
                </Badge>
                <span className="text-sm uppercase text-slate-400">{alert.alert_type}</span>
              </div>
              <p className="mt-2 text-sm">{alert.alert_message}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDateTime(alert.created_at)}</p>
            </div>
            <Button variant="secondary" onClick={() => handleResolve(alert.id)}>
              Resolve
            </Button>
          </div>
        ))}
        {alerts.length === 0 && <p className="text-slate-500">No unresolved alerts</p>}
      </main>
    </div>
  );
}
