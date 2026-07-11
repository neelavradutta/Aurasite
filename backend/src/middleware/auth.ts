import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errorHandler';
import { isTokenRevoked } from '../utils/tokenBlacklist';

export interface AuthRequest extends Request {
  user?: { id: string; role: string; email?: string; jti?: string };
}

type JwtPayload = { id: string; role: string; email?: string; jti?: string };

async function authenticateBearer(req: AuthRequest): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401, 'unauthorized');
  }

  const token = header.slice(7);
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
  } catch {
    throw new AppError('Invalid or expired token', 401, 'invalid_token');
  }

  if (await isTokenRevoked(payload.jti)) {
    throw new AppError('Token revoked', 401, 'token_revoked');
  }

  req.user = payload;
}

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction): void {
  void authenticateBearer(req)
    .then(() => next())
    .catch((error) => next(error));
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
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  void authenticateBearer(req)
    .then(() => next())
    .catch(() => next());
}
