import { getDetectionSnapshotUrl, LiveDetectionFrame } from '@/services/api';

export type LiveMode = 'camera' | 'source';

export function resolveLiveVideoSource(mode: LiveMode, source?: string): string {
  if (mode === 'source') {
    const trimmed = String(source || '').trim();
    return trimmed ? `live:source:${trimmed.slice(0, 200)}` : 'live:source';
  }
  return 'live:camera';
}

export function getLiveSnapshotInlineSrc(item: LiveDetectionFrame | null): string | null {
  if (!item) return null;
  const raw = item.dashboard_image_base64 || item.plate_image_base64;
  if (!raw) return null;
  if (raw.startsWith('data:')) return raw;
  return `data:image/jpeg;base64,${raw}`;
}

export function hasLiveSnapshot(item: LiveDetectionFrame | null): boolean {
  if (!item) return false;
  return Boolean(getLiveSnapshotInlineSrc(item) || item.detection_id);
}

export function getLiveSnapshotSrc(item: LiveDetectionFrame | null): string | null {
  const inline = getLiveSnapshotInlineSrc(item);
  if (inline) return inline;
  if (item?.detection_id) {
    return getDetectionSnapshotUrl(item.detection_id);
  }
  return null;
}

export function snapshotSrcFromFrame(frame: LiveDetectionFrame | null): string | null {
  return getLiveSnapshotSrc(frame);
}

export function isLiveVideoSource(videoSource?: string | null): boolean {
  return Boolean(videoSource?.startsWith('live:'));
}
