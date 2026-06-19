import { detectionService } from '../services/detectionService';
import { emitDetectionsChanged, emitViolationsUpdated } from './realtimeEvents';

type LiveSaveState = {
  plate: string;
  at: number;
};

const liveSaveBySource = new Map<string, LiveSaveState>();

const UNREADABLE_PLATES = new Set(['', 'UNREADABLE', 'UNKNOWN', 'REJECTED']);

function normalizePlate(value: unknown): string {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function resolveLiveVideoSource(mode: 'camera' | 'source', source?: string): string {
  if (mode === 'source') {
    const trimmed = String(source || '').trim();
    return trimmed ? `live:source:${trimmed.slice(0, 200)}` : 'live:source';
  }
  return 'live:camera';
}

export function resetLiveSaveSession(videoSource: string): void {
  liveSaveBySource.delete(videoSource);
}

function shouldPersistLiveDetection(videoSource: string, plateNumber: string): boolean {
  const normalized = normalizePlate(plateNumber);
  if (!normalized || UNREADABLE_PLATES.has(normalized)) return false;

  const previous = liveSaveBySource.get(videoSource);
  if (previous?.plate === normalized) return false;

  liveSaveBySource.set(videoSource, { plate: normalized, at: Date.now() });
  return true;
}

function extractPlateNumber(frame: Record<string, unknown>): string {
  const direct = frame.plate_number;
  if (typeof direct === 'string' && direct.trim()) return direct;
  const plate = frame.plate;
  if (plate && typeof plate === 'object') {
    const cleaned = (plate as { cleaned_text?: string }).cleaned_text;
    if (typeof cleaned === 'string' && cleaned.trim()) return cleaned;
  }
  return '';
}

export async function persistLiveDetectionIfNeeded(
  aiPayload: { success?: boolean; data?: Record<string, unknown> },
  videoSource: string,
  frameNumber: number
): Promise<{ success?: boolean; data?: Record<string, unknown> }> {
  if (frameNumber <= 1) {
    resetLiveSaveSession(videoSource);
  }

  const frame = aiPayload?.data;
  if (!frame || typeof frame !== 'object') return aiPayload;

  const plateNumber = extractPlateNumber(frame);
  if (!shouldPersistLiveDetection(videoSource, plateNumber)) {
    return aiPayload;
  }

  const { saved } = await detectionService.saveAiDetections(
    [frame],
    videoSource,
    (update) => {
      emitViolationsUpdated([update]);
    }
  );

  if (saved.length === 0) return aiPayload;

  emitDetectionsChanged({ videoSource, savedCount: saved.length });

  return {
    ...aiPayload,
    data: {
      ...frame,
      detection_id: saved[0].id,
      saved_to_log: true,
    },
  };
}
