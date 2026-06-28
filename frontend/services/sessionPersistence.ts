import { Detection } from '@/types/detection';
import { LiveDetectionFrame } from '@/services/api';
import { LiveMode } from '@/utils/liveVideoSource';
import {
  DetectionListFilters,
  DetectionSortOption,
} from '@/utils/detectionFilters';
import { VehicleSpeedReading } from '@/utils/speedEstimation';
import { MediaKind } from '@/utils/mediaFile';
import { getItem, getSessionItem, removeItem, setItem } from '@/services/storage';

export const SERVER_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const LEGACY_SESSION_META_KEY = 'apnr_session_meta';
const LEGACY_DASHBOARD_KEY = 'apnr_dashboard_session';
const LEGACY_LIVE_KEY = 'apnr_live_session';
const LEGACY_DETECTIONS_PAGE_KEY = 'apnr_detections_page_cache';
const LEGACY_VEHICLES_PAGE_KEY = 'apnr_vehicles_page_cache';

function dashboardKey(userId: number) {
  return `apnr_dashboard_u${userId}`;
}

function liveKey(userId: number) {
  return `apnr_live_u${userId}`;
}

function detectionsPageKey(userId: number) {
  return `apnr_detections_page_u${userId}`;
}

function vehiclesPageKey(userId: number) {
  return `apnr_vehicles_page_u${userId}`;
}

function metaKey(userId: number) {
  return `apnr_session_meta_u${userId}`;
}

export function getPersistenceUserId(): number | null {
  const user = getSessionItem<{ id: number } | null>('auth_user', null);
  return user?.id ?? null;
}

export type UploadedVideoMeta = {
  id: string;
  name: string;
  size: number;
  platesDetected: number;
  mediaType: MediaKind;
};

export interface DashboardSessionSnapshot {
  detections: Detection[];
  peakTrafficDetections: Detection[];
  sessionVideoSource: string | null;
  sessionVersion: number;
  detectionsVersion: number;
  vehicleSpeedReadings: VehicleSpeedReading[];
  selectedPlateId: number | null;
  uploadedVideosMeta: UploadedVideoMeta[];
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

interface SessionMeta {
  expiresAt: number;
}

function touchSessionMeta(userId: number): void {
  setItem(metaKey(userId), {
    expiresAt: Date.now() + SERVER_SESSION_TTL_MS,
  } satisfies SessionMeta);
}

function migrateLegacySessionStorage(userId: number): void {
  if (typeof window === 'undefined') return;
  try {
    const legacyDashboard = window.sessionStorage.getItem(LEGACY_DASHBOARD_KEY);
    if (legacyDashboard && !getItem(dashboardKey(userId), null)) {
      setItem(dashboardKey(userId), JSON.parse(legacyDashboard));
    }
    const legacyLive = window.sessionStorage.getItem(LEGACY_LIVE_KEY);
    if (legacyLive && !getItem(liveKey(userId), null)) {
      setItem(liveKey(userId), JSON.parse(legacyLive));
    }
    const legacyDetections = window.sessionStorage.getItem(LEGACY_DETECTIONS_PAGE_KEY);
    if (legacyDetections && !getItem(detectionsPageKey(userId), null)) {
      setItem(detectionsPageKey(userId), JSON.parse(legacyDetections));
    }
    const legacyVehicles = window.sessionStorage.getItem(LEGACY_VEHICLES_PAGE_KEY);
    if (legacyVehicles && !getItem(vehiclesPageKey(userId), null)) {
      setItem(vehiclesPageKey(userId), JSON.parse(legacyVehicles));
    }
    window.sessionStorage.removeItem(LEGACY_SESSION_META_KEY);
    window.sessionStorage.removeItem(LEGACY_DASHBOARD_KEY);
    window.sessionStorage.removeItem(LEGACY_LIVE_KEY);
    window.sessionStorage.removeItem(LEGACY_DETECTIONS_PAGE_KEY);
    window.sessionStorage.removeItem(LEGACY_VEHICLES_PAGE_KEY);
  } catch {
    /* ignore migration failures */
  }
}

export function clearAllSessionPersistence(userId = getPersistenceUserId()): void {
  if (userId == null) return;
  removeItem(metaKey(userId));
  removeItem(dashboardKey(userId));
  removeItem(liveKey(userId));
  removeItem(detectionsPageKey(userId));
  removeItem(vehiclesPageKey(userId));
}

export function clearLiveSessionPersistence(userId = getPersistenceUserId()): void {
  if (userId == null) return;
  removeItem(liveKey(userId));
}

export function loadDashboardSessionSnapshot(
  userId = getPersistenceUserId()
): DashboardSessionSnapshot | null {
  if (userId == null) return null;
  migrateLegacySessionStorage(userId);
  const snapshot = getItem<DashboardSessionSnapshot | null>(dashboardKey(userId), null);
  if (!snapshot) return null;
  touchSessionMeta(userId);
  return {
    ...snapshot,
    vehicleSpeedReadings: snapshot.vehicleSpeedReadings ?? [],
    selectedPlateId: snapshot.selectedPlateId ?? null,
    uploadedVideosMeta: snapshot.uploadedVideosMeta ?? [],
  };
}

export function persistDashboardSessionSnapshot(
  snapshot: DashboardSessionSnapshot,
  userId = getPersistenceUserId()
): void {
  if (userId == null) return;
  setItem(dashboardKey(userId), snapshot);
  touchSessionMeta(userId);
}

export function loadLiveSessionSnapshot(userId = getPersistenceUserId()): LiveSessionSnapshot | null {
  if (userId == null) return null;
  migrateLegacySessionStorage(userId);
  const snapshot = getItem<LiveSessionSnapshot | null>(liveKey(userId), null);
  if (snapshot) touchSessionMeta(userId);
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

export function persistLiveSessionSnapshot(
  snapshot: LiveSessionSnapshot,
  userId = getPersistenceUserId()
): void {
  if (userId == null) return;
  setItem(liveKey(userId), {
    ...snapshot,
    lastResult: slimLiveFrame(snapshot.lastResult),
    plateHistory: snapshot.plateHistory.map((entry) => slimLiveFrame(entry) ?? entry),
  });
  touchSessionMeta(userId);
}

export function loadDetectionsPageCache(userId = getPersistenceUserId()): DetectionsPageCache | null {
  if (userId == null) return null;
  migrateLegacySessionStorage(userId);
  const cache = getItem<DetectionsPageCache | null>(detectionsPageKey(userId), null);
  if (cache) touchSessionMeta(userId);
  return cache;
}

export function persistDetectionsPageCache(
  cache: DetectionsPageCache,
  userId = getPersistenceUserId()
): void {
  if (userId == null) return;
  setItem(detectionsPageKey(userId), cache);
  touchSessionMeta(userId);
}

export function clearDetectionsPageCache(userId = getPersistenceUserId()): void {
  if (userId == null) return;
  removeItem(detectionsPageKey(userId));
}

export function loadVehiclesPageCache<T>(userId = getPersistenceUserId()): T[] | null {
  if (userId == null) return null;
  migrateLegacySessionStorage(userId);
  return getItem<T[] | null>(vehiclesPageKey(userId), null);
}

export function persistVehiclesPageCache<T>(vehicles: T[], userId = getPersistenceUserId()): void {
  if (userId == null) return;
  setItem(vehiclesPageKey(userId), vehicles);
  touchSessionMeta(userId);
}

export function clearVehiclesPageCache(userId = getPersistenceUserId()): void {
  if (userId == null) return;
  removeItem(vehiclesPageKey(userId));
}
