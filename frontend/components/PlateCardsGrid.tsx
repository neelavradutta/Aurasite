import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Detection } from '@/types/detection';
import { Vehicle, VehicleStatus } from '@/types/vehicle';
import { useDashboardStore } from '@/store/dashboardStore';
import { LicensePlatePanelIcon } from '@/components/NavIcons';
import PanelIconHeader from '@/components/shared/PanelIconHeader';
import {
  fetchVehicleById,
  searchVehiclesByPlate,
  updateVehicleStatus,
} from '@/services/api';
import { normalizePlateKey } from '@/utils/dashboardDetections';
import { downloadVehicleReportPdf } from '@/utils/vehicleReportPdf';
import { getHistoryPlate } from '@/utils/vehicleCardDisplay';
import { getStatusReason } from '@/utils/vehicleStatus';
import {
  parseVehicleModalRestoreQuery,
  stampVehicleModalReturnUrl,
  stripVehicleModalRestoreQuery,
} from '@/utils/vehicleModalReturn';
import DetectionSnapshotImage from './DetectionSnapshotImage';
import PlateSnapshotModal from './PlateSnapshotModal';
import VehicleCatalogModal from './VehicleCatalogModal';

export const DETECTED_LICENSE_PLATES_ANCHOR = 'detected-license-plates';

interface Props {
  detections: Detection[];
  fillHeight?: boolean;
  showHeader?: boolean;
  emptyMessage?: string;
  /** Dashboard: single-click selects, double-click previews; header actions appear on select. */
  selectToPreview?: boolean;
  className?: string;
}

async function resolveVehicleForDetection(detection: Detection): Promise<Vehicle | null> {
  if (detection.vehicle_id) {
    try {
      return await fetchVehicleById(detection.vehicle_id);
    } catch {
      // fall through to plate search
    }
  }

  try {
    const results = await searchVehiclesByPlate(detection.plate_number);
    const normalized = normalizePlateKey(detection.plate_number);
    return (
      results.find((item) => normalizePlateKey(item.plate_number) === normalized) ||
      results[0] ||
      null
    );
  } catch {
    return null;
  }
}

export default function PlateCardsGrid({
  detections,
  fillHeight = false,
  showHeader = true,
  emptyMessage = 'No plates detected yet. Start live feed to begin.',
  selectToPreview = false,
  className = '',
}: Props) {
  const router = useRouter();
  const { setSelectedPlate, selectedPlate } = useDashboardStore();
  const [previewDetection, setPreviewDetection] = useState<Detection | null>(null);
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);
  const [modalVehicle, setModalVehicle] = useState<Vehicle | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [restoreInstantClose, setRestoreInstantClose] = useState(false);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const deselectTimerRef = useRef<number | null>(null);
  const restoredReturnRef = useRef(false);
  const visibleDetections = detections;
  const hasSelection = selectToPreview && Boolean(selectedPlate);
  const vehicleDetailsOpen = Boolean(detailVehicle);

  useEffect(() => {
    if (!selectToPreview || !selectedPlate || previewDetection || vehicleDetailsOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('[data-plate-card]')) return;
      if (target.closest('[data-plate-header-actions]')) return;
      if (target.closest('.vehicle-modal-overlay')) return;
      if (target.closest('[data-plate-snapshot-modal]')) return;
      clearDeselectTimer();
      setSelectedPlate(null);
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [selectToPreview, selectedPlate, previewDetection, vehicleDetailsOpen, setSelectedPlate]);

  useEffect(() => {
    return () => {
      if (deselectTimerRef.current !== null) {
        window.clearTimeout(deselectTimerRef.current);
      }
    };
  }, []);

  function clearDeselectTimer() {
    if (deselectTimerRef.current !== null) {
      window.clearTimeout(deselectTimerRef.current);
      deselectTimerRef.current = null;
    }
  }

  useEffect(() => {
    const container = gridScrollRef.current;
    if (!container) return;

    function handleWheel(event: WheelEvent) {
      const el = gridScrollRef.current;
      if (!el) return;

      const maxScroll = el.scrollHeight - el.clientHeight;

      if (maxScroll <= 1) {
        event.preventDefault();
        window.scrollBy(0, event.deltaY);
        return;
      }

      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

      if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
        event.preventDefault();
        window.scrollBy(0, event.deltaY);
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [visibleDetections.length]);

  useEffect(() => {
    if (!router.isReady || router.pathname !== '/dashboard') {
      restoredReturnRef.current = false;
      return;
    }

    const pending = parseVehicleModalRestoreQuery(router.query);
    if (!pending || restoredReturnRef.current) return;

    restoredReturnRef.current = true;
    setRestoreInstantClose(true);

    const cleanQuery = stripVehicleModalRestoreQuery(router.query);
    void router.replace({ pathname: '/dashboard', query: cleanQuery }, undefined, { shallow: true });

    void (async () => {
      setLoadingDetail(true);
      try {
        const detail = await fetchVehicleById(pending.vehicleId);
        setDetailVehicle(detail);
        setModalVehicle(detail);

        let restoredSelection = false;
        if (pending.selectedDetectionId) {
          const detection = detections.find((item) => item.id === pending.selectedDetectionId);
          if (detection) {
            setSelectedPlate(detection);
            restoredSelection = true;
          }
        }
        if (!restoredSelection && pending.plateNumber) {
          const normalized = normalizePlateKey(pending.plateNumber);
          const byPlate = detections.find((item) => normalizePlateKey(item.plate_number) === normalized);
          if (byPlate) {
            setSelectedPlate(byPlate);
          }
        }
      } finally {
        setLoadingDetail(false);
      }

      window.requestAnimationFrame(() => {
        window.scrollTo({ top: pending.scrollY, left: 0, behavior: 'auto' });
      });
    })();
  }, [router, router.isReady, router.pathname, router.query, detections, setSelectedPlate]);

  function handleCardClick(detection: Detection) {
    if (selectToPreview && selectedPlate?.id === detection.id) {
      // Delay deselect so a double-click can open preview without flashing header actions closed.
      clearDeselectTimer();
      deselectTimerRef.current = window.setTimeout(() => {
        setSelectedPlate(null);
        deselectTimerRef.current = null;
      }, 280);
      return;
    }

    clearDeselectTimer();
    setSelectedPlate(detection);
    if (!selectToPreview) {
      setPreviewDetection(detection);
    }
  }

  function handleCardDoubleClick(detection: Detection) {
    clearDeselectTimer();
    setSelectedPlate(detection);
    setPreviewDetection(detection);
  }

  function handlePreviewButtonClick() {
    if (selectedPlate) {
      setPreviewDetection(selectedPlate);
    }
  }

  async function handleDetailsButtonClick() {
    if (!selectedPlate || loadingDetail) return;

    setLoadingDetail(true);

    try {
      const vehicle = await resolveVehicleForDetection(selectedPlate);
      if (!vehicle) return;

      setDetailVehicle(vehicle);
      setModalVehicle(vehicle);

      const detail = await fetchVehicleById(vehicle.id);
      setModalVehicle(detail);
      setDetailVehicle(detail);
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeVehicleDetails() {
    setDetailVehicle(null);
    setModalVehicle(null);
    setLoadingDetail(false);
    setStatusUpdating(false);
    setRestoreInstantClose(false);
  }

  async function handleStatusChange(vehicle: Vehicle, status: VehicleStatus) {
    setStatusUpdating(true);
    try {
      await updateVehicleStatus(vehicle.id, status, getStatusReason(status));
      const detail = await fetchVehicleById(vehicle.id);
      setModalVehicle(detail);
      setDetailVehicle(detail);
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleVehicleUpdated(vehicle: Vehicle) {
    setModalVehicle(vehicle);
    setDetailVehicle(vehicle);
  }

  async function handleExport(vehicle: Vehicle) {
    try {
      const detail = vehicle.detections?.length ? vehicle : await fetchVehicleById(vehicle.id);
      await downloadVehicleReportPdf(detail);
    } catch {
      await downloadVehicleReportPdf(vehicle);
    }
  }

  function handleViewHistory(vehicle: Vehicle) {
    stampVehicleModalReturnUrl(vehicle, {
      scrollY: window.scrollY,
      selectedDetectionId: selectedPlate?.id ?? null,
    });

    void router.push({
      pathname: '/detections',
      query: { plate: getHistoryPlate(vehicle) },
    });
  }

  function handleSnapshotModalClose() {
    setPreviewDetection(null);
  }

  return (
    <section
      id={selectToPreview ? DETECTED_LICENSE_PLATES_ANCHOR : undefined}
      className={`detected-plates-section glass-panel relative flex flex-col overflow-hidden rounded-xl border border-white/5 p-5 ${
        fillHeight ? 'h-full max-h-full min-h-0' : ''
      } ${selectToPreview ? 'scroll-mt-24' : ''} ${className}`.trim()}
    >
      {showHeader ? (
        <div className="shrink-0">
          {selectToPreview ? (
            <div
              data-plate-header-actions
              className={`plate-header-actions ${
                hasSelection ? 'plate-header-actions--open' : 'plate-header-actions--idle'
              }`}
            >
              <span className="plate-header-vehicles-badge rounded-full border border-cyber-cyan/30 bg-cyber-cyan/10 px-4 py-1.5 text-xs text-cyber-cyan">
                {detections.length} vehicles
              </span>
              <div className="plate-header-action-slot plate-header-details-slot" aria-hidden={!hasSelection}>
                <button
                  type="button"
                  onClick={() => void handleDetailsButtonClick()}
                  disabled={!selectedPlate || loadingDetail}
                  className="plate-header-action-btn whitespace-nowrap rounded-full border border-white/50 bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:border-white hover:bg-white/25 disabled:pointer-events-none disabled:opacity-60"
                  tabIndex={hasSelection ? 0 : -1}
                >
                  {loadingDetail ? 'Loading...' : 'Details'}
                </button>
              </div>
              <div className="plate-header-action-slot plate-header-preview-slot" aria-hidden={!hasSelection}>
                <button
                  type="button"
                  onClick={handlePreviewButtonClick}
                  disabled={!selectedPlate}
                  className="plate-header-action-btn plate-header-preview-btn whitespace-nowrap rounded-full border border-red-500/60 bg-red-500/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-400 transition-colors hover:border-red-400 hover:bg-red-500/30 hover:text-red-300 disabled:pointer-events-none"
                  tabIndex={hasSelection ? 0 : -1}
                >
                  Preview
                </button>
              </div>
            </div>
          ) : null}

          <div className="mb-5 flex items-center justify-between gap-3">
            <PanelIconHeader
              icon={<LicensePlatePanelIcon />}
              title="Detected License Plates"
              subtitle={
                !selectToPreview
                  ? 'Click any plate card to preview the snapshot and download it.'
                  : undefined
              }
              className="!mb-0 min-w-0 flex-1"
            />

            {!selectToPreview ? (
              <span className="rounded-full border border-cyber-cyan/30 bg-cyber-cyan/10 px-4 py-1.5 text-xs text-cyber-cyan">
                {detections.length} vehicles
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {visibleDetections.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 px-4">
          <p className="text-center text-sm text-slate-500">{emptyMessage}</p>
        </div>
      ) : (
        <div
          ref={gridScrollRef}
          data-plate-grid-scroll
          className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-3 pt-3 [scrollbar-color:rgba(0,247,255,0.45)_transparent] [scrollbar-width:thin] ${
            fillHeight ? 'max-h-full' : 'max-h-[520px]'
          }`}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visibleDetections.map((detection) => {
              const isSelected = selectedPlate?.id === detection.id;
              const hasSnapshot = Boolean(detection.frame_image_path);

              return (
                <div
                  key={detection.id}
                  className={`plate-card-ring rounded-2xl${isSelected ? ' plate-card-ring--selected' : ''}`}
                >
                  <button
                    type="button"
                    data-plate-card
                    data-plate-id={detection.id}
                    onClick={() => handleCardClick(detection)}
                    onDoubleClick={() => handleCardDoubleClick(detection)}
                    className="relative z-[1] w-full overflow-hidden rounded-2xl bg-teal-700 p-3 text-left shadow-lg transition hover:brightness-110"
                    title={
                      selectToPreview
                        ? 'Single-click to select, double-click to preview snapshot'
                        : 'Preview snapshot and update selected plate'
                    }
                  >
                    <p className="w-full text-center font-orbitron text-base font-bold tracking-wide text-white">
                      {detection.plate_number || 'UNREADABLE'}
                    </p>

                    <div className="mt-3 overflow-hidden rounded-xl border-2 border-electric-cyan/50 bg-teal-900/35">
                      {hasSnapshot ? (
                        <DetectionSnapshotImage
                          detectionId={detection.id}
                          plateNumber={detection.plate_number}
                          className="aspect-[4/3] w-full bg-teal-900/50 object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[4/3] w-full items-center justify-center bg-teal-800/55 px-3 text-center text-[11px] uppercase tracking-wide text-white/70">
                          No snapshot
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PlateSnapshotModal
        detection={previewDetection}
        open={Boolean(previewDetection)}
        onClose={handleSnapshotModalClose}
      />

      <VehicleCatalogModal
        vehicle={modalVehicle || detailVehicle}
        open={vehicleDetailsOpen}
        loading={loadingDetail}
        statusUpdating={statusUpdating}
        instantClose={restoreInstantClose}
        onClose={closeVehicleDetails}
        onStatusChange={handleStatusChange}
        onExport={handleExport}
        onViewHistory={handleViewHistory}
        onVehicleUpdated={handleVehicleUpdated}
      />
    </section>
  );
}
