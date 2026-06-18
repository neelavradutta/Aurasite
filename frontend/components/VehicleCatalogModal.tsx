import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MarqueeText from '@/components/shared/MarqueeText';
import VehicleStatusBadge from '@/components/VehicleStatusBadge';
import VehicleNeuralShell from '@/components/VehicleNeuralOverlays';
import { Vehicle, VehicleDetectionSummary, VehicleStatus } from '@/types/vehicle';
import { getDetectionSnapshotUrl } from '@/services/api';
import {
  formatDetectionCount,
  getVehicleLocationHint,
  getVehicleTypeIcon,
} from '@/utils/vehicleCardDisplay';
import { isUnreadablePlate } from '@/utils/dashboardDetections';
import {
  getOtherStatuses,
  getStatusLabel,
  getVehicleStatus,
  statusFlagButtonClass,
  statusMenuToneClass,
  statusDotClass,
} from '@/utils/vehicleStatus';

/** Overlays 0.55s, then main card/stagger through ~1.27s */
const CLOSE_MS = 1320;
const HISTORY_NAV_MS = 680;

interface Props {
  vehicle: Vehicle | null;
  open: boolean;
  loading?: boolean;
  statusUpdating?: boolean;
  /** Skip close animation (e.g. when returning to dashboard). */
  instantClose?: boolean;
  onClose: () => void;
  onStatusChange?: (vehicle: Vehicle, status: VehicleStatus) => void;
  onExport?: (vehicle: Vehicle) => void;
  onViewHistory?: (vehicle: Vehicle) => void;
}

function formatTimelineTimestamp(value?: string | null): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TimelineItem({ item }: { item: VehicleDetectionSummary }) {
  return (
    <li className="relative py-1.5 pl-2.5">
      <span className="absolute -left-[calc(0.25rem+4px)] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#00D9FF] shadow-[0_0_8px_rgba(0,217,255,0.55)]" />
      <p className="text-xs text-slate-200">{formatTimelineTimestamp(item.detection_timestamp)}</p>
      <p className="truncate text-xs text-[#6B7A8F]">
        {item.video_source ? `Source: ${item.video_source}` : 'Detection recorded'}
      </p>
    </li>
  );
}

export default function VehicleCatalogModal({
  vehicle,
  open,
  loading = false,
  statusUpdating = false,
  instantClose = false,
  onClose,
  onStatusChange,
  onExport,
  onViewHistory,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [historyNavigating, setHistoryNavigating] = useState(false);
  const [displayVehicle, setDisplayVehicle] = useState<Vehicle | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const beginClose = useCallback(() => {
    if (isClosing || historyNavigating || !displayVehicle) return;

    if (instantClose) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsClosing(false);
      setDisplayVehicle(null);
      onClose();
      return;
    }

    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setDisplayVehicle(null);
      onClose();
    }, CLOSE_MS);
  }, [displayVehicle, instantClose, isClosing, historyNavigating, onClose]);

  const beginViewHistory = useCallback(() => {
    if (!displayVehicle || isClosing || historyNavigating || !onViewHistory) return;

    const vehicle = displayVehicle;
    setHistoryNavigating(true);
    onViewHistory(vehicle);

    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setHistoryNavigating(false);
      setDisplayVehicle(null);
      onClose();
    }, HISTORY_NAV_MS);
  }, [displayVehicle, historyNavigating, isClosing, onClose, onViewHistory]);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;

    if (open && vehicle) {
      if (isClosing && !justOpened) return;

      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsClosing(false);
      setDisplayVehicle(vehicle);
      return;
    }

    if (!open && displayVehicle && !isClosing && !historyNavigating) {
      beginClose();
    }
  }, [open, vehicle, displayVehicle, isClosing, historyNavigating, beginClose]);

  useEffect(() => {
    if (open && vehicle && !isClosing) {
      setDisplayVehicle(vehicle);
    }
  }, [vehicle, open, isClosing]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const isRendered = Boolean(displayVehicle) && (open || isClosing || historyNavigating);

  useEffect(() => {
    if (!isRendered) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isRendered]);

  const timeline = useMemo(() => {
    if (!displayVehicle?.detections?.length) return [];
    return [...displayVehicle.detections].sort((a, b) => {
      const left = new Date(a.detection_timestamp || 0).getTime();
      const right = new Date(b.detection_timestamp || 0).getTime();
      return right - left;
    });
  }, [displayVehicle?.detections]);

  if (!mounted || !isRendered) return null;

  const isUnreadable = isUnreadablePlate(displayVehicle.plate_number);
  const currentStatus = getVehicleStatus(displayVehicle);
  const otherStatuses = getOtherStatuses(currentStatus);
  const locationHint = getVehicleLocationHint(displayVehicle) || 'Camera GPS pending';
  const latestDetection = timeline[0];
  const snapshotUrl =
    latestDetection?.frame_image_path ? getDetectionSnapshotUrl(latestDetection.id) : null;

  return createPortal(
    <div
      className={`vehicle-modal-overlay fixed inset-0 z-[120] flex items-center justify-center bg-[#050816]/85 p-5 backdrop-blur-md${
        historyNavigating ? ' vehicle-modal-history-nav' : isClosing ? ' vehicle-modal-closing' : ''
      }`}
      onClick={historyNavigating ? undefined : beginClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vehicle-catalog-modal-title"
    >
      <VehicleNeuralShell vehicle={displayVehicle} loading={loading}>
      <div
        className="vehicle-modal-card flex h-[38rem] max-h-[88vh] w-full flex-col overflow-hidden rounded-xl border border-[#00D9FF]/30 bg-[#0a1028] shadow-[0_0_36px_rgba(0,217,255,0.1)]"
      >
        <div className="relative shrink-0 bg-gradient-to-r from-[#00D9FF]/12 via-[#0f173a]/80 to-[#d946ef]/10 px-5 pb-2 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="modal-stagger-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="vehicle-catalog-modal-title"
                  className="font-mono text-[2rem] font-bold leading-none tracking-wide text-[#00D9FF]"
                >
                  {displayVehicle.plate_number}
                </h2>
                {!isUnreadable && <VehicleStatusBadge vehicle={displayVehicle} />}
              </div>
              <p className="mt-1.5 flex items-center gap-2 text-sm text-[#A0B0C0]">
                <span aria-hidden>{getVehicleTypeIcon(displayVehicle.vehicle_type)}</span>
                <span aria-hidden>•</span>
                <span>{formatDetectionCount(displayVehicle.detection_count)}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                beginClose();
              }}
              className="vehicle-modal-close flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-red-500 text-2xl font-bold text-red-400 transition duration-300 hover:border-red-400 hover:bg-red-500/15 hover:text-red-300"
              aria-label="Close vehicle details"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 pb-3 pt-0">
          {loading ? (
            <div className="modal-stagger-2 flex h-28 items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20">
              <p className="text-sm text-slate-400">Loading vehicle details...</p>
            </div>
          ) : (
            <>
              <section className="modal-stagger-2 shrink-0">
                <p className="relative z-10 mb-2 text-xs uppercase tracking-[0.14em] text-[#6B7A8F]">Car Snapshot</p>
                <div className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
                  {snapshotUrl ? (
                    <img
                      src={snapshotUrl}
                      alt={`Car snapshot ${displayVehicle.plate_number}`}
                      className="h-44 w-full bg-black/40 object-cover object-bottom"
                    />
                  ) : (
                    <div className="flex h-44 items-center justify-center text-xs text-slate-500">
                      No snapshot available
                    </div>
                  )}
                </div>
              </section>

              <section className="modal-stagger-3 shrink-0">
                <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[#6B7A8F]">Recent Location</p>
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-4 py-2.5 text-xs text-[#A0B0C0]">
                  <span className="shrink-0 text-xs leading-none" aria-hidden>
                    📍
                  </span>
                  <MarqueeText text={locationHint} />
                </div>
              </section>

              <section className="modal-stagger-4 flex min-h-0 flex-1 flex-col">
                <p className="mb-2 shrink-0 text-xs uppercase tracking-[0.14em] text-[#6B7A8F]">Detection Timeline</p>
                <div
                  className={`min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/25 [scrollbar-color:rgba(0,217,255,0.45)_transparent] [scrollbar-width:thin]${isUnreadable ? ' flex flex-col' : ''}`}
                >
                  <div className={`px-4 py-2.5${isUnreadable ? ' flex min-h-full flex-1 flex-col' : ''}`}>
                    {timeline.length === 0 ? (
                      <p className="text-xs text-slate-500">No detection history available yet.</p>
                    ) : (
                      <ol
                        className={`relative py-1 pl-3.5 border-l ${
                          isUnreadable ? 'min-h-full flex-1 border-[#00D9FF]/50' : 'border-[#00D9FF]/20'
                        }`}
                      >
                        {timeline.slice(0, 8).map((item) => (
                          <TimelineItem key={item.id} item={item} />
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              </section>

              {displayVehicle.flagged_reason && currentStatus !== 'active' && (
                <div className="modal-stagger-4 shrink-0 rounded-lg border border-white/10 bg-black/25 px-4 py-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-[#6B7A8F]">Status Note</p>
                  <p className="mt-1 text-xs text-slate-200">{displayVehicle.flagged_reason}</p>
                </div>
              )}

              <div className="modal-stagger-5 flex shrink-0 flex-wrap gap-2.5">
                {!isUnreadable && (
                  <div className="vehicle-status-menu group relative">
                    <button
                      type="button"
                      disabled={statusUpdating}
                      className={`vehicle-modal-action vehicle-modal-action-flag flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm transition duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${statusFlagButtonClass[currentStatus]}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass[currentStatus]}`}
                        aria-hidden
                      />
                      {statusUpdating ? 'Updating...' : 'Flag Vehicle'}
                      <span className="text-sm leading-none" aria-hidden>
                        ▾
                      </span>
                    </button>
                    <div className="vehicle-status-dropdown pointer-events-none absolute bottom-full left-0 z-10 min-w-[10.5rem] pb-1 opacity-0 transition duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0a1028] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                      {otherStatuses.map((status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={statusUpdating}
                          onClick={() => onStatusChange?.(displayVehicle, status)}
                          className={`block w-full px-3 py-2 text-left text-sm transition ${statusMenuToneClass[status]} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          Mark as {getStatusLabel(status)}
                        </button>
                      ))}
                      </div>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onExport?.(displayVehicle)}
                  className="vehicle-modal-action rounded-md border border-[#00D9FF]/40 bg-[#00D9FF]/10 px-3.5 py-2 text-sm text-[#00D9FF] transition duration-300"
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    beginViewHistory();
                  }}
                  disabled={historyNavigating || statusUpdating}
                  className={`vehicle-modal-action vehicle-modal-action-history rounded-md border border-white/15 bg-white/5 px-3.5 py-2 text-sm text-slate-200 transition duration-300 hover:border-[#00D9FF]/40 hover:text-[#00D9FF] disabled:cursor-wait disabled:opacity-70${
                    historyNavigating ? ' vehicle-modal-action-history-active' : ''
                  }`}
                >
                  {historyNavigating ? 'Opening history...' : 'View History'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      </VehicleNeuralShell>
    </div>,
    document.body
  );
}
