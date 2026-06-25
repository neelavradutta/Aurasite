import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Header from '@/components/Header';
import PageTitle from '@/components/shared/PageTitle';
import DetectionLogTable from '@/components/DetectionLogTable';
import DetectionFilterBar from '@/components/DetectionFilterBar';
import Button from '@/components/shared/Button';
import { deleteDetection, fetchDetections, formatApiError } from '@/services/api';
import { getSocket } from '@/services/socket';
import { Detection } from '@/types/detection';
import { downloadDetectionsCsv } from '@/utils/detectionExport';
import { filterDetectionsByQuery } from '@/utils/detectionDisplay';
import {
  applyDetectionListOptions,
  DEFAULT_DETECTION_FILTERS,
  DEFAULT_DETECTION_SORT,
  DetectionListFilters,
  DetectionSortOption,
} from '@/utils/detectionFilters';
import {
  patchViolationCounts,
  patchVehicleUpdates as applyVehicleUpdatesToDetections,
  VehicleRealtimeUpdate,
  ViolationUpdate,
} from '@/utils/violationUpdates';
import { useDashboardStore } from '@/store/dashboardStore';
import {
  loadDetectionsPageCache,
  persistDetectionsPageCache,
} from '@/services/sessionPersistence';

export default function DetectionsPage() {
  const router = useRouter();
  const sessionVersion = useDashboardStore((state) => state.sessionVersion);
  const detectionsVersion = useDashboardStore((state) => state.detectionsVersion);
  const bumpDetectionsVersion = useDashboardStore((state) => state.bumpDetectionsVersion);
  const patchVehicleViolations = useDashboardStore((state) => state.patchVehicleViolations);
  const syncVehicleUpdate = useDashboardStore((state) => state.patchVehicleUpdates);
  const setSelectedPlate = useDashboardStore((state) => state.setSelectedPlate);
  const [pageHydrated, setPageHydrated] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<DetectionSortOption>(DEFAULT_DETECTION_SORT);
  const [listFilters, setListFilters] = useState<DetectionListFilters>(DEFAULT_DETECTION_FILTERS);
  const [selectedDetections, setSelectedDetections] = useState<Detection[]>([]);
  const [exitingDetectionIds, setExitingDetectionIds] = useState<number[]>([]);
  const [removing, setRemoving] = useState(false);
  const pendingDeleteIdsRef = useRef<Set<number>>(new Set());
  const suppressDetectionsRefreshUntilRef = useRef(0);

  const plateFromQuery = useMemo(() => {
    if (!router.isReady) return '';
    const plate = router.query.plate;
    return typeof plate === 'string' ? plate.trim() : '';
  }, [router.isReady, router.query.plate]);

  const highlightFromQuery = useMemo(() => {
    if (!router.isReady) return '';
    const highlight = router.query.highlight;
    return typeof highlight === 'string' ? highlight.trim() : '';
  }, [router.isReady, router.query.highlight]);

  const highlightIdFromQuery = useMemo(() => {
    if (!router.isReady) return null;
    const id = router.query.id;
    if (typeof id !== 'string' || !id.trim()) return null;
    const parsed = Number(id);
    return Number.isFinite(parsed) ? parsed : null;
  }, [router.isReady, router.query.id]);

  const filterPlate = highlightFromQuery ? '' : plateFromQuery;

  useEffect(() => {
    const cache = loadDetectionsPageCache();
    if (cache) {
      setDetections(cache.detections);
      setTotalCount(cache.totalCount);
      setSearchQuery(cache.searchQuery);
      setSortOption(cache.sortOption ?? DEFAULT_DETECTION_SORT);
      setListFilters(cache.listFilters ?? DEFAULT_DETECTION_FILTERS);
      setLoading(false);
    }
    setPageHydrated(true);
  }, []);

  useEffect(() => {
    setSearchQuery(filterPlate);
  }, [filterPlate]);

  useEffect(() => {
    if (!pageHydrated || loading) return;
    persistDetectionsPageCache({ detections, totalCount, searchQuery, sortOption, listFilters });
  }, [detections, totalCount, searchQuery, sortOption, listFilters, loading, pageHydrated]);

  useEffect(() => {
    if (!pageHydrated || !router.isReady) return;
    if (Date.now() < suppressDetectionsRefreshUntilRef.current) return;

    let cancelled = false;
    const showLoading = detections.length === 0;
    if (showLoading) setLoading(true);

    const params: {
      limit: number;
      plate?: string;
    } = {
      limit: filterPlate || highlightFromQuery ? 10000 : 100,
    };
    if (filterPlate) {
      params.plate = filterPlate;
    }

    fetchDetections(params)
      .then((res) => {
        if (cancelled) return;
        setDetections(res.data || []);
        setTotalCount(res.pagination?.total ?? res.data?.length ?? 0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pageHydrated, sessionVersion, detectionsVersion, router.isReady, filterPlate, highlightFromQuery]);

  useEffect(() => {
    const socket = getSocket();

    const handleViolationsUpdated = (payload: { updates?: ViolationUpdate[] }) => {
      const updates = payload?.updates || [];
      if (updates.length === 0) return;
      setDetections((current) => patchViolationCounts(current, updates));
      patchVehicleViolations(
        updates.map((update) => ({
          vehicle_id: update.vehicle_id,
          violation_count: update.violation_count,
        }))
      );
    };

    const handleVehicleUpdated = (update: VehicleRealtimeUpdate) => {
      if (!update?.vehicle_id) return;
      setDetections((current) => applyVehicleUpdatesToDetections(current, [update]));
      syncVehicleUpdate(update);
    };

    const handleDetectionsChanged = () => {
      if (Date.now() < suppressDetectionsRefreshUntilRef.current) return;
      bumpDetectionsVersion();
    };

    socket.on('violations:updated', handleViolationsUpdated);
    socket.on('vehicle:updated', handleVehicleUpdated);
    socket.on('detections:changed', handleDetectionsChanged);

    return () => {
      socket.off('violations:updated', handleViolationsUpdated);
      socket.off('vehicle:updated', handleVehicleUpdated);
      socket.off('detections:changed', handleDetectionsChanged);
    };
  }, [bumpDetectionsVersion, patchVehicleViolations, syncVehicleUpdate]);

  const filteredDetections = useMemo(
    () => applyDetectionListOptions(detections, searchQuery, sortOption, listFilters),
    [detections, searchQuery, sortOption, listFilters]
  );

  async function handleExportCsv() {
    const res = await fetchDetections({
      limit: 10000,
      ...(searchQuery.trim() ? { plate: searchQuery.trim() } : {}),
    });
    const rows = applyDetectionListOptions(res.data || [], searchQuery, sortOption, listFilters);
    downloadDetectionsCsv(rows, 'detections.csv');
  }

  async function handleRemoveSelected() {
    if (selectedDetections.length === 0 || removing || exitingDetectionIds.length > 0) return;

    const ids = selectedDetections.map((detection) => detection.id);
    pendingDeleteIdsRef.current = new Set(ids);
    setExitingDetectionIds(ids);
    setRemoving(true);
  }

  async function handleRemoveAnimationEnd(detectionId: number) {
    if (!pendingDeleteIdsRef.current.has(detectionId)) return;

    pendingDeleteIdsRef.current.delete(detectionId);
    suppressDetectionsRefreshUntilRef.current = Date.now() + 2000;

    setExitingDetectionIds((current) => current.filter((id) => id !== detectionId));
    setDetections((current) => current.filter((row) => row.id !== detectionId));
    setTotalCount((count) => Math.max(0, count - 1));
    setSelectedDetections((current) => current.filter((row) => row.id !== detectionId));

    if (pendingDeleteIdsRef.current.size === 0) {
      setRemoving(false);
      setSelectedPlate(null);
    }

    try {
      await deleteDetection(detectionId);
    } catch (error) {
      suppressDetectionsRefreshUntilRef.current = 0;
      bumpDetectionsVersion();
      window.alert(formatApiError(error, 'Failed to delete detection'));
    }
  }

  useEffect(() => {
    if (exitingDetectionIds.length === 0) return;

    const fallbackTimer = window.setTimeout(() => {
      for (const detectionId of exitingDetectionIds) {
        void handleRemoveAnimationEnd(detectionId);
      }
    }, 520);

    return () => window.clearTimeout(fallbackTimer);
  }, [exitingDetectionIds]);

  const subtitle = highlightFromQuery
    ? loading
      ? `Loading detection log · highlighting ${highlightFromQuery}...`
      : `${totalCount} detection${totalCount === 1 ? '' : 's'} · ${highlightFromQuery} highlighted`
    : filterPlate
      ? loading
        ? `Loading detections for ${filterPlate}...`
        : `${totalCount} detection${totalCount === 1 ? '' : 's'} for ${filterPlate}`
      : 'Searchable detection history';

  return (
    <div className="min-h-screen">
      <Header
        detectionToolbar={
          <Button
            variant="secondary"
            onClick={handleExportCsv}
            className="header-toolbar-btn"
          >
            Export Detection Report
          </Button>
        }
      />
      <main className="mobile-page-main mx-auto max-w-[1920px] space-y-6 px-6 py-6">
        <PageTitle title="Detection Log" subtitle={subtitle} className="xl:hidden" />
        <div className="mobile-detection-toolbar xl:hidden">
          <DetectionFilterBar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            sort={sortOption}
            filters={listFilters}
            onSortChange={setSortOption}
            onFiltersChange={setListFilters}
          />
          <Button
            variant="danger"
            onClick={handleRemoveSelected}
            disabled={selectedDetections.length === 0 || removing}
            data-detection-log-action
            className="mobile-detection-remove"
          >
            Remove selected
          </Button>
        </div>

        <div className="hidden xl:grid grid-cols-[1fr_auto_1fr] items-end gap-5">
          <PageTitle title="Detection Log" subtitle={subtitle} />
          <div className="relative">
            <DetectionFilterBar
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              sort={sortOption}
              filters={listFilters}
              onSortChange={setSortOption}
              onFiltersChange={setListFilters}
            />
            <Button
              variant="danger"
              onClick={handleRemoveSelected}
              disabled={selectedDetections.length === 0 || removing}
              data-detection-log-action
              className="absolute top-1/2 inline-flex h-9 w-[9.75rem] -translate-y-1/2 items-center justify-center px-0 left-[calc(3.5rem+54rem+0.75rem)]"
            >
              Remove
            </Button>
          </div>
          <div aria-hidden className="pointer-events-none" />
        </div>

        {loading ? (
          <div className="glass-panel flex h-40 items-center justify-center rounded-xl border border-dashed border-white/10">
            <p className="text-sm text-slate-500">Loading detections...</p>
          </div>
        ) : (
          <DetectionLogTable
            detections={filteredDetections}
            hideTitle
            visibleRowCount={25}
            highlightPlate={highlightFromQuery || undefined}
            highlightDetectionId={highlightIdFromQuery ?? undefined}
            selectedDetectionIds={selectedDetections.map((detection) => detection.id)}
            exitingDetectionIds={exitingDetectionIds}
            onSelectionChange={setSelectedDetections}
            onExitAnimationEnd={handleRemoveAnimationEnd}
          />
        )}
      </main>
    </div>
  );
}
