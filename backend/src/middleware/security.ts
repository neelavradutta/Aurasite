import { Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const WEAK_JWT_SECRETS = new Set([
  'dev-secret',
  'dev-secret-change-in-production',
  'secret',
  'changeme',
  'your-secret-key',
]);

export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'production' ? 15 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'rate_limited',
      message: 'Too many login attempts. Try again later.',
      status_code: 429,
    });
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'production' ? 400 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => Boolean(req.headers.authorization?.startsWith('Bearer ')),
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'rate_limited',
      message: 'Too many requests. Try again later.',
      status_code: 429,
    });
  },
});

export function assertProductionSecurityConfig(): void {
  if (env.nodeEnv !== 'production') return;

  if (!env.authEnabled) {
    logger.error('Refusing to start: AUTH_ENABLED must be true in production');
    process.exit(1);
  }

  if (WEAK_JWT_SECRETS.has(env.jwtSecret) || env.jwtSecret.length < 32) {
    logger.error('Refusing to start: set JWT_SECRET to a random string of at least 32 characters');
    process.exit(1);
  }

  const origins = Array.isArray(env.corsOrigin) ? env.corsOrigin : [env.corsOrigin];
  if (origins.some((origin) => origin.includes('localhost'))) {
    logger.warn('CORS_ORIGIN includes localhost in production — restrict to your Vercel domain only');
  }
}

export function blockPublicRegisterInProduction(
  _req: Request,
  res: Response,
  next: (err?: unknown) => void
): void {
  if (env.nodeEnv === 'production' && !env.allowPublicRegister) {
    res.status(403).json({
      success: false,
      error: 'registration_disabled',
      message: 'Public registration is disabled',
      status_code: 403,
    });
    return;
  }
  next();
}
