import { create } from 'zustand';

import { Detection } from '@/types/detection';

import { Vehicle } from '@/types/vehicle';

import { Alert, AnalyticsSummary } from '@/types/analytics';
import { VehicleSpeedReading } from '@/utils/speedEstimation';

import { clearAllSessionData } from '@/services/api';
import { useVideoUploadStore } from '@/store/videoUploadStore';
import { VehicleRealtimeUpdate } from '@/utils/violationUpdates';
import {
  clearAllSessionPersistence,
  DashboardSessionSnapshot,
} from '@/services/sessionPersistence';



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

  sessionVersion: number;

  detectionsVersion: number;

  sessionVideoSource: string | null;

  /** Cached speed chart rows — survives tab switches until session reset. */
  vehicleSpeedReadings: VehicleSpeedReading[];

  setSummary: (summary: AnalyticsSummary) => void;

  setDetections: (detections: Detection[]) => void;

  setPeakTrafficDetections: (detections: Detection[]) => void;

  appendPeakTrafficDetections: (detections: Detection[]) => void;

  addDetection: (detection: Detection) => void;

  setVehicles: (vehicles: Vehicle[]) => void;

  setAlerts: (alerts: Alert[]) => void;

  setSelectedPlate: (detection: Detection | null) => void;

  setSessionVideoSource: (videoSource: string | null) => void;

  setVehicleSpeedReadings: (readings: VehicleSpeedReading[]) => void;

  bumpDetectionsVersion: () => void;

  patchVehicleViolations: (updates: Array<{ vehicle_id: number; violation_count: number }>) => void;

  patchVehicleUpdates: (update: VehicleRealtimeUpdate) => void;

  /** Reset session widgets when a new video/live analysis starts. */

  startNewAnalysisSession: (videoSource: string | null) => void;

  hydrateFromSession: (snapshot: DashboardSessionSnapshot) => void;

  clearDashboard: () => Promise<void>;

}



export const useDashboardStore = create<DashboardState>((set) => ({

  summary: null,

  detections: [],

  peakTrafficDetections: [],

  vehicles: [],

  alerts: [],

  selectedPlate: null,

  sessionVersion: 1,

  detectionsVersion: 1,

  sessionVideoSource: null,

  vehicleSpeedReadings: [],

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

  setSessionVideoSource: (sessionVideoSource) => set({ sessionVideoSource }),

  setVehicleSpeedReadings: (vehicleSpeedReadings) => set({ vehicleSpeedReadings }),

  bumpDetectionsVersion: () =>
    set((state) => ({
      detectionsVersion: state.detectionsVersion + 1,
    })),

  patchVehicleViolations: (updates) =>
    set((state) => {
      if (updates.length === 0) return state;

      const byVehicleId = new Map(updates.map((row) => [row.vehicle_id, row.violation_count]));

      const patchRows = (rows: Detection[]) =>
        rows.map((detection) => {
          const vehicleId = detection.vehicle_id ?? detection.vehicle?.id;
          if (vehicleId == null) return detection;
          const nextCount = byVehicleId.get(vehicleId);
          if (nextCount === undefined) return detection;
          return {
            ...detection,
            vehicle: {
              ...(detection.vehicle || {}),
              id: vehicleId,
              violation_count: nextCount,
            },
          };
        });

      return {
        detections: patchRows(state.detections),
        peakTrafficDetections: patchRows(state.peakTrafficDetections),
      };
    }),

  patchVehicleUpdates: (update) =>
    set((state) => {
      const patchRows = (rows: Detection[]) =>
        rows.map((detection) => {
          const vehicleId = detection.vehicle_id ?? detection.vehicle?.id;
          const plateKey = detection.plate_number.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const updatePlateKey = update.plate_number.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const matches =
            (vehicleId != null && vehicleId === update.vehicle_id) || plateKey === updatePlateKey;
          if (!matches) return detection;

          return {
            ...detection,
            vehicle: {
              ...(detection.vehicle || {}),
              id: vehicleId ?? update.vehicle_id,
              plate_number: update.plate_number,
              ...(update.status !== undefined ? { status: update.status } : {}),
              ...(update.is_suspicious !== undefined ? { is_suspicious: update.is_suspicious } : {}),
              ...(update.flagged_reason !== undefined ? { flagged_reason: update.flagged_reason } : {}),
              ...(update.violation_count !== undefined ? { violation_count: update.violation_count } : {}),
            },
          };
        });

      const vehicles = state.vehicles.map((vehicle) =>
        vehicle.id === update.vehicle_id
          ? {
              ...vehicle,
              ...(update.status !== undefined ? { status: update.status } : {}),
              ...(update.is_suspicious !== undefined ? { is_suspicious: update.is_suspicious } : {}),
              ...(update.flagged_reason !== undefined ? { flagged_reason: update.flagged_reason } : {}),
              ...(update.violation_count !== undefined ? { violation_count: update.violation_count } : {}),
            }
          : vehicle
      );

      return {
        vehicles,
        detections: patchRows(state.detections),
        peakTrafficDetections: patchRows(state.peakTrafficDetections),
      };
    }),

  startNewAnalysisSession: (videoSource) =>

    set((state) => ({

      detections: [],

      vehicleSpeedReadings: [],

      selectedPlate: null,

      sessionVideoSource: videoSource,

      peakTrafficDetections: videoSource

        ? state.peakTrafficDetections.filter(

            (detection) => detection.video_source !== videoSource

          )

        : state.peakTrafficDetections,

    })),

  hydrateFromSession: (snapshot) =>
    set({
      detections: snapshot.detections,
      peakTrafficDetections: snapshot.peakTrafficDetections,
      sessionVideoSource: snapshot.sessionVideoSource,
      sessionVersion: snapshot.sessionVersion,
      detectionsVersion: snapshot.detectionsVersion,
    }),

  clearDashboard: async () => {

    await clearAllSessionData();
    useVideoUploadStore.getState().clearUploadedVideos();
    clearAllSessionPersistence();

    set((state) => ({

      summary: null,

      detections: [],

      peakTrafficDetections: [],

      vehicles: [],

      alerts: [],

      selectedPlate: null,

      sessionVideoSource: null,

      vehicleSpeedReadings: [],

      sessionVersion: state.sessionVersion + 1,

    }));

  },

}));


