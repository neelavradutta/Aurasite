import { Detection } from '@/types/detection';
import { Vehicle } from '@/types/vehicle';
import { isUnreadablePlate, normalizePlateKey } from './dashboardDetections';
import { buildCameraLocationMap, haversineDistanceKm, type CameraLocation } from './speedEstimation';

const EXCESSIVE_VISIT_THRESHOLD = 20;
const SHORT_REENTRY_MINUTES = 10;
const HIGH_SPEED_THRESHOLD_KMH = 120;
const DEFAULT_CAMERA_DISTANCE_KM = 0.8;

const DEFAULT_CAMERA_LOCATIONS: CameraLocation[] = [
  {
    video_source: 'carLicence4.mp4',
    latitude: 12.9716,
    longitude: 77.5946,
  },
  {
    video_source: 'live-camera',
    latitude: 12.9851,
    longitude: 77.6102,
  },
];
const MAX_CROSS_CAMERA_GAP_MINUTES = 60;

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

function passStartMs(pass: Detection[]): number {
  return Math.min(...pass.map((d) => new Date(d.detection_timestamp).getTime()));
}

function passEndMs(pass: Detection[]): number {
  return Math.max(...pass.map((d) => new Date(d.detection_timestamp).getTime()));
}

function isNightTimeDetection(detection: Detection): boolean {
  const hour = new Date(detection.detection_timestamp).getHours();
  return hour >= 0 && hour < 4;
}

const cameraMap = buildCameraLocationMap(DEFAULT_CAMERA_LOCATIONS);

/** Multi-camera distance (km) via GPS when available. */
function cameraDistanceKm(sourceA: string, sourceB: string): number {
  const camA = cameraMap.get(sourceA.trim());
  const camB = cameraMap.get(sourceB.trim());

  if (
    camA?.latitude != null &&
    camA?.longitude != null &&
    camB?.latitude != null &&
    camB?.longitude != null
  ) {
    return haversineDistanceKm(camA.latitude, camA.longitude, camB.latitude, camB.longitude);
  }

  return DEFAULT_CAMERA_DISTANCE_KM;
}

function evaluatePlateSuspicion(key: string, items: Detection[]): Vehicle | null {
  const reasons = new Set<string>();
  const displayPlate = items.find((item) => item.plate_number)?.plate_number || key;

  if (items.length > EXCESSIVE_VISIT_THRESHOLD) {
    reasons.add('Excessive Visits');
  }

  if (items.some(isNightTimeDetection)) {
    reasons.add('Night-Time Activity');
  }

  const passes = clusterIntoPasses(items);
  if (passes.length >= 2) {
    const firstDirection = inferPassDirection(passes[0]);

    if (firstDirection) {
      for (let index = 1; index < passes.length; index += 1) {
        const passDirection = inferPassDirection(passes[index]);
        if (!passDirection || passDirection === firstDirection) continue;

        const gapMinutes = (passStartMs(passes[index]) - passEndMs(passes[index - 1])) / 60000;
        if (gapMinutes >= 0 && gapMinutes <= SHORT_REENTRY_MINUTES) {
          reasons.add('Very Short Re-entry');
          break;
        }
      }
    }
  }

  const sorted = [...items].sort(
    (a, b) => new Date(a.detection_timestamp).getTime() - new Date(b.detection_timestamp).getTime()
  );

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const prevSource = previous.video_source?.trim();
    const curSource = current.video_source?.trim();

    if (!prevSource || !curSource || prevSource === curSource) continue;

    const gapMinutes =
      (new Date(current.detection_timestamp).getTime() -
        new Date(previous.detection_timestamp).getTime()) /
      60000;

    if (gapMinutes <= 0 || gapMinutes > MAX_CROSS_CAMERA_GAP_MINUTES) continue;

    const distanceKm = cameraDistanceKm(prevSource, curSource);
    const speedKmh = distanceKm / (gapMinutes / 60);

    if (speedKmh >= HIGH_SPEED_THRESHOLD_KMH) {
      reasons.add('High-Speed Reappearance Across Cameras');
      break;
    }
  }

  if (reasons.size === 0) return null;

  return {
    id: 0,
    plate_number: displayPlate,
    detection_count: items.length,
    vehicle_type: items.find((item) => item.vehicle_type)?.vehicle_type || 'unknown',
    is_suspicious: true,
    flagged_reason: Array.from(reasons).join(' · '),
  };
}

export function computeSuspiciousVehicles(detections: Detection[]): Vehicle[] {
  const plateDetections = new Map<string, Detection[]>();

  for (const detection of detections) {
    if (isUnreadablePlate(detection.plate_number)) continue;

    const key = normalizePlateKey(detection.plate_number);
    if (!key) continue;

    const bucket = plateDetections.get(key) ?? [];
    bucket.push(detection);
    plateDetections.set(key, bucket);
  }

  return Array.from(plateDetections.entries())
    .map(([key, items]) => evaluatePlateSuspicion(key, items))
    .filter((vehicle): vehicle is Vehicle => vehicle !== null)
    .sort((a, b) => {
      const reasonDiff =
        (b.flagged_reason?.split(' · ').length ?? 0) - (a.flagged_reason?.split(' · ').length ?? 0);
      if (reasonDiff !== 0) return reasonDiff;
      return b.detection_count - a.detection_count;
    })
    .map((vehicle, index) => ({ ...vehicle, id: index + 1 }));
}
