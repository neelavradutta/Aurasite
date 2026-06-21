import { useEffect } from 'react';
import { fetchDetections } from '@/services/api';
import { useDashboardStore } from '@/store/dashboardStore';

/** Load cumulative detection history for peak traffic hours. */
export function usePeakTrafficBootstrap() {
  const sessionVersion = useDashboardStore((state) => state.sessionVersion);
  const setPeakTrafficDetections = useDashboardStore((state) => state.setPeakTrafficDetections);

  useEffect(() => {
    const { peakTrafficDetections } = useDashboardStore.getState();
    if (peakTrafficDetections.length > 0) return;

    fetchDetections({ limit: 1000 })
      .then((response) => setPeakTrafficDetections(response.data || []))
      .catch(() => undefined);
  }, [sessionVersion, setPeakTrafficDetections]);
}
