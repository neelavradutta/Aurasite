import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './config/env';
import { connectDatabase } from './utils/database';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { registerSocketEvents } from './events/socketEvents';
import { setSocketServer, initJobQueue } from './services/jobQueue';
import detectRoutes from './routes/detectRoutes';
import detectionRoutes from './routes/detectionRoutes';
import vehicleRoutes from './routes/vehicleRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import alertRoutes from './routes/alertRoutes';
import jobRoutes from './routes/jobRoutes';
import authRoutes from './routes/authRoutes';
import cameraRoutes from './routes/cameraRoutes';
import { alertController } from './controllers/alertController';
import { authService } from './services/authService';
import './models';

const app = express();
const server = http.createServer(app);
server.requestTimeout = 600_000;
server.headersTimeout = 610_000;
server.keepAliveTimeout = 65_000;

const io = new Server(server, {
  cors: {
    origin: env.corsOrigin,
    methods: ['GET', 'POST'],
  },
});

setSocketServer(io);
registerSocketEvents(io);

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ANPR Dashboard API',
      version: '1.0.0',
      description: 'Node.js API for ANPR intelligence dashboard',
    },
    servers: [{ url: `http://localhost:${env.port}` }],
  },
  apis: ['./src/routes/*.ts'],
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'anpr-backend' });
});

app.use('/api/v1/auth', authRoutes);

app.use('/api/v1/detect', detectRoutes);
app.use('/api/v1/detections', detectionRoutes);
app.use('/api/v1/vehicles', vehicleRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/suspicious', alertController.suspicious);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/cameras', cameraRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  try {
    await connectDatabase();
    await initJobQueue();
    await authService.ensureDefaultAdmin();
    server.listen(env.port, () => {
      logger.info(`ANPR Backend running on port ${env.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

bootstrap();

export { app, io };
