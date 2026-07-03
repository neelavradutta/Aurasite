import Link from 'next/link';
import { useLiveDisplayVideo } from '@/hooks/useLiveDetection';
import PanelIconHeader from '@/components/shared/PanelIconHeader';
import { LiveFeedPanelIcon } from '@/components/NavIcons';

export default function LiveFeedLaunchCard() {
  const { videoRef, running, mode, previewSrc, requesting, cameraPreviewActive } = useLiveDisplayVideo();
  const showCameraFeed = mode === 'camera' && (cameraPreviewActive || running);
  const showSourcePreview = running && mode === 'source' && previewSrc;
  const isActive = running;

  return (
    <Link
      href="/live"
      className="glass-panel group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/5 p-4 transition hover:border-cyber-cyan/30 hover:bg-white/[0.03]"
    >
      <div className="relative flex items-center justify-between gap-3">
        <PanelIconHeader
          icon={<LiveFeedPanelIcon />}
          title="Live Feed"
          className="!mb-0 min-w-0"
        />
        {isActive ? (
          <span className="inline-flex h-[1.375rem] shrink-0 items-center rounded border border-cyber-cyan/40 bg-black/60 px-2 font-orbitron text-base uppercase tracking-wider text-cyber-cyan">
            {requesting ? 'Analyzing' : 'Live'}
          </span>
        ) : cameraPreviewActive ? (
          <span className="rounded-full border border-cyber-cyan/40 bg-black/60 px-2.5 py-1 text-[0.75rem] uppercase tracking-[0.14em] text-cyber-cyan">
            Preview
          </span>
        ) : null}
      </div>

      <div className="relative mt-2 flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-cyber-cyan/20 bg-black/35">
        {showCameraFeed ? (
          <>
            <video
              ref={videoRef}
              muted
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <div className="absolute left-1/4 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
              <div className="absolute left-3/4 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
              <div className="absolute left-0 top-1/4 h-px w-full -translate-y-1/2 bg-white/15" />
              <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/15" />
              <div className="absolute left-0 top-3/4 h-px w-full -translate-y-1/2 bg-white/15" />
            </div>
          </>
        ) : showSourcePreview ? (
          <>
            <img
              src={previewSrc}
              alt="Live source preview"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <div className="absolute left-1/4 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
              <div className="absolute left-3/4 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
              <div className="absolute left-0 top-1/4 h-px w-full -translate-y-1/2 bg-white/15" />
              <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/15" />
              <div className="absolute left-0 top-3/4 h-px w-full -translate-y-1/2 bg-white/15" />
            </div>
          </>
        ) : (
          <div className="relative text-center">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-cyber-cyan">
              {isActive ? 'Live session active' : 'Awaiting Stream'}
            </p>
            <p className="mt-1 text-center text-sm text-slate-500">
              {isActive ? 'Open Live page for controls' : 'Select a camera or enter a url'}
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}
