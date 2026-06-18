import { create } from 'zustand';
import type { LiveFeedPlayerHandle } from '@/components/RightPanel/LiveFeedPlayer';
import { useDashboardStore } from '@/store/dashboardStore';
import {
  detectLiveFrame,
  fetchStreamStatus,
  formatApiError,
  stopLiveFrameDetection,
  stopStreamDetection,
} from '@/services/api';

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

interface LiveFeedState {
  cameraStream: MediaStream | null;
  playbackUrl: string;
  selectedCamera: string;
  streamId?: string;
  liveSessionId?: string;
  detectionRunning: boolean;
  framesScanned: number;
  feedError: string;
  detectionError: string;
  loading: boolean;
  captureHandle: LiveFeedPlayerHandle | null;
  setPlaybackUrl: (url: string) => void;
  setCamera: (deviceLabel: string, stream: MediaStream) => void;
  stopCameraFeed: () => void;
  startDetection: () => Promise<void>;
  stopDetection: () => Promise<void>;
  hydrateStreamStatus: () => Promise<void>;
  registerCaptureHandle: (handle: LiveFeedPlayerHandle | null) => void;
}

export const useLiveFeedStore = create<LiveFeedState>((set, get) => ({
  cameraStream: null,
  playbackUrl: '',
  selectedCamera: '',
  streamId: undefined,
  liveSessionId: undefined,
  detectionRunning: false,
  framesScanned: 0,
  feedError: '',
  detectionError: '',
  loading: false,
  captureHandle: null,

  registerCaptureHandle: (handle) => set({ captureHandle: handle }),

  setPlaybackUrl: (url) => {
    const { cameraStream } = get();
    if (url.trim()) {
      stopMediaStream(cameraStream);
      set({ playbackUrl: url, cameraStream: null, selectedCamera: '', feedError: '' });
      return;
    }
    set({ playbackUrl: url, feedError: '' });
  },

  setCamera: (deviceLabel, stream) => {
    stopMediaStream(get().cameraStream);
    set({
      cameraStream: stream,
      selectedCamera: deviceLabel,
      playbackUrl: '',
      feedError: '',
    });
  },

  stopCameraFeed: () => {
    stopMediaStream(get().cameraStream);
    set({ cameraStream: null, selectedCamera: '' });
  },

  startDetection: async () => {
    const state = get();
    const hasActiveFeed = Boolean(state.cameraStream || state.playbackUrl.trim());
    if (!hasActiveFeed) {
      set({ feedError: 'Start a live feed first — select a camera or enter a playback URL.' });
      return;
    }

    set({ feedError: '', loading: true });

    try {
      const sessionId = crypto.randomUUID();
      const videoSource = state.selectedCamera || state.playbackUrl.trim() || 'live-camera';
      const { startNewAnalysisSession, setIsStreaming } = useDashboardStore.getState();

      startNewAnalysisSession(videoSource);
      set({
        liveSessionId: sessionId,
        detectionRunning: true,
        framesScanned: 0,
        detectionError: '',
      });
      setIsStreaming(true);
    } finally {
      set({ loading: false });
    }
  },

  stopDetection: async () => {
    const { liveSessionId, streamId } = get();
    set({ loading: true });

    try {
      if (liveSessionId) {
        await stopLiveFrameDetection(liveSessionId);
      }
      if (streamId) {
        await stopStreamDetection(streamId);
      }

      const { startNewAnalysisSession, setIsStreaming } = useDashboardStore.getState();
      startNewAnalysisSession(null);
      setIsStreaming(false);

      set({
        liveSessionId: undefined,
        streamId: undefined,
        detectionRunning: false,
        framesScanned: 0,
        detectionError: '',
      });
    } finally {
      set({ loading: false });
    }
  },

  hydrateStreamStatus: async () => {
    try {
      const data = await fetchStreamStatus();
      if (!data.current) return;

      const running = data.status === 'running';
      const { setIsStreaming } = useDashboardStore.getState();
      set({ streamId: data.current.streamId, detectionRunning: running });
      setIsStreaming(running);
    } catch {
      // ignore bootstrap errors
    }
  },
}));

export function hasActiveLiveFeed(): boolean {
  const { cameraStream, playbackUrl } = useLiveFeedStore.getState();
  return Boolean(cameraStream || playbackUrl.trim());
}

async function waitForVideoFrame(
  video: HTMLVideoElement,
  maxWaitMs = 4000
): Promise<boolean> {
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    if (
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    ) {
      return true;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  return (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  );
}

export async function captureLiveFeedFrame(
  video: HTMLVideoElement | null
): Promise<Blob | null> {
  if (!video) return null;

  const ready = await waitForVideoFrame(video);
  if (!ready) return null;

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.drawImage(video, 0, 0, width, height);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
  });
}

export async function processLiveFeedFrame(frame: Blob) {
  const state = useLiveFeedStore.getState();
  if (!state.liveSessionId || !state.detectionRunning) return;

  const videoSource = state.selectedCamera || state.playbackUrl.trim() || 'live-camera';
  const frameNumber = state.framesScanned;

  const result = await detectLiveFrame(frame, {
    sessionId: state.liveSessionId,
    videoSource,
    frameNumber,
  });

  useLiveFeedStore.setState({
    framesScanned: frameNumber + 1,
    detectionError: '',
  });

  const { addDetection, appendPeakTrafficDetections } = useDashboardStore.getState();
  for (const detection of result.detections ?? []) {
    addDetection(detection);
    appendPeakTrafficDetections([detection]);
  }
}

export function reportLiveDetectionError(error: unknown) {
  useLiveFeedStore.setState({
    detectionError: formatApiError(error, 'Live detection request failed'),
  });
}
