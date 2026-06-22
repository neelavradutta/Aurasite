import { Vehicle } from '@/types/vehicle';

const RESTORE_VEHICLE = 'restoreVehicle';
const RESTORE_SCROLL = 'restoreScroll';
const RESTORE_PLATE = 'restorePlate';
const RESTORE_DETECTION = 'restoreDetection';

export interface VehicleModalRestoreQuery {
  vehicleId: number;
  scrollY: number;
  plateNumber: string;
  selectedDetectionId: number | null;
}

type RouterQuery = Record<string, string | string[] | undefined>;

function readQueryValue(query: RouterQuery, key: string): string {
  const value = query[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] || '';
  return '';
}

export function stampVehicleModalReturnUrl(
  vehicle: Vehicle,
  options: { scrollY: number; selectedDetectionId?: number | null }
): void {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  params.set(RESTORE_VEHICLE, String(vehicle.id));
  params.set(RESTORE_SCROLL, String(Math.round(options.scrollY)));
  params.set(RESTORE_PLATE, vehicle.plate_number);

  if (options.selectedDetectionId) {
    params.set(RESTORE_DETECTION, String(options.selectedDetectionId));
  } else {
    params.delete(RESTORE_DETECTION);
  }

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(window.history.state, '', nextUrl);
}

export function parseVehicleModalRestoreQuery(query: RouterQuery): VehicleModalRestoreQuery | null {
  const vehicleIdRaw = readQueryValue(query, RESTORE_VEHICLE);
  if (!vehicleIdRaw) return null;

  const vehicleId = Number(vehicleIdRaw);
  if (!Number.isFinite(vehicleId)) return null;

  const scrollY = Number(readQueryValue(query, RESTORE_SCROLL));
  const detectionRaw = readQueryValue(query, RESTORE_DETECTION);
  const selectedDetectionId = detectionRaw ? Number(detectionRaw) : null;

  return {
    vehicleId,
    scrollY: Number.isFinite(scrollY) ? scrollY : 0,
    plateNumber: readQueryValue(query, RESTORE_PLATE),
    selectedDetectionId: Number.isFinite(selectedDetectionId) ? selectedDetectionId : null,
  };
}

export function stripVehicleModalRestoreQuery(query: RouterQuery): RouterQuery {
  const next = { ...query };
  delete next[RESTORE_VEHICLE];
  delete next[RESTORE_SCROLL];
  delete next[RESTORE_PLATE];
  delete next[RESTORE_DETECTION];
  return next;
}
