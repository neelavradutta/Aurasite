import { Request, Response, NextFunction } from 'express';
import { vehicleService } from '../services/vehicleService';
import { AppError } from '../middleware/errorHandler';

export const vehicleController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await vehicleService.listVehicles({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        suspicious: req.query.suspicious === 'true' ? true : undefined,
      });
      res.json({ success: true, data: result.data, pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const vehicle = await vehicleService.getVehicleById(Number(req.params.id));
      if (!vehicle) throw new AppError('Vehicle not found', 404, 'not_found');
      res.json({ success: true, data: vehicle });
    } catch (error) {
      next(error);
    }
  },

  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const plate = (req.query.plate as string) || '';
      const vehicles = await vehicleService.searchByPlate(plate);
      res.json({ success: true, data: vehicles });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const vehicle = await vehicleService.updateVehicle(Number(req.params.id), req.body);
      if (!vehicle) throw new AppError('Vehicle not found', 404, 'not_found');
      res.json({ success: true, data: vehicle });
    } catch (error) {
      next(error);
    }
  },

  async flag(req: Request, res: Response, next: NextFunction) {
    try {
      const vehicle = await vehicleService.flagSuspicious(Number(req.params.id), req.body.reason || 'Flagged manually');
      if (!vehicle) throw new AppError('Vehicle not found', 404, 'not_found');
      res.json({ success: true, data: vehicle, message: 'Vehicle flagged as suspicious' });
    } catch (error) {
      next(error);
    }
  },

  async setStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const status = String(req.body.status || '').toLowerCase();
      const allowed = ['active', 'suspicious', 'invalid', 'accidental'];
      if (!allowed.includes(status)) {
        throw new AppError('Invalid vehicle status', 400, 'validation_error');
      }
      const vehicle = await vehicleService.updateStatus(
        Number(req.params.id),
        status as 'active' | 'suspicious' | 'invalid' | 'accidental',
        req.body.reason
      );
      if (!vehicle) throw new AppError('Vehicle not found', 404, 'not_found');
      res.json({ success: true, data: vehicle, message: `Vehicle status updated to ${status}` });
    } catch (error) {
      next(error);
    }
  },

  async repeatAnalysis(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await vehicleService.repeatAnalysis();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
