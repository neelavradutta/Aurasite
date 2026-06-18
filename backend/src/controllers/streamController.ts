import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { Server as SocketServer } from 'socket.io';
import Detection from '../models/Detection';
import { detectionService } from '../services/detectionService';
import { streamService } from '../services/streamService';
import { aiService } from '../services/aiService';
import { cacheSet } from '../utils/redis';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';

let io: SocketServer | null = null;

export function setStreamSocket(server: SocketServer): void {
  io = server;
}

function emitSavedDetection(saved: Detection, videoSource: string): void {
  io?.emit('detection', {
    plate: saved.plate_number,
    confidence: saved.plate_confidence,
    vehicle_type: saved.vehicle_type,
    timestamp: saved.detection_timestamp,
    detection_id: saved.id,
    video_source: videoSource,
    frame_image_path: saved.frame_image_path,
    frame_number: saved.frame_number,
    track_id: saved.track_id,
    plate_bbox: saved.plate_bbox,
    bounding_box: saved.bounding_box,
    detection_quality: saved.detection_quality,
  });
}

function isDetectionPayload(item: Record<string, unknown>): boolean {
  const plate = item.plate as { cleaned_text?: string } | undefined;
  return Boolean(plate?.cleaned_text);
}

export const streamController = {
  async startStream(req: Request, res: Response, next: NextFunction) {
    try {
      const { stream_url, options } = req.body;
      if (!stream_url) {
        throw new AppError('stream_url is required', 400, 'missing_stream_url');
      }

      const active = await streamService.startStream(stream_url, options);

      io?.emit('stream:status', { status: 'running', stream: active });

      res.status(201).json({
        success: true,
        data: active,
        message: 'Stream detection started',
      });
    } catch (error) {
      next(error);
    }
  },

  async stopStream(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await streamService.stopStream(req.body.stream_id);
      io?.emit('stream:status', { status: 'stopped', stream_id: result.streamId });
      res.json({ success: true, data: result, message: 'Stream stopped' });
    } catch (error) {
      next(error);
    }
  },

  async handleStreamUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = req.body;
      if (!payload?.plate?.cleaned_text) {
        throw new AppError('Invalid stream update payload', 400, 'invalid_payload');
      }

      const plateNumber = payload.plate.cleaned_text.toUpperCase();
      await cacheSet(`stream:recent:${plateNumber}`, JSON.stringify(payload), 60);

      const videoSource = String(payload.video_source || payload.stream_id || 'live-stream');
      const [saved] = await detectionService.saveAiDetections([payload], videoSource);

      if (saved) {
        emitSavedDetection(saved, videoSource);
      }

      if (payload.alert) {
        io?.emit('alert', payload.alert);
      }

      res.json({ success: true, message: 'Stream update processed' });
    } catch (error) {
      next(error);
    }
  },

  async getStreamStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await streamService.getStatus();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getStreamPreview(req: Request, res: Response, next: NextFunction) {
    try {
      const streamId = String(req.params.streamId);
      const frameUrl = aiService.getFramePreviewUrl(streamId);
      const response = await axios.get(frameUrl, { responseType: 'arraybuffer', timeout: 5000 });
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'no-cache');
      res.send(Buffer.from(response.data));
    } catch (error) {
      next(new AppError('Preview frame unavailable', 404, 'no_frame'));
    }
  },

  async detectLiveFrame(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      if (!file?.buffer?.length) {
        throw new AppError('frame file is required', 400, 'missing_frame');
      }

      const sessionId = String(req.body.session_id || '').trim();
      const videoSource = String(req.body.video_source || 'live-camera').trim();
      if (!sessionId) {
        throw new AppError('session_id is required', 400, 'missing_session_id');
      }

      const frameNumber = Number(req.body.frame_number) || 0;
      const timestamp = Number(req.body.timestamp) || Date.now() / 1000;

      const aiResult = await aiService.detectFrame(file.buffer, frameNumber, timestamp, sessionId);
      const data = (aiResult.data || {}) as { detections?: Array<Record<string, unknown>> };
      const rawDetections = data.detections || [];
      const payloads = rawDetections.filter(isDetectionPayload);

      const frameSnapshotBase64 = file.buffer.toString('base64');
      const savedDetections: Detection[] = [];
      for (const payload of payloads) {
        const plateNumber = String(
          (payload.plate as { cleaned_text?: string })?.cleaned_text || ''
        ).toUpperCase();
        await cacheSet(`stream:recent:${plateNumber}`, JSON.stringify(payload), 60);

        if (
          !payload.plate_image_base64 &&
          !payload.dashboard_image_base64
        ) {
          payload.dashboard_image_base64 = frameSnapshotBase64;
        }

        const [saved] = await detectionService.saveAiDetections([payload], videoSource);
        if (saved) {
          savedDetections.push(saved);
          emitSavedDetection(saved, videoSource);
        }

        if (payload.alert) {
          io?.emit('alert', payload.alert);
        }
      }

      res.json({
        success: true,
        data: {
          session_id: sessionId,
          processed: rawDetections.length,
          saved: savedDetections.length,
          detections: savedDetections.map((detection) => ({
            id: detection.id,
            plate_number: detection.plate_number,
            plate_confidence: detection.plate_confidence,
            vehicle_type: detection.vehicle_type,
            detection_timestamp: detection.detection_timestamp,
            video_source: detection.video_source,
            frame_image_path: detection.frame_image_path,
            detection_quality: detection.detection_quality,
            frame_number: detection.frame_number,
            track_id: detection.track_id,
            plate_bbox: detection.plate_bbox,
            bounding_box: detection.bounding_box,
          })),
        },
        message: 'Live frame processed',
      });
    } catch (error) {
      next(error);
    }
  },

  async stopLiveFrameSession(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionId = String(req.body.session_id || '').trim();
      if (!sessionId) {
        throw new AppError('session_id is required', 400, 'missing_session_id');
      }

      await aiService.stopLiveDetectSession(sessionId);

      res.json({
        success: true,
        data: { session_id: sessionId, status: 'stopped' },
        message: 'Live detection session stopped',
      });
    } catch (error) {
      next(error);
    }
  },

  async proxyPlayback(req: Request, res: Response, next: NextFunction) {
    try {
      const url = String(req.query.url || '');
      if (!url) throw new AppError('url query param required', 400, 'missing_url');

      const allowed = url.startsWith('http://') || url.startsWith('https://');
      if (!allowed) throw new AppError('Only HTTP/HTTPS playback URLs supported', 400, 'invalid_url');

      res.json({
        success: true,
        data: {
          playback_url: url,
          proxy_preview: `${env.corsOrigin.replace('3000', '8000')}/api/v1/stream/preview-proxy?url=${encodeURIComponent(url)}`,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
