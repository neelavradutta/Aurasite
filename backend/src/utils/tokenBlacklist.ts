import jwt from 'jsonwebtoken';
import { cacheGet, cacheSet } from './memoryCache';

function revokedKey(jti: string): string {
  return `revoked:jti:${jti}`;
}

export async function revokeToken(token: string): Promise<void> {
  const decoded = jwt.decode(token) as { jti?: string; exp?: number } | null;
  if (!decoded?.jti || !decoded.exp) return;

  const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000);
  if (ttlSeconds > 0) {
    await cacheSet(revokedKey(decoded.jti), '1', ttlSeconds);
  }
}

export async function isTokenRevoked(jti: string | undefined): Promise<boolean> {
  if (!jti) return false;
  return (await cacheGet(revokedKey(jti))) !== null;
}
