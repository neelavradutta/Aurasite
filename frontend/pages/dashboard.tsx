import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import Header from '@/components/Header';
import PageTitle from '@/components/shared/PageTitle';
import KPICards from '@/components/KPICards';
import MostFrequentVehicles, {
  MOST_FREQUENT_VEHICLES_ANCHOR,
} from '@/components/LeftPanel/MostFrequentVehicles';
import PeakTrafficChart, {
  PEAK_TRAFFIC_HOURS_ANCHOR,
} from '@/components/LeftPanel/PeakTrafficChart';
import RepeatAnalysisWidget, {
  REPEAT_VEHICLE_ANALYSIS_ANCHOR,
} from '@/components/LeftPanel/RepeatAnalysisWidget';
import VehicleSpeedPanel, {
  VEHICLE_SPEED_ANCHOR,
} from '@/components/Analytics/VehicleSpeedPanel';
import ConfidenceHeatmap from '@/components/CenterPanel/ConfidenceHeatmap';
import SuspiciousVehiclesSection from '@/components/CenterPanel/SuspiciousVehiclesSection';
import SelectedPlatePanel from '@/components/RightPanel/SelectedPlatePanel';
import VideoInputPanel from '@/components/RightPanel/VideoInputPanel';
import PlateCardsGrid from '@/components/PlateCardsGrid';
import { useRouter } from 'next/router';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useSocket } from '@/hooks/useSocket';
import { useDashboardStore } from '@/store/dashboardStore';
import { useAuthStore } from '@/store/authStore';
import VideoProcessingOverlay, { ProcessingOverlayState, ProcessingPhase } from '@/components/VideoProcessingOverlay';
import {
  fetchDetections,
  formatApiError,
  ProcessingCancelledError,
  uploadVideo,
  waitForJob,
} from '@/services/api';
import { getDashboardPlates } from '@/utils/dashboardDetections';
import { useChartAnimationKey } from '@/hooks/useChartAnimationKey';
import { isImageFile } from '@/utils/mediaFile';

const MAX_FRAMES = 100;

function mapJobStatusMessage(status: string, isImage = false): string {
  if (status === 'saving') return 'Saving detections to database...';
  if (status === 'processing' || status === 'active') {
    return isImage ? 'Running AI detection on image...' : 'Running AI detection on video frames...';
  }
  if (status === 'completed' || status === 'complete') return 'Processing complete.';
  if (status === 'failed') return 'Upload failed.';
  return isImage ? 'Processing image...' : 'Processing video...';
}

function computeOverlayProgress(
  phase: ProcessingOverlayState['phase'],
  framesProcessed: number,
  maxFrames: number,
  backendProgress: number
): number {
  if (phase === 'uploading') return Math.min(5, backendProgress || 5);
  if (phase === 'complete') return 100;
  if (phase === 'error') return backendProgress;
  if (phase === 'saving') return 95;
  if (maxFrames > 0) {
    return Math.min(90, Math.round(5 + (framesProcessed / maxFrames) * 85));
  }
  return Math.min(90, Math.round(5 + (backendProgress / 100) * 85));
}

export default function DashboardPage() {
  const router = useRouter();
  const {
    summary,
    detections,
    setDetections,
    appendPeakTrafficDetections,
    startNewAnalysisSession,
  } = useDashboardStore();
  const { confidence, repeat, frequent, suspicious, traffic, speeds } = useAnalytics();
  const peakTrafficKey = useChartAnimationKey('peak-traffic');
  const confidenceHeatmapKey = useChartAnimationKey('confidence-heatmap');
  const { token, hydrate } = useAuthStore();
  useSocket();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [processingOverlay, setProcessingOverlay] = useState<ProcessingOverlayState | null>(null);
  const processingCancelledRef = useRef(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const lastProcessingFileRef = useRef<File | null>(null);
  const dashboardPlates = useMemo(() => getDashboardPlates(detections), [detections]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);


  async function handleLoadVideo(file: File): Promise<{ success: boolean; platesDetected: number }> {
    if (!token) {
      setUploadError('Please log in before uploading files.');
      router.push('/login');
      return { success: false, platesDetected: 0 };
    }

    const isImage = isImageFile(file);
    const maxFrames = isImage ? 1 : MAX_FRAMES;

    lastProcessingFileRef.current = file;
    setUploading(true);
    setUploadError('');
    processingCancelledRef.current = false;
    uploadAbortRef.current = new AbortController();
    startNewAnalysisSession(file.name);
    setProcessingOverlay({
      fileName: file.name,
      phase: 'uploading',
      progress: 0,
      statusMessage: isImage ? 'Uploading image to server...' : 'Uploading video to server...',
      framesProcessed: 0,
      maxFrames,
    });

    try {
      setProcessingOverlay((current) =>
        current
          ? {
              ...current,
              progress: 5,
              statusMessage: isImage ? 'Uploading image to server...' : 'Uploading video to server...',
            }
          : current
      );

      const result = await uploadVideo(
        file,
        {
          frame_skip: isImage ? 1 : 3,
          confidence_threshold: 0.45,
          max_frames: maxFrames,
        },
        uploadAbortRef.current.signal
      );
      const jobId = result.data?.job_id as string | undefined;

      if (jobId) {
        setProcessingOverlay((current) =>
          current
            ? {
                ...current,
                phase: 'processing',
                progress: 12,
                statusMessage: 'Upload complete. Starting AI detection...',
              }
            : current
        );

        const completedJob = await waitForJob(
          jobId,
          ({ status, progress, framesProcessed, maxFrames }) => {
            const phase: ProcessingPhase = status === 'saving' ? 'saving' : 'processing';
            const resolvedMaxFrames = maxFrames || (isImage ? 1 : MAX_FRAMES);

            setProcessingOverlay((current) =>
              current
                ? {
                    ...current,
                    phase,
                    maxFrames: resolvedMaxFrames,
                    framesProcessed,
                    progress: computeOverlayProgress(phase, framesProcessed, resolvedMaxFrames, progress),
                    statusMessage: mapJobStatusMessage(status, isImage),
                  }
                : current
            );
          },
          1000,
          () => processingCancelledRef.current
        );
        const jobResult = (completedJob?.result || {}) as {
          savedCount?: number;
          summary?: { saved_count?: number };
        };
        const savedFromJob = Number(jobResult.savedCount ?? jobResult.summary?.saved_count ?? NaN);
        if (isImage && Number.isFinite(savedFromJob) && savedFromJob === 0) {
          setUploadError('No license plate detected in this image. Try a clearer front-facing photo.');
        }
      }

      let res = await fetchDetections({ limit: 200, video_source: file.name });
      let rows = res.data || [];
      if (rows.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        res = await fetchDetections({ limit: 200, video_source: file.name });
        rows = res.data || [];
      }
      setDetections(rows);
      appendPeakTrafficDetections(rows);
      const platesDetected = getDashboardPlates(rows).length;

      setProcessingOverlay((current) =>
        current
          ? {
              ...current,
              phase: 'complete',
              progress: 100,
              statusMessage: 'Processing complete. Loading dashboard...',
              framesProcessed: current.maxFrames,
            }
          : current
      );

      await new Promise((resolve) => setTimeout(resolve, 900));
      setProcessingOverlay(null);
      return { success: true, platesDetected };
    } catch (err) {
      if (
        processingCancelledRef.current ||
        err instanceof ProcessingCancelledError ||
        (axios.isAxiosError(err) && err.code === 'ERR_CANCELED')
      ) {
        setProcessingOverlay(null);
        return { success: false, platesDetected: 0 };
      }

      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setProcessingOverlay(null);
        setUploadError('Session expired. Please log in again.');
        router.push('/login');
      } else {
        const message = formatApiError(err, 'Upload failed');

        setProcessingOverlay((current) =>
          current
            ? {
                ...current,
                phase: 'error',
                error: message,
                statusMessage: message,
              }
            : {
                fileName: file.name,
                phase: 'error',
                progress: 0,
                statusMessage: message,
                framesProcessed: 0,
                maxFrames: MAX_FRAMES,
                error: message,
              }
        );
        setUploadError(message);
      }
      return { success: false, platesDetected: 0 };
    } finally {
      setUploading(false);
    }
  }

  function closeProcessingOverlay() {
    setProcessingOverlay(null);
  }

  function stopProcessing() {
    processingCancelledRef.current = true;
    uploadAbortRef.current?.abort();
    setProcessingOverlay(null);
    setUploading(false);
  }

  function retryProcessing() {
    const file = lastProcessingFileRef.current;
    if (!file) {
      closeProcessingOverlay();
      return;
    }
    void handleLoadVideo(file);
  }

  return (
    <div className="min-h-screen pb-10">
      {processingOverlay && (
        <VideoProcessingOverlay
          state={processingOverlay}
          onClose={closeProcessingOverlay}
          onStop={stopProcessing}
          onRetry={retryProcessing}
        />
      )}
      <Header />
      <main className="mx-auto max-w-[1920px] space-y-6 px-6 py-6">
        <PageTitle title="Operations Dashboard" />

        <KPICards summary={summary} />

        {/* Analytics row — fixed row heights so panels stay the same in input vs results mode */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:grid-rows-[27.5rem_27.5rem] xl:items-stretch">
          <div className="flex h-[27.5rem] min-h-[27.5rem] max-h-[27.5rem] shrink-0 flex-col overflow-hidden xl:col-span-3 xl:row-start-1">
            <MostFrequentVehicles
              vehicles={frequent}
              size="lg"
              limit={3}
              platesOnly
              fillHeight
              href={`/analytics#${MOST_FREQUENT_VEHICLES_ANCHOR}`}
              className="!h-[27.5rem] !min-h-[27.5rem] !max-h-[27.5rem] !shrink-0"
            />
          </div>

          <div className="flex h-[27.5rem] min-h-[27.5rem] max-h-[27.5rem] shrink-0 flex-col overflow-hidden xl:col-span-5 xl:row-start-1">
            <ConfidenceHeatmap
              key={confidenceHeatmapKey}
              data={confidence}
              compact
              className="!h-[27.5rem] !min-h-[27.5rem] !max-h-[27.5rem] !shrink-0"
            />
          </div>

          <div className="flex h-[27.5rem] min-h-[27.5rem] max-h-[27.5rem] shrink-0 flex-col overflow-hidden xl:col-span-4 xl:row-start-1">
            <VideoInputPanel
              uploading={uploading}
              uploadError={uploadError}
              isLoggedIn={Boolean(token)}
              onLoadVideo={handleLoadVideo}
            />
          </div>

          <div className="h-[27.5rem] min-h-[27.5rem] max-h-[27.5rem] shrink-0 overflow-hidden xl:col-span-3 xl:row-start-2">
            <PeakTrafficChart
              key={peakTrafficKey}
              data={traffic}
              variant="table"
              limit={3}
              size="lg"
              href={`/analytics#${PEAK_TRAFFIC_HOURS_ANCHOR}`}
              className="h-full min-h-0 max-h-full"
            />
          </div>

          <div className="h-[27.5rem] min-h-[27.5rem] max-h-[27.5rem] shrink-0 overflow-hidden xl:col-span-5 xl:row-start-2">
            <SuspiciousVehiclesSection vehicles={suspicious} fillHeight className="h-full min-h-0 max-h-full" />
          </div>

          <div className="grid h-[27.5rem] min-h-[27.5rem] max-h-[27.5rem] shrink-0 grid-rows-[13rem_minmax(0,1fr)] gap-3 overflow-hidden xl:col-span-4 xl:row-start-2">
            <VehicleSpeedPanel
              readings={speeds}
              limit={3}
              fillHeight
              className="h-full min-h-0 max-h-full"
              href={`/analytics#${VEHICLE_SPEED_ANCHOR}`}
            />
            <RepeatAnalysisWidget
              data={repeat}
              fillHeight
              compact
              className="h-full min-h-0 max-h-full"
              href={`/analytics#${REPEAT_VEHICLE_ANALYSIS_ANCHOR}`}
            />
          </div>
        </div>

        {/* Detection row — matched height; plates empty area + live feed share bottom line */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:grid-rows-[44rem]">
          <div className="h-[44rem] min-h-[44rem] max-h-[44rem] shrink-0 overflow-hidden xl:col-span-8">
            <PlateCardsGrid detections={dashboardPlates} fillHeight selectToPreview className="h-full min-h-0 max-h-full" />
          </div>

          <div className="h-[44rem] min-h-[44rem] max-h-[44rem] shrink-0 overflow-hidden xl:col-span-4">
            <SelectedPlatePanel />
          </div>
        </div>
      </main>
    </div>
  );
}
