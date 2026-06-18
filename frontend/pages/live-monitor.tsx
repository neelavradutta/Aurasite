import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import Header from '@/components/Header';
import PageTitle from '@/components/shared/PageTitle';
import LiveFeedPlayer, { LIVE_FEED_ANCHOR } from '@/components/RightPanel/LiveFeedPlayer';
import PlateCardsGrid from '@/components/PlateCardsGrid';
import Button from '@/components/shared/Button';
import CameraSelectOverlay from '@/components/CameraSelectOverlay';
import { useSocket } from '@/hooks/useSocket';
import { useDashboardStore } from '@/store/dashboardStore';
import { useLiveFeedStore } from '@/store/liveFeedStore';
import { filterActiveLiveFeedDetections } from '@/utils/liveDetections';

export default function LiveMonitorPage() {
  const router = useRouter();
  const { connected } = useSocket();
  const { detections } = useDashboardStore();

  const cameraStream = useLiveFeedStore((s) => s.cameraStream);
  const playbackUrl = useLiveFeedStore((s) => s.playbackUrl);
  const selectedCamera = useLiveFeedStore((s) => s.selectedCamera);
  const streamId = useLiveFeedStore((s) => s.streamId);
  const detectionRunning = useLiveFeedStore((s) => s.detectionRunning);
  const framesScanned = useLiveFeedStore((s) => s.framesScanned);
  const feedError = useLiveFeedStore((s) => s.feedError);
  const detectionError = useLiveFeedStore((s) => s.detectionError);
  const loading = useLiveFeedStore((s) => s.loading);
  const setPlaybackUrl = useLiveFeedStore((s) => s.setPlaybackUrl);
  const setCamera = useLiveFeedStore((s) => s.setCamera);
  const stopCameraFeed = useLiveFeedStore((s) => s.stopCameraFeed);
  const startDetection = useLiveFeedStore((s) => s.startDetection);
  const stopDetection = useLiveFeedStore((s) => s.stopDetection);

  const [cameraOverlayOpen, setCameraOverlayOpen] = useState(false);
  const manualStopRef = useRef(false);
  const feedKey = selectedCamera || playbackUrl.trim();

  const hasActiveFeed = Boolean(cameraStream || playbackUrl.trim());
  const liveFeedSource = selectedCamera || playbackUrl.trim() || null;
  const liveDetections = useMemo(
    () => filterActiveLiveFeedDetections(detections, liveFeedSource),
    [detections, liveFeedSource]
  );

  useEffect(() => {
    manualStopRef.current = false;
  }, [feedKey, cameraStream]);

  useEffect(() => {
    if (!hasActiveFeed || detectionRunning || loading || manualStopRef.current) return;
    void startDetection();
  }, [hasActiveFeed, detectionRunning, loading, feedKey, startDetection]);

  const handleStartDetection = () => {
    manualStopRef.current = false;
    void startDetection();
  };

  const handleStopDetection = () => {
    manualStopRef.current = true;
    void stopDetection();
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hash = router.asPath.split('#')[1];
    if (!hash) return;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [router.asPath]);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1920px] space-y-6 px-6 py-6">
        <PageTitle title="Live Monitor" subtitle="Real-time stream detection">
          <span className={`text-xs ${connected ? 'text-cyber-green' : 'text-slate-500'}`}>
            {connected ? 'WebSocket connected' : 'Connecting...'}
          </span>

          <span className="text-xs text-cyber-cyan">
            Detection: {detectionRunning ? 'running' : 'stopped'}
          </span>

          {detectionRunning && (
            <span className="text-xs text-slate-400">Frames scanned: {framesScanned}</span>
          )}
        </PageTitle>

        <div className="glass-panel rounded-xl p-4">
          <label className="mb-2 block text-xs uppercase tracking-wider text-slate-400">
            HTTP Playback URL
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={playbackUrl}
              onChange={(e) => setPlaybackUrl(e.target.value)}
              className="min-w-[16rem] flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyber-purple"
              placeholder="http://example.com/stream.m3u8"
            />

            <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => setCameraOverlayOpen(true)}>
                Select Camera
              </Button>

              <Button
                onClick={handleStartDetection}
                disabled={loading || detectionRunning || !hasActiveFeed}
              >
                Start Detection
              </Button>

              <Button
                variant="danger"
                onClick={handleStopDetection}
                disabled={loading || !detectionRunning}
              >
                Stop
              </Button>
            </div>
          </div>

          {selectedCamera && (
            <p className="mt-2 truncate text-xs text-slate-500">Selected camera: {selectedCamera}</p>
          )}

          {feedError && <p className="mt-2 text-xs text-cyber-pink">{feedError}</p>}
          {detectionError && <p className="mt-2 text-xs text-cyber-pink">{detectionError}</p>}
          {detectionRunning && !detectionError && (
            <p className="mt-2 text-xs text-slate-500">
              Scanning live feed for plates. Each frame may take several seconds to analyze.
            </p>
          )}
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <LiveFeedPlayer
              sectionId={LIVE_FEED_ANCHOR}
              streamId={streamId}
              playbackUrl={playbackUrl || undefined}
              mediaStream={cameraStream}
              onStopCameraFeed={stopCameraFeed}
            />
          </div>

          <div className="glass-panel rounded-xl p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-orbitron text-base font-semibold text-cyber-cyan">
                Recent Live Detections
              </h3>
              <span className="shrink-0 rounded-full border border-cyber-cyan/30 bg-cyber-cyan/10 px-3 py-1 text-xs font-medium text-cyber-cyan">
                {liveDetections.length} vehicles
              </span>
            </div>
            <PlateCardsGrid
              detections={liveDetections}
              showHeader={false}
              emptyMessage={
                !hasActiveFeed
                  ? 'Select a camera or enter a playback URL to begin.'
                  : detectionRunning
                    ? 'Scanning feed for plates. Detections with snapshots will appear here.'
                    : 'Start detection to scan the live feed for plates.'
              }
            />
          </div>
        </div>
      </main>

      <CameraSelectOverlay
        open={cameraOverlayOpen}
        onClose={() => setCameraOverlayOpen(false)}
        onSelect={(device, stream) => {
          setCamera(device.label?.trim() || 'Selected camera', stream);
        }}
      />
    </div>
  );
}
