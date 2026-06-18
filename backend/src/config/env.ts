import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'mysql://anpr_user:anpr_pass@localhost:3306/anpr_db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://localhost:5000',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL || 'admin@gmail.com',
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
  authEnabled: process.env.AUTH_ENABLED !== 'false',
};
