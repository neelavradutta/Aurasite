import dynamic from 'next/dynamic';
import Link from 'next/link';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Card from '../shared/Card';
import { useDashboardStore } from '@/store/dashboardStore';
import { useLiveFeedStore } from '@/store/liveFeedStore';
import { getStreamPreviewUrl } from '@/services/api';
import { captureLiveFeedFrame } from '@/store/liveFeedStore';

const ReactPlayer = dynamic(() => import('react-player'), { ssr: false });

export const LIVE_FEED_ANCHOR = 'live-feed';

export interface LiveFeedPlayerHandle {
  captureFrame: () => Promise<Blob | null>;
  hasActiveFeed: () => boolean;
}

interface Props {
  streamUrl?: string;
  streamId?: string;
  playbackUrl?: string;
  mediaStream?: MediaStream | null;
  onStopCameraFeed?: () => void;
  fillHeight?: boolean;
  className?: string;
  /** When set, the whole panel links to live monitor (or another route). */
  href?: string;
  /** Anchor id for scroll targets on the live monitor page. */
  sectionId?: string;
}

function getVideoElement(
  mediaStream: MediaStream | null | undefined,
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

const LiveFeedPlayer = forwardRef<LiveFeedPlayerHandle, Props>(function LiveFeedPlayer(
  {
    streamUrl,
    streamId,
    playbackUrl,
    mediaStream,
    onStopCameraFeed,
    fillHeight = false,
    className = '',
    href,
    sectionId,
  },
  ref
) {
  const { isStreaming } = useDashboardStore();
  const registerCaptureHandle = useLiveFeedStore((s) => s.registerCaptureHandle);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<{ getInternalPlayer?: () => unknown } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const previewSrc = streamId ? `${getStreamPreviewUrl(streamId)}?t=${previewKey}` : undefined;
  const playerUrl =
    !mediaStream && (playbackUrl || (streamUrl?.startsWith('http') ? streamUrl : undefined));
  const feedActive = !!mediaStream || !!playerUrl || !!previewSrc;
  const isLinkPreview = Boolean(href);

  useEffect(() => {
    if (!streamId) return;
    const interval = setInterval(() => setPreviewKey((k) => k + 1), 1000);
    return () => clearInterval(interval);
  }, [streamId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (mediaStream) {
      video.srcObject = mediaStream;
      void video.play().catch(() => undefined);
      return;
    }

    video.srcObject = null;
  }, [mediaStream]);

  const captureFrame = async () => {
    const video = getVideoElement(mediaStream, videoRef.current, playerRef);
    return captureLiveFeedFrame(video);
  };

  const hasActiveFeed = () => Boolean(mediaStream || playerUrl);

  useImperativeHandle(ref, () => ({
    hasActiveFeed,
    captureFrame,
  }));

  useEffect(() => {
    if (!feedActive) {
      registerCaptureHandle(null);
      return;
    }

    registerCaptureHandle({ hasActiveFeed, captureFrame });
    return () => registerCaptureHandle(null);
  }, [feedActive, mediaStream, playerUrl, registerCaptureHandle]);

  const active = feedActive || isStreaming;

  const panel = (
    <Card
      id={sectionId}
      className={`${fillHeight ? 'flex h-full min-h-0 flex-col overflow-hidden' : ''} ${
        sectionId ? 'scroll-mt-24' : ''
      } ${href ? 'transition hover:border-cyber-cyan/30 hover:bg-white/[0.03]' : ''} ${
        href ? '' : className
      }`.trim()}
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <h3 className="font-orbitron text-sm uppercase tracking-wider text-cyber-cyan">Live Feed</h3>

        {mediaStream && onStopCameraFeed && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onStopCameraFeed();
            }}
            className="rounded-md border border-cyber-pink/50 bg-cyber-pink/10 px-3 py-1.5 text-xs font-semibold text-cyber-pink transition hover:bg-cyber-pink/20"
          >
            Stop Feed
          </button>
        )}
      </div>

      <div
        className={`relative min-h-0 overflow-hidden rounded-lg border border-cyber-cyan/20 bg-black/50 ${
          fillHeight ? 'flex-1' : 'aspect-video'
        }`}
      >
        <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(transparent_96%,rgba(0,247,255,0.08)_100%)] bg-[length:100%_4px]" />

        {mediaStream ? (
          <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />
        ) : playerUrl ? (
          <ReactPlayer
            ref={playerRef}
            url={playerUrl}
            width="100%"
            height="100%"
            controls={!isLinkPreview}
            playing
            muted
          />
        ) : previewSrc ? (
          <img src={previewSrc} alt="Live preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className={`h-3 w-3 rounded-full ${active ? 'bg-cyber-green live-dot' : 'bg-slate-600'}`} />
            <p className="font-orbitron text-sm text-cyber-cyan">
              {active ? 'STREAM ACTIVE' : 'AWAITING STREAM'}
            </p>
            <p className="text-xs text-slate-500">Select a camera or enter a playback URL</p>
          </div>
        )}
      </div>

      {href ? (
        <p className="mb-0 mt-3 shrink-0 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500 group-hover:text-cyber-cyan/80">
          Open live monitor
        </p>
      ) : null}
    </Card>
  );

  if (!href) return panel;

  return (
    <Link
      href={href}
      className={`group block h-full min-h-0 overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyber-cyan/50 ${className}`}
      aria-label="Open Live Feed in Live Monitor"
    >
      {panel}
    </Link>
  );
});

export default LiveFeedPlayer;
