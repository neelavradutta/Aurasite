import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import {
  detectLiveFrame,
  detectLiveSourceFrame,
  fetchDetections,
  formatApiError,
  LiveDetectionFrame,
  persistLiveDetectionRecord,
  releaseLiveSource,
  resetLiveSaveSession,
} from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useLiveStore } from '@/store/liveStore';
import { createLivePlateResolver, pickLiveDisplayPlate } from '@/utils/livePlateResolver';
import { normalizePlateKey } from '@/utils/dashboardDetections';
import {
  getLiveSnapshotSrc,
  LiveMode,
  resolveLiveVideoSource,
  snapshotSrcFromFrame,
} from '@/utils/liveVideoSource';

const LIVE_INTERVAL_MS = 800;
const LIVE_ERROR_PREFIX = 'Error : ';

const captureVideo = typeof document !== 'undefined' ? document.createElement('video') : null;
const captureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

if (captureVideo) {
  captureVideo.muted = true;
  captureVideo.playsInline = true;
}

const streamRef = { current: null as MediaStream | null };
const timeoutRef = { current: null as number | null };
const abortRef = { current: null as AbortController | null };
const runningRef = { current: false };
const frameNumberRef = { current: 0 };
const plateResolverRef = { current: createLivePlateResolver() };
const previewDeviceIdRef = { current: '' };
const historySuppressedPlateRef = { current: null as string | null };
const displayVideos = new Set<HTMLVideoElement>();

function formatLiveError(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return '';
  const body = trimmed.replace(/^error\s*:\s*/i, '').trim();
  return `${LIVE_ERROR_PREFIX}${body}`;
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

function getPreviewVideoElement(): HTMLVideoElement | null {
  for (const element of displayVideos) {
    return element;
  }
  return captureVideo;
}

async function syncStreamToVideo(element: HTMLVideoElement, stream: MediaStream): Promise<void> {
  element.srcObject = stream;
  element.muted = true;
  element.playsInline = true;
  element.autoplay = true;

  try {
    await element.play();
  } catch {
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) {
      await element.play().catch(() => undefined);
      return;
    }
    await new Promise<void>((resolve) => {
      element.onloadedmetadata = () => {
        void element.play().finally(() => resolve());
      };
    });
  }
}

function collectDisplayTargets(preferredVideo?: HTMLVideoElement | null): HTMLVideoElement[] {
  const targets: HTMLVideoElement[] = [];
  if (preferredVideo) targets.push(preferredVideo);
  for (const element of displayVideos) {
    if (!targets.includes(element)) targets.push(element);
  }
  return targets;
}

async function attachStreamToDisplays(
  stream: MediaStream | null,
  preferredVideo?: HTMLVideoElement | null
): Promise<void> {
  if (!stream) {
    for (const element of collectDisplayTargets(preferredVideo)) {
      element.srcObject = null;
    }
    return;
  }

  const targets = collectDisplayTargets(preferredVideo);
  await Promise.all(targets.map((element) => syncStreamToVideo(element, stream)));

  if (targets.length === 0 && captureVideo) {
    await syncStreamToVideo(captureVideo, stream);
  }
}

function stopCamera() {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
  previewDeviceIdRef.current = '';
  void attachStreamToDisplays(null);
  useLiveStore.getState().setCameraPreviewActive(false);
}

export function getLiveCameraStream(): MediaStream | null {
  return streamRef.current;
}

export function resumeLiveMedia(preferredVideo?: HTMLVideoElement | null): void {
  const stream = streamRef.current;
  if (!stream) return;
  void attachStreamToDisplays(stream, preferredVideo);
}

function ensureDetectionLoopRunning(): void {
  if (!runningRef.current) return;
  if (timeoutRef.current || abortRef.current) return;
  void processNextFrame();
}

function clearTimer() {
  if (timeoutRef.current) {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}

async function captureFrameBlob(): Promise<Blob> {
  const video = getPreviewVideoElement();
  const canvas = captureCanvas;
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

async function appendLiveDetectionToPeakTraffic(videoSource: string) {
  const { appendPeakTrafficDetections } = useDashboardStore.getState();

  try {
    const res = await fetchDetections({ limit: 200, video_source: videoSource });
    const rows = res.data || [];
    if (rows.length === 0) return;
    appendPeakTrafficDetections(rows);
  } catch {
    // Cumulative analytics sync is best-effort.
  }
}

function recordResult(result: LiveDetectionFrame) {
  const { mode, source, setLastResult, setPreviewSrc, pushPlateHistory, patchPlateHistory } =
    useLiveStore.getState();
  const preview = snapshotSrcFromFrame(result);
  if (preview) setPreviewSrc(preview);

  const tracked = plateResolverRef.current.observe(result);
  const resolved = pickLiveDisplayPlate(result, tracked);
  if (!resolved) return;

  const displayResult: LiveDetectionFrame = {
    ...result,
    plate_number: resolved.plate,
    plate_confidence: resolved.confidence || result.plate_confidence,
    detection_quality: 'accepted',
    frame_id: resolved.frameId || result.frame_id,
  };

  const plateKey = normalizePlateKey(displayResult.plate_number || '');
  const isSuppressedRepeat =
    historySuppressedPlateRef.current !== null && plateKey === historySuppressedPlateRef.current;

  if (
    historySuppressedPlateRef.current &&
    plateKey &&
    plateKey !== historySuppressedPlateRef.current
  ) {
    historySuppressedPlateRef.current = null;
  }

  if (!isSuppressedRepeat) {
    setLastResult(displayResult);
    pushPlateHistory(displayResult);
  }

  const videoSource = resolveLiveVideoSource(mode, source);
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
    plate_image_base64: displayResult.plate_image_base64,
    mode,
    source: mode === 'source' ? source.trim() : undefined,
  })
    .then((response) => {
      const saved = response.data;
      if (!saved?.detection_id) return;
      const patch = {
        detection_id: saved.detection_id,
        saved_to_log: saved.saved_to_log,
      };
      if (!isSuppressedRepeat) {
        patchPlateHistory(
          (entry) =>
            entry.plate_number === displayResult.plate_number &&
            entry.frame_id === displayResult.frame_id,
          patch
        );
      }
      if (!isSuppressedRepeat) {
        setLastResult({
          ...displayResult,
          ...patch,
        });
      }
      void appendLiveDetectionToPeakTraffic(videoSource);
    })
    .catch(() => undefined);
}

async function processNextFrame() {
  if (!runningRef.current) return;

  const { mode, source, setRequesting, setError } = useLiveStore.getState();
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
    useLiveStore.getState().setRequesting(false);
    abortRef.current = null;
    if (runningRef.current) {
      timeoutRef.current = window.setTimeout(processNextFrame, LIVE_INTERVAL_MS);
    }
  }
}

async function acquireCameraStream(deviceId: string): Promise<MediaStream> {
  const baseConstraints: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };

  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { ...baseConstraints, deviceId: { ideal: deviceId } },
        audio: false,
      });
    } catch {
      return await navigator.mediaDevices.getUserMedia({
        video: { ...baseConstraints, deviceId: { exact: deviceId } },
        audio: false,
      });
    }
  }

  return await navigator.mediaDevices.getUserMedia({
    video: baseConstraints,
    audio: false,
  });
}

async function startCamera(deviceId: string, preferredVideo?: HTMLVideoElement | null) {
  stopCamera();
  const stream = await acquireCameraStream(deviceId);
  streamRef.current = stream;
  previewDeviceIdRef.current = deviceId;
  await attachStreamToDisplays(stream, preferredVideo);
  useLiveStore.getState().setCameraPreviewActive(true);
  useLiveStore.getState().bumpPreviewStreamTick();
}

export async function startCameraPreview(
  deviceId: string,
  preferredVideo?: HTMLVideoElement | null
): Promise<void> {
  if (!deviceId) return;

  if (previewDeviceIdRef.current === deviceId && streamRef.current) {
    await attachStreamToDisplays(streamRef.current, preferredVideo);
    useLiveStore.getState().setCameraPreviewActive(true);
    useLiveStore.getState().bumpPreviewStreamTick();
    return;
  }

  try {
    await startCamera(deviceId, preferredVideo);
  } catch (err) {
    useLiveStore.getState().setCameraPreviewActive(false);
    useLiveStore.getState().setError(formatLiveError(formatApiError(err, 'Unable to open camera')));
  }
}

export function stopCameraPreview(): void {
  if (runningRef.current) return;
  stopCamera();
}

export function stopLiveCameraFeed(): void {
  if (runningRef.current) return;
  stopCamera();
  useLiveStore.getState().setDeviceId('');
}

export async function startLiveDetectionSession(): Promise<boolean> {
  const { token } = useAuthStore.getState();
  const {
    mode,
    source,
    deviceId,
    setRunning,
    setError,
    resetSessionUi,
    setVideoSource,
  } = useLiveStore.getState();

  if (!token) return false;

  if (mode === 'source' && !source.trim()) {
    setError(formatLiveError('Enter a link or stream URL'));
    return false;
  }
  if (mode === 'camera' && !deviceId) {
    setError(formatLiveError('Select a camera device'));
    return false;
  }

  const videoSource = resolveLiveVideoSource(mode, source);
  resetSessionUi();
  frameNumberRef.current = 0;
  plateResolverRef.current.reset();
  setVideoSource(videoSource);
  void resetLiveSaveSession(mode, mode === 'source' ? source.trim() : undefined);

  try {
    if (mode === 'camera') {
      if (previewDeviceIdRef.current !== deviceId || !streamRef.current) {
        await startCamera(deviceId);
      } else {
        await attachStreamToDisplays(streamRef.current);
        useLiveStore.getState().setCameraPreviewActive(true);
        useLiveStore.getState().bumpPreviewStreamTick();
      }
    }
    runningRef.current = true;
    setRunning(true);
    void processNextFrame();
    return true;
  } catch (err) {
    runningRef.current = false;
    setRunning(false);
    setError(formatLiveError(formatApiError(err, 'Unable to start live detection')));
    return false;
  }
}

export function stopLiveDetectionSession() {
  const { mode, source, stopSessionUi } = useLiveStore.getState();
  const activeSource = source.trim();

  runningRef.current = false;
  stopSessionUi();
  abortRef.current?.abort();
  abortRef.current = null;
  clearTimer();

  if (mode === 'source' && activeSource) {
    void releaseLiveSource(activeSource).catch(() => undefined);
  }
}

export function registerLiveDisplayVideo(element: HTMLVideoElement | null) {
  if (!element) return () => undefined;

  displayVideos.add(element);
  if (streamRef.current) {
    void syncStreamToVideo(element, streamRef.current);
  }

  return () => {
    displayVideos.delete(element);
    element.srcObject = null;
  };
}

export function useLiveDetection() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const running = useLiveStore((state) => state.running);
  const requesting = useLiveStore((state) => state.requesting);
  const mode = useLiveStore((state) => state.mode);
  const source = useLiveStore((state) => state.source);
  const deviceId = useLiveStore((state) => state.deviceId);
  const previewSrc = useLiveStore((state) => state.previewSrc);
  const lastResult = useLiveStore((state) => state.lastResult);
  const error = useLiveStore((state) => state.error);
  const setMode = useLiveStore((state) => state.setMode);
  const setSource = useLiveStore((state) => state.setSource);
  const setDeviceId = useLiveStore((state) => state.setDeviceId);
  const plateHistory = useLiveStore((state) => state.plateHistory);
  const clearPlateHistoryFromStore = useLiveStore((state) => state.clearPlateHistory);
  const setLastResult = useLiveStore((state) => state.setLastResult);

  const clearPlateHistory = useCallback(() => {
    const lastPlate = useLiveStore.getState().lastResult?.plate_number;
    historySuppressedPlateRef.current = lastPlate ? normalizePlateKey(lastPlate) : null;
    clearPlateHistoryFromStore();
    setLastResult(null);
  }, [clearPlateHistoryFromStore, setLastResult]);
  const setError = useLiveStore((state) => state.setError);

  const bindVideoRef = useCallback((element: HTMLVideoElement | null) => {
    return registerLiveDisplayVideo(element);
  }, []);

  const startLiveDetection = useCallback(async () => {
    if (!token) {
      void router.push('/login');
      return;
    }
    await startLiveDetectionSession();
  }, [router, token]);

  const stopLiveDetection = useCallback(() => {
    stopLiveDetectionSession();
  }, []);

  const stopCameraOnly = useCallback(() => {
    stopCameraPreview();
  }, []);

  const stopFeed = useCallback(() => {
    stopLiveCameraFeed();
  }, []);

  const previewCamera = useCallback(async (id: string, preferredVideo?: HTMLVideoElement | null) => {
    await startCameraPreview(id, preferredVideo);
  }, []);

  return {
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
    bindVideoRef,
    getLiveSnapshotSrc,
    resolveVehicleLabel,
    resolveVehicleColour,
  };
}

export function useLiveSessionKeepAlive() {
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      resumeLiveMedia();
      ensureDetectionLoopRunning();
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      resumeLiveMedia();
      ensureDetectionLoopRunning();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);
}

/** Binds the shared camera stream to a local <video> element. */
export function useLiveCameraVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cleanupRef = useRef<(() => void) | undefined>();
  const cameraPreviewActive = useLiveStore((state) => state.cameraPreviewActive);
  const previewStreamTick = useLiveStore((state) => state.previewStreamTick);

  const setVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = undefined;
      videoRef.current = node;

      if (!node) return;

      cleanupRef.current = registerLiveDisplayVideo(node);
      if (streamRef.current && cameraPreviewActive) {
        void syncStreamToVideo(node, streamRef.current);
      }
    },
    [cameraPreviewActive]
  );

  const getVideoElement = useCallback(() => videoRef.current, []);

  useEffect(() => {
    const node = videoRef.current;
    const stream = streamRef.current;
    if (!node || !stream || !cameraPreviewActive) return;
    void syncStreamToVideo(node, stream);
  }, [cameraPreviewActive, previewStreamTick]);

  useEffect(() => () => cleanupRef.current?.(), []);

  return {
    videoRef: setVideoRef,
    getVideoElement,
    cameraPreviewActive,
  };
}

export function useLiveDisplayVideo() {
  const { videoRef, cameraPreviewActive } = useLiveCameraVideo();
  const running = useLiveStore((state) => state.running);
  const mode = useLiveStore((state) => state.mode);
  const previewSrc = useLiveStore((state) => state.previewSrc);
  const requesting = useLiveStore((state) => state.requesting);

  return {
    videoRef,
    running,
    mode,
    previewSrc,
    requesting,
    cameraPreviewActive,
  };
}
