import { Detection } from '@/types/detection';

export type ViolationUpdate = {
  vehicle_id: number;
  plate_number: string;
  violation_count: number;
};

export type VehicleRealtimeUpdate = {
  vehicle_id: number;
  plate_number: string;
  status?: string | null;
  is_suspicious?: boolean;
  flagged_reason?: string | null;
  violation_count?: number;
};

function normalizePlateKey(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function matchesVehicleUpdate(detection: Detection, update: VehicleRealtimeUpdate): boolean {
  const vehicleId = detection.vehicle_id ?? detection.vehicle?.id;
  if (vehicleId != null && vehicleId === update.vehicle_id) return true;
  return normalizePlateKey(detection.plate_number) === normalizePlateKey(update.plate_number);
}

function applyVehicleUpdate(detection: Detection, update: VehicleRealtimeUpdate): Detection {
  const vehicleId = detection.vehicle_id ?? detection.vehicle?.id ?? update.vehicle_id;

  return {
    ...detection,
    vehicle: {
      ...(detection.vehicle || {}),
      id: vehicleId,
      plate_number: update.plate_number,
      ...(update.status !== undefined ? { status: update.status } : {}),
      ...(update.is_suspicious !== undefined ? { is_suspicious: update.is_suspicious } : {}),
      ...(update.flagged_reason !== undefined ? { flagged_reason: update.flagged_reason } : {}),
      ...(update.violation_count !== undefined ? { violation_count: update.violation_count } : {}),
    },
  };
}

export function patchVehicleUpdates(
  detections: Detection[],
  updates: VehicleRealtimeUpdate[]
): Detection[] {
  if (updates.length === 0) return detections;

  return detections.map((detection) => {
    const update = updates.find((row) => matchesVehicleUpdate(detection, row));
    return update ? applyVehicleUpdate(detection, update) : detection;
  });
}

export function patchViolationCounts(
  detections: Detection[],
  updates: ViolationUpdate[]
): Detection[] {
  return patchVehicleUpdates(
    detections,
    updates.map((update) => ({
      vehicle_id: update.vehicle_id,
      plate_number: update.plate_number,
      violation_count: update.violation_count,
    }))
  );
}
