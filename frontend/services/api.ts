import axios from 'axios';
import { Detection } from '@/types/detection';
import { Vehicle } from '@/types/vehicle';
import { getItem } from './storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120_000,
});

export function formatApiError(err: unknown, fallback = 'Request failed'): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : fallback;
  }

  const code = err.code;
  if (code === 'ECONNABORTED') {
    return 'Request timed out. Try a smaller video or restart the backend and AI services.';
  }
  if (code === 'ECONNRESET' || err.message.toLowerCase().includes('socket hang up')) {
    return 'Connection lost to server. Ensure backend (port 8000) and AI service (port 5000) are running.';
  }

  return String(err.response?.data?.message || err.message || fallback);
}

api.interceptors.request.use((config) => {
  const token = getItem<string | null>('auth_token', null);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Let the browser set multipart boundary for file uploads.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

export async function login(email: string, password: string) {
  const { data } = await api.post('/auth/login', { email, password });
  return data.data;
}

export async function register(email: string, password: string, name: string) {
  const { data } = await api.post('/auth/register', { email, password, name });
  return data.data;
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me');
  return data.data;
}

export async function fetchSummary() {
  const { data } = await api.get('/analytics/summary');
  return data.data;
}

export async function fetchDetections(params?: {
  page?: number;
  limit?: number;
  plate?: string;
  minConfidence?: number;
  video_source?: string;
}) {
  const { data } = await api.get('/detections', { params });
  return data;
}

export async function clearAllSessionData() {
  const { data } = await api.post('/detections/clear');
  return data;
}

export async function fetchCameraLocations() {
  const { data } = await api.get('/cameras/locations');
  return (data.data || []) as Array<{
    video_source: string;
    name?: string;
    latitude: number | null;
    longitude: number | null;
    camera_code?: string;
  }>;
}

export async function fetchTraffic() {
  const { data } = await api.get('/analytics/traffic');
  return data.data;
}

export async function fetchConfidence() {
  const { data } = await api.get('/analytics/confidence');
  return data.data;
}

export async function fetchRepeatAnalysis() {
  const { data } = await api.get('/analytics/repeat');
  return data.data;
}

export async function fetchFrequentVehicles() {
  const { data } = await api.get('/analytics/vehicles');
  return data.data;
}

export async function fetchAlerts() {
  const { data } = await api.get('/alerts/unresolved');
  return data.data;
}

export async function fetchSuspicious() {
  const { data } = await api.get('/suspicious');
  return data.data;
}

export async function uploadVideo(
  file: File,
  options?: Record<string, unknown>,
  signal?: AbortSignal
) {
  const form = new FormData();
  form.append('video_file', file);
  if (options) form.append('options', JSON.stringify(options));
  const { data } = await api.post('/detect', form, {
    timeout: 600_000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    signal,
  });
  return data;
}

export interface LiveDetectionFrame {
  frame_id?: number;
  timestamp?: number;
  plate_number?: string;
  detection_quality?: string;
  plate_confidence?: number;
  vehicle_confidence?: number;
  processing_time_ms?: number;
  plate_bbox?: { bbox?: number[] } | number[] | null;
  plate?: {
    raw_text?: string;
    cleaned_text?: string;
    confidence?: number;
    detection_quality?: string;
  } | null;
  vehicle?: Record<string, unknown> | null;
  vehicle_type?: string;
  vehicle_color?: string | null;
  dashboard_image_base64?: string | null;
  plate_image_base64?: string | null;
  detection_id?: number;
  saved_to_log?: boolean;
}

export interface LiveDetectionResponse {
  success: boolean;
  data: LiveDetectionFrame;
  message?: string;
}

export async function detectLiveFrame(
  frame: Blob,
  frameNumber: number,
  timestamp: number,
  signal?: AbortSignal
): Promise<LiveDetectionResponse> {
  const form = new FormData();
  form.append('frame', frame, `live-frame-${frameNumber}.jpg`);
  form.append('frame_number', String(frameNumber));
  form.append('timestamp', String(timestamp));

  const { data } = await api.post('/live/frame', form, { signal });
  return data;
}

export async function detectLiveSourceFrame(
  source: string,
  frameNumber: number,
  timestamp: number,
  signal?: AbortSignal
): Promise<LiveDetectionResponse> {
  const { data } = await api.post(
    '/live/source/frame',
    { source, frame_number: frameNumber, timestamp },
    { signal }
  );
  return data;
}

export async function persistLiveDetectionRecord(payload: {
  plate_number: string;
  frame_number?: number;
  plate_confidence?: number;
  vehicle_confidence?: number;
  vehicle_type?: string;
  vehicle_color?: string | null;
  detection_quality?: string;
  dashboard_image_base64?: string | null;
  plate_image_base64?: string | null;
  mode: 'camera' | 'source';
  source?: string;
}): Promise<LiveDetectionResponse> {
  const { data } = await api.post('/live/record', payload);
  return data;
}

export async function releaseLiveSource(source: string): Promise<void> {
  await api.post('/live/source/release', { source });
}

export async function resetLiveSaveSession(mode: 'camera' | 'source', source?: string): Promise<void> {
  await api.post('/live/session/reset', { mode, source: source?.trim() || undefined });
}

export class ProcessingCancelledError extends Error {
  constructor() {
    super('Processing cancelled');
    this.name = 'ProcessingCancelledError';
  }
}

export async function waitForJob(
  jobId: string,
  onProgress?: (update: {
    status: string;
    progress: number;
    framesProcessed: number;
    maxFrames: number;
  }) => void,
  pollMs = 1000,
  shouldCancel?: () => boolean
): Promise<Record<string, unknown>> {
  for (;;) {
    if (shouldCancel?.()) {
      throw new ProcessingCancelledError();
    }

    const job = await fetchJobStatus(jobId);
    const status = String(job.status || 'unknown');
    const progress = Number(job.progress) || 0;
    const framesProcessed = Number(job.frames_processed) || 0;
    const maxFrames = Number(job.max_frames) || 0;
    onProgress?.({ status, progress, framesProcessed, maxFrames });

    if (status === 'completed' || status === 'complete') {
      return job;
    }
    if (status === 'failed') {
      throw new Error(String(job.failedReason || 'Video processing failed'));
    }
    if (status === 'not_found') {
      throw new Error('Processing job not found');
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export async function fetchJobStatus(jobId: string) {
  const { data } = await api.get(`/jobs/${jobId}/status`);
  return data.data;
}

export async function fetchVehicles(params?: Record<string, string | number>) {
  const { data } = await api.get('/vehicles', { params });
  return data;
}

export async function searchVehiclesByPlate(plate: string): Promise<Vehicle[]> {
  const { data } = await api.get('/vehicles/search', { params: { plate } });
  return (data.data || []) as Vehicle[];
}

export async function fetchVehicleById(id: number): Promise<Vehicle> {
  const { data } = await api.get(`/vehicles/${id}`);
  return data.data as Vehicle;
}

export async function resolveAlert(id: number, resolvedBy = 'operator') {
  const { data } = await api.post(`/alerts/${id}/resolve`, { resolved_by: resolvedBy });
  return data;
}

export async function flagVehicle(id: number, reason: string) {
  const { data } = await api.post(`/vehicles/${id}/flag`, { reason });
  return data;
}

export async function updateVehicleStatus(id: number, status: string, reason?: string) {
  const { data } = await api.post(`/vehicles/${id}/status`, { status, reason });
  return data.data as Vehicle;
}

export function getExportDetectionsUrl(params?: { plate?: string; days?: number }) {
  const base = `${API_URL}/api/v1/analytics/export/detections`;
  const query = new URLSearchParams();
  if (params?.plate) query.set('plate', params.plate);
  if (params?.days) query.set('days', String(params.days));
  const qs = query.toString();
  return qs ? `${base}?${qs}` : base;
}

export function getExportVehiclesUrl() {
  return `${API_URL}/api/v1/analytics/export/vehicles`;
}

export async function downloadCsv(url: string, filename: string) {
  const token = getItem<string | null>('auth_token', null);
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error('Export failed');
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function getDetectionSnapshotUrl(detectionId: number): string {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return `${API_URL}/api/v1/detections/${detectionId}/snapshot`;
}

export async function downloadDetectionSnapshot(detection: Detection): Promise<void> {
  if (!detection.frame_image_path) return;

  const response = await fetch(getDetectionSnapshotUrl(detection.id));
  if (!response.ok) throw new Error('Download failed');

  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `plate-${detection.plate_number || detection.id}.jpg`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function getStreamPreviewUrl(streamId: string) {
  return `${API_URL}/api/v1/stream/${streamId}/preview`;
}
