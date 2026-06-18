import { Detection } from '@/types/detection';
import { IMAGE_EXTENSIONS } from '@/utils/mediaFile';

const VIDEO_FILE_SOURCE = /\.(mp4|avi|mov|mkv|webm|wmv|flv|m4v|3gp|mpeg|mpg)$/i;

/** Uploaded image/video filenames saved as video_source — not live monitor feeds. */
export function isUploadedMediaSource(source?: string | null): boolean {
  if (!source?.trim()) return false;
  const normalized = source.trim();
  return VIDEO_FILE_SOURCE.test(normalized) || IMAGE_EXTENSIONS.test(normalized);
}

/** True when detection came from live monitor (camera / playback URL), not an uploaded file. */
export function isLiveFeedVideoSource(source?: string | null): boolean {
  if (!source?.trim()) return false;

  const normalized = source.trim();

  if (isUploadedMediaSource(normalized)) return false;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return true;
  if (normalized === 'live-camera' || normalized === 'live-stream') return true;

  // Camera device labels from getUserMedia (e.g. "Integrated Camera (04f2:b6dd)").
  if (normalized.includes('(') && normalized.includes(')')) return true;

  // Paths are uploads or file references, not live feeds.
  if (normalized.includes('/') || normalized.includes('\\')) return false;

  // Non-file device names without extensions (camera labels).
  return !/\.[a-z0-9]{2,5}$/i.test(normalized);
}

export function filterLiveFeedDetections(detections: Detection[]): Detection[] {
  return detections.filter((detection) => isLiveFeedVideoSource(detection.video_source));
}

/** Restrict to the active live monitor feed (camera label or playback URL). */
export function filterActiveLiveFeedDetections(
  detections: Detection[],
  liveFeedSource?: string | null
): Detection[] {
  const source = liveFeedSource?.trim();
  if (!source) return [];

  return filterLiveFeedDetections(detections).filter(
    (detection) => (detection.video_source || '').trim() === source
  );
}
