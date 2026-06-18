import { Vehicle, VehicleRecentLocation } from '@/types/vehicle';



const VEHICLE_TYPE_ICONS: Record<string, string> = {
  car: '🚗',
  truck: '🚚',
  bus: '🚌',
  motorcycle: '🏍️',
  van: '🚐',
};

type VehicleTypeKey = keyof typeof VEHICLE_TYPE_ICONS;

export function normalizeVehicleType(vehicleType?: string | null): VehicleTypeKey {
  const raw = (vehicleType || '').toLowerCase().trim();
  if (!raw || raw === 'unknown') return 'car';
  if (raw in VEHICLE_TYPE_ICONS) return raw as VehicleTypeKey;
  if (raw.includes('truck') || raw.includes('lorry') || raw.includes('pickup')) return 'truck';
  if (raw.includes('bus') || raw.includes('coach')) return 'bus';
  if (raw.includes('motor') || raw === 'motorbike' || raw === 'scooter') return 'motorcycle';
  if (raw.includes('van')) return 'van';
  if (raw.includes('car') || raw === 'vehicle' || raw === 'automobile') return 'car';
  return 'car';
}

export function resolveVehicleType(
  vehicleType?: string | null,
  vehicle?: { vehicle_type?: string | null; class_name?: string | null } | null,
): VehicleTypeKey {
  return normalizeVehicleType(vehicleType || vehicle?.vehicle_type || vehicle?.class_name);
}

export function getVehicleTypeIcon(vehicleType?: string | null): string {
  return VEHICLE_TYPE_ICONS[normalizeVehicleType(vehicleType)];
}

export function formatRelativeLastSeen(timestamp?: string | null): string {
  if (!timestamp) return 'Unknown';

  const diffMs = Date.now() - new Date(timestamp).getTime();

  if (Number.isNaN(diffMs) || diffMs < 0) return 'Unknown';

  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return 'Just now';

  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);

  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

  const months = Math.floor(days / 30);

  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export function formatDetectionCount(count: number): string {
  const value = Math.max(0, count);

  return `${value} Detection${value === 1 ? '' : 's'}`;
}

function formatCoordinate(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(5)}° ${value >= 0 ? positive : negative}`;
}



export function formatCameraGpsLocation(location: VehicleRecentLocation): string {

  const parts: string[] = [];



  if (location.place_name) {

    parts.push(location.place_name);

  }



  if (location.latitude !== null && location.longitude !== null) {

    parts.push(

      `${formatCoordinate(location.latitude, 'N', 'S')}, ${formatCoordinate(location.longitude, 'E', 'W')}`

    );

  }



  if (parts.length > 0) {

    return location.camera_name ? `${location.camera_name} · ${parts.join(' · ')}` : parts.join(' · ');

  }



  return location.camera_name || 'Camera GPS unavailable';

}



export function getVehicleLocationHint(vehicle: Vehicle): string | null {

  if (vehicle.recent_location) {

    return formatCameraGpsLocation(vehicle.recent_location);

  }



  const latestSource = vehicle.detections?.[0]?.video_source?.trim();

  if (latestSource) {

    return `Camera source: ${latestSource}`;

  }



  return null;

}

export function getHistoryPlate(
  vehicle: Pick<Vehicle, 'plate_number' | 'detections'>
): string {
  const fromTimeline = vehicle.detections
    ?.find((item) => item.plate_number?.trim())
    ?.plate_number?.trim();
  return fromTimeline || vehicle.plate_number.trim();
}

