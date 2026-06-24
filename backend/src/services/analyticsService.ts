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
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([['No vehicles in catalog']]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehicle Catalog');
      return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
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

    const rows = vehicles.map((vehicle) => {
      const record = vehicle.toJSON();
      const vehicleDetections = detectionsByVehicle.get(vehicle.id) ?? [];
      const latestVideoSource = vehicleDetections.find((item) => item.video_source?.trim())?.video_source?.trim();
      const location = latestVideoSource ? locationBySource.get(latestVideoSource) ?? null : null;
      const timeline = vehicleDetections
        .map(
          (item) =>
            `${formatDateTime(item.detection_timestamp)} | ${item.video_source?.trim() || 'Detection recorded'}`
        )
        .join('; ');

      return {
        'Plate Number': cell(record.plate_number),
        'Detection Count': cell(record.detection_count),
        'Registration Number': cell(record.registration_number),
        'Owner Name': cell(record.owner_name),
        Work: cell(record.work),
        'Contact Number': cell(record.owner_contact),
        'Email Address': cell(record.owner_email),
        'Residential Address': cell(record.owner_address),
        'Driving License': cell(record.driving_license),
        'Vehicle Type': cell(record.vehicle_type),
        'Vehicle Status': resolveVehicleStatusLabel(record),
        Colour: cell(record.color),
        Model: cell(record.model),
        'Manufacturing Year': cell(record.manufacturing_year),
        Modifications: cell(record.modifications),
        'Engine Number': cell(record.engine_number),
        'Chassis Number': cell(record.chassis_number),
        'Fuel Type': cell(record.fuel_type),
        'Insurance Status': cell(record.insurance_status),
        'Registration Date': cell(record.registration_date ? formatDateTime(record.registration_date) : ''),
        'First Detected': cell(formatDateTime(record.first_detected_timestamp)),
        'Last Detected': cell(formatDateTime(record.last_detected_timestamp)),
        'Last Seen': cell(formatDateTime(record.last_detected_timestamp)),
        'Violation Count': cell(record.violation_count),
        'Is Suspicious': record.is_suspicious ? 'Yes' : 'No',
        'Status Note': cell(record.flagged_reason),
        'Recent Location': formatLocationExport(location),
        'Camera Name': cell(location?.camera_name),
        'Camera Code': cell(location?.camera_code),
        'Place Name': cell(location?.place_name),
        Latitude: cell(location?.latitude),
        Longitude: cell(location?.longitude),
        'Latest Video Source': cell(latestVideoSource),
        'Detection Timeline': timeline,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
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

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehicle Catalog');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  },
};
