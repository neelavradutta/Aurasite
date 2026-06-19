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

export function violationCountAfterStatusChange(
  vehicle: Pick<Vehicle, 'is_suspicious' | 'status' | 'violation_count'>,
  nextStatus: string
): number {
  const current = Math.max(0, Number(vehicle.violation_count) || 0);
  const wasFlagged = vehicleQualifiesForViolation(vehicle);
  const willBeActive = nextStatus === 'active';

  if (willBeActive && wasFlagged) {
    return Math.max(0, current - 1);
  }
  if (!willBeActive && !wasFlagged) {
    return current + 1;
  }
  return current;
}

export function violationCountAfterAutoFlag(
  vehicle: Pick<Vehicle, 'is_suspicious' | 'status' | 'violation_count'>
): number {
  if (vehicleQualifiesForViolation(vehicle)) {
    return Math.max(0, Number(vehicle.violation_count) || 0);
  }
  return Math.max(0, Number(vehicle.violation_count) || 0) + 1;
}
