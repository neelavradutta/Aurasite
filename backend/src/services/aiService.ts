import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface DetectOptions {
  frame_skip?: number;
  confidence_threshold?: number;
  min_plate_confidence?: number;
  max_frames?: number | null;
  return_images?: boolean;
  job_id?: string;
}

export interface AiDetectionResult {
  success: boolean;
  data?: {
    total_frames: number;
    frames_processed?: number;
    max_frames?: number;
    total_detections: number;
    unique_vehicles: number;
    processing_time_seconds: number;
    fps: number;
    detections: Array<Record<string, unknown>>;
  };
  message?: string;
  error?: string;
}

export interface AiDetectJobStatus {
  job_id: string;
  status: string;
  progress: number;
  frames_processed: number;
  max_frames: number;
  result?: AiDetectionResult['data'];
  error?: string;
}

const MEDIA_CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.wmv': 'video/x-msvideo',
  '.m4v': 'video/mp4',
  '.flv': 'video/x-flv',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
  '.jfif': 'image/jpeg',
};

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.gif',
  '.heic',
  '.heif',
  '.avif',
  '.jfif',
]);

function resolveMediaContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (MEDIA_CONTENT_TYPES[ext]) return MEDIA_CONTENT_TYPES[ext];
  return ext ? 'application/octet-stream' : 'video/mp4';
}

function isImageMediaPath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function resolveDetectEndpoint(_filePath: string): string {
  // Unified detect route handles both video and image uploads.
  return '/api/v1/detect';
}

class AiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.pythonServiceUrl,
      timeout: 600000,
    });
  }

  async healthCheck(): Promise<Record<string, unknown>> {
    const { data } = await this.client.get('/api/v1/health');
    return data;
  }

  async detectVideo(videoPath: string, options: DetectOptions = {}): Promise<AiDetectionResult> {
    const absolutePath = path.resolve(videoPath);

    const form = new FormData();
    form.append('video_file', fs.createReadStream(absolutePath), {
      filename: path.basename(absolutePath),
      contentType: resolveMediaContentType(absolutePath),
    });
    form.append('options', JSON.stringify(options));

    logger.info('Sending media to AI service', { videoPath, options });

    const endpoint = resolveDetectEndpoint(absolutePath);
    const { data } = await this.client.post<AiDetectionResult>(endpoint, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    return data;
  }

  async startVideoJob(videoPath: string, options: DetectOptions & { job_id: string }): Promise<void> {
    const absolutePath = path.resolve(videoPath);
    const endpoint = resolveDetectEndpoint(absolutePath);

    const form = new FormData();
    form.append('video_file', fs.createReadStream(absolutePath), {
      filename: path.basename(absolutePath),
      contentType: resolveMediaContentType(absolutePath),
    });
    form.append('options', JSON.stringify({
      ...options,
      media_type: isImageMediaPath(absolutePath) ? 'image' : 'video',
    }));

    logger.info('Starting async AI media job', { videoPath, jobId: options.job_id, endpoint });

    await this.client.post(endpoint, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }

  async getDetectJobStatus(jobId: string): Promise<AiDetectJobStatus | null> {
    try {
      const { data } = await this.client.get<{ success: boolean; data: AiDetectJobStatus }>(
        `/api/v1/detect/jobs/${jobId}`
      );
      return data.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async waitForDetectJob(
    jobId: string,
    onProgress?: (status: AiDetectJobStatus) => void,
    pollMs = 1000
  ): Promise<AiDetectionResult['data']> {
    let missingPolls = 0;

    for (;;) {
      const job = await this.getDetectJobStatus(jobId);
      if (!job) {
        missingPolls += 1;
        if (missingPolls > 120) {
          throw new Error(
            'AI processing job not found. The AI service may have restarted — please upload again.'
          );
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        continue;
      }

      missingPolls = 0;
      onProgress?.(job);

      if (job.status === 'completed' && job.result) {
        return job.result;
      }
      if (job.status === 'failed') {
        throw new Error(job.error || 'AI video processing failed');
      }

      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

}

export const aiService = new AiService();
