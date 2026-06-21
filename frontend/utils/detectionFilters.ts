import { Detection } from '@/types/detection';
import { filterDetectionsByQuery } from '@/utils/detectionDisplay';

export type DetectionSortOption =
  | 'date-desc'
  | 'date-asc'
  | 'violations-desc'
  | 'violations-asc'
  | 'plate';

export type DetectionVehicleFilter = 'all' | 'car' | 'truck' | 'bike' | 'ev' | 'unknown';

export type DetectionRegDateFilter = 'all' | '2025' | '2024' | '2020-2023' | 'pre-2020';

export interface DetectionListFilters {
  vehicle: DetectionVehicleFilter;
  regdate: DetectionRegDateFilter;
}

export const DEFAULT_DETECTION_SORT: DetectionSortOption = 'date-desc';

export const DEFAULT_DETECTION_FILTERS: DetectionListFilters = {
  vehicle: 'all',
  regdate: 'all',
};

function getDetectionVehicleType(detection: Detection): string {
  const raw =
    detection.vehicle_type ||
    detection.vehicle?.vehicle_type ||
    detection.vehicle?.class_name ||
    '';
  return raw.toLowerCase().trim();
}

function matchesVehicleFilter(detection: Detection, filter: DetectionVehicleFilter): boolean {
  if (filter === 'all') return true;

  const type = getDetectionVehicleType(detection);
  if (filter === 'unknown') {
    return !type || type === 'unknown' || type === '--';
  }
  if (filter === 'car') {
    return (
      type.includes('car') ||
      type.includes('sedan') ||
      type.includes('suv') ||
      type.includes('hatchback')
    );
  }
  if (filter === 'truck') {
    return (
      type.includes('truck') ||
      type.includes('lorry') ||
      type.includes('bus') ||
      type.includes('van')
    );
  }
  if (filter === 'bike') {
    return (
      type.includes('bike') ||
      type.includes('motorcycle') ||
      type.includes('scooter') ||
      type.includes('moped') ||
      type.includes('two-wheeler') ||
      type.includes('two wheeler')
    );
  }
  if (filter === 'ev') {
    return (
      type.includes('ev') ||
      type.includes('electric') ||
      type.includes('bev') ||
      type.includes('phev')
    );
  }
  return true;
}

function getRegistrationYear(detection: Detection): number | null {
  const source = detection.vehicle?.registration_date;
  if (!source) return null;
  const year = new Date(source).getFullYear();
  return Number.isNaN(year) ? null : year;
}

function matchesRegDateFilter(detection: Detection, filter: DetectionRegDateFilter): boolean {
  if (filter === 'all') return true;

  const year = getRegistrationYear(detection);
  if (year == null) return false;

  switch (filter) {
    case '2025':
      return year === 2025;
    case '2024':
      return year === 2024;
    case '2020-2023':
      return year >= 2020 && year <= 2023;
    case 'pre-2020':
      return year < 2020;
    default:
      return true;
  }
}

function getViolationCount(detection: Detection): number {
  return Math.max(0, detection.vehicle?.violation_count ?? 0);
}

export function countActiveDetectionFilters(filters: DetectionListFilters): number {
  return (filters.vehicle !== 'all' ? 1 : 0) + (filters.regdate !== 'all' ? 1 : 0);
}

export function applyDetectionListOptions(
  detections: Detection[],
  query: string,
  sort: DetectionSortOption,
  filters: DetectionListFilters
): Detection[] {
  const rows = filterDetectionsByQuery(detections, query).filter(
    (detection) =>
      matchesVehicleFilter(detection, filters.vehicle) &&
      matchesRegDateFilter(detection, filters.regdate)
  );

  return [...rows].sort((a, b) => {
    switch (sort) {
      case 'date-asc':
        return (
          new Date(a.detection_timestamp).getTime() - new Date(b.detection_timestamp).getTime()
        );
      case 'date-desc':
        return (
          new Date(b.detection_timestamp).getTime() - new Date(a.detection_timestamp).getTime()
        );
      case 'violations-desc':
        return getViolationCount(b) - getViolationCount(a);
      case 'violations-asc':
        return getViolationCount(a) - getViolationCount(b);
      case 'plate':
        return a.plate_number.localeCompare(b.plate_number, undefined, { sensitivity: 'base' });
      default:
        return 0;
    }
  });
}
