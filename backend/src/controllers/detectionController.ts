import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { detectionService, resolveSnapshotPath } from '../services/detectionService';
import { enqueueVideoJob, getJobStatus } from '../services/jobQueue';
import { AppError } from '../middleware/errorHandler';
import { emitDetectionsChanged } from '../utils/realtimeEvents';

const uploadDir = path.resolve(env.uploadDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export const detectionController = {
  async processVideo(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError('Video or image file is required', 400, 'missing_file');
      }

      const jobId = uuidv4();
      const options = req.body.options ? JSON.parse(req.body.options) : {};

      await enqueueVideoJob({
        jobId,
        videoPath: req.file.path,
        videoSource: req.file.originalname,
        options,
      });

      res.status(202).json({
        success: true,
        data: { job_id: jobId, status: 'queued' },
        message: 'Media queued for processing',
      });
    } catch (error) {
      next(error);
    }
  },

  async getJobStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const jobId = String(req.params.jobId);
      const status = await getJobStatus(jobId);
      res.json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  },

  async listDetections(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await detectionService.listDetections({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        plate: req.query.plate as string,
        minConfidence: req.query.minConfidence ? Number(req.query.minConfidence) : undefined,
        videoSource: req.query.video_source as string,
      });
      res.json({ success: true, data: result.data, pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  },

  async getDetection(req: Request, res: Response, next: NextFunction) {
    try {
      const detection = await detectionService.getDetectionById(Number(req.params.id));
      if (!detection) throw new AppError('Detection not found', 404, 'not_found');
      res.json({ success: true, data: detection });
    } catch (error) {
      next(error);
    }
  },

  async verifyDetection(req: Request, res: Response, next: NextFunction) {
    try {
      const detection = await detectionService.verifyDetection(Number(req.params.id), req.body.plate_number);
      if (!detection) throw new AppError('Detection not found', 404, 'not_found');
      res.json({ success: true, data: detection, message: 'Detection verified' });
    } catch (error) {
      next(error);
    }
  },

  async deleteDetection(req: Request, res: Response, next: NextFunction) {
    try {
      const deleted = await detectionService.deleteDetection(Number(req.params.id));
      if (!deleted) throw new AppError('Detection not found', 404, 'not_found');
      emitDetectionsChanged({ videoSource: '', savedCount: 0 });
      res.json({ success: true, message: 'Detection deleted' });
    } catch (error) {
      next(error);
    }
  },

  async clearAll(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await detectionService.clearAllData();
      res.json({ success: true, data: result, message: 'All session data cleared' });
    } catch (error) {
      next(error);
    }
  },

  async getSnapshot(req: Request, res: Response, next: NextFunction) {
    try {
      const detection = await detectionService.getDetectionById(Number(req.params.id));
      if (!detection?.frame_image_path) {
        throw new AppError('Snapshot not found', 404, 'not_found');
      }

      const filePath = resolveSnapshotPath(detection.frame_image_path);
      if (!fs.existsSync(filePath)) {
        throw new AppError('Snapshot file missing', 404, 'not_found');
      }

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', `inline; filename="plate-${detection.plate_number || detection.id}.jpg"`);
      res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  },
};
