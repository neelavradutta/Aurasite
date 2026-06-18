import { Detection } from '@/types/detection';
import { isUnreadablePlate, normalizePlateKey } from './dashboardDetections';

/**
 * Software-only speed estimation (no radar/LIDAR).
 *
 * Reference pipeline:
 *   1. Detect vehicle in frame T1 and frame T2
 *   2. Measure pixel travel Δpixels on the road plane
 *   3. Calibrate pixels → meters (plate width ~0.52 m)
 *   4. Speed = Δmeters / Δtime
 *
 * Accuracy is typically ±15–20% without full camera intrinsics; we reduce error by:
 * - ByteTrack `track_id` grouping when available
 * - Ground-contact point (vehicle bbox bottom-center) instead of plate center
 * - Video timing from frame_index / FPS (not DB save timestamp)
 * - Linear regression over multiple track points + MAD outlier rejection
 */

const PLATE_WIDTH_METERS = 0.52;
const DEFAULT_VIDEO_FPS = 25;
const LIVE_FRAME_INTERVAL_SEC = 1.5;
const MAX_CROSS_CAMERA_GAP_MINUTES = 60;
const MIN_CROSS_CAMERA_GAP_SEC = 3;
const MIN_VISUAL_GAP_SEC = 0.05;
const MAX_VISUAL_GAP_SEC = 30;
const MIN_SPEED_KMH = 1;
const MAX_SPEED_KMH = 220;
const DEFAULT_CAMERA_DISTANCE_KM = 0.8;
const MAX_TRACK_FRAME_GAP = 45;

export type SpeedMethod =
  | 'cross_camera_gps'
  | 'cross_camera_estimated'
  | 'visual_tracking';

export interface CameraLocation {
  video_source: string;
  latitude: number | null;
  longitude: number | null;
  name?: string;
  camera_code?: string;
}

export interface VehicleSpeedReading {
  plate_number: string;
  speed_kmh: number;
  method: SpeedMethod;
  confidence: 'high' | 'medium' | 'low';
  source_label: string;
  measured_at: string;
  detection_id: number;
}

type Bbox = [number, number, number, number];

interface TrackPoint {
  detection: Detection;
  timeSec: number;
  ground: { x: number; y: number };
  metersPerPixel: number;
}

function extractBbox(raw: Detection['plate_bbox'] | Detection['bounding_box']): Bbox | null {
  if (!raw) return null;
  const bbox = Array.isArray(raw) ? raw : raw.bbox;
  if (!bbox || bbox.length < 4) return null;
  return [bbox[0], bbox[1], bbox[2], bbox[3]];
}

function bboxWidth(raw: Detection['plate_bbox'] | Detection['bounding_box']): number | null {
  const bbox = extractBbox(raw);
  if (!bbox) return null;
  return Math.abs(bbox[2] - bbox[0]);
}

/** Ground-contact point — bottom-center of vehicle bbox (road plane proxy). */
function groundContactPoint(detection: Detection): { x: number; y: number } | null {
  const vehicleBbox = extractBbox(detection.bounding_box);
  if (vehicleBbox) {
    return {
      x: (vehicleBbox[0] + vehicleBbox[2]) / 2,
      y: vehicleBbox[3],
    };
  }

  const plateBbox = extractBbox(detection.plate_bbox);
  if (plateBbox) {
    return {
      x: (plateBbox[0] + plateBbox[2]) / 2,
      y: plateBbox[3],
    };
  }

  return null;
}

/** Plate-width self-calibration (meters per pixel). */
function metersPerPixel(detection: Detection): number | null {
  const plateWidthPx = bboxWidth(detection.plate_bbox) ?? bboxWidth(detection.bounding_box);
  if (!plateWidthPx || plateWidthPx < 12) return null;
  return PLATE_WIDTH_METERS / plateWidthPx;
}

function detectionTimeMs(detection: Detection): number {
  return new Date(detection.detection_timestamp).getTime();
}

function isVideoFileSource(source?: string | null): boolean {
  return /\.(mp4|avi|mov|mkv|webm|wmv|flv|m4v)$/i.test(source?.trim() || '');
}

function isLiveLikeSource(source?: string | null): boolean {
  if (!source?.trim()) return false;
  const normalized = source.trim();
  if (isVideoFileSource(normalized)) return false;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return true;
  if (normalized === 'live-camera' || normalized === 'live-stream') return true;
  return true;
}

/** Precise Δt: video uses frame index / FPS; live uses capture interval. */
function timeSeconds(detection: Detection, videoFps: number): number {
  if (isVideoFileSource(detection.video_source) && detection.frame_number != null) {
    return detection.frame_number / videoFps;
  }
  return detectionTimeMs(detection) / 1000;
}

function deltaSeconds(
  previous: Detection,
  current: Detection,
  videoFps: number
): number | null {
  const sameVideo = isVideoFileSource(current.video_source);

  if (sameVideo && previous.frame_number != null && current.frame_number != null) {
    const frameDelta = current.frame_number - previous.frame_number;
    if (frameDelta > 0) {
      return frameDelta / videoFps;
    }
  }

  if (isLiveLikeSource(current.video_source)) {
    const byTimestamp = (detectionTimeMs(current) - detectionTimeMs(previous)) / 1000;
    if (byTimestamp > MIN_VISUAL_GAP_SEC) return byTimestamp;
    return LIVE_FRAME_INTERVAL_SEC;
  }

  const byTimestamp = (detectionTimeMs(current) - detectionTimeMs(previous)) / 1000;
  return byTimestamp > MIN_VISUAL_GAP_SEC ? byTimestamp : null;
}

/** Project motion onto dominant road axis for this camera segment. */
function roadPlaneDisplacementPx(
  prev: { x: number; y: number },
  cur: { x: number; y: number }
): number {
  const dx = Math.abs(cur.x - prev.x);
  const dy = Math.abs(cur.y - prev.y);
  return dx >= dy ? dx : dy;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function filterSpeedOutliers(samples: number[]): number[] {
  if (samples.length < 3) return samples;
  const med = median(samples);
  if (med == null) return samples;
  const deviations = samples.map((v) => Math.abs(v - med));
  const mad = median(deviations) ?? 0;
  const threshold = Math.max(12, mad * 3.5);
  return samples.filter((v) => Math.abs(v - med) <= threshold);
}

function clampSpeed(speedKmh: number): number | null {
  if (!Number.isFinite(speedKmh) || speedKmh < MIN_SPEED_KMH || speedKmh > MAX_SPEED_KMH) {
    return null;
  }
  return Math.round(speedKmh * 10) / 10;
}

function toTrackPoints(detections: Detection[], videoFps: number): TrackPoint[] {
  const sorted = [...detections].sort((a, b) => {
    if (isVideoFileSource(a.video_source)) {
      return (a.frame_number ?? 0) - (b.frame_number ?? 0);
    }
    return detectionTimeMs(a) - detectionTimeMs(b);
  });

  const points: TrackPoint[] = [];

  for (const detection of sorted) {
    const ground = groundContactPoint(detection);
    const scale = metersPerPixel(detection);
    if (!ground || scale == null) continue;

    points.push({
      detection,
      timeSec: timeSeconds(detection, videoFps),
      ground,
      metersPerPixel: scale,
    });
  }

  return points;
}

/** Pairwise frame-to-frame speeds (steps 1–5 in the reference pipeline). */
function pairwiseSpeedSamples(points: TrackPoint[], videoFps: number): number[] {
  const samples: number[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    const dt = deltaSeconds(previous.detection, current.detection, videoFps);
    if (dt == null || dt < MIN_VISUAL_GAP_SEC || dt > MAX_VISUAL_GAP_SEC) continue;

    const displacementPx = roadPlaneDisplacementPx(previous.ground, current.ground);
    if (displacementPx < 0.5) continue;

    const metersPerPx = (previous.metersPerPixel + current.metersPerPixel) / 2;
    const speedKmh = clampSpeed((displacementPx * metersPerPx) / dt * 3.6);
    if (speedKmh != null) samples.push(speedKmh);
  }

  return filterSpeedOutliers(samples);
}

/** Regression speed over full track — more stable than single frame pairs. */
function regressionSpeedKmh(points: TrackPoint[], videoFps: number): number | null {
  if (points.length < 2) return null;

  const origin = points[0].timeSec;
  const samples: { t: number; d: number }[] = [{ t: 0, d: 0 }];
  let cumulativeM = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dt = deltaSeconds(previous.detection, current.detection, videoFps);
    if (dt == null || dt < MIN_VISUAL_GAP_SEC) continue;

    const displacementPx = roadPlaneDisplacementPx(previous.ground, current.ground);
    const metersPerPx = (previous.metersPerPixel + current.metersPerPixel) / 2;
    cumulativeM += displacementPx * metersPerPx;
    samples.push({ t: current.timeSec - origin, d: cumulativeM });
  }

  if (samples.length < 2) return null;

  const n = samples.length;
  let sumT = 0;
  let sumD = 0;
  let sumTT = 0;
  let sumTD = 0;

  for (const sample of samples) {
    sumT += sample.t;
    sumD += sample.d;
    sumTT += sample.t * sample.t;
    sumTD += sample.t * sample.d;
  }

  const denom = n * sumTT - sumT * sumT;
  if (Math.abs(denom) < 1e-9) return null;

  const slopeMs = (n * sumTD - sumT * sumD) / denom;
  return clampSpeed(slopeMs * 3.6);
}

function groupIntoTracks(detections: Detection[]): Detection[][] {
  const withTrackId = detections.filter((d) => d.track_id?.trim());
  const tracks = new Map<string, Detection[]>();

  for (const detection of withTrackId) {
    const key = detection.track_id!.trim();
    const bucket = tracks.get(key) ?? [];
    bucket.push(detection);
    tracks.set(key, bucket);
  }

  if (tracks.size > 0) {
    return [...tracks.values()];
  }

  const sorted = [...detections].sort((a, b) => (a.frame_number ?? 0) - (b.frame_number ?? 0));
  const clusters: Detection[][] = [];
  let current: Detection[] = [];

  for (const detection of sorted) {
    if (current.length === 0) {
      current.push(detection);
      continue;
    }

    const lastFrame = current[current.length - 1].frame_number ?? 0;
    const frame = detection.frame_number ?? 0;
    if (frame - lastFrame > MAX_TRACK_FRAME_GAP) {
      clusters.push(current);
      current = [detection];
    } else {
      current.push(detection);
    }
  }

  if (current.length > 0) clusters.push(current);
  return clusters;
}

function visualConfidence(
  sampleCount: number,
  hasTrackId: boolean,
  isVideo: boolean,
  speeds: number[]
): 'high' | 'medium' | 'low' {
  const spread =
    speeds.length >= 2
      ? Math.max(...speeds) - Math.min(...speeds)
      : Number.POSITIVE_INFINITY;

  if (isVideo && hasTrackId && sampleCount >= 4 && spread <= 18) return 'high';
  if (isVideo && sampleCount >= 3 && spread <= 25) return 'medium';
  if (sampleCount >= 2 && spread <= 30) return 'medium';
  return 'low';
}

function speedFromPoints(
  points: TrackPoint[],
  videoFps: number
): { speedKmh: number; sampleCount: number } | null {
  if (points.length < 2) return null;

  const pairwise = pairwiseSpeedSamples(points, videoFps);
  const regression = regressionSpeedKmh(points, videoFps);
  const candidates = [regression, median(pairwise)].filter((v): v is number => v != null);
  if (candidates.length === 0) return null;

  return {
    speedKmh: median(candidates) ?? candidates[0],
    sampleCount: Math.max(pairwise.length, 1),
  };
}

function estimateVisualSpeed(
  detections: Detection[],
  videoFps: number
): { speedKmh: number; sampleCount: number; hasTrackId: boolean; isVideo: boolean } | null {
  const source = detections[0]?.video_source;
  const isVideo = isVideoFileSource(source);
  const hasTrackId = detections.some((d) => Boolean(d.track_id?.trim()));

  let bestSpeed: number | null = null;
  let bestSampleCount = 0;

  // Primary: all frames for this plate/source (track_id often resets mid-video).
  const allPoints = toTrackPoints(detections, videoFps);
  const combined = speedFromPoints(allPoints, videoFps);
  if (combined) {
    bestSpeed = combined.speedKmh;
    bestSampleCount = combined.sampleCount;
  }

  // Secondary: per-track segments when they add more samples.
  for (const track of groupIntoTracks(detections)) {
    if (track.length < 2) continue;
    const estimate = speedFromPoints(toTrackPoints(track, videoFps), videoFps);
    if (!estimate) continue;
    if (estimate.sampleCount > bestSampleCount) {
      bestSpeed = estimate.speedKmh;
      bestSampleCount = estimate.sampleCount;
    }
  }

  if (bestSpeed == null) return null;

  return {
    speedKmh: bestSpeed,
    sampleCount: bestSampleCount,
    hasTrackId,
    isVideo,
  };
}

/** Needs plate text + bbox data to estimate motion. */
function isSpeedEligibleDetection(detection: Detection): boolean {
  if (isUnreadablePlate(detection.plate_number)) return false;
  if (!normalizePlateKey(detection.plate_number)) return false;
  return groundContactPoint(detection) != null && metersPerPixel(detection) != null;
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cameraDistanceKm(
  sourceA: string,
  sourceB: string,
  cameraMap: Map<string, CameraLocation>
): { distanceKm: number; hasGps: boolean } {
  const camA = cameraMap.get(sourceA.trim());
  const camB = cameraMap.get(sourceB.trim());

  if (
    camA?.latitude != null &&
    camA?.longitude != null &&
    camB?.latitude != null &&
    camB?.longitude != null
  ) {
    return {
      distanceKm: haversineDistanceKm(
        camA.latitude,
        camA.longitude,
        camB.latitude,
        camB.longitude
      ),
      hasGps: true,
    };
  }

  return { distanceKm: DEFAULT_CAMERA_DISTANCE_KM, hasGps: false };
}

function crossCameraSpeedReadings(
  plate: string,
  detections: Detection[],
  cameraMap: Map<string, CameraLocation>
): VehicleSpeedReading[] {
  const sorted = [...detections].sort(
    (a, b) => detectionTimeMs(a) - detectionTimeMs(b)
  );

  const readings: VehicleSpeedReading[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const prevSource = previous.video_source?.trim();
    const curSource = current.video_source?.trim();
    if (!prevSource || !curSource || prevSource === curSource) continue;

    const gapSec = (detectionTimeMs(current) - detectionTimeMs(previous)) / 1000;
    if (gapSec < MIN_CROSS_CAMERA_GAP_SEC || gapSec > MAX_CROSS_CAMERA_GAP_MINUTES * 60) {
      continue;
    }

    const { distanceKm, hasGps } = cameraDistanceKm(prevSource, curSource, cameraMap);
    const speedKmh = clampSpeed(distanceKm / (gapSec / 3600));
    if (speedKmh == null) continue;

    readings.push({
      plate_number: plate,
      speed_kmh: speedKmh,
      method: hasGps ? 'cross_camera_gps' : 'cross_camera_estimated',
      confidence: hasGps ? 'high' : 'medium',
      source_label: `${prevSource} → ${curSource}`,
      measured_at: current.detection_timestamp,
      detection_id: current.id,
    });
  }

  return readings;
}

function visualTrackingReading(
  plate: string,
  detections: Detection[],
  videoFps: number
): VehicleSpeedReading | null {
  const bySource = new Map<string, Detection[]>();

  for (const detection of detections) {
    const source = detection.video_source?.trim() || 'single source';
    const bucket = bySource.get(source) ?? [];
    bucket.push(detection);
    bySource.set(source, bucket);
  }

  let best: VehicleSpeedReading | null = null;
  let bestSampleCount = 0;

  for (const [source, sourceItems] of bySource.entries()) {
    const estimate = estimateVisualSpeed(sourceItems, videoFps);
    if (!estimate) continue;

    const latest = [...sourceItems].sort((a, b) => detectionTimeMs(b) - detectionTimeMs(a))[0];
    const pairwise = pairwiseSpeedSamples(toTrackPoints(sourceItems, videoFps), videoFps);

    const reading: VehicleSpeedReading = {
      plate_number: plate,
      speed_kmh: estimate.speedKmh,
      method: 'visual_tracking',
      confidence: visualConfidence(
        estimate.sampleCount,
        estimate.hasTrackId,
        estimate.isVideo,
        pairwise
      ),
      source_label: source,
      measured_at: latest.detection_timestamp,
      detection_id: latest.id,
    };

    if (estimate.sampleCount > bestSampleCount) {
      best = reading;
      bestSampleCount = estimate.sampleCount;
    }
  }

  return best;
}

function methodPriority(method: SpeedMethod): number {
  if (method === 'cross_camera_gps') return 3;
  if (method === 'visual_tracking') return 2;
  return 1;
}

function pickBestReading(candidates: VehicleSpeedReading[]): VehicleSpeedReading | null {
  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    const methodDiff = methodPriority(b.method) - methodPriority(a.method);
    if (methodDiff !== 0) return methodDiff;
    const confidenceRank = { high: 3, medium: 2, low: 1 };
    const confDiff = confidenceRank[b.confidence] - confidenceRank[a.confidence];
    if (confDiff !== 0) return confDiff;
    return (
      detectionTimeMs({ detection_timestamp: b.measured_at } as Detection) -
      detectionTimeMs({ detection_timestamp: a.measured_at } as Detection)
    );
  })[0];
}

export function buildCameraLocationMap(locations: CameraLocation[]): Map<string, CameraLocation> {
  const map = new Map<string, CameraLocation>();
  for (const location of locations) {
    const key = location.video_source?.trim();
    if (!key) continue;
    map.set(key, location);
  }
  return map;
}

/** Compute best speed estimate per detected plate in the session. */
export function computeVehicleSpeeds(
  detections: Detection[],
  cameraLocations: CameraLocation[] = [],
  videoFps: number = DEFAULT_VIDEO_FPS
): VehicleSpeedReading[] {
  const cameraMap = buildCameraLocationMap(cameraLocations);
  const byPlate = new Map<string, Detection[]>();

  for (const detection of detections) {
    if (!isSpeedEligibleDetection(detection)) continue;

    const key = normalizePlateKey(detection.plate_number);
    if (!key) continue;

    const bucket = byPlate.get(key) ?? [];
    bucket.push(detection);
    byPlate.set(key, bucket);
  }

  const results: VehicleSpeedReading[] = [];

  for (const [key, items] of byPlate.entries()) {
    const displayPlate = items.find((item) => item.plate_number)?.plate_number || key;
    const candidates: VehicleSpeedReading[] = [
      ...crossCameraSpeedReadings(displayPlate, items, cameraMap),
    ];

    const visual = visualTrackingReading(displayPlate, items, videoFps);
    if (visual) candidates.push(visual);

    const best = pickBestReading(candidates);
    if (best) results.push(best);
  }

  return results.sort((a, b) => b.speed_kmh - a.speed_kmh);
}
