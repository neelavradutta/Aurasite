import { Op } from 'sequelize';
import Alert from '../models/Alert';
import Vehicle from '../models/Vehicle';
import Detection from '../models/Detection';

export const alertService = {
  async listAlerts(params: { page?: number; limit?: number; resolved?: boolean }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const offset = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (params.resolved === false) {
      where.resolved_at = null;
    } else if (params.resolved === true) {
      where.resolved_at = { [Op.ne]: null };
    }

    const { rows, count } = await Alert.findAndCountAll({
      where,
      include: [
        { model: Vehicle, as: 'vehicle' },
        { model: Detection, as: 'detection' },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    return {
      data: rows,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    };
  },

  async getUnresolved() {
    return Alert.findAll({
      where: { resolved_at: null },
      include: [{ model: Vehicle, as: 'vehicle' }],
      order: [['created_at', 'DESC']],
      limit: 50,
    });
  },

  async resolveAlert(id: number, resolvedBy: string) {
    const alert = await Alert.findByPk(id);
    if (!alert) return null;
    await alert.update({ resolved_at: new Date(), resolved_by: resolvedBy });
    return alert;
  },

  async getSuspiciousVehicles() {
    return Vehicle.findAll({
      where: { is_suspicious: true },
      order: [['updated_at', 'DESC']],
      limit: 20,
    });
  },
};
