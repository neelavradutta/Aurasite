import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import Header from '@/components/Header';
import PageTitle from '@/components/shared/PageTitle';
import Button from '@/components/shared/Button';
import TabSwitcher from '@/components/shared/TabSwitcher';
import StatusBadge from '@/components/shared/StatusBadge';
import {
  detectLiveFrame,
  detectLiveSourceFrame,
  formatApiError,
  LiveDetectionFrame,
  persistLiveDetectionRecord,
  releaseLiveSource,
  resetLiveSaveSession,
} from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { createLivePlateResolver, pickLiveDisplayPlate } from '@/utils/livePlateResolver';

type LiveMode = 'camera' | 'source';

const LIVE_INTERVAL_MS = 800;
const LIVE_HISTORY_VISIBLE = 5;
const LIVE_HISTORY_MAX = 30;
/** 5 cards (5.5rem each) + 4 gaps (space-y-3) */
const LIVE_HISTORY_SCROLL_MAX = `calc(${LIVE_HISTORY_VISIBLE} * 5.5rem + ${LIVE_HISTORY_VISIBLE - 1} * 0.75rem)`;
const LIVE_ERROR_PREFIX = 'Error : ';

function formatLiveError(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return '';
  const body = trimmed.replace(/^error\s*:\s*/i, '').trim();
  return `${LIVE_ERROR_PREFIX}${body}`;
}

function formatConfidence(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function resolveVehicleLabel(result: LiveDetectionFrame | null): string {
  const vehicle = result?.vehicle;
  const className = vehicle?.class_name;
  if (typeof className === 'string' && className.trim()) return className;
  return result?.vehicle_type || 'Unknown';
}

function resolveVehicleColour(result: LiveDetectionFrame | null): string {
  const vehicle = result?.vehicle;
  const color = result?.vehicle_color ?? vehicle?.color;
  if (typeof color === 'string' && color.trim()) return color;
  return '--';
}

function getLiveSnapshotSrc(item: LiveDetectionFrame | null): string | null {
  if (!item) return null;
  const raw = item.dashboard_image_base64 || item.plate_image_base64;
  if (!raw) return null;
  if (raw.startsWith('data:')) return raw;
  return `data:image/jpeg;base64,${raw}`;
}

function formatOverlayVehicleLine(result: LiveDetectionFrame | null): string {
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
  const { token, hydrate } = useAuthStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const frameNumberRef = useRef(0);
  const plateResolverRef = useRef(createLivePlateResolver());
  const deviceMenuRef = useRef<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<LiveMode>('camera');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [source, setSource] = useState('');
  const [running, setRunning] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [lastResult, setLastResult] = useState<LiveDetectionFrame | null>(null);
  const [plateHistory, setPlateHistory] = useState<LiveDetectionFrame[]>([]);
  const [error, setError] = useState('');
  const [previewItem, setPreviewItem] = useState<LiveDetectionFrame | null>(null);
  const [portalMounted, setPortalMounted] = useState(false);

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

    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      tempStream.getTracks().forEach((track) => track.stop());
    } catch {
      // Labels may stay generic until permission is granted.
    }

    const items = await navigator.mediaDevices.enumerateDevices();
    setDevices(items.filter((item) => item.kind === 'videoinput'));
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
  }, [mode]);

  useEffect(() => {
    return () => {
      stopLiveDetection();
    };
  }, []);

  useEffect(() => {
    if (mode === 'source') {
      stopCamera();
      setDeviceMenuOpen(false);
    }
  }, [mode]);

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
  }, [error]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function clearTimer() {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  async function startCamera() {
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    await refreshDevices();
  }

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
  }

  const selectedDeviceLabel = useMemo(() => {
    if (!deviceId) return 'Select Device';
    const index = devices.findIndex((device) => device.deviceId === deviceId);
    if (index >= 0) return deviceLabel(devices[index], index);
    return 'Select Device';
  }, [deviceId, devices]);

  async function captureFrameBlob(): Promise<Blob> {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      throw new Error('Camera frame is not ready yet.');
    }

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to capture camera frame.');

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Unable to encode camera frame.'));
        },
        'image/jpeg',
        0.82
      );
    });
  }

  function openDetectionLog(plateNumber?: string) {
    const plate = plateNumber?.trim();
    if (!plate) return;
    void router.push({ pathname: '/detections', query: { plate } });
  }

  function recordResult(result: LiveDetectionFrame) {
    const tracked = plateResolverRef.current.observe(result);
    const resolved = pickLiveDisplayPlate(result, tracked);
    if (!resolved) {
      return;
    }

    const displayResult: LiveDetectionFrame = {
      ...result,
      plate_number: resolved.plate,
      plate_confidence: resolved.confidence || result.plate_confidence,
      detection_quality: 'accepted',
      frame_id: resolved.frameId || result.frame_id,
    };

    setLastResult(displayResult);
    setPlateHistory((current) => {
      const latest = current[0];
      if (latest?.plate_number === displayResult.plate_number) {
        return [{ ...latest, ...displayResult }, ...current.slice(1)];
      }

      void persistLiveDetectionRecord({
        plate_number: displayResult.plate_number || '',
        frame_number: displayResult.frame_id,
        plate_confidence: displayResult.plate_confidence,
        vehicle_confidence: displayResult.vehicle_confidence,
        vehicle_type: resolveVehicleLabel(displayResult),
        vehicle_color:
          resolveVehicleColour(displayResult) === '--' ? null : resolveVehicleColour(displayResult),
        detection_quality: displayResult.detection_quality,
        dashboard_image_base64: displayResult.dashboard_image_base64,
        mode,
        source: mode === 'source' ? source.trim() : undefined,
      })
        .then((response) => {
          const saved = response.data;
          if (!saved?.detection_id) return;
          setPlateHistory((history) =>
            history.map((entry) =>
              entry.plate_number === displayResult.plate_number && entry.frame_id === displayResult.frame_id
                ? { ...entry, detection_id: saved.detection_id, saved_to_log: saved.saved_to_log }
                : entry
            )
          );
          setLastResult((current) =>
            current?.plate_number === displayResult.plate_number
              ? { ...current, detection_id: saved.detection_id, saved_to_log: saved.saved_to_log }
              : current
          );
        })
        .catch(() => undefined);

      return [displayResult, ...current].slice(0, LIVE_HISTORY_MAX);
    });
  }

  async function processNextFrame() {
    if (!runningRef.current) return;

    setRequesting(true);
    abortRef.current = new AbortController();

    try {
      const frameNumber = frameNumberRef.current + 1;
      frameNumberRef.current = frameNumber;
      const timestamp = Date.now() / 1000;
      const response =
        mode === 'camera'
          ? await detectLiveFrame(
              await captureFrameBlob(),
              frameNumber,
              timestamp,
              abortRef.current.signal
            )
          : await detectLiveSourceFrame(source.trim(), frameNumber, timestamp, abortRef.current.signal);

      setError('');
      recordResult(response.data);
    } catch (err) {
      if (runningRef.current) {
        setError(formatLiveError(formatApiError(err, 'Live detection failed')));
      }
    } finally {
      setRequesting(false);
      abortRef.current = null;
      if (runningRef.current) {
        timeoutRef.current = window.setTimeout(processNextFrame, LIVE_INTERVAL_MS);
      }
    }
  }

  async function startLiveDetection() {
    if (!token) {
      router.push('/login');
      return;
    }
    if (mode === 'source' && !source.trim()) {
      setError(formatLiveError('Enter a link or stream URL'));
      return;
    }
    if (mode === 'camera' && !deviceId) {
      setError(formatLiveError('Select a camera device'));
      return;
    }

    setError('');
    frameNumberRef.current = 0;
    plateResolverRef.current.reset();
    setLastResult(null);
    setPlateHistory([]);
    void resetLiveSaveSession(mode, mode === 'source' ? source.trim() : undefined);

    try {
      if (mode === 'camera') {
        await startCamera();
      }
      runningRef.current = true;
      setRunning(true);
      processNextFrame();
    } catch (err) {
      runningRef.current = false;
      setRunning(false);
      setError(formatLiveError(formatApiError(err, 'Unable to start live detection')));
    }
  }

  function stopLiveDetection() {
    const activeSource = source.trim();
    runningRef.current = false;
    setRunning(false);
    setRequesting(false);
    abortRef.current?.abort();
    abortRef.current = null;
    clearTimer();
    if (mode === 'camera') {
      stopCamera();
    } else if (activeSource) {
      void releaseLiveSource(activeSource).catch(() => undefined);
    }
  }

  const previewSnapshotSrc = previewItem ? getLiveSnapshotSrc(previewItem) : null;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1920px] space-y-6 px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <PageTitle
            title="Live Monitoring"
            subtitle="Detection from camera devices and live sources"
          />
          <StatusBadge isScanning={running} />
        </div>

        <section className="grid items-stretch gap-6 xl:grid-cols-[1.35fr_0.65fr]">
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
              <div className="relative min-h-[28rem] overflow-hidden rounded-xl border border-cyber-cyan/20 bg-black/50">
                {mode === 'camera' ? (
                  <>
                    <video
                      ref={videoRef}
                      muted
                      playsInline
                      className="h-full min-h-[28rem] w-full object-cover"
                    />
                    {!running ? (
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                        <p className="font-orbitron text-xl text-cyber-pink remote-source-fade">LIVE FEED MODE</p>
                      </div>
                    ) : null}
                  </>
                ) : !running ? (
                  <div className="flex h-full min-h-[28rem] flex-col items-center justify-center gap-4 px-6 text-center">
                    <p className="font-orbitron text-xl text-cyber-pink remote-source-fade">REMOTE SOURCE MODE</p>
                  </div>
                ) : (
                  <div className="h-full min-h-[28rem]" aria-hidden />
                )}
                <div className="pointer-events-none absolute inset-0" aria-hidden>
                  <div className="absolute left-1/4 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
                  <div className="absolute left-3/4 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
                  <div className="absolute left-0 top-1/4 h-px w-full -translate-y-1/2 bg-white/15" />
                  <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/15" />
                  <div className="absolute left-0 top-3/4 h-px w-full -translate-y-1/2 bg-white/15" />
                </div>
                <div className="absolute left-3 top-3 rounded-full border border-cyber-cyan/40 bg-black/60 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.14em] text-cyber-cyan">
                  {requesting ? 'Analyzing' : running ? 'Live' : 'Idle'}
                </div>
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
            <h3 className="font-orbitron text-lg font-semibold text-cyber-cyan neon-text">
              Recent Live Detections
            </h3>

            <div className="mt-5 flex min-h-0 flex-1 flex-col">
              {plateHistory.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 px-6 py-8 text-center text-sm text-slate-500">
                  No plates detected yet.
                </div>
              ) : (
                <div
                  className="space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:rgba(0,247,255,0.45)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-cyber-cyan/45"
                  style={{ maxHeight: LIVE_HISTORY_SCROLL_MAX }}
                >
                  {plateHistory.map((item, index) => (
                    <div
                      key={`${item.frame_id}-${item.plate_number}-${index}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => openDetectionLog(item.plate_number)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openDetectionLog(item.plate_number);
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
                      {formatOverlayVehicleLine(previewItem)}
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
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
