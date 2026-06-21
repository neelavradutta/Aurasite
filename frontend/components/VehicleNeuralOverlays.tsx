import { Vehicle } from '@/types/vehicle';
import { displayValue } from '@/utils/detectionDisplay';
import { formatDate } from '@/utils/dateFormat';
import { formatRelativeLastSeen } from '@/utils/vehicleCardDisplay';
import { isUnreadablePlate } from '@/utils/dashboardDetections';
import { getStatusLabel, getVehicleStatus, statusTextClass } from '@/utils/vehicleStatus';

function formatRegistrationDate(value?: string | null): string {
  if (!value) return '--';
  const formatted = formatDate(value, '');
  return formatted || displayValue(value);
}

interface Props {
  children: React.ReactNode;
  vehicle: Vehicle;
  loading?: boolean;
}

function SatelliteRow({
  label,
  value,
  valueClassName = 'text-slate-200',
  size = 'sm',
}: {
  label: string;
  value: string;
  valueClassName?: string;
  size?: 'sm' | 'md';
}) {
  const textClass = size === 'md' ? 'text-sm' : 'text-xs';
  return (
    <div className={`flex items-center justify-between gap-3 ${textClass}`}>
      <span className="uppercase tracking-[0.12em] text-[#6B7A8F]">{label}</span>
      <span className={`min-w-[5.5rem] shrink-0 truncate text-right whitespace-nowrap ${valueClassName}`}>{value}</span>
    </div>
  );
}

function OwnerProfileEmailRow({ value }: { value: string }) {
  const at = value.indexOf('@');
  const canSplitAtDomain = at > 0 && value !== '--';

  return (
    <div className="flex items-start justify-between gap-3 text-sm leading-snug">
      <span className="max-w-[42%] shrink-0 uppercase tracking-[0.12em] text-[#6B7A8F]">Email Address</span>
      <span
        className="owner-profile-email-value min-w-0 max-w-[58%] text-right text-slate-200"
        title={value}
      >
        {canSplitAtDomain ? (
          <>
            {value.slice(0, at)}
            <wbr />
            {value.slice(at)}
          </>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

function OwnerProfileRow({
  label,
  value,
  valueClassName = 'text-slate-200',
  fullWrap = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  fullWrap?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm leading-snug">
      <span className="max-w-[42%] shrink-0 uppercase tracking-[0.12em] text-[#6B7A8F]">{label}</span>
      <span
        className={`${fullWrap ? 'owner-profile-address-value' : 'owner-profile-value'} min-w-0 max-w-[58%] text-right ${valueClassName}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function OwnerProfilePanel({ vehicle }: { vehicle: Vehicle }) {
  return (
    <div className="rounded-xl border border-[#00D9FF]/25 bg-[#0a1028]/95 p-5 shadow-[0_0_28px_rgba(0,217,255,0.14)] backdrop-blur-md">
      <p className="mb-4 flex items-center justify-center gap-2 text-sm uppercase tracking-[0.16em] text-[#00D9FF]">
        <span className="text-base" aria-hidden>
          👤
        </span>
        Owner Profile
      </p>
      <div className="space-y-3">
        <OwnerProfileRow label="Name" value={displayValue(vehicle.owner_name)} />
        <OwnerProfileRow label="Work" value={displayValue(vehicle.work)} />
        <OwnerProfileRow label="Contact Number" value={displayValue(vehicle.owner_contact)} />
        <OwnerProfileEmailRow value={displayValue(vehicle.owner_email)} />
        <OwnerProfileRow label="Residential Address" value={displayValue(vehicle.owner_address)} fullWrap />
        <OwnerProfileRow label="Driving License" value={displayValue(vehicle.driving_license)} />
      </div>
    </div>
  );
}

function VehicleInformationPanel({ vehicle }: { vehicle: Vehicle }) {
  const status = getVehicleStatus(vehicle);

  return (
    <div className="flex h-[24rem] w-[20rem] flex-col rounded-xl border border-[#00D9FF]/25 bg-[#0a1028]/95 p-5 shadow-[0_0_28px_rgba(0,217,255,0.14)] backdrop-blur-md">
      <p className="mb-4 flex shrink-0 items-center gap-2 text-sm uppercase tracking-[0.16em] text-[#00D9FF]">
        <span className="text-base" aria-hidden>
          🚗
        </span>
        Vehicle Information
      </p>
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
        <SatelliteRow size="md" label="Type" value={displayValue(vehicle.vehicle_type)} />
        <SatelliteRow size="md" label="Status" value={getStatusLabel(status)} valueClassName={statusTextClass[status]} />
        <SatelliteRow size="md" label="Colour" value={displayValue(vehicle.color)} />
        <SatelliteRow size="md" label="Model" value={displayValue(vehicle.model)} />
        <SatelliteRow size="md" label="Manufacturing Year" value={displayValue(vehicle.manufacturing_year)} />
        <SatelliteRow size="md" label="Modifications" value={displayValue(vehicle.modifications)} />
        <SatelliteRow size="md" label="Engine Number" value={displayValue(vehicle.engine_number)} />
        <SatelliteRow size="md" label="Chassis Number" value={displayValue(vehicle.chassis_number)} />
        <SatelliteRow size="md" label="Fuel Type" value={displayValue(vehicle.fuel_type)} />
        <SatelliteRow size="md" label="Insurance Status" value={displayValue(vehicle.insurance_status)} />
        <SatelliteRow size="md" label="Registration Date" value={formatRegistrationDate(vehicle.registration_date)} />
        <SatelliteRow size="md" label="Last Seen" value={formatRelativeLastSeen(vehicle.last_detected_timestamp)} />
      </div>
    </div>
  );
}

export default function VehicleNeuralShell({ children, vehicle, loading }: Props) {
  const isUnreadable = isUnreadablePlate(vehicle.plate_number);

  return (
    <div className="relative w-full overflow-visible" onClick={(event) => event.stopPropagation()}>
      {!loading && !isUnreadable && (
        <>
          <div className="owner-profile-satellite-anchor pointer-events-none absolute left-10 z-[2] hidden w-[20rem] lg:block">
            <div className="neural-satellite neural-satellite-tl">
              <OwnerProfilePanel vehicle={vehicle} />
            </div>
          </div>
          <div className="neural-satellite neural-satellite-br pointer-events-none absolute right-10 top-8 z-[2] hidden w-[20rem] lg:block">
            <VehicleInformationPanel vehicle={vehicle} />
          </div>
        </>
      )}
      <div className="relative z-10 mx-auto w-full max-w-lg">{children}</div>
    </div>
  );
}
