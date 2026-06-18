import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Detection } from '@/types/detection';
import { downloadDetectionSnapshot } from '@/services/api';
import DetectionSnapshotImage from './DetectionSnapshotImage';

interface Props {
  detection: Detection | null;
  open: boolean;
  onClose: () => void;
}

export default function PlateSnapshotModal({ detection, open, onClose }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!mounted || !open || !detection) return null;

  const hasSnapshot = Boolean(detection.frame_image_path);

  return createPortal(
    <div
      data-plate-snapshot-modal
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-2xl rounded-2xl border border-cyber-cyan/30 p-6 shadow-neon"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-orbitron text-2xl uppercase tracking-wider text-cyber-cyan">
              {detection.plate_number}
            </h3>
            <p className="mt-1.5 text-sm text-slate-400">Plate snapshot preview</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-white/10 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-cyber-cyan hover:text-cyber-cyan"
          >
            Close
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
          {hasSnapshot ? (
            <DetectionSnapshotImage
              detectionId={detection.id}
              plateNumber={detection.plate_number}
              className="max-h-[420px] w-full object-cover"
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">
              No snapshot available for this detection
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300 hover:border-white/20"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!detection.frame_image_path}
            onClick={() => {
              downloadDetectionSnapshot(detection).catch(() => undefined);
            }}
            className="rounded-md border border-cyber-cyan/50 bg-cyber-cyan/10 px-4 py-2 text-sm text-cyber-cyan transition hover:bg-cyber-cyan/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Download Snapshot
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
