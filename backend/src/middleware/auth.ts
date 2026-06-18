import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errorHandler';

export interface AuthRequest extends Request {
  user?: { id: string; role: string; email?: string };
}

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError('Authentication required', 401, 'unauthorized'));
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, env.jwtSecret) as { id: string; role: string; email?: string };
    req.user = payload;
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401, 'invalid_token'));
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!env.authEnabled) {
    next();
    return;
  }
  authMiddleware(req, res, next);
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const token = header.slice(7);
      req.user = jwt.verify(token, env.jwtSecret) as { id: string; role: string };
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}
