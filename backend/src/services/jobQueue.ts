import axios from 'axios';
import { logger } from '../utils/logger';
import { aiService } from './aiService';
import { detectionService } from './detectionService';
import { emitDetectionsChanged, emitViolationsUpdated, setRealtimeSocket } from '../utils/realtimeEvents';
import { Server as SocketServer } from 'socket.io';

function formatJobError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const code = error.code;
    if (code === 'ECONNABORTED') {
      return 'AI service request timed out while uploading video. Try a smaller file or restart the AI service.';
    }
    if (code === 'ECONNRESET' || error.message.toLowerCase().includes('socket hang up')) {
      return 'Lost connection to AI service. Ensure it is running on port 5000.';
    }
    return String(error.response?.data?.message || error.message || 'Job failed');
  }
  return error instanceof Error ? error.message : 'Job failed';
}

export interface ProcessVideoJob {
  jobId: string;
  videoPath: string;
  videoSource: string;
  options?: Record<string, unknown>;
}

interface MemoryJob {
  jobId: string;
  status: string;
  progress: number;
  framesProcessed: number;
  maxFrames: number;
  result?: unknown;
  failedReason?: string;
}

let io: SocketServer | null = null;
const memoryJobs = new Map<string, MemoryJob>();

export function setSocketServer(server: SocketServer): void {
  io = server;
  setRealtimeSocket(server);
}

async function processVideoJob(data: ProcessVideoJob): Promise<unknown> {
  try {
    return await runProcessVideoJob(data);
  } catch (error) {
    throw new Error(formatJobError(error));
  }
}

async function runProcessVideoJob(data: ProcessVideoJob): Promise<unknown> {
  const { jobId, videoPath, videoSource, options } = data;
  logger.info('Processing video job', { jobId });

  const maxFramesOption = Number(options?.max_frames) || 100;

  const update = (
    progress: number,
    status: string,
    framesProcessed = 0,
    maxFrames = maxFramesOption
  ) => {
    const mem = memoryJobs.get(jobId);
    if (mem) {
      mem.progress = progress;
      mem.status = status;
      mem.framesProcessed = framesProcessed;
      mem.maxFrames = maxFrames;
    }
    io?.emit('job:progress', { jobId, progress, status, framesProcessed, maxFrames });
  };

  update(0, 'processing', 0, maxFramesOption);

  await aiService.startVideoJob(videoPath, {
    ...(options as Parameters<typeof aiService.startVideoJob>[1]),
    max_frames: maxFramesOption,
    job_id: jobId,
  });

  const aiResult = await aiService.waitForDetectJob(jobId, (aiJob) => {
    update(
      Number(aiJob.progress) || 0,
      'processing',
      Number(aiJob.frames_processed) || 0,
      Number(aiJob.max_frames) || maxFramesOption
    );
  });

  if (!aiResult) {
    throw new Error('AI processing failed');
  }

  const finalFrames = Number(aiResult.frames_processed) || 0;
  const finalMaxFrames = Number(aiResult.max_frames) || maxFramesOption;

  update(finalMaxFrames > 0 ? 92 : 90, 'saving', finalFrames, finalMaxFrames);

  await detectionService.clearDetectionsForVideoSource(videoSource);

  const dashboardPlates = Array.isArray(
    (aiResult as { dashboard_plates?: Array<Record<string, unknown>> }).dashboard_plates
  )
    ? (aiResult as { dashboard_plates: Array<Record<string, unknown>> }).dashboard_plates
    : [];
  const isImageJob = (aiResult as { media_type?: string }).media_type === 'image';
  const isVideoJob = (aiResult as { media_type?: string }).media_type === 'video';

  const detectionItems = isImageJob
    ? dashboardPlates
    : isVideoJob
      ? Array.isArray(aiResult.detections)
        ? aiResult.detections
        : []
      : Array.isArray(aiResult.detections) && aiResult.detections.length > 0
        ? aiResult.detections
        : dashboardPlates;

  const { saved, violationUpdates } = await detectionService.saveAiDetections(
    detectionItems,
    videoSource,
    (update) => {
      emitViolationsUpdated([update]);
    }
  );
  if (saved.length === 0 && Number(aiResult.total_detections) > 0) {
    logger.warn('AI returned detections but none were saved', { jobId, videoSource });
  }
  if (saved.length === 0) {
    logger.warn('No detections saved for media job', {
      jobId,
      videoSource,
      aiTotal: aiResult.total_detections,
      detectionItems: detectionItems.length,
    });
  }

  update(100, 'completed', finalFrames, finalMaxFrames);
  const summary = {
    total_detections: aiResult.total_detections,
    unique_vehicles: aiResult.unique_vehicles,
    processing_time_seconds: aiResult.processing_time_seconds,
    saved_count: saved.length,
    frames_processed: finalFrames,
    max_frames: finalMaxFrames,
  };

  emitDetectionsChanged({ videoSource, savedCount: saved.length });

  io?.emit('job:complete', { jobId, summary });

  return { savedCount: saved.length, summary, violationUpdates };
}

async function runMemoryJob(data: ProcessVideoJob): Promise<void> {
  const mem = memoryJobs.get(data.jobId);
  if (mem) {
    mem.status = 'active';
  }
  try {
    const result = await processVideoJob(data);
    const mem = memoryJobs.get(data.jobId);
    if (mem) {
      mem.status = 'completed';
      mem.result = result;
    }
  } catch (error) {
    const message = formatJobError(error);
    const mem = memoryJobs.get(data.jobId);
    if (mem) {
      mem.status = 'failed';
      mem.failedReason = message;
    }
    io?.emit('job:complete', { jobId: data.jobId, status: 'failed', error: message });
    logger.error('Video job failed', { jobId: data.jobId, error: message });
  }
}

export async function initJobQueue(): Promise<void> {
  logger.info('In-memory job queue ready');
}

export async function enqueueVideoJob(data: ProcessVideoJob): Promise<{ id: string }> {
  const maxFrames = Number(data.options?.max_frames) || 100;
  memoryJobs.set(data.jobId, {
    jobId: data.jobId,
    status: 'queued',
    progress: 0,
    framesProcessed: 0,
    maxFrames,
  });

  setImmediate(() => {
    runMemoryJob(data).catch((err) => logger.error('Memory job error', { err }));
  });
  return { id: data.jobId };
}

export async function getJobStatus(jobId: string): Promise<Record<string, unknown>> {
  const mem = memoryJobs.get(jobId);
  if (mem) {
    return {
      jobId,
      status: mem.status,
      progress: mem.progress,
      frames_processed: mem.framesProcessed,
      max_frames: mem.maxFrames,
      result: mem.result,
      failedReason: mem.failedReason,
    };
  }

  return { jobId, status: 'not_found' };
}
