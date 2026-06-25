import dotenv from 'dotenv';

dotenv.config();

function parseCorsOrigin(): string | string[] {
  const raw = process.env.CORS_ORIGIN || 'http://localhost:3001';
  const origins = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
  return origins.length <= 1 ? (origins[0] ?? 'http://localhost:3001') : origins;
}

export const env = {
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'mysql://anpr_user:anpr_pass@localhost:3306/anpr_db',
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://localhost:5000',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  corsOrigin: parseCorsOrigin(),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL || 'admin@gmail.com',
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
  authEnabled: process.env.AUTH_ENABLED !== 'false',
};

/** ngrok free tier returns an HTML warning unless this header is sent. */
export function pythonServiceRequestHeaders(): Record<string, string> {
  if (env.pythonServiceUrl.includes('ngrok')) {
    return { 'ngrok-skip-browser-warning': 'true' };
  }
  return {};
}
