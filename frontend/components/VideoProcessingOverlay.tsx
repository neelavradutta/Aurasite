import { useEffect } from 'react';
import { isImageFileName } from '@/utils/mediaFile';

export type ProcessingPhase = 'uploading' | 'processing' | 'saving' | 'complete' | 'error';

export interface ProcessingOverlayState {
  fileName: string;
  phase: ProcessingPhase;
  progress: number;
  statusMessage: string;
  framesProcessed: number;
  maxFrames: number;
  error?: string;
}

interface Props {
  state: ProcessingOverlayState;
  onClose?: () => void;
  onStop?: () => void;
  onRetry?: () => void;
}

function footerLeftLabel(phase: ProcessingPhase): string {
  if (phase === 'complete') return 'COMPLETE';
  return 'PLEASE WAIT';
}

function isActivePhase(phase: ProcessingPhase): boolean {
  return phase === 'uploading' || phase === 'processing' || phase === 'saving';
}

const MAX_FILENAME_DISPLAY = 35;

function formatProcessingFileName(fileName: string): string {
  if (fileName.length <= MAX_FILENAME_DISPLAY) return fileName;
  return `${fileName.slice(0, MAX_FILENAME_DISPLAY)}...`;
}

export default function VideoProcessingOverlay({ state, onClose, onStop, onRetry }: Props) {
  const { fileName, phase, progress, statusMessage, error } = state;
  const isError = phase === 'error';
  const isComplete = phase === 'complete';
  const showStop = isActivePhase(phase) && Boolean(onStop);
  const showRetry = isError && Boolean(onRetry);
  const showClose = isError && Boolean(onClose);
  const isImage = isImageFileName(fileName);
  const processingTitle = isImage ? 'Image Processing' : 'Video Processing';
  const displayFileName = formatProcessingFileName(fileName);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#050816]/80 px-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-processing-title"
    >
      <div className="w-full max-w-3xl text-center">
        <div className="mx-auto mb-8 flex h-40 w-40 items-center justify-center md:h-44 md:w-44">
          {!isError && !isComplete && (
            <div className="processing-loader" aria-hidden>
              <div className="processing-loader__halo" />
              <div className="processing-loader__scan" />
              <div className="processing-loader__ring processing-loader__ring--outer" />
              <div className="processing-loader__ring processing-loader__ring--mid" />
              <div className="processing-loader__ring processing-loader__ring--inner" />
              <div className="processing-loader__orbit">
                <span />
                <span />
                <span />
              </div>
              <div className="processing-loader__core" />
            </div>
          )}
          {isError && (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-cyber-pink/40 bg-cyber-pink/10">
              <span className="font-orbitron text-2xl text-cyber-pink">!</span>
            </div>
          )}
          {isComplete && (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-cyber-green/40 bg-cyber-green/10">
              <span className="font-orbitron text-2xl text-cyber-green">✓</span>
            </div>
          )}
        </div>

        <p className="font-orbitron text-xl uppercase tracking-[0.35em] text-cyber-cyan md:text-2xl">
          {processingTitle}
        </p>

        <h2
          id="video-processing-title"
          className="mt-4 truncate font-mono text-3xl font-semibold text-white md:text-4xl"
          title={fileName.length > MAX_FILENAME_DISPLAY ? fileName : undefined}
        >
          {displayFileName}
        </h2>

        <p className={`mt-3 text-sm ${isError ? 'text-cyber-pink' : 'text-slate-400'}`}>
          {error || statusMessage}
        </p>

        <div className="mx-auto mt-10 max-w-2xl rounded-full border-2 border-cyber-cyan/70 bg-black/40 p-1 shadow-[0_0_24px_rgba(0,247,255,0.25)]">
          <div className="processing-progress-bar-container">
            {!isError && !isComplete ? <div className="processing-progress-grid-bg" /> : null}
            <div
              className={`processing-progress-bar-fill transition-all duration-500 ease-out ${
                isError ? 'processing-progress-bar-fill--error' : ''
              }`}
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        </div>

        <div className="mx-auto mt-3 flex max-w-2xl items-center justify-between gap-4 font-orbitron uppercase tracking-[0.18em]">
          {showRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 rounded-full border border-cyber-cyan/70 bg-cyber-cyan/10 px-5 py-1.5 font-orbitron text-sm uppercase tracking-[0.18em] text-cyber-cyan shadow-[0_0_16px_rgba(0,247,255,0.2)] transition hover:border-cyber-cyan hover:bg-cyber-cyan/20 hover:text-white"
            >
              Try Again
            </button>
          ) : (
            <span className="shrink-0 text-left text-base text-slate-300">{footerLeftLabel(phase)}</span>
          )}
          <span className="shrink-0 text-base text-cyber-cyan">{Math.round(progress)}%</span>
          {showStop ? (
            <button
              type="button"
              onClick={onStop}
              className="shrink-0 rounded-full border border-cyber-pink/70 bg-cyber-pink/10 px-5 py-1.5 font-orbitron text-sm uppercase tracking-[0.18em] text-cyber-pink shadow-[0_0_16px_rgba(255,0,110,0.2)] transition hover:border-cyber-pink hover:bg-cyber-pink/20 hover:text-white"
            >
              Stop
            </button>
          ) : showClose ? (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-white/25 bg-black/40 px-5 py-1.5 font-orbitron text-sm uppercase tracking-[0.18em] text-white transition hover:border-cyber-cyan/50 hover:text-cyber-cyan"
            >
              Close
            </button>
          ) : (
            <span className="invisible shrink-0 px-5 py-1.5" aria-hidden>
              Close
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
