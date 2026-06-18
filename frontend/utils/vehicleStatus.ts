import { Vehicle, VehicleStatus } from '@/types/vehicle';

export type { VehicleStatus };

export const VEHICLE_STATUSES: VehicleStatus[] = ['active', 'suspicious', 'invalid', 'accidental'];

const STATUS_LABELS: Record<VehicleStatus, string> = {
  active: 'Active',
  suspicious: 'Suspicious',
  invalid: 'Invalid',
  accidental: 'Accidental',
};

export function isVehicleStatus(value: string): value is VehicleStatus {
  return VEHICLE_STATUSES.includes(value as VehicleStatus);
}

export function getVehicleStatus(
  vehicle: Pick<Vehicle, 'status' | 'is_suspicious' | 'flagged_reason'>
): VehicleStatus {
  const normalized = String(vehicle.status ?? '').trim().toLowerCase();
  if (normalized && isVehicleStatus(normalized)) {
    return normalized;
  }

  if (Boolean(vehicle.is_suspicious)) {
    return 'suspicious';
  }

  const reason = (vehicle.flagged_reason ?? '').toLowerCase();
  if (reason.includes('accidental')) return 'accidental';
  if (reason.includes('invalid')) return 'invalid';
  if (reason.includes('suspicious')) return 'suspicious';

  return 'active';
}

export function getStatusLabel(status: VehicleStatus): string {
  return STATUS_LABELS[status];
}

export function getOtherStatuses(current: VehicleStatus): VehicleStatus[] {
  return VEHICLE_STATUSES.filter((status) => status !== current);
}

export function getStatusReason(status: VehicleStatus): string {
  if (status === 'active') {
    return '';
  }
  return `${getStatusLabel(status)} status set by Authority`;
}

export const statusAccentClass: Record<VehicleStatus, string> = {
  active: 'bg-cyber-green',
  suspicious: 'bg-red-500',
  invalid: 'bg-white/80',
  accidental: 'bg-yellow-400',
};

export const statusCardClass: Record<VehicleStatus, string> = {
  active: 'vehicle-catalog-card--active',
  suspicious: 'vehicle-catalog-card--suspicious',
  invalid: 'vehicle-catalog-card--invalid',
  accidental: 'vehicle-catalog-card--accidental',
};

export const statusCardMetaTextClass: Record<VehicleStatus, string> = {
  active: 'text-lime-50/90',
  suspicious: 'text-red-50/90',
  invalid: 'text-slate-100/85',
  accidental: 'text-yellow-50/90',
};

export const statusDotClass: Record<VehicleStatus, string> = {
  active: 'bg-cyber-green live-dot',
  suspicious: 'bg-red-500 live-dot',
  invalid: 'bg-white',
  accidental: 'bg-yellow-400',
};

export const statusHoverGlowClass: Record<VehicleStatus, string> = {
  active: 'hover:shadow-[0_0_28px_rgba(132,255,0,0.55)]',
  suspicious: 'hover:shadow-[0_0_28px_rgba(239,68,68,0.55)]',
  invalid: 'hover:shadow-[0_0_28px_rgba(255,255,255,0.28)]',
  accidental: 'hover:shadow-[0_0_28px_rgba(250,204,21,0.5)]',
};

export const statusBadgeTone: Record<VehicleStatus, 'green' | 'red' | 'white' | 'yellow'> = {
  active: 'green',
  suspicious: 'red',
  invalid: 'white',
  accidental: 'yellow',
};

export const statusMenuToneClass: Record<VehicleStatus, string> = {
  active: 'text-cyber-green hover:bg-cyber-green/10',
  suspicious: 'text-red-500 hover:bg-red-500/10',
  invalid: 'text-white hover:bg-white/10',
  accidental: 'text-yellow-400 hover:bg-yellow-400/10',
};

export const statusTextClass: Record<VehicleStatus, string> = {
  active: 'text-cyber-green',
  suspicious: 'text-red-500',
  invalid: 'text-white',
  accidental: 'text-yellow-400',
};

export const statusFlagButtonClass: Record<VehicleStatus, string> = {
  active:
    'border-cyber-green/45 bg-cyber-green/10 text-cyber-green hover:border-cyber-green/70 hover:bg-cyber-green/15 hover:shadow-[0_0_14px_rgba(132,255,0,0.22)]',
  suspicious:
    'border-red-500/45 bg-red-500/10 text-red-400 hover:border-red-500/70 hover:bg-red-500/15 hover:shadow-[0_0_14px_rgba(239,68,68,0.22)]',
  invalid:
    'border-white/30 bg-white/8 text-slate-100 hover:border-white/50 hover:bg-white/12 hover:shadow-[0_0_14px_rgba(255,255,255,0.12)]',
  accidental:
    'border-yellow-400/45 bg-yellow-400/10 text-yellow-400 hover:border-yellow-400/70 hover:bg-yellow-400/15 hover:shadow-[0_0_14px_rgba(250,204,21,0.22)]',
};
