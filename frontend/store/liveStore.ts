import { create } from 'zustand';
import { LiveDetectionFrame } from '@/services/api';
import { LiveMode } from '@/utils/liveVideoSource';
import {
  clearLiveSessionPersistence,
  LiveSessionSnapshot,
} from '@/services/sessionPersistence';

const LIVE_HISTORY_MAX = 30;

interface LiveState {
  running: boolean;
  requesting: boolean;
  mode: LiveMode;
  source: string;
  deviceId: string;
  videoSource: string | null;
  previewSrc: string | null;
  lastResult: LiveDetectionFrame | null;
  plateHistory: LiveDetectionFrame[];
  cameraPreviewActive: boolean;
  previewStreamTick: number;
  error: string;
  setMode: (mode: LiveMode) => void;
  setSource: (source: string) => void;
  setDeviceId: (deviceId: string) => void;
  setRunning: (running: boolean) => void;
  setRequesting: (requesting: boolean) => void;
  setVideoSource: (videoSource: string | null) => void;
  setPreviewSrc: (previewSrc: string | null) => void;
  setLastResult: (lastResult: LiveDetectionFrame | null) => void;
  pushPlateHistory: (item: LiveDetectionFrame) => void;
  patchPlateHistory: (
    matcher: (entry: LiveDetectionFrame) => boolean,
    patch: Partial<LiveDetectionFrame>
  ) => void;
  clearPlateHistory: () => void;
  setError: (error: string) => void;
  setCameraPreviewActive: (active: boolean) => void;
  bumpPreviewStreamTick: () => void;
  resetSessionUi: () => void;
  stopSessionUi: () => void;
  hydrateFromSession: (snapshot: LiveSessionSnapshot) => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  running: false,
  requesting: false,
  mode: 'camera',
  source: '',
  deviceId: '',
  videoSource: null,
  previewSrc: null,
  lastResult: null,
  plateHistory: [],
  cameraPreviewActive: false,
  previewStreamTick: 0,
  error: '',
  setMode: (mode) => set({ mode }),
  setSource: (source) => set({ source }),
  setDeviceId: (deviceId) => set({ deviceId }),
  setRunning: (running) => set({ running }),
  setRequesting: (requesting) => set({ requesting }),
  setVideoSource: (videoSource) => set({ videoSource }),
  setPreviewSrc: (previewSrc) => set({ previewSrc }),
  setLastResult: (lastResult) => set({ lastResult }),
  pushPlateHistory: (item) =>
    set((state) => {
      const latest = state.plateHistory[0];
      if (latest?.plate_number === item.plate_number) {
        return {
          plateHistory: [{ ...latest, ...item }, ...state.plateHistory.slice(1)],
        };
      }
      return {
        plateHistory: [item, ...state.plateHistory].slice(0, LIVE_HISTORY_MAX),
      };
    }),
  patchPlateHistory: (matcher, patch) =>
    set((state) => ({
      plateHistory: state.plateHistory.map((entry) =>
        matcher(entry) ? { ...entry, ...patch } : entry
      ),
    })),
  clearPlateHistory: () => {
    clearLiveSessionPersistence();
    set({ plateHistory: [], lastResult: null });
  },
  setError: (error) => set({ error }),
  setCameraPreviewActive: (cameraPreviewActive) => set({ cameraPreviewActive }),
  bumpPreviewStreamTick: () =>
    set((state) => ({ previewStreamTick: state.previewStreamTick + 1 })),
  resetSessionUi: () =>
    set((state) => ({
      lastResult: null,
      previewSrc: state.mode === 'camera' ? state.previewSrc : null,
      error: '',
    })),
  stopSessionUi: () =>
    set((state) => ({
      running: false,
      requesting: false,
      previewSrc: state.mode === 'camera' ? state.previewSrc : null,
    })),
  hydrateFromSession: (snapshot) =>
    set({
      mode: snapshot.mode,
      source: snapshot.source,
      deviceId: snapshot.deviceId,
      lastResult: snapshot.lastResult,
      plateHistory: snapshot.plateHistory,
    }),
}));
