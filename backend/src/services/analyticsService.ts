import { QueryTypes } from 'sequelize';
import { sequelize, isSqliteDb } from '../utils/database';
import Detection from '../models/Detection';
import Vehicle from '../models/Vehicle';
import Alert from '../models/Alert';

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

    const lines = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
    ];

    return lines.join('\n');
  },

  async exportVehiclesCsv() {
    const vehicles = await Vehicle.findAll({
      order: [['detection_count', 'DESC']],
      raw: true,
    });

    const headers = [
      'id',
      'plate_number',
      'detection_count',
      'vehicle_type',
      'is_suspicious',
      'first_detected_timestamp',
      'last_detected_timestamp',
    ];

    const escape = (val: unknown) => {
      const str = val == null ? '' : String(val);
      if (str.includes(',') || str.includes('"')) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };

    return [
      headers.join(','),
      ...vehicles.map((v) => headers.map((h) => escape((v as unknown as Record<string, unknown>)[h])).join(',')),
    ].join('\n');
  },
};
