import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import Header from '@/components/Header';
import PageTitle from '@/components/shared/PageTitle';
import Button from '@/components/shared/Button';
import { ExportHeaderIcon } from '@/components/NavIcons';
import TabSwitcher from '@/components/shared/TabSwitcher';
import StatusBadge from '@/components/shared/StatusBadge';
import { LiveDetectionFrame } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useLiveDetection, useLiveCameraVideo } from '@/hooks/useLiveDetection';
import { downloadLiveReport } from '@/services/api';
import { getLiveSnapshotSrc } from '@/utils/liveVideoSource';

const LIVE_HISTORY_VISIBLE = 5;
/** 5 cards (5.5rem each) + 4 gaps (space-y-3) */
const LIVE_HISTORY_SCROLL_MAX = `calc(${LIVE_HISTORY_VISIBLE} * 5.5rem + ${LIVE_HISTORY_VISIBLE - 1} * 0.75rem)`;

function formatConfidence(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatOverlayVehicleLine(
  result: LiveDetectionFrame | null,
  resolveVehicleLabel: (result: LiveDetectionFrame | null) => string
): string {
  const label = resolveVehicleLabel(result);
  const vehicle = label.toLowerCase() === 'unknown' ? 'unknown' : label;
  return `Vehicle - ${vehicle}`;
}

function downloadLiveSnapshot(item: LiveDetectionFrame, snapshotSrc: string): void {
  const link = document.createElement('a');
  link.href = snapshotSrc;
  link.download = `plate-${item.plate_number || item.frame_id || 'snapshot'}.jpg`;
  link.click();
}

export default function LivePage() {
  const router = useRouter();
  const { hydrate } = useAuthStore();
  const deviceMenuRef = useRef<HTMLDivElement | null>(null);
  const {
    running,
    requesting,
    mode,
    source,
    deviceId,
    previewSrc,
    lastResult,
    plateHistory,
    clearPlateHistory,
    error,
    setMode,
    setSource,
    setDeviceId,
    setError,
    startLiveDetection,
    stopLiveDetection,
    stopCameraOnly,
    stopFeed,
    previewCamera,
    resolveVehicleLabel,
    resolveVehicleColour,
  } = useLiveDetection();
  const { videoRef, getVideoElement, cameraPreviewActive } = useLiveCameraVideo();

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<LiveDetectionFrame | null>(null);
  const [portalMounted, setPortalMounted] = useState(false);
  const [exportingLive, setExportingLive] = useState(false);

  useEffect(() => {
    if (mode !== 'camera' || !deviceId) return;
    void previewCamera(deviceId, getVideoElement());
  }, [mode, deviceId, previewCamera, getVideoElement]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    if (!previewItem) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreviewItem(null);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewItem]);

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    let items = await navigator.mediaDevices.enumerateDevices();
    let videoInputs = items.filter((item) => item.kind === 'videoinput');
    const hasLabels = videoInputs.some((item) => Boolean(item.label?.trim()));

    if (!hasLabels && !cameraPreviewActive) {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        tempStream.getTracks().forEach((track) => track.stop());
      } catch {
        // Labels may stay generic until permission is granted.
      }
      items = await navigator.mediaDevices.enumerateDevices();
      videoInputs = items.filter((item) => item.kind === 'videoinput');
    }

    setDevices(videoInputs);
  }

  useEffect(() => {
    if (mode !== 'camera') return;

    void refreshDevices();

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;

    const handleDeviceChange = () => {
      void refreshDevices();
    };

    mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  }, [mode, cameraPreviewActive]);

  useEffect(() => {
    if (mode === 'source') {
      stopCameraOnly();
      setDeviceMenuOpen(false);
    }
  }, [mode, stopCameraOnly]);

  useEffect(() => {
    if (!deviceMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!deviceMenuRef.current?.contains(event.target as Node)) {
        setDeviceMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [deviceMenuOpen]);

  useEffect(() => {
    if (!error) return;

    function dismissError() {
      setError('');
    }

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', dismissError);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', dismissError);
    };
  }, [error, setError]);

  function deviceLabel(device: MediaDeviceInfo, index: number): string {
    const label = device.label?.trim();
    if (label) return label;
    return `Camera ${index + 1}`;
  }

  function isDeviceSelected(id: string): boolean {
    return deviceId === id;
  }

  function selectDevice(id: string) {
    setDeviceId(id);
    setDeviceMenuOpen(false);
    void previewCamera(id, getVideoElement());
  }

  const selectedDeviceLabel = useMemo(() => {
    if (!deviceId) return 'Select Device';
    const index = devices.findIndex((device) => device.deviceId === deviceId);
    if (index >= 0) return deviceLabel(devices[index], index);
    return 'Select Device';
  }, [deviceId, devices]);

  async function handleExportLiveReport() {
    if (exportingLive || plateHistory.length === 0) return;
    setExportingLive(true);
    try {
      await downloadLiveReport(
        plateHistory,
        { mode, source },
        resolveVehicleLabel,
        resolveVehicleColour
      );
    } catch {
      window.alert('Failed to export live report.');
    } finally {
      setExportingLive(false);
    }
  }

  function openDetectionLog(item: LiveDetectionFrame) {
    const plate = item.plate_number?.trim();
    if (!plate) return;
    void router.push({
      pathname: '/detections',
      query: {
        highlight: plate,
        ...(item.detection_id ? { id: String(item.detection_id) } : {}),
      },
    });
  }

  const previewSnapshotSrc = previewItem ? getLiveSnapshotSrc(previewItem) : null;

  return (
    <div className="min-h-screen">
      <Header
        liveToolbar={
          <Button
            variant="secondary"
            onClick={handleExportLiveReport}
            disabled={exportingLive || plateHistory.length === 0}
            className="header-toolbar-btn inline-flex items-center justify-center gap-1.5"
          >
            <ExportHeaderIcon />
            {exportingLive ? 'Exporting...' : 'Export Live Report'}
          </Button>
        }
      />
      <main className="mobile-page-main mx-auto max-w-[1920px] space-y-6 px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <PageTitle
            title="Live Monitoring"
            subtitle="Detection from camera devices and live sources"
          />
          <StatusBadge isScanning={running} className="mr-2 px-5 py-2 sm:mr-4 xl:mr-6" />
        </div>

        <section className="live-page-grid grid items-stretch gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="glass-panel overflow-hidden rounded-2xl border border-cyber-cyan/20">
            <div className="border-b border-cyber-cyan/15 px-5 py-4">
              <div className="grid items-center gap-5 lg:grid-cols-[1fr_18rem]">
                {mode === 'camera' ? (
                  <div ref={deviceMenuRef} className="relative min-w-0 w-full">
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => setDeviceMenuOpen((open) => !open)}
                      title={selectedDeviceLabel}
                      className="relative flex w-full min-w-0 items-center rounded-md border border-white/40 bg-transparent px-4 py-2 text-sm font-normal text-white outline-none transition hover:border-white focus:border-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span
                        className={`w-full truncate px-5 text-center ${
                          deviceId ? 'text-white' : 'text-white/70'
                        }`}
                      >
                        {selectedDeviceLabel}
                      </span>
                      <span className="pointer-events-none absolute right-4 shrink-0 text-xs text-white/70">
                        {deviceMenuOpen ? '▲' : '▼'}
                      </span>
                    </button>

                    {deviceMenuOpen ? (
                      <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-md border border-cyber-cyan/30 bg-[#0b1020] shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
                        {devices.map((device, index) => (
                          <button
                            key={device.deviceId || `camera-${index}`}
                            type="button"
                            disabled={running || !device.deviceId}
                            onClick={() => selectDevice(device.deviceId)}
                            className={`block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-4 py-2.5 text-center text-xs tracking-[0.08em] transition hover:bg-cyber-cyan/10 disabled:cursor-not-allowed disabled:opacity-60 ${
                              isDeviceSelected(device.deviceId)
                                ? 'bg-cyber-cyan/15 text-cyber-cyan'
                                : 'text-slate-300'
                            }`}
                            title={deviceLabel(device, index)}
                          >
                            {deviceLabel(device, index)}
                          </button>
                        ))}
                        {devices.length === 0 ? (
                          <p className="border-t border-cyber-cyan/15 px-4 py-2.5 text-center text-xs text-slate-500">
                            No cameras detected. Allow camera access to list devices.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="relative min-w-0 w-full">
                    <input
                      value={source}
                      disabled={running}
                      onChange={(event) => setSource(event.target.value)}
                      placeholder="YouTube, Facebook, RTSP, or direct URL"
                      title={source.trim() || 'Public video link or stream URL'}
                      className="w-full rounded-md border border-white/40 bg-transparent px-4 py-2 text-center text-sm font-normal text-white placeholder:text-white/70 outline-none transition hover:border-white focus:border-white disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                )}
                <div className="flex justify-end lg:justify-end">
                  <TabSwitcher
                    value={mode}
                    onChange={setMode}
                    disabled={running}
                    className="shrink-0"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[1fr_18rem]">
              <div className="relative min-h-[28rem] h-[28rem] overflow-hidden rounded-xl border border-cyber-cyan/20 bg-black/50">
                {mode === 'camera' ? (
                  <>
                    <video
                      ref={videoRef}
                      muted
                      autoPlay
                      playsInline
                      className="absolute inset-0 z-0 h-full w-full object-cover"
                    />
                    {!running && !cameraPreviewActive ? (
                      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center">
                        <p className="font-orbitron text-xl text-cyber-pink remote-source-fade">LIVE FEED MODE</p>
                      </div>
                    ) : null}
                  </>
                ) : !running ? (
                  <div className="flex h-full min-h-[28rem] flex-col items-center justify-center gap-4 px-6 text-center">
                    <p className="font-orbitron text-xl text-cyber-pink remote-source-fade">REMOTE SOURCE MODE</p>
                  </div>
                ) : previewSrc ? (
                  <img
                    src={previewSrc}
                    alt="Remote source preview"
                    className="h-full min-h-[28rem] w-full object-cover"
                  />
                ) : (
                  <div className="h-full min-h-[28rem]" aria-hidden />
                )}
                <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
                  <div className="absolute left-1/4 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
                  <div className="absolute left-3/4 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
                  <div className="absolute left-0 top-1/4 h-px w-full -translate-y-1/2 bg-white/15" />
                  <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/15" />
                  <div className="absolute left-0 top-3/4 h-px w-full -translate-y-1/2 bg-white/15" />
                </div>
                <div className="absolute left-3 top-3 z-20 rounded-full border border-cyber-cyan/40 bg-black/60 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.14em] text-cyber-cyan">
                  {requesting ? 'Analyzing' : running ? 'Live' : cameraPreviewActive ? 'Preview' : 'Idle'}
                </div>
                {mode === 'camera' && cameraPreviewActive && !running ? (
                  <button
                    type="button"
                    onClick={stopFeed}
                    className="absolute right-3 top-3 z-20 rounded-full border border-red-500/50 bg-black/60 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.14em] text-red-400 transition hover:border-red-400/70 hover:text-red-300"
                  >
                    Stop Feed
                  </button>
                ) : null}
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="success"
                    glow={!running && !requesting}
                    onClick={startLiveDetection}
                    disabled={running}
                  >
                    Start
                  </Button>
                  <Button
                    variant="danger"
                    glow={running || requesting}
                    onClick={stopLiveDetection}
                    disabled={!running && !requesting}
                  >
                    Stop
                  </Button>
                </div>

                {error ? (
                  <p className="text-center text-sm text-cyber-pink">{error}</p>
                ) : null}

                <div className="rounded-xl border border-cyber-purple/30 bg-black/30 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyber-purple">Latest Plate</p>
                  <p className="mt-3 font-orbitron text-3xl text-white">
                    {lastResult?.plate_number || '---'}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-slate-500">Confidence</p>
                      <p className="mt-1 text-cyber-cyan">{formatConfidence(lastResult?.plate_confidence)}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-slate-500">Vehicle</p>
                      <p className="mt-1 text-cyber-cyan">{resolveVehicleLabel(lastResult)}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-slate-500">Frame</p>
                      <p className="mt-1 text-cyber-cyan">{lastResult?.frame_id ?? '--'}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-slate-500">Colour</p>
                      <p className="mt-1 capitalize text-cyber-cyan">{resolveVehicleColour(lastResult)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="glass-panel flex h-full min-h-0 flex-col rounded-2xl border border-cyber-cyan/20 p-5">
            <div className="flex shrink-0 items-center justify-between gap-3">
              <h3 className="font-orbitron text-lg font-semibold text-cyber-cyan neon-text">
                Recent Live Detections
              </h3>
              {plateHistory.length > 0 || lastResult ? (
                <button
                  type="button"
                  onClick={clearPlateHistory}
                  className="shrink-0 rounded-full border border-white bg-white/15 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_0_10px_rgba(255,255,255,0.3)] transition hover:bg-white/25 hover:shadow-[0_0_14px_rgba(255,255,255,0.45)]"
                >
                  Reset
                </button>
              ) : null}
            </div>

            <div className="mt-5 flex min-h-0 flex-1 flex-col">
              {plateHistory.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 px-6 py-8 text-center text-sm text-slate-500">
                  No plates detected yet.
                </div>
              ) : (
                <div
                  className="live-history-panel space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:rgba(0,247,255,0.45)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-cyber-cyan/45"
                  style={{ maxHeight: LIVE_HISTORY_SCROLL_MAX }}
                >
                  {plateHistory.map((item, index) => (
                    <div
                      key={`${item.frame_id}-${item.plate_number}-${index}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => openDetectionLog(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openDetectionLog(item);
                        }
                      }}
                      className="shrink-0 cursor-pointer rounded-xl border border-cyber-cyan/20 bg-black/30 p-4 transition hover:border-cyber-cyan/45 hover:bg-black/40"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-orbitron text-xl text-white">{item.plate_number}</p>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPreviewItem(item);
                          }}
                          className="rounded-full border border-cyber-green/40 bg-cyber-green/10 px-2 py-1 text-[0.65rem] uppercase tracking-[0.16em] text-cyber-green transition hover:border-cyber-green/70 hover:bg-cyber-green/20"
                        >
                          Preview
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </section>
      </main>
      {portalMounted && previewItem
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
              onClick={() => setPreviewItem(null)}
            >
              <div
                className="glass-panel w-full max-w-2xl rounded-2xl border border-cyber-cyan/30 p-6 shadow-neon"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-orbitron text-2xl uppercase tracking-wider text-cyber-cyan">
                      {previewItem.plate_number}
                    </h3>
                    <p className="mt-1.5 text-sm text-slate-400">
                      {formatOverlayVehicleLine(previewItem, resolveVehicleLabel)}
                      {resolveVehicleColour(previewItem) !== '--'
                        ? ` · ${resolveVehicleColour(previewItem)}`
                        : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewItem(null)}
                    className="shrink-0 rounded-md border border-white/10 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-cyber-cyan hover:text-cyber-cyan"
                  >
                    Close
                  </button>
                </div>

                <div className="overflow-hidden rounded-xl border-2 border-black bg-black/40">
                  {previewSnapshotSrc ? (
                    <img
                      src={previewSnapshotSrc}
                      alt={`Vehicle snapshot ${previewItem.plate_number}`}
                      className="max-h-[420px] w-full border border-black object-contain"
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center border border-black text-sm text-slate-500">
                      No snapshot available for this detection
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={!previewSnapshotSrc}
                    onClick={() => {
                      if (previewSnapshotSrc) {
                        downloadLiveSnapshot(previewItem, previewSnapshotSrc);
                      }
                    }}
                    className="rounded-md border border-cyber-cyan/50 bg-cyber-cyan/10 px-4 py-2 text-sm text-cyber-cyan transition hover:bg-cyber-cyan/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Download Snapshot
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
