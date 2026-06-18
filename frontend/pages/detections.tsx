import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Header from '@/components/Header';
import PageTitle from '@/components/shared/PageTitle';
import DetectionLogTable from '@/components/DetectionLogTable';
import Button from '@/components/shared/Button';
import { fetchDetections } from '@/services/api';
import { Detection } from '@/types/detection';
import { downloadDetectionsCsv } from '@/utils/detectionExport';
import { filterDetectionsByQuery } from '@/utils/detectionDisplay';
import { consumeDetectionsPageEnter } from '@/utils/pageTransitions';
import { useDashboardStore } from '@/store/dashboardStore';

export default function DetectionsPage() {
  const router = useRouter();
  const sessionVersion = useDashboardStore((state) => state.sessionVersion);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageEntering, setPageEntering] = useState(false);

  const plateFromQuery = useMemo(() => {
    if (!router.isReady) return '';
    const plate = router.query.plate;
    return typeof plate === 'string' ? plate.trim() : '';
  }, [router.isReady, router.query.plate]);

  useEffect(() => {
    if (consumeDetectionsPageEnter()) {
      setPageEntering(true);
      const timer = window.setTimeout(() => setPageEntering(false), 600);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    setSearchQuery(plateFromQuery);
  }, [plateFromQuery]);

  useEffect(() => {
    if (!router.isReady) return;

    let cancelled = false;
    setLoading(true);

    const params: {
      limit: number;
      plate?: string;
    } = {
      limit: plateFromQuery ? 10000 : 100,
    };
    if (plateFromQuery) {
      params.plate = plateFromQuery;
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
  }, [sessionVersion, router.isReady, plateFromQuery]);

  const filteredDetections = useMemo(
    () => filterDetectionsByQuery(detections, searchQuery),
    [detections, searchQuery]
  );

  async function handleExportCsv() {
    const res = await fetchDetections({
      limit: 10000,
      ...(searchQuery.trim() ? { plate: searchQuery.trim() } : {}),
    });
    const rows = filterDetectionsByQuery(res.data || [], searchQuery);
    downloadDetectionsCsv(rows, 'detections.csv');
  }

  const subtitle = plateFromQuery
    ? loading
      ? `Loading detections for ${plateFromQuery}...`
      : `${totalCount} detection${totalCount === 1 ? '' : 's'} for ${plateFromQuery}`
    : 'Searchable detection history';

  return (
    <div className={`min-h-screen${pageEntering ? ' detections-page-enter' : ''}`}>
      <Header />
      <main className="mx-auto max-w-[1920px] space-y-6 px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <PageTitle title="Detection Log" subtitle={subtitle} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter..."
            className="w-[36rem] rounded-md border border-cyber-cyan/30 bg-black/30 px-3 py-2 text-center text-sm outline-none focus:border-cyber-cyan sm:w-[42rem]"
          />
          <Button variant="secondary" onClick={handleExportCsv}>
            Export Detection CSV
          </Button>
        </div>
        {loading ? (
          <div className="glass-panel flex h-40 items-center justify-center rounded-xl border border-dashed border-white/10">
            <p className="text-sm text-slate-500">Loading detections...</p>
          </div>
        ) : (
          <DetectionLogTable detections={filteredDetections} hideTitle visibleRowCount={25} />
        )}
      </main>
    </div>
  );
}
