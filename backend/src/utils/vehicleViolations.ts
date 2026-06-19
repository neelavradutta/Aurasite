import Vehicle from '../models/Vehicle';

export function vehicleQualifiesForViolation(
  vehicle: Pick<Vehicle, 'is_suspicious' | 'status'>
): boolean {
  if (vehicle.is_suspicious) return true;
  const status = String(vehicle.status || 'active').trim().toLowerCase();
  return status !== 'active';
}

export function resolveViolationCount(vehicle: Vehicle): number {
  const current = Math.max(0, Number(vehicle.violation_count) || 0);
  return vehicleQualifiesForViolation(vehicle) ? current + 1 : current;
}
