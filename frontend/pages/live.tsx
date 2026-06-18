import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Header from '@/components/Header';
import PageTitle from '@/components/shared/PageTitle';
import Button from '@/components/shared/Button';
import {
  detectLiveFrame,
  detectLiveSourceFrame,
  formatApiError,
  LiveDetectionFrame,
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

function resolveStatus(result: LiveDetectionFrame | null, running: boolean): string {
  if (running) return 'SCANNING';
  if (result?.plate_number) return 'PLATE LOCKED';
  return 'STANDBY';
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

  const [mode, setMode] = useState<LiveMode>('camera');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [source, setSource] = useState('');
  const [running, setRunning] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [lastResult, setLastResult] = useState<LiveDetectionFrame | null>(null);
  const [plateHistory, setPlateHistory] = useState<LiveDetectionFrame[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((items) => setDevices(items.filter((item) => item.kind === 'videoinput')))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      stopLiveDetection();
    };
  }, []);

  useEffect(() => {
    if (mode === 'source') {
      stopCamera();
    }
  }, [mode]);

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
    const items = await navigator.mediaDevices.enumerateDevices();
    setDevices(items.filter((item) => item.kind === 'videoinput'));
  }

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
      setError('Enter a live source URL, device index, or camera path.');
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
    runningRef.current = false;
    setRunning(false);
    setRequesting(false);
    abortRef.current?.abort();
    abortRef.current = null;
    clearTimer();
    if (mode === 'camera') {
      stopCamera();
    }
  }

  const status = resolveStatus(lastResult, running);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1920px] space-y-6 px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <PageTitle
            title="Live Recognition"
            subtitle="Preview-only plate detection from camera devices and live sources"
          />
          <div className="flex items-center gap-3 rounded-full border border-cyber-cyan/30 bg-black/30 px-4 py-2 text-xs uppercase tracking-[0.25em] text-cyber-cyan">
            <span className={`h-2.5 w-2.5 rounded-full ${running ? 'bg-cyber-green live-dot' : 'bg-slate-500'}`} />
            {status}
          </div>
        </div>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="glass-panel overflow-hidden rounded-2xl border border-cyber-cyan/20">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyber-cyan/15 px-5 py-4">
              <div>
                <h3 className="font-orbitron text-lg font-semibold text-cyber-cyan neon-text">
                  Live Input Matrix
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Results stay on this page and are not written to detection history.
                </p>
              </div>
              <div className="flex rounded-lg border border-cyber-cyan/30 bg-black/30 p-1">
                {(['camera', 'source'] as LiveMode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={running}
                    onClick={() => setMode(item)}
                    className={`rounded-md px-4 py-2 text-xs uppercase tracking-[0.2em] transition ${
                      mode === item
                        ? 'bg-cyber-cyan/15 text-cyber-cyan shadow-neon'
                        : 'text-slate-400 hover:text-cyber-cyan'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {item === 'camera' ? 'Camera' : 'Source'}
                  </button>
                ))}
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
                        Frames are sampled by the backend from the configured live source.
                      </p>
                    </div>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_95%,rgba(0,247,255,0.12)_96%)] bg-[length:100%_12px]" />
                <div className="absolute left-4 top-4 rounded-full border border-cyber-cyan/40 bg-black/60 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyber-cyan">
                  {requesting ? 'Analyzing' : running ? 'Live' : 'Idle'}
                </div>
              </div>

              <div className="space-y-4">
                {mode === 'camera' ? (
                  <label className="block">
                    <span className="text-xs uppercase tracking-[0.2em] text-cyber-cyan">Input Device</span>
                    <select
                      value={deviceId}
                      disabled={running}
                      onChange={(event) => setDeviceId(event.target.value)}
                      className="mt-2 w-full rounded-md border border-cyber-cyan/30 bg-black/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyber-cyan"
                    >
                      <option value="">Default camera</option>
                      {devices.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-xs uppercase tracking-[0.2em] text-cyber-cyan">Source</span>
                    <input
                      value={source}
                      disabled={running}
                      onChange={(event) => setSource(event.target.value)}
                      placeholder="0, rtsp://..., http://..., or path"
                      className="mt-2 w-full rounded-md border border-cyber-cyan/30 bg-black/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyber-cyan"
                    />
                  </label>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={startLiveDetection} disabled={running}>
                    Start
                  </Button>
                  <Button variant="danger" onClick={stopLiveDetection} disabled={!running && !requesting}>
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
