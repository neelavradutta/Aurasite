import { useEffect } from 'react';
import { fetchDetections } from '@/services/api';
import { useDashboardStore } from '@/store/dashboardStore';
import { useLiveStore } from '@/store/liveStore';
import {
  loadDashboardSessionSnapshot,
  loadLiveSessionSnapshot,
  persistDashboardSessionSnapshot,
  persistLiveSessionSnapshot,
} from '@/services/sessionPersistence';

export function useSessionPersistence() {
  useEffect(() => {
    const dashboardSnapshot = loadDashboardSessionSnapshot();
    if (dashboardSnapshot) {
      useDashboardStore.getState().hydrateFromSession(dashboardSnapshot);
    }

    const liveSnapshot = loadLiveSessionSnapshot();
    if (liveSnapshot) {
      useLiveStore.getState().hydrateFromSession(liveSnapshot);
    }

    const { detections, sessionVideoSource, setDetections } = useDashboardStore.getState();
    if (detections.length > 0 || !sessionVideoSource) return;

    let cancelled = false;
    void fetchDetections({ limit: 200, video_source: sessionVideoSource })
      .then((response) => {
        if (cancelled) return;
        const rows = response.data || [];
        if (rows.length > 0) {
          setDetections(rows);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let dashboardTimer: number | null = null;
    let liveTimer: number | null = null;

    const unsubscribeDashboard = useDashboardStore.subscribe((state) => {
      if (dashboardTimer) window.clearTimeout(dashboardTimer);
      dashboardTimer = window.setTimeout(() => {
        persistDashboardSessionSnapshot({
          detections: state.detections,
          peakTrafficDetections: state.peakTrafficDetections,
          sessionVideoSource: state.sessionVideoSource,
          sessionVersion: state.sessionVersion,
          detectionsVersion: state.detectionsVersion,
        });
      }, 250);
    });

    const unsubscribeLive = useLiveStore.subscribe((state) => {
      if (liveTimer) window.clearTimeout(liveTimer);
      liveTimer = window.setTimeout(() => {
        persistLiveSessionSnapshot({
          plateHistory: state.plateHistory,
          lastResult: state.lastResult,
          mode: state.mode,
          source: state.source,
          deviceId: state.deviceId,
        });
      }, 250);
    });

    return () => {
      unsubscribeDashboard();
      unsubscribeLive();
      if (dashboardTimer) window.clearTimeout(dashboardTimer);
      if (liveTimer) window.clearTimeout(liveTimer);
    };
  }, []);
}
