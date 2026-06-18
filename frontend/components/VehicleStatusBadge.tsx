import Badge from '@/components/shared/Badge';
import { Vehicle } from '@/types/vehicle';
import { getStatusLabel, getVehicleStatus, statusBadgeTone } from '@/utils/vehicleStatus';

export default function VehicleStatusBadge({ vehicle }: { vehicle: Pick<Vehicle, 'status' | 'is_suspicious'> }) {
  const status = getVehicleStatus(vehicle);
  return <Badge tone={statusBadgeTone[status]}>{getStatusLabel(status)}</Badge>;
}
