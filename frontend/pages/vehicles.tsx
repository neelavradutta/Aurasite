import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Header from '@/components/Header';
import PageTitle from '@/components/shared/PageTitle';
import Button from '@/components/shared/Button';
import VehicleCatalogCard from '@/components/VehicleCatalogCard';
import VehicleCatalogModal from '@/components/VehicleCatalogModal';
import {
  fetchVehicleById,
  fetchVehicles,
  searchVehiclesByPlate,
  updateVehicleStatus,
  downloadFile,
  getExportVehiclesUrl,
} from '@/services/api';
import { Vehicle, VehicleStatus } from '@/types/vehicle';
import { downloadVehicleReportPdf } from '@/utils/vehicleReportPdf';
import { getHistoryPlate } from '@/utils/vehicleCardDisplay';
import { getStatusReason } from '@/utils/vehicleStatus';
import { useDashboardStore } from '@/store/dashboardStore';
import { normalizePlateKey } from '@/utils/dashboardDetections';
import { getSocket } from '@/services/socket';
import { VehicleRealtimeUpdate } from '@/utils/violationUpdates';
import {
  loadVehiclesPageCache,
  persistVehiclesPageCache,
} from '@/services/sessionPersistence';
import {
  parseVehicleModalRestoreQuery,
  stampVehicleModalReturnUrl,
  stripVehicleModalRestoreQuery,
} from '@/utils/vehicleModalReturn';

export default function VehiclesPage() {
  const router = useRouter();
  const sessionVersion = useDashboardStore((state) => state.sessionVersion);
  const syncVehicleUpdate = useDashboardStore((state) => state.patchVehicleUpdates);
  const [pageHydrated, setPageHydrated] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [modalVehicle, setModalVehicle] = useState<Vehicle | null>(null);
  const [highlightedVehicleId, setHighlightedVehicleId] = useState<number | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [exportingCatalog, setExportingCatalog] = useState(false);
  const [restoreInstantClose, setRestoreInstantClose] = useState(false);
  const openedQueryKeyRef = useRef<string | null>(null);
  const restoredReturnRef = useRef(false);

  async function loadVehicles() {
    const res = await fetchVehicles({ limit: 100 });
    const rows = res.data || [];
    setVehicles(rows);
    persistVehiclesPageCache(rows);
  }

  useEffect(() => {
    const cache = loadVehiclesPageCache<Vehicle>();
    if (cache) {
      setVehicles(cache);
    }
    setPageHydrated(true);
  }, []);

  useEffect(() => {
    if (!pageHydrated) return;
    loadVehicles();
  }, [sessionVersion, pageHydrated]);

  useEffect(() => {
    const socket = getSocket();

    const handleVehicleUpdated = (update: VehicleRealtimeUpdate) => {
      if (!update?.vehicle_id) return;

      setVehicles((prev) =>
        prev.map((item) =>
          item.id === update.vehicle_id
            ? {
                ...item,
                ...(update.status !== undefined ? { status: update.status } : {}),
                ...(update.is_suspicious !== undefined ? { is_suspicious: update.is_suspicious } : {}),
                ...(update.flagged_reason !== undefined ? { flagged_reason: update.flagged_reason } : {}),
                ...(update.violation_count !== undefined ? { violation_count: update.violation_count } : {}),
              }
            : item
        )
      );

      setModalVehicle((prev) =>
        prev?.id === update.vehicle_id
          ? {
              ...prev,
              ...(update.status !== undefined ? { status: update.status } : {}),
              ...(update.is_suspicious !== undefined ? { is_suspicious: update.is_suspicious } : {}),
              ...(update.flagged_reason !== undefined ? { flagged_reason: update.flagged_reason } : {}),
              ...(update.violation_count !== undefined ? { violation_count: update.violation_count } : {}),
            }
          : prev
      );

      syncVehicleUpdate(update);
    };

    socket.on('vehicle:updated', handleVehicleUpdated);
    return () => {
      socket.off('vehicle:updated', handleVehicleUpdated);
    };
  }, [syncVehicleUpdate]);

  async function openVehicle(vehicle: Vehicle, highlight = true) {
    setSelectedVehicle(vehicle);
    setModalVehicle(vehicle);
    if (highlight) {
      setHighlightedVehicleId(vehicle.id);
    }
    setLoadingDetail(true);

    try {
      const detail = await fetchVehicleById(vehicle.id);
      setModalVehicle(detail);
    } catch {
      setModalVehicle(vehicle);
    } finally {
      setLoadingDetail(false);
    }

    if (highlight) {
      window.requestAnimationFrame(() => {
        document
          .getElementById(`vehicle-card-${vehicle.id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  async function handleCardClick(vehicle: Vehicle) {
    await openVehicle(vehicle);
  }

  useEffect(() => {
    if (!router.isReady) return;

    const plate = typeof router.query.plate === 'string' ? router.query.plate : '';
    const id = typeof router.query.id === 'string' ? router.query.id : '';
    const queryKey = `${plate}|${id}`;
    if (!plate && !id) {
      openedQueryKeyRef.current = null;
      return;
    }
    if (openedQueryKeyRef.current === queryKey) return;
    openedQueryKeyRef.current = queryKey;

    async function openFromQuery() {
      let vehicle: Vehicle | null = null;

      if (id) {
        try {
          vehicle = await fetchVehicleById(Number(id));
        } catch {
          vehicle = null;
        }
      }

      if (!vehicle && plate) {
        const normalized = normalizePlateKey(plate);
        const localMatch = vehicles.find((item) => normalizePlateKey(item.plate_number) === normalized);
        if (localMatch) {
          vehicle = localMatch;
        } else {
          try {
            const results = await searchVehiclesByPlate(plate);
            vehicle =
              results.find((item) => normalizePlateKey(item.plate_number) === normalized) ||
              results[0] ||
              null;
          } catch {
            vehicle = null;
          }
        }
      }

      if (!vehicle) return;

      setVehicles((prev) => {
        if (prev.some((item) => item.id === vehicle!.id)) return prev;
        return [vehicle!, ...prev];
      });

      await openVehicle(vehicle);
    }

    void openFromQuery();
  }, [router.isReady, router.query.plate, router.query.id]);

  useEffect(() => {
    if (!router.isReady || router.pathname !== '/vehicles' || !pageHydrated) {
      restoredReturnRef.current = false;
      return;
    }

    const pending = parseVehicleModalRestoreQuery(router.query);
    if (!pending || restoredReturnRef.current) return;

    restoredReturnRef.current = true;
    setRestoreInstantClose(true);

    const cleanQuery = stripVehicleModalRestoreQuery(router.query);
    void router.replace({ pathname: '/vehicles', query: cleanQuery }, undefined, { shallow: true });

    void (async () => {
      setLoadingDetail(true);
      try {
        const detail = await fetchVehicleById(pending.vehicleId);
        setSelectedVehicle(detail);
        setModalVehicle(detail);
        setHighlightedVehicleId(detail.id);
      } catch {
        restoredReturnRef.current = false;
        setRestoreInstantClose(false);
      } finally {
        setLoadingDetail(false);
      }

      window.requestAnimationFrame(() => {
        window.scrollTo({ top: pending.scrollY, left: 0, behavior: 'auto' });
      });
    })();
  }, [router, router.isReady, router.pathname, router.query, pageHydrated]);

  function closeModal() {
    setSelectedVehicle(null);
    setModalVehicle(null);
    setHighlightedVehicleId(null);
    setLoadingDetail(false);
    setStatusUpdating(false);
    setRestoreInstantClose(false);
  }

  async function handleStatusChange(vehicle: Vehicle, status: VehicleStatus) {
    setStatusUpdating(true);
    try {
      const updated = await updateVehicleStatus(vehicle.id, status, getStatusReason(status));
      setVehicles((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      const detail = await fetchVehicleById(vehicle.id);
      setModalVehicle(detail);
      await loadVehicles();
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleExportCatalog() {
    if (exportingCatalog) return;
    setExportingCatalog(true);
    try {
      await downloadFile(getExportVehiclesUrl(), 'vehicle-catalog.xlsx');
    } catch {
      window.alert('Failed to export vehicle catalog.');
    } finally {
      setExportingCatalog(false);
    }
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
    stampVehicleModalReturnUrl(vehicle, { scrollY: window.scrollY });

    void router.push({
      pathname: '/detections',
      query: { plate: getHistoryPlate(vehicle) },
    });
  }

  function handleVehicleUpdated(vehicle: Vehicle) {
    setModalVehicle(vehicle);
    setVehicles((prev) => prev.map((item) => (item.id === vehicle.id ? { ...item, ...vehicle } : item)));
  }

  return (
    <div className="min-h-screen">
      <Header
        vehiclesToolbar={
          <Button
            variant="secondary"
            onClick={handleExportCatalog}
            disabled={exportingCatalog}
            className="inline-flex h-9 shrink-0 items-center justify-center px-3 py-0"
          >
            {exportingCatalog ? 'Exporting...' : 'Export Vehicles Report'}
          </Button>
        }
      />
      <main className="mx-auto max-w-[1920px] space-y-6 px-6 py-6">
        <PageTitle title="Vehicle Catalog" subtitle="Registered vehicles from detection history" />
        {vehicles.length === 0 ? (
          <div className="glass-panel flex h-40 items-center justify-center rounded-xl border border-dashed border-white/10">
            <p className="text-sm text-slate-500">No vehicles registered yet. Upload a video to begin.</p>
          </div>
        ) : (
          <div className="grid gap-4 overflow-visible md:grid-cols-2 xl:grid-cols-3">
            {vehicles.map((vehicle) => (
              <VehicleCatalogCard
                key={vehicle.id}
                vehicle={vehicle}
                highlighted={highlightedVehicleId === vehicle.id}
                onClick={handleCardClick}
              />
            ))}
          </div>
        )}
      </main>

      <VehicleCatalogModal
        vehicle={modalVehicle || selectedVehicle}
        open={Boolean(selectedVehicle)}
        loading={loadingDetail}
        statusUpdating={statusUpdating}
        instantClose={restoreInstantClose}
        onClose={closeModal}
        onStatusChange={handleStatusChange}
        onExport={handleExport}
        onViewHistory={handleViewHistory}
        onVehicleUpdated={handleVehicleUpdated}
      />
    </div>
  );
}
