import { Server, Socket } from 'socket.io';
import { analyticsService } from '../services/analyticsService';
import { logger } from '../utils/logger';

export function registerSocketEvents(io: Server): void {
  io.on('connection', (socket: Socket) => {
    logger.info('Client connected', { socketId: socket.id });

    socket.on('request:stats', async () => {
      try {
        const stats = await analyticsService.getSummary();
        socket.emit('statistics:update', stats);
      } catch (error) {
        logger.error('Failed to fetch stats for socket', { error });
      }
    });

    socket.on('disconnect', () => {
      logger.debug('Client disconnected', { socketId: socket.id });
    });
  });
}
