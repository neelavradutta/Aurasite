import { Vehicle } from '@/types/vehicle';
import { formatDateTime } from '@/utils/dateFormat';

function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadVehicleCsv(vehicle: Vehicle, filename?: string): void {
  const rows = [
    ['plate_number', 'vehicle_type', 'color', 'status', 'detection_count', 'is_suspicious', 'owner_name', 'owner_contact', 'owner_address', 'registration_number', 'first_detected_timestamp', 'last_detected_timestamp', 'flagged_reason'],
    [
      vehicle.plate_number,
      vehicle.vehicle_type || '',
      vehicle.color || '',
      vehicle.status || (vehicle.is_suspicious ? 'suspicious' : 'active'),
      String(vehicle.detection_count ?? 0),
      String(Boolean(vehicle.is_suspicious)),
      vehicle.owner_name || '',
      vehicle.owner_contact || '',
      vehicle.owner_address || '',
      vehicle.registration_number || '',
      vehicle.first_detected_timestamp ? formatDateTime(vehicle.first_detected_timestamp) : '',
      vehicle.last_detected_timestamp ? formatDateTime(vehicle.last_detected_timestamp) : '',
      vehicle.flagged_reason || '',
    ],
  ];

  const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename || `vehicle-${vehicle.plate_number}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
