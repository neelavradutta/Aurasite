import { create } from 'zustand';

import { Detection } from '@/types/detection';

import { Vehicle } from '@/types/vehicle';

import { Alert, AnalyticsSummary } from '@/types/analytics';

import { clearAllSessionData } from '@/services/api';
import { useVideoUploadStore } from '@/store/videoUploadStore';



function mergeDetections(existing: Detection[], incoming: Detection[]): Detection[] {

  const seen = new Set(existing.map((row) => row.id));

  const merged = [...incoming.filter((row) => !seen.has(row.id)), ...existing];

  return merged.slice(0, 5000);

}



interface DashboardState {

  summary: AnalyticsSummary | null;

  /** Current upload/live session — resets each new analysis. */

  detections: Detection[];

  /** Cumulative history — persists until Clear is pressed. */

  peakTrafficDetections: Detection[];

  vehicles: Vehicle[];

  alerts: Alert[];

  selectedPlate: Detection | null;

  isStreaming: boolean;

  sessionVersion: number;

  sessionVideoSource: string | null;

  setSummary: (summary: AnalyticsSummary) => void;

  setDetections: (detections: Detection[]) => void;

  setPeakTrafficDetections: (detections: Detection[]) => void;

  appendPeakTrafficDetections: (detections: Detection[]) => void;

  addDetection: (detection: Detection) => void;

  setVehicles: (vehicles: Vehicle[]) => void;

  setAlerts: (alerts: Alert[]) => void;

  setSelectedPlate: (detection: Detection | null) => void;

  setIsStreaming: (streaming: boolean) => void;

  setSessionVideoSource: (videoSource: string | null) => void;

  /** Reset session widgets when a new video/live analysis starts. */

  startNewAnalysisSession: (videoSource: string | null) => void;

  clearDashboard: () => Promise<void>;

}



export const useDashboardStore = create<DashboardState>((set) => ({

  summary: null,

  detections: [],

  peakTrafficDetections: [],

  vehicles: [],

  alerts: [],

  selectedPlate: null,

  isStreaming: false,

  sessionVersion: 1,

  sessionVideoSource: null,

  setSummary: (summary) => set({ summary }),

  setDetections: (detections) => set({ detections }),

  setPeakTrafficDetections: (peakTrafficDetections) => set({ peakTrafficDetections }),

  appendPeakTrafficDetections: (incoming) =>

    set((state) => ({

      peakTrafficDetections: mergeDetections(state.peakTrafficDetections, incoming),

    })),

  addDetection: (detection) =>

    set((state) => {

      if (state.detections.some((row) => row.id === detection.id)) {

        return {

          peakTrafficDetections: mergeDetections(state.peakTrafficDetections, [detection]),

        };

      }

      return {

        detections: [detection, ...state.detections].slice(0, 100),

        peakTrafficDetections: mergeDetections(state.peakTrafficDetections, [detection]),

      };

    }),

  setVehicles: (vehicles) => set({ vehicles }),

  setAlerts: (alerts) => set({ alerts }),

  setSelectedPlate: (selectedPlate) => set({ selectedPlate }),

  setIsStreaming: (isStreaming) => set({ isStreaming }),

  setSessionVideoSource: (sessionVideoSource) => set({ sessionVideoSource }),

  startNewAnalysisSession: (videoSource) =>

    set((state) => ({

      detections: [],

      selectedPlate: null,

      sessionVideoSource: videoSource,

      peakTrafficDetections: videoSource

        ? state.peakTrafficDetections.filter(

            (detection) => detection.video_source !== videoSource

          )

        : state.peakTrafficDetections,

    })),

  clearDashboard: async () => {

    await clearAllSessionData();
    useVideoUploadStore.getState().clearUploadedVideos();

    set((state) => ({

      summary: null,

      detections: [],

      peakTrafficDetections: [],

      vehicles: [],

      alerts: [],

      selectedPlate: null,

      sessionVideoSource: null,

      isStreaming: false,

      sessionVersion: state.sessionVersion + 1,

    }));

  },

}));


