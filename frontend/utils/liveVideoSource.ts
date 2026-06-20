import { LiveDetectionFrame } from '@/services/api';

export type LiveMode = 'camera' | 'source';

export function resolveLiveVideoSource(mode: LiveMode, source?: string): string {
  if (mode === 'source') {
    const trimmed = String(source || '').trim();
    return trimmed ? `live:source:${trimmed.slice(0, 200)}` : 'live:source';
  }
  return 'live:camera';
}

export function getLiveSnapshotSrc(item: LiveDetectionFrame | null): string | null {
  if (!item) return null;
  const raw = item.dashboard_image_base64 || item.plate_image_base64;
  if (!raw) return null;
  if (raw.startsWith('data:')) return raw;
  return `data:image/jpeg;base64,${raw}`;
}

export function snapshotSrcFromFrame(frame: LiveDetectionFrame | null): string | null {
  return getLiveSnapshotSrc(frame);
}

export function isLiveVideoSource(videoSource?: string | null): boolean {
  return Boolean(videoSource?.startsWith('live:'));
}
