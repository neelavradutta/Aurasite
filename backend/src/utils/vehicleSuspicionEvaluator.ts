import { Op } from 'sequelize';
import Detection from '../models/Detection';
import Vehicle from '../models/Vehicle';
import { isUnreadablePlate } from './vehicleProfileGenerator';
import { vehicleQualifiesForViolation, violationCountAfterAutoFlag } from './vehicleViolations';

const EXCESSIVE_VISIT_THRESHOLD = 20;
const SHORT_REENTRY_MINUTES = 10;
const HIGH_SPEED_THRESHOLD_KMH = 120;
const DEFAULT_CAMERA_DISTANCE_KM = 0.8;
const MAX_CROSS_CAMERA_GAP_MINUTES = 60;

type DetectionRow = {
  plate_number?: string | null;
  detection_timestamp: Date;
  frame_number?: number | null;
  video_source?: string | null;
  plate_bbox?: unknown;
  bounding_box?: unknown;
};

function normalizePlateKey(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function extractBboxCenter(row: DetectionRow): { x: number; y: number } | null {
  const raw = row.plate_bbox ?? row.bounding_box;
  if (!raw) return null;

  const bbox = Array.isArray(raw) ? raw : (raw as { bbox?: number[] }).bbox;
  if (!bbox || bbox.length < 4) return null;

  return { x: (bbox[0] + bbox[2]) / 2, y: (bbox[1] + bbox[3]) / 2 };
}

type TravelDirection = 'left' | 'right';

function inferPassDirection(passDetections: DetectionRow[]): TravelDirection | null {
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

function clusterIntoPasses(detections: DetectionRow[], frameGap = 12): DetectionRow[][] {
  const sorted = [...detections].sort((a, b) => {
    const frameDiff = (a.frame_number ?? 0) - (b.frame_number ?? 0);
    if (frameDiff !== 0) return frameDiff;
    return new Date(a.detection_timestamp).getTime() - new Date(b.detection_timestamp).getTime();
  });

  const passes: DetectionRow[][] = [];
  let current: DetectionRow[] = [];

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

function passStartMs(pass: DetectionRow[]): number {
  return Math.min(...pass.map((d) => new Date(d.detection_timestamp).getTime()));
}

function passEndMs(pass: DetectionRow[]): number {
  return Math.max(...pass.map((d) => new Date(d.detection_timestamp).getTime()));
}

function cameraDistanceKm(_sourceA: string, _sourceB: string): number {
  return DEFAULT_CAMERA_DISTANCE_KM;
}

function evaluateSuspicionReasons(items: DetectionRow[]): string[] {
  const reasons = new Set<string>();

  if (items.length > EXCESSIVE_VISIT_THRESHOLD) {
    reasons.add('Excessive Visits');
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

  return Array.from(reasons);
}

async function loadPlateDetections(plateNumber: string): Promise<DetectionRow[]> {
  const normalized = normalizePlateKey(plateNumber);
  if (!normalized || isUnreadablePlate(plateNumber)) return [];

  const rows = await Detection.findAll({
    where: {
      plate_number: {
        [Op.or]: [
          { [Op.eq]: plateNumber },
          { [Op.eq]: normalized },
          { [Op.like]: `${normalized}%` },
        ],
      },
    },
    order: [['detection_timestamp', 'ASC']],
    limit: 500,
    attributes: ['plate_number', 'detection_timestamp', 'frame_number', 'video_source', 'plate_bbox', 'bounding_box'],
  });

  return rows
    .map((row) => row.toJSON() as DetectionRow)
    .filter((row) => normalizePlateKey(row.plate_number || '') === normalized);
}

export async function applyAutoSuspicionIfNeeded(
  vehicle: Vehicle,
  plateNumber: string,
  quality: string
): Promise<boolean> {
  if (quality !== 'accepted') return false;
  if (vehicleQualifiesForViolation(vehicle)) return false;

  const items = await loadPlateDetections(plateNumber);
  const reasons = evaluateSuspicionReasons(items);
  if (reasons.length === 0) return false;

  await vehicle.update({
    is_suspicious: true,
    status: 'suspicious',
    flagged_reason: reasons.join(' · '),
    violation_count: violationCountAfterAutoFlag(vehicle),
  });

  return true;
}

export type ViolationUpdate = {
  vehicle_id: number;
  plate_number: string;
  violation_count: number;
};

export async function incrementViolationIfNeeded(vehicle: Vehicle): Promise<ViolationUpdate | null> {
  await vehicle.reload();
  if (!vehicleQualifiesForViolation(vehicle)) return null;

  const previous = Math.max(0, Number(vehicle.violation_count) || 0);
  const next = previous + 1;
  if (next === previous) return null;

  await vehicle.update({ violation_count: next });
  await vehicle.reload();

  return {
    vehicle_id: vehicle.id,
    plate_number: vehicle.plate_number,
    violation_count: next,
  };
}
