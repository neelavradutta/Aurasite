import { Request, Response, NextFunction } from 'express';
import { alertService } from '../services/alertService';
import { AppError } from '../middleware/errorHandler';

export const alertController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await alertService.listAlerts({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        resolved: req.query.resolved === 'true' ? true : req.query.resolved === 'false' ? false : undefined,
      });
      res.json({ success: true, data: result.data, pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  },

  async unresolved(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await alertService.getUnresolved();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async resolve(req: Request, res: Response, next: NextFunction) {
    try {
      const alert = await alertService.resolveAlert(Number(req.params.id), req.body.resolved_by || 'system');
      if (!alert) throw new AppError('Alert not found', 404, 'not_found');
      res.json({ success: true, data: alert, message: 'Alert resolved' });
    } catch (error) {
      next(error);
    }
  },

  async suspicious(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await alertService.getSuspiciousVehicles();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
