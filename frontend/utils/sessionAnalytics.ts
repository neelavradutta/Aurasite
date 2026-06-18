import { Detection } from '@/types/detection';
import { AnalyticsSummary, TrafficHour, ConfidenceBand, RepeatAnalysis } from '@/types/analytics';
import { Vehicle } from '@/types/vehicle';
import { isUnreadablePlate, normalizePlateKey, isHalfPlate } from './dashboardDetections';
import { normalizeVehicleType, resolveVehicleType } from './vehicleCardDisplay';

const CONFIDENCE_BANDS = [
  { band: '0-50%', min: 0, max: 0.5 },
  { band: '50-70%', min: 0.5, max: 0.7 },
  { band: '70-85%', min: 0.7, max: 0.85 },
  { band: '85-100%', min: 0.85, max: 1.01 },
];

/** Confidence bands from the full detection log (all quality tiers). */
export function computeConfidenceBands(detections: Detection[]): ConfidenceBand[] {
  if (detections.length === 0) return [];

  const total = detections.length;
  return CONFIDENCE_BANDS.map(({ band, min, max }) => {
    const count = detections.filter((detection) => {
      const value = Number(detection.plate_confidence) || 0;
      return value >= min && value < max;
    }).length;
    return { band, count, percentage: Math.round((count / total) * 100) };
  }).filter((band) => band.count > 0);
}

/** Most frequent plates by hit count from the full detection log. */
export function computeFrequentVehicles(detections: Detection[]): Vehicle[] {
  const frequentMap = new Map<
    string,
    {
      plate_number: string;
      count: number;
      typeCounts: Map<string, number>;
      is_suspicious?: boolean;
      flagged_reason?: string;
    }
  >();

  for (const detection of detections) {
    if (isUnreadablePlate(detection.plate_number)) continue;
    if (isHalfPlate(detection.plate_number, detection)) continue;

    const key = normalizePlateKey(detection.plate_number);
    if (!key) continue;

    const existing = frequentMap.get(key);
    const vehicleRecord = detection.vehicle as
      | { is_suspicious?: boolean; flagged_reason?: string; vehicle_type?: string | null; class_name?: string | null }
      | null
      | undefined;
    const typeCounts = existing?.typeCounts ?? new Map<string, number>();
    const resolvedType = resolveVehicleType(detection.vehicle_type, vehicleRecord);
    typeCounts.set(resolvedType, (typeCounts.get(resolvedType) || 0) + 1);

    frequentMap.set(key, {
      plate_number: existing?.plate_number || detection.plate_number || key,
      count: (existing?.count || 0) + 1,
      typeCounts,
      is_suspicious: vehicleRecord?.is_suspicious || existing?.is_suspicious || false,
      flagged_reason: vehicleRecord?.flagged_reason || existing?.flagged_reason,
    });
  }

  return Array.from(frequentMap.entries())
    .map(([key, info], index) => {
      let vehicle_type = 'car';
      let bestCount = 0;
      for (const [type, count] of info.typeCounts) {
        if (count > bestCount) {
          vehicle_type = type;
          bestCount = count;
        }
      }

      return {
        id: index + 1,
        plate_number: info.plate_number || key,
        detection_count: info.count,
        vehicle_type: normalizeVehicleType(vehicle_type),
        is_suspicious: info.is_suspicious || false,
        flagged_reason: info.flagged_reason,
      };
    })
    .sort((a, b) => b.detection_count - a.detection_count)
    .slice(0, 5);
}

type TravelDirection = 'left' | 'right';

function extractBboxCenter(detection: Detection): { x: number; y: number } | null {
  const raw = detection.plate_bbox ?? detection.bounding_box;
  if (!raw) return null;

  const bbox = Array.isArray(raw) ? raw : raw.bbox;
  if (!bbox || bbox.length < 4) return null;

  return { x: (bbox[0] + bbox[2]) / 2, y: (bbox[1] + bbox[3]) / 2 };
}

function inferPassDirection(passDetections: Detection[]): TravelDirection | null {
  if (passDetections.length < 2) return null;

  const sorted = [...passDetections].sort((a, b) => {
    const frameDiff = (a.frame_number ?? 0) - (b.frame_number ?? 0);
    if (frameDiff !== 0) return frameDiff;
    return new Date(a.detection_timestamp).getTime() - new Date(b.detection_timestamp).getTime();
  });

  const first = extractBboxCenter(sorted[0]);
  const last = extractBboxCenter(sorted[sorted.length - 1]);
  if (!first || !last) return null;

  const deltaX = last.x - first.x;
  if (Math.abs(deltaX) < 8) return null;

  return deltaX > 0 ? 'right' : 'left';
}

function clusterIntoPasses(detections: Detection[], frameGap = 12): Detection[][] {
  const sorted = [...detections].sort((a, b) => {
    const frameDiff = (a.frame_number ?? 0) - (b.frame_number ?? 0);
    if (frameDiff !== 0) return frameDiff;
    return new Date(a.detection_timestamp).getTime() - new Date(b.detection_timestamp).getTime();
  });

  const passes: Detection[][] = [];
  let current: Detection[] = [];

  for (const detection of sorted) {
    if (current.length === 0) {
      current.push(detection);
      continue;
    }

    const previousFrame = current[current.length - 1].frame_number ?? 0;
    const frame = detection.frame_number ?? 0;
    if (frame - previousFrame > frameGap) {
      passes.push(current);
      current = [detection];
    } else {
      current.push(detection);
    }
  }

  if (current.length > 0) passes.push(current);
  return passes;
}

/** Repeat = same plate seen again travelling the opposite way from its first pass. */
export function computeRepeatAnalysis(detections: Detection[]): RepeatAnalysis {
  const plateDetections = new Map<string, Detection[]>();

  for (const detection of detections) {
    if (isUnreadablePlate(detection.plate_number)) continue;

    const key = normalizePlateKey(detection.plate_number);
    if (!key) continue;

    const bucket = plateDetections.get(key) ?? [];
    bucket.push(detection);
    plateDetections.set(key, bucket);
  }

  let repeatVehicles = 0;
  let mostActivePlate: string | null = null;
  let mostActiveCount = 0;

  for (const [key, items] of plateDetections.entries()) {
    const passes = clusterIntoPasses(items);
    if (passes.length < 2) continue;

    const firstDirection = inferPassDirection(passes[0]);
    if (!firstDirection) continue;

    let oppositeReturns = 0;
    let displayPlate = items.find((item) => item.plate_number)?.plate_number || key;

    for (let index = 1; index < passes.length; index += 1) {
      const passDirection = inferPassDirection(passes[index]);
      if (passDirection && passDirection !== firstDirection) {
        oppositeReturns += 1;
      }
    }

    if (oppositeReturns === 0) continue;

    repeatVehicles += 1;
    if (oppositeReturns > mostActiveCount) {
      mostActiveCount = oppositeReturns;
      mostActivePlate = displayPlate;
    }
  }

  return {
    unique_vehicles: plateDetections.size,
    repeat_vehicles: repeatVehicles,
    most_active_plate: repeatVehicles > 0 ? mostActivePlate : null,
    most_active_count: mostActiveCount,
  };
}

/** Session-wide KPI totals — only reset when Clear is pressed. */
export function computeCumulativeKpis(
  detections: Detection[]
): Pick<AnalyticsSummary, 'total_detections' | 'unique_plates'> {
  if (detections.length === 0) {
    return { total_detections: 0, unique_plates: 0 };
  }

  return {
    total_detections: detections.length,
    unique_plates: new Set(detections.map((detection) => detection.plate_number)).size,
  };
}

/** Cumulative peak traffic hours — never reset per video/live session. */
export function computePeakTraffic(detections: Detection[]): TrafficHour[] {
  if (detections.length === 0) return [];

  const total = detections.length;
  const hourCounts = new Map<number, number>();
  for (const detection of detections) {
    const hour = new Date(detection.detection_timestamp).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }

  return Array.from(hourCounts.entries())
    .map(([hour, count]) => ({
      hour,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => a.hour - b.hour);
}

/** Top N busiest hour slots by vehicle count (highest first). */
export function selectTopTrafficIntervals(data: TrafficHour[], limit = 3): TrafficHour[] {
  return [...data]
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.hour - b.hour)
    .slice(0, Math.max(1, limit));
}

export function computeSessionAnalytics(detections: Detection[]) {
  if (detections.length === 0) {
    return {
      summary: {
        total_detections: 0,
        unique_plates: 0,
        avg_confidence: 0,
        unresolved_alerts: 0,
      } satisfies AnalyticsSummary,
      traffic: [] as TrafficHour[],
      confidence: [] as ConfidenceBand[],
      repeat: null as RepeatAnalysis | null,
      frequent: [] as Vehicle[],
      suspicious: [] as Vehicle[],
    };
  }

  const total = detections.length;
  const uniquePlates = new Set(detections.map((d) => d.plate_number));
  const confidences = detections
    .map((d) => Number(d.plate_confidence) || 0)
    .filter((value) => value > 0);
  const avgConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : 0;

  const hourCounts = new Map<number, number>();
  for (const detection of detections) {
    const hour = new Date(detection.detection_timestamp).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }

  const traffic: TrafficHour[] = Array.from(hourCounts.entries())
    .map(([hour, count]) => ({
      hour,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => a.hour - b.hour);

  const confidence: ConfidenceBand[] = CONFIDENCE_BANDS.map(({ band, min, max }) => {
    const count = detections.filter((detection) => {
      const value = Number(detection.plate_confidence) || 0;
      return value >= min && value < max;
    }).length;
    return { band, count, percentage: Math.round((count / total) * 100) };
  }).filter((band) => band.count > 0);

  const plateCounts = new Map<string, number>();
  for (const detection of detections) {
    plateCounts.set(detection.plate_number, (plateCounts.get(detection.plate_number) || 0) + 1);
  }

  const repeat = computeRepeatAnalysis(detections);

  const frequentMap = new Map<
    string,
    { count: number; vehicle_type?: string; is_suspicious?: boolean; flagged_reason?: string }
  >();

  for (const detection of detections) {
    if (isUnreadablePlate(detection.plate_number)) continue;
    if (isHalfPlate(detection.plate_number, detection)) continue;

    const existing = frequentMap.get(detection.plate_number);
    const vehicleRecord = detection.vehicle as { is_suspicious?: boolean; flagged_reason?: string } | null | undefined;
    frequentMap.set(detection.plate_number, {
      count: (existing?.count || 0) + 1,
      vehicle_type: detection.vehicle_type || detection.vehicle?.vehicle_type || existing?.vehicle_type,
      is_suspicious: vehicleRecord?.is_suspicious || existing?.is_suspicious || false,
      flagged_reason: vehicleRecord?.flagged_reason || existing?.flagged_reason,
    });
  }

  const frequent: Vehicle[] = Array.from(frequentMap.entries())
    .map(([plate_number, info], index) => ({
      id: index + 1,
      plate_number,
      detection_count: info.count,
      vehicle_type: info.vehicle_type || 'unknown',
      is_suspicious: info.is_suspicious || false,
      flagged_reason: info.flagged_reason,
    }))
    .sort((a, b) => b.detection_count - a.detection_count)
    .slice(0, 5);

  const suspicious = frequent.filter((vehicle) => vehicle.is_suspicious);

  return {
    summary: {
      total_detections: total,
      unique_plates: uniquePlates.size,
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      unresolved_alerts: 0,
    } satisfies AnalyticsSummary,
    traffic,
    confidence,
    repeat,
    frequent,
    suspicious,
  };
}
