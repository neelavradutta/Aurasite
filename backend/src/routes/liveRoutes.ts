import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import multer from 'multer';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const aiClient = axios.create({
  baseURL: env.pythonServiceUrl,
  timeout: 120_000,
});

function parseFrameNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTimestamp(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now() / 1000;
}

function forwardAiServiceError(error: unknown, next: NextFunction): void {
  if (axios.isAxiosError(error) && error.response) {
    const payload = error.response.data as { message?: string; error?: string };
    next(
      new AppError(
        payload?.message || 'AI service request failed',
        error.response.status,
        typeof payload?.error === 'string' ? payload.error : 'ai_service_error'
      )
    );
    return;
  }
  next(error);
}

function handleLiveUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('frame')(req, res, (err) => {
    if (err) {
      next(new AppError(err.message, 400, 'live_upload_error'));
      return;
    }
    next();
  });
}

router.post('/frame', requireAuth, handleLiveUpload, async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('Live frame is required', 400, 'missing_frame');
    }

    const form = new FormData();
    form.append('frame', req.file.buffer, {
      filename: req.file.originalname || 'live-frame.jpg',
      contentType: req.file.mimetype || 'image/jpeg',
    });
    form.append('frame_number', String(parseFrameNumber(req.body.frame_number)));
    form.append('timestamp', String(parseTimestamp(req.body.timestamp)));

    const { data } = await aiClient.post('/api/v1/live/frame', form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    res.json(data);
  } catch (error) {
    forwardAiServiceError(error, next);
  }
});

router.post('/source/frame', requireAuth, async (req, res, next) => {
  try {
    const source = String(req.body.source || '').trim();
    if (!source) {
      throw new AppError('Live source is required', 400, 'missing_source');
    }

    const { data } = await aiClient.post('/api/v1/live/source/frame', {
      source,
      frame_number: parseFrameNumber(req.body.frame_number),
      timestamp: parseTimestamp(req.body.timestamp),
    });

    res.json(data);
  } catch (error) {
    forwardAiServiceError(error, next);
  }
});

router.post('/source/release', requireAuth, async (req, res, next) => {
  try {
    const source = String(req.body.source || '').trim();
    if (!source) {
      throw new AppError('Live source is required', 400, 'missing_source');
    }

    const { data } = await aiClient.post('/api/v1/live/source/release', { source });
    res.json(data);
  } catch (error) {
    forwardAiServiceError(error, next);
  }
});

export default router;
