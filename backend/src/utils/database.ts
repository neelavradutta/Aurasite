import path from 'path';
import { Sequelize } from 'sequelize';
import { env } from '../config/env';
import { logger } from './logger';

const isSqlite = env.databaseUrl.startsWith('sqlite:');

function mysqlNeedsSsl(url: string): boolean {
  try {
    const host = new URL(url.replace(/^mysql:\/\//, 'http://')).hostname;
    return host !== 'localhost' && host !== '127.0.0.1';
  } catch {
    return false;
  }
}

export const sequelize = isSqlite
  ? new Sequelize({
      dialect: 'sqlite',
      storage: env.databaseUrl.replace('sqlite:', ''),
      logging: env.nodeEnv === 'development' ? (msg) => logger.debug(msg) : false,
    })
  : new Sequelize(env.databaseUrl, {
      dialect: 'mysql',
      logging: env.nodeEnv === 'development' ? (msg) => logger.debug(msg) : false,
      ...(mysqlNeedsSsl(env.databaseUrl)
        ? {
            dialectOptions: {
              ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
            },
          }
        : {}),
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    });

export async function connectDatabase(): Promise<void> {
  try {
    if (isSqlite) {
      const fs = await import('fs');
      const dir = path.dirname(env.databaseUrl.replace('sqlite:', ''));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    await sequelize.authenticate();

    const { syncSchemaFromModels } = await import('./ensureSchema');
    await syncSchemaFromModels(isSqlite);

    const { cameraService } = await import('../services/cameraService');
    await cameraService.seedDefaultCameras();

    logger.info(`Database connected (${isSqlite ? 'sqlite' : 'mysql'}) and synced`);
  } catch (error) {
    logger.error('Unable to connect to database', { error });
    throw error;
  }
}

export function isSqliteDb(): boolean {
  return isSqlite;
}
