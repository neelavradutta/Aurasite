import { useEffect, useState } from 'react';

import { useDashboardStore } from '@/store/dashboardStore';

import { TrafficHour, ConfidenceBand, RepeatAnalysis } from '@/types/analytics';

import { Vehicle } from '@/types/vehicle';

import {

  computeConfidenceBands,

  computeFrequentVehicles,

  computePeakTraffic,

  computeRepeatAnalysis,

  computeCumulativeKpis,

  computeSessionAnalytics,

} from '@/utils/sessionAnalytics';

import { computeSuspiciousVehicles } from '@/utils/suspiciousVehicles';
import { computeVehicleSpeeds, VehicleSpeedReading, CameraLocation } from '@/utils/speedEstimation';
import { computeParkingOccupancy } from '@/utils/parkingOccupancy';
import { ParkingOccupancyResult } from '@/types/analytics';
import { useCameraLocations } from '@/hooks/useCameraLocations';
import { fetchDetections } from '@/services/api';
import { Detection } from '@/types/detection';



function mergeScopedDetections(
  detections: Detection[],
  peakTrafficDetections: Detection[],
  sessionVideoSource: string | null
): Detection[] {
  const byId = new Map<number, Detection>();
  for (const row of [...detections, ...peakTrafficDetections]) {
    if (!sessionVideoSource || row.video_source === sessionVideoSource) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

function computeSpeedReadings(
  detections: Detection[],
  peakTrafficDetections: Detection[],
  sessionVideoSource: string | null,
  cameraLocations: CameraLocation[]
): VehicleSpeedReading[] {
  return computeVehicleSpeeds(
    mergeScopedDetections(detections, peakTrafficDetections, sessionVideoSource),
    cameraLocations
  );
}



export function useAnalytics(maxCapacity = 400) {

  const {
    detections,
    peakTrafficDetections,
    sessionVideoSource,
    sessionVersion,
    vehicleSpeedReadings,
    setSummary,
    setPeakTrafficDetections,
    setVehicleSpeedReadings,
  } = useDashboardStore();

  const [traffic, setTraffic] = useState<TrafficHour[]>([]);

  const [confidence, setConfidence] = useState<ConfidenceBand[]>([]);

  const [repeat, setRepeat] = useState<RepeatAnalysis | null>(null);

  const [frequent, setFrequent] = useState<Vehicle[]>([]);

  const [suspicious, setSuspicious] = useState<Vehicle[]>([]);

  const [parking, setParking] = useState<ParkingOccupancyResult>(() =>
    computeParkingOccupancy([], maxCapacity)
  );

  const { locations: cameraLocations } = useCameraLocations();

  const [loading, setLoading] = useState(false);



  useEffect(() => {
    let cancelled = false;

    async function hydrateCumulativeDetections() {
      if (peakTrafficDetections.length > 0) return;

      try {
        const res = await fetchDetections({ limit: 10000 });
        if (cancelled) return;

        const rows = (res.data as Detection[]) || [];
        if (rows.length > 0) {
          setPeakTrafficDetections(rows);
        }
      } catch {
        // Keep empty state when the API is unavailable.
      }
    }

    void hydrateCumulativeDetections();

    return () => {
      cancelled = true;
    };
  }, [peakTrafficDetections.length, setPeakTrafficDetections]);

  useEffect(() => {

    const computed = computeSessionAnalytics(detections);
    const cumulative = computeCumulativeKpis(peakTrafficDetections);

    setSummary({

      total_detections: cumulative.total_detections,

      unique_plates: cumulative.unique_plates,

      avg_confidence: detections.length === 0 ? 0 : computed.summary.avg_confidence,

      unresolved_alerts: detections.length === 0 ? 0 : computed.summary.unresolved_alerts,

    });

    setTraffic(computePeakTraffic(peakTrafficDetections));

    // Session-scoped — restored after login; reset only on new upload.
    setConfidence(computeConfidenceBands(detections));
    setFrequent(computeFrequentVehicles(detections));

    // Cumulative — persist across uploads until Clear.
    setRepeat(computeRepeatAnalysis(peakTrafficDetections));
    setSuspicious(computeSuspiciousVehicles(peakTrafficDetections));

    setParking((prev) =>
      detections.length === 0 ? prev : computeParkingOccupancy(detections, maxCapacity)
    );

    setLoading(false);

  }, [detections, peakTrafficDetections, maxCapacity, setSummary]);

  useEffect(() => {
    let cancelled = false;

    const persistedReadings = useDashboardStore.getState().vehicleSpeedReadings;
    const primed = computeSpeedReadings(
      detections,
      peakTrafficDetections,
      sessionVideoSource,
      cameraLocations
    );

    if (primed.length > 0) {
      setVehicleSpeedReadings(primed);
    } else if (
      persistedReadings.length > 0 &&
      sessionVideoSource &&
      cameraLocations.length === 0
    ) {
      return () => {
        cancelled = true;
      };
    }

    async function loadSpeeds() {
      if (detections.length === 0) {
        if (!sessionVideoSource) {
          if (primed.length === 0 && persistedReadings.length === 0) {
            setVehicleSpeedReadings([]);
          }
          return;
        }

        if (persistedReadings.length > 0 && cameraLocations.length === 0) {
          return;
        }

        try {
          const res = await fetchDetections({
            limit: 1000,
            video_source: sessionVideoSource,
          });
          if (cancelled) return;
          const apiRows = ((res.data as Detection[]) || []).filter(
            (row) => row.video_source === sessionVideoSource
          );
          setVehicleSpeedReadings(computeVehicleSpeeds(apiRows, cameraLocations));
        } catch {
          if (!cancelled && primed.length === 0 && persistedReadings.length === 0) {
            setVehicleSpeedReadings([]);
          }
        }
        return;
      }

      try {
        const res = await fetchDetections({
          limit: 1000,
          ...(sessionVideoSource ? { video_source: sessionVideoSource } : {}),
        });
        if (cancelled) return;

        const apiRows = ((res.data as Detection[]) || []).filter(
          (row) => !sessionVideoSource || row.video_source === sessionVideoSource
        );
        const byId = new Map<number, Detection>();
        for (const row of detections) {
          if (!sessionVideoSource || row.video_source === sessionVideoSource) {
            byId.set(row.id, row);
          }
        }
        for (const row of apiRows) {
          byId.set(row.id, row);
        }
        setVehicleSpeedReadings(computeVehicleSpeeds([...byId.values()], cameraLocations));
      } catch {
        if (!cancelled) {
          setVehicleSpeedReadings(
            computeSpeedReadings(detections, peakTrafficDetections, sessionVideoSource, cameraLocations)
          );
        }
      }
    }

    void loadSpeeds();

    return () => {
      cancelled = true;
    };
  }, [
    detections,
    peakTrafficDetections,
    cameraLocations,
    sessionVideoSource,
    sessionVersion,
    setVehicleSpeedReadings,
  ]);



  return {
    traffic,
    confidence,
    repeat,
    frequent,
    suspicious,
    speeds: vehicleSpeedReadings,
    parking,
    loading,
  };

}


