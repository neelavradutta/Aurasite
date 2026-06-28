import { useEffect } from 'react';
import { fetchDetections } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useLiveStore } from '@/store/liveStore';
import { useVideoUploadStore } from '@/store/videoUploadStore';
import { isLiveVideoSource } from '@/utils/liveVideoSource';
import {
  loadDashboardSessionSnapshot,
  loadLiveSessionSnapshot,
  persistDashboardSessionSnapshot,
  persistLiveSessionSnapshot,
} from '@/services/sessionPersistence';
import { flushSessionPersistence } from '@/services/dashboardSessionFlush';

export function useSessionPersistence() {
  const userId = useAuthStore((state) => state.user?.id ?? null);

  useEffect(() => {
    if (!userId) return;

    useDashboardStore.getState().resetForUserPersistence();
    useVideoUploadStore.getState().clearUploadedVideos();

    const dashboardSnapshot = loadDashboardSessionSnapshot(userId);
    if (dashboardSnapshot) {
      useDashboardStore.getState().hydrateFromSession(dashboardSnapshot);
      useVideoUploadStore.getState().hydrateUploadedVideosFromMeta(dashboardSnapshot.uploadedVideosMeta);
    }

    const liveSnapshot = loadLiveSessionSnapshot(userId);
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
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let dashboardTimer: number | null = null;
    let liveTimer: number | null = null;

    const unsubscribeDashboard = useDashboardStore.subscribe((state) => {
      if (dashboardTimer) window.clearTimeout(dashboardTimer);
      dashboardTimer = window.setTimeout(() => {
        persistDashboardSessionSnapshot(
          {
            detections: state.detections,
            peakTrafficDetections: state.peakTrafficDetections,
            sessionVideoSource: state.sessionVideoSource,
            sessionVersion: state.sessionVersion,
            detectionsVersion: state.detectionsVersion,
            vehicleSpeedReadings: state.vehicleSpeedReadings,
            selectedPlateId: state.selectedPlate?.id ?? null,
            uploadedVideosMeta: useVideoUploadStore.getState().uploadedVideos.map((video) => ({
              id: video.id,
              name: video.name,
              size: video.size,
              platesDetected: video.platesDetected,
              mediaType: video.mediaType,
            })),
          },
          userId
        );
      }, 250);
    });

    const unsubscribeLive = useLiveStore.subscribe((state) => {
      if (liveTimer) window.clearTimeout(liveTimer);
      liveTimer = window.setTimeout(() => {
        persistLiveSessionSnapshot(
          {
            plateHistory: state.plateHistory,
            lastResult: state.lastResult,
            mode: state.mode,
            source: state.source,
            deviceId: state.deviceId,
          },
          userId
        );
      }, 250);
    });

    const unsubscribeVideos = useVideoUploadStore.subscribe(() => {
      const state = useDashboardStore.getState();
      persistDashboardSessionSnapshot(
        {
          detections: state.detections,
          peakTrafficDetections: state.peakTrafficDetections,
          sessionVideoSource: state.sessionVideoSource,
          sessionVersion: state.sessionVersion,
          detectionsVersion: state.detectionsVersion,
          vehicleSpeedReadings: state.vehicleSpeedReadings,
          selectedPlateId: state.selectedPlate?.id ?? null,
          uploadedVideosMeta: useVideoUploadStore.getState().uploadedVideos.map((video) => ({
            id: video.id,
            name: video.name,
            size: video.size,
            platesDetected: video.platesDetected,
            mediaType: video.mediaType,
          })),
        },
        userId
      );
    });

    return () => {
      flushSessionPersistence(userId);
      unsubscribeDashboard();
      unsubscribeLive();
      unsubscribeVideos();
      if (dashboardTimer) window.clearTimeout(dashboardTimer);
      if (liveTimer) window.clearTimeout(liveTimer);
    };
  }, [userId]);

  useEffect(() => {
    function refreshDashboardDetections() {
      if (document.visibilityState !== 'visible') return;
      if (!userId) return;

      const { sessionVideoSource, setDetections } = useDashboardStore.getState();
      if (!sessionVideoSource || isLiveVideoSource(sessionVideoSource)) return;

      void fetchDetections({ limit: 200, video_source: sessionVideoSource })
        .then((response) => {
          const rows = response.data || [];
          if (rows.length > 0) {
            setDetections(rows);
          }
        })
        .catch(() => undefined);
    }

    document.addEventListener('visibilitychange', refreshDashboardDetections);
    window.addEventListener('focus', refreshDashboardDetections);
    return () => {
      document.removeEventListener('visibilitychange', refreshDashboardDetections);
      window.removeEventListener('focus', refreshDashboardDetections);
    };
  }, [userId]);
}
