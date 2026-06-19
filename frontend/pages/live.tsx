import { useEffect, useMemo, useRef, useState } from 'react';
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
  releaseLiveSource,
} from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { createLivePlateResolver } from '@/utils/livePlateResolver';

type LiveMode = 'camera' | 'source';

const LIVE_INTERVAL_MS = 1200;

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

  useEffect(() => {
    hydrate();
  }, [hydrate]);

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
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
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
        0.84
      );
    });
  }

  function recordResult(result: LiveDetectionFrame) {
    const resolved = plateResolverRef.current.observe(result);
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
      return [displayResult, ...current].slice(0, 12);
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
        setError(formatApiError(err, 'Live detection failed'));
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
      setError('Enter a public video link, RTSP URL, or stream address.');
      return;
    }
    if (mode === 'camera' && !deviceId) {
      setError('Select a camera device.');
      return;
    }

    setError('');
    frameNumberRef.current = 0;
    plateResolverRef.current.reset();
    setLastResult(null);
    setPlateHistory([]);

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
      setError(formatApiError(err, 'Unable to start live detection'));
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

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="glass-panel overflow-hidden rounded-2xl border border-cyber-cyan/20">
            <div className="border-b border-cyber-cyan/15 px-5 py-4">
              <div className="grid items-center gap-5 lg:grid-cols-[1fr_18rem]">
                {mode === 'camera' ? (
                  <div ref={deviceMenuRef} className="relative w-[20rem] shrink-0">
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => setDeviceMenuOpen((open) => !open)}
                      title={selectedDeviceLabel}
                      className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md border border-white/40 bg-transparent px-4 py-2 text-left text-sm font-normal text-white transition hover:border-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                        {selectedDeviceLabel}
                      </span>
                      <span className="shrink-0 text-xs text-white/70">{deviceMenuOpen ? '▲' : '▼'}</span>
                    </button>

                    {deviceMenuOpen ? (
                      <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-md border border-cyber-cyan/30 bg-[#0b1020] shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
                        {devices.map((device, index) => (
                          <button
                            key={device.deviceId || `camera-${index}`}
                            type="button"
                            disabled={running || !device.deviceId}
                            onClick={() => selectDevice(device.deviceId)}
                            className={`block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-4 py-2.5 text-left text-xs tracking-[0.08em] transition hover:bg-cyber-cyan/10 disabled:cursor-not-allowed disabled:opacity-60 ${
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
                          <p className="border-t border-cyber-cyan/15 px-4 py-2.5 text-xs text-slate-500">
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
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className="h-full min-h-[28rem] w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full min-h-[28rem] flex-col items-center justify-center gap-4 px-6 text-center">
                    <div className="h-20 w-20 rounded-full border border-cyber-pink/50 bg-cyber-pink/10 shadow-[0_0_40px_rgba(255,0,110,0.35)]" />
                    <div>
                      <p className="font-orbitron text-lg text-cyber-pink">REMOTE SOURCE MODE</p>
                      <p className="mt-2 max-w-md text-sm text-slate-400">
                        Paste a public YouTube, Facebook, Instagram, or other video link. The backend
                        resolves and samples frames for detection.
                      </p>
                    </div>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_95%,rgba(0,247,255,0.12)_96%)] bg-[length:100%_12px]" />
                <div className="absolute left-4 top-4 rounded-full border border-cyber-cyan/40 bg-black/60 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyber-cyan">
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

                {error && (
                  <div className="rounded-lg border border-cyber-pink/40 bg-cyber-pink/10 p-3 text-sm text-cyber-pink">
                    {error}
                  </div>
                )}

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
                      <p className="text-slate-500">Latency</p>
                      <p className="mt-1 text-cyber-cyan">
                        {lastResult?.processing_time_ms ? `${lastResult.processing_time_ms}ms` : '--'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="glass-panel rounded-2xl border border-cyber-cyan/20 p-5">
            <h3 className="font-orbitron text-lg font-semibold text-cyber-cyan neon-text">
              Preview Detections
            </h3>
            <p className="mt-1 text-xs text-slate-400">Local session list only. Nothing is saved.</p>

            <div className="mt-5 space-y-3">
              {plateHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
                  Plates detected from live input will appear here.
                </div>
              ) : (
                plateHistory.map((item, index) => (
                  <div
                    key={`${item.frame_id}-${item.plate_number}-${index}`}
                    className="rounded-xl border border-cyber-cyan/20 bg-black/30 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-orbitron text-xl text-white">{item.plate_number}</p>
                      <span className="rounded-full border border-cyber-green/40 bg-cyber-green/10 px-2 py-1 text-[0.65rem] uppercase tracking-[0.16em] text-cyber-green">
                        Preview
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span>Frame {item.frame_id ?? '--'}</span>
                      <span>{formatConfidence(item.plate_confidence)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </section>
      </main>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
