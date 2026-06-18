import { Vehicle, VehicleStatus } from '@/types/vehicle';
import { isUnreadablePlate } from '@/utils/dashboardDetections';
import {
  formatDetectionCount,
  formatRelativeLastSeen,
  getVehicleLocationHint,
  getVehicleTypeIcon,
} from '@/utils/vehicleCardDisplay';
import {
  getStatusLabel,
  getVehicleStatus,
  statusCardClass,
  statusCardMetaTextClass,
} from '@/utils/vehicleStatus';

const STATUS_DOT_CLASS: Record<VehicleStatus, string> = {
  active: 'bg-cyber-green live-dot shadow-[0_0_8px_rgba(132,255,0,0.9)]',
  suspicious: 'bg-red-500 live-dot shadow-[0_0_8px_rgba(239,68,68,0.9)]',
  invalid: 'bg-white live-dot shadow-[0_0_8px_rgba(255,255,255,0.75)] ring-1 ring-slate-400/60',
  accidental: 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)]',
};

interface Props {
  vehicle: Vehicle;
  onClick: (vehicle: Vehicle) => void;
  highlighted?: boolean;
}

export default function VehicleCatalogCard({ vehicle, onClick, highlighted = false }: Props) {
  const status = getVehicleStatus(vehicle);
  const isUnreadable = isUnreadablePlate(vehicle.plate_number);
  const cardClass = isUnreadable
    ? 'border-white/10 bg-[rgba(22,32,72,0.9)]'
    : statusCardClass[status];
  const metaTextClass = isUnreadable ? 'text-[#A0B0C0]' : statusCardMetaTextClass[status];
  const subtleMetaClass = isUnreadable ? 'text-[#6B7A8F]' : `${statusCardMetaTextClass[status]} opacity-80`;
  const dotClass = STATUS_DOT_CLASS[status];
  const locationHint = getVehicleLocationHint(vehicle);

  return (
    <button
      id={`vehicle-card-${vehicle.id}`}
      type="button"
      onClick={() => onClick(vehicle)}
      className={`vehicle-catalog-card group relative w-full overflow-hidden rounded-xl border p-3 text-left ${cardClass} ${
        highlighted
          ? 'ring-2 ring-cyber-cyan/40 ring-offset-2 ring-offset-[#0a0e27]'
          : ''
      }`}
    >
      {!isUnreadable && (
        <span
          className={`absolute right-3 top-3 z-10 h-2 w-2 rounded-full ${dotClass}`}
          title={`${getStatusLabel(status)} vehicle`}
          aria-label={`${getStatusLabel(status)} vehicle`}
        />
      )}

      <p
        className={`font-mono text-[1.375rem] font-bold leading-none tracking-wide sm:text-[1.5rem] ${
          isUnreadable ? 'text-[#00D9FF]' : 'text-white drop-shadow-sm'
        } ${isUnreadable ? '' : 'pr-6'}`}
      >
        {vehicle.plate_number}
      </p>

      <p className={`mt-2 flex items-center gap-1.5 text-sm ${metaTextClass}`}>
        <span aria-hidden>{getVehicleTypeIcon(vehicle.vehicle_type)}</span>
        <span aria-hidden>•</span>
        <span>{formatDetectionCount(vehicle.detection_count)}</span>
      </p>

      <p className={`mt-1.5 text-xs ${subtleMetaClass}`}>
        Last seen: {formatRelativeLastSeen(vehicle.last_detected_timestamp)}
      </p>

      {locationHint && (
        <p className={`mt-0.5 text-[10px] ${subtleMetaClass}`}>
          <span aria-hidden>📍 </span>
          {locationHint}
        </p>
      )}
    </button>
  );
}
