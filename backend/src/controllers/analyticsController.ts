import { Request, Response, NextFunction } from 'express';
import { analyticsService } from '../services/analyticsService';
import { boundPlateInput } from '../utils/plateInput';

export const analyticsController = {
  async summary(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getSummary();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async traffic(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getTrafficPeakHours();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async repeat(_req: Request, res: Response, next: NextFunction) {
    try {
      const { vehicleService } = await import('../services/vehicleService');
      const data = await vehicleService.repeatAnalysis();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async confidence(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getConfidenceHeatmap();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async vehicles(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getMostFrequentVehicles();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async trends(req: Request, res: Response, next: NextFunction) {
    try {
      const days = Number(req.query.days) || 7;
      const data = await analyticsService.getTrends(days);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async exportDetections(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await analyticsService.exportDetectionsCsv({
        plate: boundPlateInput(req.query.plate),
        days: req.query.days ? Number(req.query.days) : undefined,
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="detections.csv"');
      res.send(csv);
    } catch (error) {
      next(error);
    }
  },

  async exportVehicles(_req: Request, res: Response, next: NextFunction) {
    try {
      const buffer = await analyticsService.exportVehiclesExcel();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="vehicle-catalog.xlsx"');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },

  async exportLiveReport(req: Request, res: Response, next: NextFunction) {
    try {
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
      const buffer = await analyticsService.exportLiveVehiclesExcel(entries, {
        mode: typeof req.body?.mode === 'string' ? req.body.mode : undefined,
        source: typeof req.body?.source === 'string' ? req.body.source : undefined,
      });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="live-detections-report.xlsx"');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },
};
