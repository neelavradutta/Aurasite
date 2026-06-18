import { Detection } from '@/types/detection';
import { DETECTION_LOG_COLUMNS } from './detectionLogColumns';

export function displayValue(value?: string | number | null, fallback = '--'): string {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

export function formatConfidence(confidence?: number | null): string {
  if (confidence === undefined || confidence === null) return '--';
  return `${(confidence * 100).toFixed(1)}%`;
}

export function formatTimestamp(timestamp?: string | null): string {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatRegistrationDate(detection: Detection): string {
  const source =
    detection.vehicle?.first_detected_timestamp ||
    detection.vehicle?.created_at ||
    detection.detection_timestamp;
  if (!source) return '--';
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function getVehicleColour(detection: Detection): string {
  return displayValue(detection.vehicle_color || detection.vehicle?.color);
}

export function getVehicleType(detection: Detection): string {
  return displayValue(detection.vehicle_type || detection.vehicle?.vehicle_type);
}

export function getOwnerName(detection: Detection): string {
  return displayValue(detection.vehicle?.owner_name);
}

export function getAddress(detection: Detection): string {
  return displayValue(detection.vehicle?.owner_address);
}

export function getChallanPaid(detection: Detection): string {
  const paid = detection.vehicle?.total_challan_paid;
  if (paid === undefined || paid === null) return '--';
  return String(paid);
}

export function getPlateDisplay(plate?: string | null): string {
  if (!plate) return '-- --';
  return plate;
}

export function detectionRowSearchText(detection: Detection): string {
  return DETECTION_LOG_COLUMNS.map((column) => column.getValue(detection)).join(' ').toLowerCase();
}

export function filterDetectionsByQuery(detections: Detection[], query: string): Detection[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return detections;
  return detections.filter((detection) => detectionRowSearchText(detection).includes(normalized));
}
