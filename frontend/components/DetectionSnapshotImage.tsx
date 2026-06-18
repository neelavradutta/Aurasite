import { useEffect, useState } from 'react';
import { getDetectionSnapshotUrl } from '@/services/api';

interface Props {
  detectionId: number;
  plateNumber?: string | null;
  className?: string;
}

export default function DetectionSnapshotImage({
  detectionId,
  plateNumber,
  className,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function loadSnapshot() {
      setFailed(false);
      setSrc(null);

      try {
        const response = await fetch(getDetectionSnapshotUrl(detectionId));
        if (!response.ok) throw new Error('snapshot unavailable');
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void loadSnapshot();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [detectionId]);

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
