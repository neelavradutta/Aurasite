import { QueryTypes, Op } from 'sequelize';
import * as XLSX from 'xlsx';
import { sequelize, isSqliteDb } from '../utils/database';
import { formatDateTime } from '../utils/dateFormat';
import Detection from '../models/Detection';
import Vehicle from '../models/Vehicle';
import Alert from '../models/Alert';
import { cameraService, CameraLocationPayload } from './cameraService';

const VEHICLE_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  suspicious: 'Suspicious',
  invalid: 'Invalid',
  accidental: 'Accidental',
};

function resolveVehicleStatusLabel(vehicle: {
  status?: string | null;
  is_suspicious?: boolean;
  flagged_reason?: string | null;
}): string {
  const normalized = String(vehicle.status ?? '').trim().toLowerCase();
  if (normalized && VEHICLE_STATUS_LABELS[normalized]) {
    return VEHICLE_STATUS_LABELS[normalized];
  }
  if (vehicle.is_suspicious) return 'Suspicious';
  const reason = String(vehicle.flagged_reason ?? '').toLowerCase();
  if (reason.includes('accidental')) return 'Accidental';
  if (reason.includes('invalid')) return 'Invalid';
  if (reason.includes('suspicious')) return 'Suspicious';
  return 'Active';
}

function formatLocationExport(location: CameraLocationPayload | null): string {
  if (!location) return 'Camera GPS pending';

  const parts: string[] = [];
  if (location.place_name) parts.push(location.place_name);
  if (location.latitude !== null && location.longitude !== null) {
    parts.push(`${location.latitude}, ${location.longitude}`);
  }
  if (parts.length > 0) {
    return location.camera_name ? `${location.camera_name} · ${parts.join(' · ')}` : parts.join(' · ');
  }
  return location.camera_name || 'Camera GPS unavailable';
}

function cell(value: unknown): string | number {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  return String(value);
}

function normalizePlateKey(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface LiveExportEntry {
  plate_number: string;
  frame_id?: number;
  plate_confidence?: number;
  vehicle_type?: string;
  vehicle_color?: string | null;
  timestamp?: number;
  detection_id?: number;
}

function formatLiveTimestamp(timestamp?: number): string {
  if (timestamp == null || !Number.isFinite(timestamp)) return '';
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  return formatDateTime(new Date(ms));
}

function formatLiveConfidence(confidence?: number): string {
  if (confidence == null || !Number.isFinite(confidence)) return '';
  const value = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(value)}%`;
}

async function findVehicleForPlate(plateNumber: string): Promise<Vehicle | null> {
  const direct = plateNumber.toUpperCase().replace(/-/g, '').trim();
  const normalized = normalizePlateKey(plateNumber);
  if (!normalized) return null;

  const candidates = await Vehicle.findAll({
    where: {
      [Op.or]: [
        { plate_number: direct },
        { plate_number: normalized },
        { plate_number: { [Op.like]: `${normalized}%` } },
      ],
    },
    order: [['last_detected_timestamp', 'DESC']],
    limit: 10,
  });

  return (
    candidates.find((row) => normalizePlateKey(row.plate_number) === normalized) ||
    candidates.find((row) => normalizePlateKey(row.plate_number).startsWith(normalized)) ||
    candidates[0] ||
    null
  );
}

function buildVehicleExportRow(
  vehicle: Vehicle | null,
  location: CameraLocationPayload | null,
  timeline: string,
  live?: LiveExportEntry
): Record<string, string | number> {
  const record: Record<string, unknown> = vehicle
    ? (vehicle.toJSON() as unknown as Record<string, unknown>)
    : {};
  const row: Record<string, string | number> = {};

  if (live) {
    row['Live Detected At'] = formatLiveTimestamp(live.timestamp);
    row['Live Frame'] = cell(live.frame_id);
    row['Live Plate Confidence'] = formatLiveConfidence(live.plate_confidence);
    row['Live Vehicle Type'] = cell(live.vehicle_type);
    row['Live Vehicle Colour'] = cell(live.vehicle_color);
    row['Live Detection ID'] = cell(live.detection_id);
  }

  row['Plate Number'] = cell(live?.plate_number || record.plate_number);
  row['Detection Count'] = cell(record.detection_count);
  row['Registration Number'] = cell(record.registration_number);
  row['Owner Name'] = cell(record.owner_name);
  row.Work = cell(record.work);
  row['Contact Number'] = cell(record.owner_contact);
  row['Email Address'] = cell(record.owner_email);
  row['Residential Address'] = cell(record.owner_address);
  row['Driving License'] = cell(record.driving_license);
  row['Vehicle Type'] = cell(record.vehicle_type || live?.vehicle_type);
  row['Vehicle Status'] = vehicle ? resolveVehicleStatusLabel(vehicle) : '';
  row.Colour = cell(record.color || live?.vehicle_color);
  row.Model = cell(record.model);
  row['Manufacturing Year'] = cell(record.manufacturing_year);
  row.Modifications = cell(record.modifications);
  row['Engine Number'] = cell(record.engine_number);
  row['Chassis Number'] = cell(record.chassis_number);
  row['Fuel Type'] = cell(record.fuel_type);
  row['Insurance Status'] = cell(record.insurance_status);
  row['Registration Date'] = cell(
    record.registration_date ? formatDateTime(record.registration_date) : ''
  );
  row['First Detected'] = cell(formatDateTime(record.first_detected_timestamp));
  row['Last Detected'] = cell(formatDateTime(record.last_detected_timestamp));
  row['Last Seen'] = cell(formatDateTime(record.last_detected_timestamp));
  row['Violation Count'] = cell(record.violation_count);
  row['Is Suspicious'] = vehicle?.is_suspicious ? 'Yes' : vehicle ? 'No' : '';
  row['Status Note'] = cell(record.flagged_reason);
  row['Recent Location'] = formatLocationExport(location);
  row['Camera Name'] = cell(location?.camera_name);
  row['Camera Code'] = cell(location?.camera_code);
  row['Place Name'] = cell(location?.place_name);
  row.Latitude = cell(location?.latitude);
  row.Longitude = cell(location?.longitude);
  row['Latest Video Source'] = cell(location?.video_source);
  row['Detection Timeline'] = timeline;

  return row;
}

const VEHICLE_EXPORT_COLUMN_WIDTHS = [
  { wch: 20 },
  { wch: 12 },
  { wch: 18 },
  { wch: 14 },
  { wch: 14 },
  { wch: 14 },
  { wch: 14 },
  { wch: 16 },
  { wch: 18 },
  { wch: 22 },
  { wch: 18 },
  { wch: 16 },
  { wch: 28 },
  { wch: 32 },
  { wch: 18 },
  { wch: 14 },
  { wch: 14 },
  { wch: 12 },
  { wch: 18 },
  { wch: 10 },
  { wch: 22 },
  { wch: 18 },
  { wch: 18 },
  { wch: 14 },
  { wch: 16 },
  { wch: 18 },
  { wch: 20 },
  { wch: 20 },
  { wch: 20 },
  { wch: 14 },
  { wch: 14 },
  { wch: 36 },
  { wch: 22 },
  { wch: 14 },
  { wch: 24 },
  { wch: 12 },
  { wch: 12 },
  { wch: 28 },
  { wch: 48 },
];

function buildVehicleWorkbook(
  rows: Record<string, string | number>[],
  sheetName: string,
  emptyMessage: string
): Buffer {
  const payload =
    rows.length > 0 ? rows : [{ Message: emptyMessage }];
  const worksheet = XLSX.utils.json_to_sheet(payload);
  worksheet['!cols'] = VEHICLE_EXPORT_COLUMN_WIDTHS;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

async function loadVehicleExportContext(vehicles: Vehicle[]) {
  if (vehicles.length === 0) {
    return {
      detectionsByVehicle: new Map<number, Detection[]>(),
      locationBySource: new Map<string, CameraLocationPayload | null>(),
    };
  }

  const vehicleIds = vehicles.map((vehicle) => vehicle.id);
  const detections = await Detection.findAll({
    where: { vehicle_id: { [Op.in]: vehicleIds } },
    attributes: ['id', 'vehicle_id', 'detection_timestamp', 'video_source'],
    order: [['detection_timestamp', 'DESC']],
  });

  const detectionsByVehicle = new Map<number, Detection[]>();
  for (const detection of detections) {
    const vehicleId = detection.vehicle_id;
    if (vehicleId == null) continue;
    const bucket = detectionsByVehicle.get(vehicleId) ?? [];
    if (bucket.length < 20) bucket.push(detection);
    detectionsByVehicle.set(vehicleId, bucket);
  }

  const videoSources = new Set<string>();
  for (const bucket of detectionsByVehicle.values()) {
    for (const detection of bucket) {
      const source = detection.video_source?.trim();
      if (source) videoSources.add(source);
    }
  }

  const locationBySource = new Map<string, CameraLocationPayload | null>();
  await Promise.all(
    [...videoSources].map(async (source) => {
      locationBySource.set(source, await cameraService.getLiveLocationByVideoSource(source));
    })
  );

  return { detectionsByVehicle, locationBySource };
}

function resolveExportLocation(
  vehicle: Vehicle | null,
  detectionsByVehicle: Map<number, Detection[]>,
  locationBySource: Map<string, CameraLocationPayload | null>,
  fallbackVideoSource?: string | null
): CameraLocationPayload | null {
  const vehicleDetections = vehicle ? detectionsByVehicle.get(vehicle.id) ?? [] : [];
  const latestVideoSource =
    vehicleDetections.find((item) => item.video_source?.trim())?.video_source?.trim() ||
    fallbackVideoSource?.trim() ||
    null;
  if (!latestVideoSource) return null;
  const location = locationBySource.get(latestVideoSource) ?? null;
  return location ? { ...location, video_source: latestVideoSource } : null;
}

function buildDetectionTimeline(
  vehicle: Vehicle | null,
  detectionsByVehicle: Map<number, Detection[]>,
  live?: LiveExportEntry
): string {
  const vehicleDetections = vehicle ? detectionsByVehicle.get(vehicle.id) ?? [] : [];
  if (vehicleDetections.length > 0) {
    return vehicleDetections
      .map(
        (item) =>
          `${formatDateTime(item.detection_timestamp)} | ${item.video_source?.trim() || 'Detection recorded'}`
      )
      .join('; ');
  }
  if (live) {
    return `${formatLiveTimestamp(live.timestamp)} | Live detection`;
  }
  return '';
}

export const analyticsService = {
  async getSummary() {
    const [totalDetections, uniquePlates, avgConfidence, unresolvedAlerts] = await Promise.all([
      Detection.count(),
      Vehicle.count(),
      Detection.findOne({
        attributes: [[sequelize.fn('AVG', sequelize.col('vehicle_confidence')), 'avg']],
        raw: true,
      }) as Promise<{ avg: number } | null>,
      Alert.count({ where: { resolved_at: null } }),
    ]);

    return {
      total_detections: totalDetections,
      unique_plates: uniquePlates,
      avg_confidence: Number((avgConfidence as { avg?: number })?.avg || 0).toFixed(2),
      unresolved_alerts: unresolvedAlerts,
    };
  },

  async getTrafficPeakHours() {
    const sql = isSqliteDb()
      ? `SELECT 
          CAST(strftime('%H', detection_timestamp) AS INTEGER) as hour,
          COUNT(*) as count,
          ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
        FROM detections
        WHERE detection_timestamp >= datetime('now', '-1 day')
        GROUP BY hour
        ORDER BY hour`
      : `SELECT 
          HOUR(detection_timestamp) as hour,
          COUNT(*) as count,
          ROUND(COUNT(*) * 100 / SUM(COUNT(*)) OVER(), 2) as percentage
        FROM detections
        WHERE detection_timestamp >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        GROUP BY HOUR(detection_timestamp)
        ORDER BY hour`;

    return sequelize.query(sql, { type: QueryTypes.SELECT });
  },

  async getConfidenceHeatmap() {
    const results = await sequelize.query(
      `SELECT 
        CASE 
          WHEN vehicle_confidence >= 0.90 THEN '90-100%'
          WHEN vehicle_confidence >= 0.80 THEN '80-90%'
          WHEN vehicle_confidence >= 0.70 THEN '70-80%'
          ELSE '<70%'
        END as band,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100 / SUM(COUNT(*)) OVER(), 2) as percentage
      FROM detections
      GROUP BY band`,
      { type: QueryTypes.SELECT }
    );

    return results;
  },

  async getMostFrequentVehicles(limit = 5) {
    return Vehicle.findAll({
      order: [['detection_count', 'DESC']],
      limit,
      attributes: ['id', 'plate_number', 'detection_count', 'vehicle_type', 'is_suspicious'],
    });
  },

  async getTrends(days = 7) {
    const sql = isSqliteDb()
      ? `SELECT date(detection_timestamp) as date, COUNT(*) as count
         FROM detections
         WHERE detection_timestamp >= datetime('now', '-' || :days || ' day')
         GROUP BY date(detection_timestamp)
         ORDER BY date`
      : `SELECT DATE(detection_timestamp) as date, COUNT(*) as count
         FROM detections
         WHERE detection_timestamp >= DATE_SUB(NOW(), INTERVAL :days DAY)
         GROUP BY DATE(detection_timestamp)
         ORDER BY date`;

    return sequelize.query(sql, { replacements: { days }, type: QueryTypes.SELECT });
  },

  async exportDetectionsCsv(params?: { plate?: string; days?: number }) {
    const whereClauses: string[] = [];
    const replacements: Record<string, unknown> = {};

    if (params?.plate) {
      whereClauses.push('plate_number LIKE :plate');
      replacements.plate = `%${params.plate}%`;
    }
    if (params?.days) {
      whereClauses.push(
        isSqliteDb()
          ? "detection_timestamp >= datetime('now', '-' || :days || ' day')"
          : 'detection_timestamp >= DATE_SUB(NOW(), INTERVAL :days DAY)'
      );
      replacements.days = params.days;
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const rows = (await sequelize.query(
      `SELECT id, plate_number, plate_confidence, vehicle_confidence, vehicle_type,
              detection_timestamp, frame_number, track_id, is_repeat_detection, detection_quality, video_source
       FROM detections ${where}
       ORDER BY detection_timestamp DESC
       LIMIT 10000`,
      { replacements, type: QueryTypes.SELECT }
    )) as Array<Record<string, unknown>>;

    const headers = [
      'id',
      'plate_number',
      'plate_confidence',
      'vehicle_confidence',
      'vehicle_type',
      'detection_timestamp',
      'frame_number',
      'track_id',
      'is_repeat_detection',
      'detection_quality',
      'video_source',
    ];

    const escape = (val: unknown) => {
      const str = val == null ? '' : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const timestampFields = new Set([
      'detection_timestamp',
      'first_detected_timestamp',
      'last_detected_timestamp',
    ]);

    const formatCell = (header: string, value: unknown) => {
      if (timestampFields.has(header)) {
        return formatDateTime(value);
      }
      return value;
    };

    const lines = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => escape(formatCell(h, row[h]))).join(',')),
    ];

    return lines.join('\n');
  },

  async exportVehiclesExcel(): Promise<Buffer> {
    const vehicles = await Vehicle.findAll({
      order: [['last_detected_timestamp', 'DESC']],
    });

    if (vehicles.length === 0) {
      return buildVehicleWorkbook([], 'Vehicle Catalog', 'No vehicles in catalog');
    }

    const { detectionsByVehicle, locationBySource } = await loadVehicleExportContext(vehicles);

    const rows = vehicles.map((vehicle) => {
      const location = resolveExportLocation(vehicle, detectionsByVehicle, locationBySource);
      const timeline = buildDetectionTimeline(vehicle, detectionsByVehicle);
      return buildVehicleExportRow(vehicle, location, timeline);
    });

    return buildVehicleWorkbook(rows, 'Vehicle Catalog', 'No vehicles in catalog');
  },

  async exportLiveVehiclesExcel(
    entries: LiveExportEntry[],
    session?: { mode?: string; source?: string }
  ): Promise<Buffer> {
    const uniqueEntries: LiveExportEntry[] = [];
    const seen = new Set<string>();

    for (const entry of entries) {
      const key = normalizePlateKey(entry.plate_number || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      uniqueEntries.push({ ...entry, plate_number: entry.plate_number.trim() });
    }

    if (uniqueEntries.length === 0) {
      return buildVehicleWorkbook([], 'Live Detections', 'No recent live detections to export');
    }

    const fallbackVideoSource =
      session?.mode === 'source' && session.source?.trim()
        ? session.source.trim()
        : 'live-camera';

    const vehicles = await Promise.all(
      uniqueEntries.map((entry) => findVehicleForPlate(entry.plate_number))
    );
    const foundVehicles = vehicles.filter((vehicle): vehicle is Vehicle => vehicle != null);
    const { detectionsByVehicle, locationBySource } = await loadVehicleExportContext(foundVehicles);

    if (!locationBySource.has(fallbackVideoSource)) {
      locationBySource.set(
        fallbackVideoSource,
        await cameraService.getLiveLocationByVideoSource(fallbackVideoSource)
      );
    }

    const rows = uniqueEntries.map((entry, index) => {
      const vehicle = vehicles[index];
      const location = resolveExportLocation(
        vehicle,
        detectionsByVehicle,
        locationBySource,
        fallbackVideoSource
      );
      const timeline = buildDetectionTimeline(vehicle, detectionsByVehicle, entry);
      return buildVehicleExportRow(vehicle, location, timeline, entry);
    });

    return buildVehicleWorkbook(rows, 'Live Detections', 'No recent live detections to export');
  },
};
