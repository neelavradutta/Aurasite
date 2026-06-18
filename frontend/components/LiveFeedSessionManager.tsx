import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import {
  captureLiveFeedFrame,
  hasActiveLiveFeed,
  processLiveFeedFrame,
  reportLiveDetectionError,
  useLiveFeedStore,
} from '@/store/liveFeedStore';

const ReactPlayer = dynamic(() => import('react-player'), { ssr: false });

const FRAME_INTERVAL_MS = 1500;
const CAPTURE_RETRY_ATTEMPTS = 4;
const CAPTURE_RETRY_DELAY_MS = 250;

function getHiddenVideoElement(
  mediaStream: MediaStream | null,
  cameraVideo: HTMLVideoElement | null,
  playerRef: React.RefObject<{ getInternalPlayer?: () => unknown } | null>
): HTMLVideoElement | null {
  if (mediaStream && cameraVideo) {
    return cameraVideo;
  }

  const internal = playerRef.current?.getInternalPlayer?.();
  if (internal instanceof HTMLVideoElement) {
    return internal;
  }

  return null;
}

/** Keeps live camera/detection alive across page navigation. */
export default function LiveFeedSessionManager() {
  const cameraStream = useLiveFeedStore((s) => s.cameraStream);
  const playbackUrl = useLiveFeedStore((s) => s.playbackUrl);
  const captureHandle = useLiveFeedStore((s) => s.captureHandle);
  const detectionRunning = useLiveFeedStore((s) => s.detectionRunning);
  const liveSessionId = useLiveFeedStore((s) => s.liveSessionId);
  const hydrateStreamStatus = useLiveFeedStore((s) => s.hydrateStreamStatus);
  const stopDetection = useLiveFeedStore((s) => s.stopDetection);

  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<{ getInternalPlayer?: () => unknown } | null>(null);

  const playerUrl =
    !cameraStream && playbackUrl.trim() ? playbackUrl.trim() : undefined;
  const needsHiddenCamera = Boolean(cameraStream);
  const needsHiddenPlayer = Boolean(playerUrl && !captureHandle?.hasActiveFeed());

  useEffect(() => {
    void hydrateStreamStatus();
  }, [hydrateStreamStatus]);

  useEffect(() => {
    const video = cameraVideoRef.current;
    if (!video || !cameraStream) return;

    video.srcObject = cameraStream;
    void video.play().catch(() => undefined);

    return () => {
      if (video.srcObject === cameraStream) {
        video.srcObject = null;
      }
    };
  }, [cameraStream]);

  useEffect(() => {
    if (!detectionRunning || hasActiveLiveFeed()) return;
    void stopDetection();
  }, [detectionRunning, cameraStream, playbackUrl, stopDetection]);

  useEffect(() => {
    if (!detectionRunning || !liveSessionId) return;

    let cancelled = false;
    let processing = false;

    async function captureAndDetect() {
      if (cancelled || processing) return;
      if (!hasActiveLiveFeed()) return;

      const registered = useLiveFeedStore.getState().captureHandle;
      let frame: Blob | null = null;

      for (let attempt = 0; attempt < CAPTURE_RETRY_ATTEMPTS && !frame && !cancelled; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, CAPTURE_RETRY_DELAY_MS));
        }

        if (registered?.hasActiveFeed()) {
          frame = await registered.captureFrame();
        } else {
          const video = getHiddenVideoElement(cameraStream, cameraVideoRef.current, playerRef);
          frame = await captureLiveFeedFrame(video);
        }
      }

      if (!frame || cancelled) return;

      processing = true;
      try {
        await processLiveFeedFrame(frame);
      } catch (error) {
        reportLiveDetectionError(error);
      } finally {
        processing = false;
      }
    }

    const interval = window.setInterval(() => {
      void captureAndDetect();
    }, FRAME_INTERVAL_MS);

    void captureAndDetect();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [detectionRunning, liveSessionId, cameraStream, playbackUrl, captureHandle]);

  if (!needsHiddenCamera && !needsHiddenPlayer) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed -left-[9999px] -top-[9999px] h-px w-px overflow-hidden opacity-0" aria-hidden>
      {needsHiddenCamera ? (
        <video ref={cameraVideoRef} autoPlay muted playsInline width={640} height={480} />
      ) : null}
      {needsHiddenPlayer ? (
        <ReactPlayer
          ref={playerRef}
          url={playerUrl}
          width={640}
          height={480}
          playing
          muted
        />
      ) : null}
    </div>
  );
}
