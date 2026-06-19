import { Op } from 'sequelize';
import Vehicle from '../models/Vehicle';
import Detection from '../models/Detection';
import Alert from '../models/Alert';
import { cameraService } from './cameraService';
import { emitVehicleUpdated } from '../utils/realtimeEvents';
import { violationCountAfterStatusChange } from '../utils/vehicleViolations';

const VEHICLE_STATUSES = ['active', 'suspicious', 'invalid', 'accidental'] as const;
type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

function isVehicleStatus(value: string): value is VehicleStatus {
  return VEHICLE_STATUSES.includes(value as VehicleStatus);
}

export const vehicleService = {
  async listVehicles(params: { page?: number; limit?: number; suspicious?: boolean }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const offset = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (params.suspicious !== undefined) {
      where.is_suspicious = params.suspicious;
    }

    const { rows, count } = await Vehicle.findAndCountAll({
      where,
      order: [['last_detected_timestamp', 'DESC']],
      limit,
      offset,
    });

    return {
      data: rows,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    };
  },

  async getVehicleById(id: number) {
    const vehicle = await Vehicle.findByPk(id, {
      include: [{ model: Detection, as: 'detections', limit: 50, order: [['detection_timestamp', 'DESC']] }],
    });

    if (!vehicle) return null;

    const plain = vehicle.toJSON() as unknown as Record<string, unknown>;
    const detections = (plain.detections as Array<{ video_source?: string | null }> | undefined) || [];
    const videoSource = detections.find((item) => item.video_source?.trim())?.video_source?.trim();

    if (videoSource) {
      plain.recent_location = await cameraService.getLiveLocationByVideoSource(videoSource);
    }

    return plain;
  },

  async searchByPlate(plate: string) {
    return Vehicle.findAll({
      where: { plate_number: { [Op.like]: `%${plate.toUpperCase()}%` } },
      limit: 20,
    });
  },

  async updateVehicle(id: number, data: Partial<Vehicle>) {
    const vehicle = await Vehicle.findByPk(id);
    if (!vehicle) return null;
    await vehicle.update(data);
    return vehicle;
  },

  async flagSuspicious(id: number, reason: string) {
    return this.updateStatus(id, 'suspicious', reason);
  },

  async updateStatus(id: number, status: VehicleStatus, reason?: string) {
    if (!isVehicleStatus(status)) {
      throw new Error('Invalid vehicle status');
    }

    const vehicle = await Vehicle.findByPk(id);
    if (!vehicle) return null;

    const isSuspicious = status === 'suspicious';
    const flaggedReason =
      status === 'active'
        ? null
        : reason || `${status.charAt(0).toUpperCase()}${status.slice(1)} status set by Authority`;

    await vehicle.update({
      status,
      is_suspicious: isSuspicious,
      flagged_reason: flaggedReason,
      violation_count: violationCountAfterStatusChange(vehicle, status),
    });

    if (isSuspicious) {
      await Alert.create({
        vehicle_id: vehicle.id,
        alert_type: 'suspicious',
        alert_message: flaggedReason || 'Marked suspicious',
        severity: 'high',
      });
    }

    await vehicle.reload();

    emitVehicleUpdated({
      vehicle_id: vehicle.id,
      plate_number: vehicle.plate_number,
      status: vehicle.status,
      is_suspicious: vehicle.is_suspicious,
      flagged_reason: vehicle.flagged_reason,
      violation_count: Math.max(0, Number(vehicle.violation_count) || 0),
    });

    return vehicle;
  },

  async repeatAnalysis() {
    const [results] = await Detection.sequelize!.query(`
      SELECT 
        COUNT(DISTINCT vehicle_id) as unique_vehicles,
        COUNT(*) - COUNT(DISTINCT vehicle_id) as repeat_vehicles,
        CASE WHEN COUNT(DISTINCT vehicle_id) = 0 THEN 0
          ELSE ((COUNT(*) - COUNT(DISTINCT vehicle_id)) / COUNT(DISTINCT vehicle_id) * 100)
        END as repeat_rate
      FROM detections
    `);

    return (results as Array<Record<string, number>>)[0] || {
      unique_vehicles: 0,
      repeat_vehicles: 0,
      repeat_rate: 0,
    };
  },
};
