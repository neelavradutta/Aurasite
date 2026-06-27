import { Detection } from '@/types/detection';
import { LiveDetectionFrame } from '@/services/api';
import { LiveMode } from '@/utils/liveVideoSource';
import {
  DetectionListFilters,
  DetectionSortOption,
} from '@/utils/detectionFilters';
import { getSessionItem, removeSessionItem, setSessionItem } from '@/services/storage';

export const SERVER_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const SESSION_META_KEY = 'apnr_session_meta';
const DASHBOARD_KEY = 'apnr_dashboard_session';
const LIVE_KEY = 'apnr_live_session';
const DETECTIONS_PAGE_KEY = 'apnr_detections_page_cache';
const VEHICLES_PAGE_KEY = 'apnr_vehicles_page_cache';

interface SessionMeta {
  expiresAt: number;
}

export interface DashboardSessionSnapshot {
  detections: Detection[];
  peakTrafficDetections: Detection[];
  sessionVideoSource: string | null;
  sessionVersion: number;
  detectionsVersion: number;
}

export interface LiveSessionSnapshot {
  plateHistory: LiveDetectionFrame[];
  lastResult: LiveDetectionFrame | null;
  mode: LiveMode;
  source: string;
  deviceId: string;
}

export interface DetectionsPageCache {
  detections: Detection[];
  totalCount: number;
  searchQuery: string;
  sortOption?: DetectionSortOption;
  listFilters?: DetectionListFilters;
}

function touchSessionMeta(): void {
  setSessionItem(SESSION_META_KEY, {
    expiresAt: Date.now() + SERVER_SESSION_TTL_MS,
  } satisfies SessionMeta);
}

export function isSessionExpired(): boolean {
  const meta = getSessionItem<SessionMeta | null>(SESSION_META_KEY, null);
  if (!meta?.expiresAt) return false;
  return Date.now() > meta.expiresAt;
}

export function clearAllSessionPersistence(): void {
  removeSessionItem(SESSION_META_KEY);
  removeSessionItem(DASHBOARD_KEY);
  removeSessionItem(LIVE_KEY);
  removeSessionItem(DETECTIONS_PAGE_KEY);
  removeSessionItem(VEHICLES_PAGE_KEY);
}

export function clearLiveSessionPersistence(): void {
  removeSessionItem(LIVE_KEY);
}

export function loadDashboardSessionSnapshot(): DashboardSessionSnapshot | null {
  if (isSessionExpired()) {
    clearAllSessionPersistence();
    return null;
  }
  const snapshot = getSessionItem<DashboardSessionSnapshot | null>(DASHBOARD_KEY, null);
  if (snapshot) touchSessionMeta();
  return snapshot;
}

export function persistDashboardSessionSnapshot(snapshot: DashboardSessionSnapshot): void {
  setSessionItem(DASHBOARD_KEY, snapshot);
  touchSessionMeta();
}

export function loadLiveSessionSnapshot(): LiveSessionSnapshot | null {
  if (isSessionExpired()) {
    clearAllSessionPersistence();
    return null;
  }
  const snapshot = getSessionItem<LiveSessionSnapshot | null>(LIVE_KEY, null);
  if (snapshot) touchSessionMeta();
  return snapshot;
}

function slimLiveFrame(frame: LiveDetectionFrame | null): LiveDetectionFrame | null {
  if (!frame) return null;
  if (!frame.detection_id) return frame;
  return {
    ...frame,
    dashboard_image_base64: null,
    plate_image_base64: null,
  };
}

export function persistLiveSessionSnapshot(snapshot: LiveSessionSnapshot): void {
  setSessionItem(LIVE_KEY, {
    ...snapshot,
    lastResult: slimLiveFrame(snapshot.lastResult),
    plateHistory: snapshot.plateHistory.map((entry) => slimLiveFrame(entry) ?? entry),
  });
  touchSessionMeta();
}

export function loadDetectionsPageCache(): DetectionsPageCache | null {
  if (isSessionExpired()) {
    clearAllSessionPersistence();
    return null;
  }
  const cache = getSessionItem<DetectionsPageCache | null>(DETECTIONS_PAGE_KEY, null);
  if (cache) touchSessionMeta();
  return cache;
}

export function persistDetectionsPageCache(cache: DetectionsPageCache): void {
  setSessionItem(DETECTIONS_PAGE_KEY, cache);
  touchSessionMeta();
}

export function clearDetectionsPageCache(): void {
  removeSessionItem(DETECTIONS_PAGE_KEY);
}

export function loadVehiclesPageCache<T>(): T[] | null {
  if (isSessionExpired()) {
    clearAllSessionPersistence();
    return null;
  }
  return getSessionItem<T[] | null>(VEHICLES_PAGE_KEY, null);
}

export function persistVehiclesPageCache<T>(vehicles: T[]): void {
  setSessionItem(VEHICLES_PAGE_KEY, vehicles);
  touchSessionMeta();
}

export function clearVehiclesPageCache(): void {
  removeSessionItem(VEHICLES_PAGE_KEY);
}
