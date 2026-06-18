import { Detection } from '@/types/detection';
import { DETECTION_LOG_COLUMNS, DetectionLogColumn } from './detectionLogColumns';

/** Extra export fields beyond the detection log table. */
const ADDITIONAL_DETECTION_EXPORT_COLUMNS: readonly DetectionLogColumn[] = [
  { key: 'id', label: 'id', getValue: (d) => String(d.id) },
  {
    key: 'plate_confidence',
    label: 'plate_confidence',
    getValue: (d) => (d.plate_confidence != null ? String(d.plate_confidence) : ''),
  },
  {
    key: 'vehicle_confidence',
    label: 'vehicle_confidence',
    getValue: (d) => (d.vehicle_confidence != null ? String(d.vehicle_confidence) : ''),
  },
  { key: 'track_id', label: 'track_id', getValue: (d) => d.track_id ?? '' },
  {
    key: 'is_repeat_detection',
    label: 'is_repeat_detection',
    getValue: (d) => String(Boolean(d.is_repeat_detection)),
  },
  { key: 'detection_quality', label: 'detection_quality', getValue: (d) => d.detection_quality ?? '' },
  { key: 'video_source', label: 'video_source', getValue: (d) => d.video_source ?? '' },
];

export function getDetectionExportColumns(): DetectionLogColumn[] {
  return [...DETECTION_LOG_COLUMNS, ...ADDITIONAL_DETECTION_EXPORT_COLUMNS];
}

function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function detectionsToCsv(detections: Detection[]): string {
  const columns = getDetectionExportColumns();
  const header = columns.map((column) => escapeCsvCell(column.label)).join(',');
  const rows = detections.map((detection) =>
    columns.map((column) => escapeCsvCell(column.getValue(detection))).join(',')
  );
  return [header, ...rows].join('\n');
}

export function downloadDetectionsCsv(detections: Detection[], filename = 'detections.csv'): void {
  const csv = detectionsToCsv(detections);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
