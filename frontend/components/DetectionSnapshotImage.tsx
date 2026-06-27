import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDetectionSnapshotBlob } from '@/services/api';

interface Props {
  detectionId?: number;
  inlineSrc?: string | null;
  plateNumber?: string | null;
  className?: string;
}

export default function DetectionSnapshotImage({
  detectionId,
  inlineSrc,
  plateNumber,
  className,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      if (inlineSrc) {
        setFailed(false);
        revokeObjectUrl();
        setSrc(inlineSrc);
        return;
      }

      if (!detectionId) {
        setFailed(true);
        setSrc(null);
        revokeObjectUrl();
        return;
      }

      setFailed(false);
      setSrc(null);
      revokeObjectUrl();

      try {
        const blob = await fetchDetectionSnapshotBlob(detectionId);
        if (cancelled) return;
        objectUrlRef.current = URL.createObjectURL(blob);
        setSrc(objectUrlRef.current);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void loadSnapshot();

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible' || cancelled) return;
      void loadSnapshot();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      revokeObjectUrl();
    };
  }, [detectionId, inlineSrc, revokeObjectUrl]);

  if (failed || !src) {
    return (
      <div
        className={`flex items-center justify-center bg-teal-800/55 px-3 text-center text-[11px] uppercase tracking-wide text-white/70 ${className || ''}`}
      >
        {failed ? 'Snapshot unavailable' : 'Loading snapshot...'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`Snapshot ${plateNumber || detectionId}`}
      className={className}
      loading="lazy"
      draggable={false}
    />
  );
}
