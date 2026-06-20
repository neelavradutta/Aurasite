import { Op } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Detection from '../models/Detection';
import Vehicle from '../models/Vehicle';
import Alert from '../models/Alert';
import { cacheGet, cacheSet } from '../utils/memoryCache';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { sequelize } from '../utils/database';
import { cameraService } from './cameraService';
import { generateVehicleProfile, getMissingProfileFields, randomRegistrationDate, shouldGenerateVehicleProfile } from '../utils/vehicleProfileGenerator';
import {
  applyAutoSuspicionIfNeeded,
  incrementViolationIfNeeded,
  ViolationUpdate,
} from '../utils/vehicleSuspicionEvaluator';
import { emitVehicleUpdated } from '../utils/realtimeEvents';

const SNAPSHOT_DIR = path.resolve(env.uploadDir, 'snapshots');

function ensureSnapshotDir(): void {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

function savePlateSnapshot(base64Image?: string): string | null {
  if (!base64Image) return null;

  ensureSnapshotDir();
  const filename = `${uuidv4()}.jpg`;
  fs.writeFileSync(path.join(SNAPSHOT_DIR, filename), Buffer.from(base64Image, 'base64'));
  return filename;
}

export function resolveSnapshotPath(filename: string): string {
  return path.join(SNAPSHOT_DIR, filename);
}

function extractSnapshotBase64(item: AiDetectionItem): string | undefined {
  if (item.plate_image_base64) return item.plate_image_base64;
  const nested = item as Record<string, unknown>;
  if (typeof nested.plate_image_base64 === 'string') return nested.plate_image_base64;
  return undefined;
}

function extractDashboardSnapshotBase64(item: AiDetectionItem): string | undefined {
  if (item.dashboard_image_base64) return item.dashboard_image_base64;
  const nested = item as Record<string, unknown>;
  if (typeof nested.dashboard_image_base64 === 'string') return nested.dashboard_image_base64;
  return undefined;
}

function resolveQuality(item: AiDetectionItem): string {
  return String(item.detection_quality || item.plate?.detection_quality || 'invalid');
}

function resolvePlateNumberForSave(item: AiDetectionItem): string {
  const direct = item.plate_number?.toUpperCase().replace(/-/g, '').trim();
  const fromOcr = item.plate?.cleaned_text?.toUpperCase().replace(/-/g, '').trim();
  return direct || fromOcr || 'UNREADABLE';
}

function vehicleKeyFor(item: AiDetectionItem, plateNumber: string, index: number): string {
  if (resolveQuality(item) === 'accepted') return plateNumber;
  return `${plateNumber}-${item.track_id || item.frame_id || index}`;
}

function normalizePlateKey(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function findExistingVehicle(
  vehiclePlateKey: string,
  plateNumber: string,
  quality: string
): Promise<Vehicle | null> {
  const byKey = await Vehicle.findOne({ where: { plate_number: vehiclePlateKey } });
  if (byKey) return byKey;

  const normalized = normalizePlateKey(plateNumber);
  if (!normalized || ['UNREADABLE', 'UNKNOWN', 'REJECTED'].includes(normalized)) {
    return null;
  }

  if (quality !== 'accepted') return null;

  const candidates = await Vehicle.findAll({
    where: {
      [Op.or]: [
        { plate_number: plateNumber },
        { plate_number: normalized },
        { plate_number: { [Op.like]: `${normalized}-%` } },
      ],
    },
    order: [
      ['is_suspicious', 'DESC'],
      ['detection_count', 'DESC'],
      ['id', 'ASC'],
    ],
  });

  return (
    candidates.find((row) => normalizePlateKey(row.plate_number) === normalized) ||
    candidates.find((row) => normalizePlateKey(row.plate_number).startsWith(normalized)) ||
    null
  );
}

interface AiDetectionItem {
  frame_id?: number;
  timestamp?: number;
  plate_number?: string;
  detection_quality?: string;
  plate_bbox?: number[];
  plate_image_base64?: string;
  dashboard_image_base64?: string;
  vehicle?: {
    class_name?: string;
    confidence?: number;
    bbox?: number[];
    color?: string;
  };
  plate?: {
    cleaned_text?: string;
    confidence?: number;
    is_valid?: boolean;
    detection_quality?: string;
    plate_bbox?: number[];
  };
  track_id?: string;
  is_repeat_detection?: boolean;
  vehicle_color?: string | null;
}

export const detectionService = {
  async clearDetectionsForVideoSource(videoSource: string): Promise<number> {
    const rows = await Detection.findAll({
      where: { video_source: videoSource },
      attributes: ['id', 'vehicle_id', 'frame_image_path'],
    });

    if (rows.length === 0) return 0;

    const detectionIds = rows.map((row) => row.id);

    for (const row of rows) {
      if (row.frame_image_path) {
        const snapshotPath = resolveSnapshotPath(row.frame_image_path);
        if (fs.existsSync(snapshotPath)) {
          fs.unlinkSync(snapshotPath);
        }
      }
    }

    const deleted = await sequelize.transaction(async (transaction) => {
      await Alert.destroy({
        where: { detection_id: { [Op.in]: detectionIds } },
        transaction,
      });

      const count = await Detection.destroy({
        where: { video_source: videoSource },
        transaction,
      });

      return count;
    });

    logger.info('Cleared prior detections for video', { videoSource, deleted });
    return deleted;
  },

  async clearAllData(): Promise<{ detections: number; vehicles: number; alerts: number }> {
    const rows = await Detection.findAll({ attributes: ['frame_image_path'] });

    for (const row of rows) {
      if (!row.frame_image_path) continue;
      const snapshotPath = resolveSnapshotPath(row.frame_image_path);
      if (fs.existsSync(snapshotPath)) {
        fs.unlinkSync(snapshotPath);
      }
    }

    const result = await sequelize.transaction(async (transaction) => {
      const alerts = await Alert.destroy({ where: {}, transaction });
      const detections = await Detection.destroy({ where: {}, transaction });
      const vehicles = await Vehicle.destroy({ where: {}, transaction });
      return { detections, vehicles, alerts };
    });

    logger.info('Cleared all session data', result);
    return result;
  },

  async saveAiDetections(
    items: Array<Record<string, unknown>>,
    videoSource: string,
    onViolationUpdate?: (update: ViolationUpdate) => void
  ) {
    const saved: Detection[] = [];
    const violationUpdates: ViolationUpdate[] = [];

    await cameraService.ensureCameraForVideoSource(videoSource);

    for (const [index, raw] of items.entries()) {
      const item = raw as AiDetectionItem;
      const quality = resolveQuality(item);
      if (quality === 'invalid') continue;

      const plateNumber = resolvePlateNumberForSave(item);
      const snapshotB64 = extractDashboardSnapshotBase64(item) || extractSnapshotBase64(item);
      const snapshotFile = snapshotB64 ? savePlateSnapshot(snapshotB64) : null;

      if ((quality === 'accepted' || quality === 'partial') && !snapshotFile) continue;

      const vehiclePlateKey = vehicleKeyFor(item, plateNumber, index);
      const isRepeat = quality === 'accepted' && (await this.checkRepeatDetection(plateNumber));
      const generateProfile = shouldGenerateVehicleProfile(vehiclePlateKey, plateNumber, quality);

      let vehicle = await findExistingVehicle(vehiclePlateKey, plateNumber, quality);
      if (vehicle) {
        const profilePatch = generateProfile
          ? getMissingProfileFields(vehiclePlateKey, vehicle.toJSON() as Record<string, unknown>)
          : {};
        await vehicle.update({
          ...profilePatch,
          last_detected_timestamp: new Date(),
          detection_count: vehicle.detection_count + 1,
          vehicle_type: item.vehicle?.class_name || vehicle.vehicle_type || profilePatch.vehicle_type,
        });
      } else {
        const profile = generateProfile ? generateVehicleProfile(vehiclePlateKey) : null;
        vehicle = await Vehicle.create({
          plate_number: vehiclePlateKey,
          vehicle_type: item.vehicle?.class_name || profile?.vehicle_type || 'unknown',
          first_detected_timestamp: new Date(),
          last_detected_timestamp: new Date(),
          violation_count: 0,
          ...(profile || {}),
          ...(generateProfile ? { registration_date: randomRegistrationDate() } : {}),
        });
      }

      const detection = await Detection.create({
        vehicle_id: vehicle.id,
        detection_timestamp: new Date(),
        plate_number: plateNumber,
        plate_confidence: item.plate?.confidence ?? null,
        vehicle_confidence: item.vehicle?.confidence ?? null,
        frame_number: item.frame_id ?? null,
        bounding_box: item.vehicle?.bbox ? { bbox: item.vehicle.bbox } : null,
        plate_bbox: item.plate_bbox
          ? { bbox: item.plate_bbox }
          : item.plate?.plate_bbox
            ? { bbox: item.plate.plate_bbox }
            : null,
        vehicle_type: item.vehicle?.class_name ?? null,
        vehicle_color: item.vehicle_color ?? item.vehicle?.color ?? null,
        video_source: videoSource,
        frame_image_path: snapshotFile,
        is_repeat_detection: isRepeat || item.is_repeat_detection || false,
        detection_quality: quality,
        track_id: item.track_id ?? null,
      });

      const flagged = await applyAutoSuspicionIfNeeded(vehicle, plateNumber, quality);
      if (flagged) {
        await vehicle.reload();
        emitVehicleUpdated({
          vehicle_id: vehicle.id,
          plate_number: vehicle.plate_number,
          status: vehicle.status,
          is_suspicious: vehicle.is_suspicious,
          flagged_reason: vehicle.flagged_reason,
          violation_count: Math.max(0, Number(vehicle.violation_count) || 0),
        });
      }

      const violationUpdate = await incrementViolationIfNeeded(vehicle);
      if (violationUpdate) {
        violationUpdates.push(violationUpdate);
        onViolationUpdate?.(violationUpdate);
      }

      await vehicle.reload();

      if (quality === 'accepted' && (isRepeat || item.is_repeat_detection)) {
        await Alert.create({
          detection_id: detection.id,
          vehicle_id: vehicle.id,
          alert_type: 'repeat',
          alert_message: `Repeat detection for plate ${plateNumber}`,
          severity: 'low',
        });
      }

      if (quality === 'accepted' && (item.plate?.confidence ?? 1) < 0.7) {
        await Alert.create({
          detection_id: detection.id,
          vehicle_id: vehicle.id,
          alert_type: 'low_confidence',
          alert_message: `Low confidence OCR for ${plateNumber}`,
          severity: 'medium',
        });
      }

      if (quality === 'accepted') {
        await cacheSet(`plate:${plateNumber}`, new Date().toISOString(), 300);
      }
      saved.push(detection);
    }

    logger.info('Saved detections', { count: saved.length, violationUpdates: violationUpdates.length });
    return { saved, violationUpdates };
  },

  async checkRepeatDetection(plateNumber: string): Promise<boolean> {
    const cached = await cacheGet(`plate:${plateNumber}`);
    return !!cached;
  },

  async listDetections(params: {
    page?: number;
    limit?: number;
    plate?: string;
    minConfidence?: number;
    videoSource?: string;
  }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 10000);
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.plate) {
      where.plate_number = { [Op.like]: `%${params.plate}%` };
    }
    if (params.minConfidence) {
      where.vehicle_confidence = { [Op.gte]: params.minConfidence };
    }
    if (params.videoSource) {
      where.video_source = params.videoSource;
    }

    const { rows, count } = await Detection.findAndCountAll({
      where,
      include: [{ model: Vehicle, as: 'vehicle' }],
      order: [['detection_timestamp', 'DESC']],
      limit,
      offset,
    });

    return {
      data: rows,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    };
  },

  async getDetectionById(id: number) {
    return Detection.findByPk(id, { include: [{ model: Vehicle, as: 'vehicle' }] });
  },

  async verifyDetection(id: number, plateNumber: string) {
    const detection = await Detection.findByPk(id);
    if (!detection) return null;

    await detection.update({ plate_number: plateNumber.toUpperCase() });
    return detection;
  },

  async deleteDetection(id: number) {
    const detection = await Detection.findByPk(id);
    if (!detection) return false;

    if (detection.frame_image_path) {
      const snapshotPath = resolveSnapshotPath(detection.frame_image_path);
      if (fs.existsSync(snapshotPath)) {
        fs.unlinkSync(snapshotPath);
      }
    }

    const vehicleId = detection.vehicle_id;

    await sequelize.transaction(async (transaction) => {
      await Alert.destroy({ where: { detection_id: id }, transaction });
      await detection.destroy({ transaction });

      if (vehicleId) {
        const remaining = await Detection.count({ where: { vehicle_id: vehicleId }, transaction });
        if (remaining === 0) {
          const vehicle = await Vehicle.findByPk(vehicleId, { transaction });
          const keepVehicle =
            vehicle &&
            (vehicle.is_suspicious ||
              (vehicle.status && vehicle.status !== 'active') ||
              Boolean(vehicle.flagged_reason));

          if (!keepVehicle) {
            await Alert.destroy({ where: { vehicle_id: vehicleId }, transaction });
            await Vehicle.destroy({ where: { id: vehicleId }, transaction });
          }
        }
      }
    });

    return true;
  },
};
