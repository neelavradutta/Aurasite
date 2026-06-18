import { v4 as uuidv4 } from 'uuid';
import { aiService } from './aiService';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';

export interface ActiveStream {
  streamId: string;
  streamUrl: string;
  previewUrl: string;
  status: string;
  startedAt: string;
}

const STREAM_KEY_PREFIX = 'stream:active:';
const CURRENT_STREAM_KEY = 'stream:current';

export const streamService = {
  async startStream(streamUrl: string, options?: Record<string, unknown>): Promise<ActiveStream> {
    const streamId = uuidv4();
    const result = await aiService.startStream(streamUrl, streamId, options);

    const active: ActiveStream = {
      streamId,
      streamUrl,
      previewUrl: `/api/v1/stream/${streamId}/preview`,
      status: String(result.status || 'running'),
      startedAt: new Date().toISOString(),
    };

    await cacheSet(`${STREAM_KEY_PREFIX}${streamId}`, JSON.stringify(active), 86400);
    await cacheSet(CURRENT_STREAM_KEY, streamId, 86400);

    logger.info('Stream started', { streamId, streamUrl });
    return active;
  },

  async stopStream(streamId?: string): Promise<{ streamId: string; status: string }> {
    const id = streamId || (await cacheGet(CURRENT_STREAM_KEY));
    if (!id) {
      return { streamId: '', status: 'not_running' };
    }

    await aiService.stopStream(id);
    await cacheDel(`${STREAM_KEY_PREFIX}${id}`);
    const current = await cacheGet(CURRENT_STREAM_KEY);
    if (current === id) {
      await cacheDel(CURRENT_STREAM_KEY);
    }

    return { streamId: id, status: 'stopped' };
  },

  async getStatus(): Promise<{ status: string; active_streams: number; current?: ActiveStream }> {
    const aiStatus = await aiService.getStreamStatus();
    const currentId = await cacheGet(CURRENT_STREAM_KEY);
    let current: ActiveStream | undefined;

    if (currentId) {
      const raw = await cacheGet(`${STREAM_KEY_PREFIX}${currentId}`);
      if (raw) current = JSON.parse(raw) as ActiveStream;
    }

    return {
      status: current ? 'running' : 'idle',
      active_streams: (aiStatus.streams as unknown[])?.length ?? 0,
      current,
    };
  },

  getPreviewUrl(streamId: string): string {
    return `${process.env.PYTHON_SERVICE_URL || 'http://localhost:5000'}/api/v1/stream/${streamId}/frame`;
  },
};
