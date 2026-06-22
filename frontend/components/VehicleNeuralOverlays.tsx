import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Vehicle } from '@/types/vehicle';
import { displayValue } from '@/utils/detectionDisplay';
import { formatDate } from '@/utils/dateFormat';
import { formatRelativeLastSeen } from '@/utils/vehicleCardDisplay';
import { isUnreadablePlate } from '@/utils/dashboardDetections';
import { getStatusLabel, getVehicleStatus, statusTextClass } from '@/utils/vehicleStatus';
import { updateVehicle } from '@/services/api';

type EditableVehicleField =
  | 'owner_name'
  | 'work'
  | 'owner_contact'
  | 'owner_email'
  | 'owner_address'
  | 'driving_license'
  | 'vehicle_type'
  | 'color'
  | 'model'
  | 'manufacturing_year'
  | 'modifications'
  | 'engine_number'
  | 'chassis_number'
  | 'fuel_type'
  | 'insurance_status'
  | 'registration_date';

function formatRegistrationDate(value?: string | null): string {
  if (!value) return '--';
  const formatted = formatDate(value, '');
  return formatted || displayValue(value);
}

interface Props {
  children: React.ReactNode;
  vehicle: Vehicle;
  loading?: boolean;
  editing?: boolean;
  onVehicleUpdated?: (vehicle: Vehicle) => void;
}

function normalizeEditableValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '--') return null;
  return trimmed;
}

export function EditableValue({
  editing,
  display,
  multiline = false,
  clampLines = 2,
  onSave,
  className = 'text-slate-200',
}: {
  editing: boolean;
  display: string;
  multiline?: boolean;
  clampLines?: number;
  onSave: (next: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const isClampable = !multiline && clampLines !== undefined;

  useLayoutEffect(() => {
    if (!editing) {
      setExpanded(false);
    }
  }, [editing, display]);

  if (!editing) {
    return (
      <span className={className} title={display}>
        {display}
      </span>
    );
  }

  function commit() {
    const el = ref.current;
    if (!el) return;
    onSave(el.innerText);
  }

  function syncExpanded() {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el || !isClampable) return;

      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
      const clampedHeight = lineHeight * clampLines;
      const isExpanded = el.classList.contains('owner-profile-value-expanded');

      if (!isExpanded) {
        if (el.scrollHeight > el.clientHeight + 1) {
          setExpanded(true);
        }
        return;
      }

      if (el.scrollHeight <= clampedHeight + 1) {
        setExpanded(false);
      }
    });
  }

  const expandedClass = isClampable && expanded ? 'owner-profile-value-expanded' : '';

  return (
    <span
      ref={ref}
      role="textbox"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      className={`${className} owner-profile-editable cursor-text outline-none focus:outline focus:outline-1 focus:outline-[#00D9FF]/45 ${expandedClass}`}
      onBlur={commit}
      onInput={syncExpanded}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !multiline) {
          event.preventDefault();
          commit();
          (event.target as HTMLElement).blur();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          if (ref.current) ref.current.textContent = display === '--' ? '' : display;
          setExpanded(false);
          (event.target as HTMLElement).blur();
        }
      }}
    >
      {display === '--' ? '' : display}
    </span>
  );
}

function OwnerProfileEmailRow({
  value,
  editing,
  onSave,
}: {
  value: string;
  editing: boolean;
  onSave: (next: string) => void;
}) {
  const at = value.indexOf('@');
  const canSplitAtDomain = at > 0 && value !== '--' && !editing;

  return (
    <div className="flex items-start justify-between gap-3 text-sm leading-snug">
      <span className="max-w-[42%] shrink-0 uppercase tracking-[0.12em] text-[#6B7A8F]">Email Address</span>
      {editing ? (
        <EditableValue
          editing
          display={value}
          clampLines={undefined}
          onSave={onSave}
          className="owner-profile-email-value min-w-0 max-w-[58%] text-right text-slate-200"
        />
      ) : (
        <span className="owner-profile-email-value min-w-0 max-w-[58%] text-right text-slate-200" title={value}>
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
      )}
    </div>
  );
}

function OwnerProfileRow({
  label,
  value,
  valueClassName = 'text-slate-200',
  fullWrap = false,
  editing = false,
  onSave,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  fullWrap?: boolean;
  editing?: boolean;
  onSave?: (next: string) => void;
}) {
  const valueClass = fullWrap
    ? 'owner-profile-address-value min-w-0 max-w-[58%] text-right'
    : 'owner-profile-value min-w-0 max-w-[58%] text-right';

  return (
    <div className="flex items-start justify-between gap-3 text-sm leading-snug">
      <span className="max-w-[42%] shrink-0 uppercase tracking-[0.12em] text-[#6B7A8F]">{label}</span>
      {editing && onSave ? (
        <EditableValue
          editing
          display={value}
          multiline={fullWrap}
          clampLines={fullWrap ? undefined : 2}
          onSave={onSave}
          className={`${valueClass} ${valueClassName}`}
        />
      ) : (
        <span className={`${valueClass} ${valueClassName}`} title={value}>
          {value}
        </span>
      )}
    </div>
  );
}

function OwnerProfilePanel({
  vehicle,
  editing,
  onFieldSave,
}: {
  vehicle: Vehicle;
  editing: boolean;
  onFieldSave: (field: EditableVehicleField, raw: string) => void;
}) {
  const save =
    (field: EditableVehicleField) =>
    (raw: string) =>
      onFieldSave(field, raw);

  return (
    <div className="rounded-xl border border-[#00D9FF]/25 bg-[#0a1028]/95 p-5 shadow-[0_0_28px_rgba(0,217,255,0.14)] backdrop-blur-md">
      <p className="mb-4 flex items-center justify-center gap-2 text-sm uppercase tracking-[0.16em] text-[#00D9FF]">
        <span className="text-base" aria-hidden>
          👤
        </span>
        Owner Profile
      </p>
      <div className="space-y-3">
        <OwnerProfileRow
          label="Name"
          value={displayValue(vehicle.owner_name)}
          editing={editing}
          onSave={save('owner_name')}
        />
        <OwnerProfileRow label="Work" value={displayValue(vehicle.work)} editing={editing} onSave={save('work')} />
        <OwnerProfileRow
          label="Contact Number"
          value={displayValue(vehicle.owner_contact)}
          editing={editing}
          onSave={save('owner_contact')}
        />
        <OwnerProfileEmailRow
          value={displayValue(vehicle.owner_email)}
          editing={editing}
          onSave={save('owner_email')}
        />
        <OwnerProfileRow
          label="Residential Address"
          value={displayValue(vehicle.owner_address)}
          fullWrap
          editing={editing}
          onSave={save('owner_address')}
        />
        <OwnerProfileRow
          label="Driving License"
          value={displayValue(vehicle.driving_license)}
          editing={editing}
          onSave={save('driving_license')}
        />
      </div>
    </div>
  );
}

function VehicleInformationPanel({
  vehicle,
  editing,
  onFieldSave,
}: {
  vehicle: Vehicle;
  editing: boolean;
  onFieldSave: (field: EditableVehicleField, raw: string) => void;
}) {
  const status = getVehicleStatus(vehicle);
  const save =
    (field: EditableVehicleField) =>
    (raw: string) =>
      onFieldSave(field, raw);

  return (
    <div className="rounded-xl border border-[#00D9FF]/25 bg-[#0a1028]/95 p-5 shadow-[0_0_28px_rgba(0,217,255,0.14)] backdrop-blur-md">
      <p className="mb-4 flex items-center justify-center gap-2 text-sm uppercase tracking-[0.16em] text-[#00D9FF]">
        <span className="text-base" aria-hidden>
          🚗
        </span>
        Vehicle Information
      </p>
      <div className="space-y-3">
        <OwnerProfileRow
          label="Type"
          value={displayValue(vehicle.vehicle_type)}
          editing={editing}
          onSave={save('vehicle_type')}
        />
        <OwnerProfileRow
          label="Vehicle Status"
          value={getStatusLabel(status)}
          valueClassName={statusTextClass[status]}
        />
        <OwnerProfileRow
          label="Colour"
          value={displayValue(vehicle.color)}
          editing={editing}
          onSave={save('color')}
        />
        <OwnerProfileRow
          label="Model"
          value={displayValue(vehicle.model)}
          editing={editing}
          onSave={save('model')}
        />
        <OwnerProfileRow
          label="Manufacturing Year"
          value={displayValue(vehicle.manufacturing_year)}
          editing={editing}
          onSave={save('manufacturing_year')}
        />
        <OwnerProfileRow
          label="Modifications"
          value={displayValue(vehicle.modifications)}
          fullWrap
          editing={editing}
          onSave={save('modifications')}
        />
        <OwnerProfileRow
          label="Engine Number"
          value={displayValue(vehicle.engine_number)}
          editing={editing}
          onSave={save('engine_number')}
        />
        <OwnerProfileRow
          label="Chassis Number"
          value={displayValue(vehicle.chassis_number)}
          editing={editing}
          onSave={save('chassis_number')}
        />
        <OwnerProfileRow
          label="Fuel Type"
          value={displayValue(vehicle.fuel_type)}
          editing={editing}
          onSave={save('fuel_type')}
        />
        <OwnerProfileRow
          label="Insurance Status"
          value={displayValue(vehicle.insurance_status)}
          editing={editing}
          onSave={save('insurance_status')}
        />
        <OwnerProfileRow
          label="Registration Date"
          value={formatRegistrationDate(vehicle.registration_date)}
          editing={editing}
          onSave={save('registration_date')}
        />
        <OwnerProfileRow label="Last Seen" value={formatRelativeLastSeen(vehicle.last_detected_timestamp)} />
      </div>
    </div>
  );
}

export default function VehicleNeuralShell({
  children,
  vehicle,
  loading,
  editing = false,
  onVehicleUpdated,
}: Props) {
  const isUnreadable = isUnreadablePlate(vehicle.plate_number);
  const [localVehicle, setLocalVehicle] = useState(vehicle);

  useEffect(() => {
    setLocalVehicle(vehicle);
  }, [vehicle]);

  async function handleFieldSave(field: EditableVehicleField, raw: string) {
    const nextValue = normalizeEditableValue(raw);
    const currentValue = localVehicle[field] ?? null;
    const normalizedCurrent =
      currentValue === undefined || currentValue === null || currentValue === '' ? null : String(currentValue);

    if (nextValue === normalizedCurrent) return;

    try {
      const updated = await updateVehicle(localVehicle.id, { [field]: nextValue });
      const merged = { ...localVehicle, ...updated };
      setLocalVehicle(merged);
      onVehicleUpdated?.(merged);
    } catch {
      // keep previous value on failure
    }
  }

  const panelPointerClass = editing ? 'pointer-events-auto' : 'pointer-events-none';

  return (
    <div className="relative w-full overflow-visible" onClick={(event) => event.stopPropagation()}>
      {!loading && !isUnreadable && (
        <>
          <div className="owner-profile-satellite-anchor pointer-events-none absolute left-10 z-[2] hidden w-[20rem] lg:block">
            <div className={`neural-satellite neural-satellite-tl ${panelPointerClass}`}>
              <OwnerProfilePanel vehicle={localVehicle} editing={editing} onFieldSave={handleFieldSave} />
            </div>
          </div>
          <div className="vehicle-info-satellite-anchor pointer-events-none absolute right-10 z-[2] hidden w-[20rem] lg:block">
            <div className={`neural-satellite neural-satellite-br ${panelPointerClass}`}>
              <VehicleInformationPanel vehicle={localVehicle} editing={editing} onFieldSave={handleFieldSave} />
            </div>
          </div>
        </>
      )}
      <div className="relative z-10 mx-auto w-full max-w-lg">{children}</div>
    </div>
  );
}
