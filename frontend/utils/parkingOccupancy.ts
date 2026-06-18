import { Detection } from '@/types/detection';
import { ParkingOccupancyResult, ParkingHourlyPoint } from '@/types/analytics';
import { isUnreadablePlate, normalizePlateKey } from './dashboardDetections';

/** Gap without re-detection before a plate is treated as exited. */
const EXIT_GAP_MS = 20 * 60 * 1000;

const HOUR_LABELS = ['04:00', '08:00', '12:00', '16:00', '20:00', '24:00'];

type OccupancyEvent = { time: number; delta: number };

function isAcceptedDetection(detection: Detection): boolean {
  const quality = (detection.detection_quality || 'accepted').toLowerCase();
  if (quality === 'invalid' || quality === 'rejected') return false;
  if (isUnreadablePlate(detection.plate_number)) return false;
  return Boolean(normalizePlateKey(detection.plate_number));
}

function buildOccupancyEvents(detections: Detection[]): OccupancyEvent[] {
  const sorted = [...detections]
    .filter(isAcceptedDetection)
    .sort(
      (a, b) =>
        new Date(a.detection_timestamp).getTime() - new Date(b.detection_timestamp).getTime()
    );

  if (sorted.length === 0) return [];

  const plateState = new Map<string, { inside: boolean; lastSeen: number }>();
  const events: OccupancyEvent[] = [];

  const flushExitsBefore = (time: number) => {
    for (const state of plateState.values()) {
      if (state.inside && time - state.lastSeen >= EXIT_GAP_MS) {
        events.push({ time: state.lastSeen + EXIT_GAP_MS, delta: -1 });
        state.inside = false;
      }
    }
  };

  for (const detection of sorted) {
    const time = new Date(detection.detection_timestamp).getTime();
    const key = normalizePlateKey(detection.plate_number);
    if (!key) continue;

    flushExitsBefore(time);

    let state = plateState.get(key);
    if (!state) {
      state = { inside: false, lastSeen: time };
      plateState.set(key, state);
    }

    if (!state.inside) {
      events.push({ time, delta: 1 });
      state.inside = true;
    }

    state.lastSeen = time;
  }

  flushExitsBefore(Number.MAX_SAFE_INTEGER);

  return events.sort((a, b) => a.time - b.time);
}

function occupancyAtTime(events: OccupancyEvent[], time: number): number {
  let count = 0;
  for (const event of events) {
    if (event.time > time) break;
    count += event.delta;
  }
  return Math.max(0, count);
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function getReferenceDay(detections: Detection[]): Date {
  const accepted = detections.filter(isAcceptedDetection);
  if (accepted.length === 0) return new Date();

  const latest = accepted.reduce((max, det) => {
    const time = new Date(det.detection_timestamp).getTime();
    return time > max ? time : max;
  }, 0);

  const day = new Date(latest);
  day.setHours(0, 0, 0, 0);
  return day;
}

function buildHourlySeries(
  events: OccupancyEvent[],
  maxCapacity: number,
  referenceDay: Date
): ParkingHourlyPoint[] {
  const capacity = Math.max(1, maxCapacity);
  const points: ParkingHourlyPoint[] = [];

  for (let hour = 0; hour <= 24; hour += 1) {
    const slotTime = new Date(referenceDay);
    if (hour === 24) {
      slotTime.setDate(slotTime.getDate() + 1);
      slotTime.setHours(0, 0, 0, 0);
    } else {
      slotTime.setHours(hour, 59, 59, 999);
    }

    const occupied = occupancyAtTime(events, slotTime.getTime());
    const occupancyPct = Math.min(100, Math.round((occupied / capacity) * 100));

    points.push({
      hour,
      label: hour === 24 ? '24:00' : formatHourLabel(hour),
      occupancyPct,
      occupied,
    });
  }

  return points;
}

export function computeParkingOccupancy(
  detections: Detection[],
  maxCapacity: number
): ParkingOccupancyResult {
  const capacity = Math.max(1, maxCapacity);
  const events = buildOccupancyEvents(detections);
  const referenceDay = getReferenceDay(detections);
  const hourly = buildHourlySeries(events, capacity, referenceDay);

  const now = Date.now();
  const currentHour = new Date(now).getHours();
  const currentHourPoint =
    hourly.find((point) => point.hour === currentHour) ??
    [...hourly]
      .filter((point) => point.hour < 24 && point.hour <= currentHour)
      .sort((a, b) => b.hour - a.hour)[0];
  const currentOccupied = currentHourPoint?.occupied ?? occupancyAtTime(events, now);
  const currentPct = Math.min(100, Math.round((currentOccupied / capacity) * 100));

  let peakHour = 0;
  let peakPct = 0;
  let peakOccupied = 0;

  for (const point of hourly) {
    if (point.hour === 24) continue;
    if (point.occupancyPct >= peakPct) {
      peakPct = point.occupancyPct;
      peakHour = point.hour;
      peakOccupied = point.occupied;
    }
  }

  const peakLabel = formatHourLabel(peakHour);
  const available = Math.max(0, capacity - currentOccupied);

  return {
    hourly,
    axisLabels: HOUR_LABELS,
    currentOccupied,
    currentPct,
    peakHour,
    peakLabel,
    peakPct,
    peakOccupied,
    available,
    maxCapacity: capacity,
    isPeakAlert: peakPct >= 90,
  };
}
