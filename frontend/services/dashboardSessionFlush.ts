import { useDashboardStore } from '@/store/dashboardStore';
import { useVideoUploadStore } from '@/store/videoUploadStore';
import {
  persistDashboardSessionSnapshot,
  persistLiveSessionSnapshot,
} from '@/services/sessionPersistence';
import { useLiveStore } from '@/store/liveStore';

export function flushDashboardPersistence(userId: number): void {
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
}

export function flushLivePersistence(userId: number): void {
  const state = useLiveStore.getState();
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
}

export function flushSessionPersistence(userId: number): void {
  flushDashboardPersistence(userId);
  flushLivePersistence(userId);
}
