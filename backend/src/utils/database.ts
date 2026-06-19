import path from 'path';
import { Sequelize } from 'sequelize';
import { env } from '../config/env';
import { logger } from './logger';

const isSqlite = env.databaseUrl.startsWith('sqlite:');

export const sequelize = isSqlite
  ? new Sequelize({
      dialect: 'sqlite',
      storage: env.databaseUrl.replace('sqlite:', ''),
      logging: env.nodeEnv === 'development' ? (msg) => logger.debug(msg) : false,
    })
  : new Sequelize(env.databaseUrl, {
      dialect: 'mysql',
      logging: env.nodeEnv === 'development' ? (msg) => logger.debug(msg) : false,
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
    await sequelize.sync({ force: isSqlite && env.nodeEnv === 'development' && process.env.DB_FORCE_SYNC === 'true' });

    if (isSqlite) {
      await ensureSqliteColumns();
      await ensureSqliteCamerasTable();
    } else {
      await ensureMysqlColumns();
    }

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

async function ensureSqliteColumns(): Promise<void> {
  const [columns] = await sequelize.query('PRAGMA table_info(vehicles)');
  const names = new Set((columns as Array<{ name: string }>).map((column) => column.name));

  if (!names.has('owner_address')) {
    await sequelize.query('ALTER TABLE vehicles ADD COLUMN owner_address VARCHAR(255)');
    logger.info('Added vehicles.owner_address column');
  }

  if (!names.has('work')) {
    await sequelize.query('ALTER TABLE vehicles ADD COLUMN work VARCHAR(100)');
    logger.info('Added vehicles.work column');
  }

  if (!names.has('owner_email')) {
    await sequelize.query('ALTER TABLE vehicles ADD COLUMN owner_email VARCHAR(120)');
    logger.info('Added vehicles.owner_email column');
  }

  if (!names.has('driving_license')) {
    await sequelize.query('ALTER TABLE vehicles ADD COLUMN driving_license VARCHAR(50)');
    logger.info('Added vehicles.driving_license column');
  }

  const vehicleDetailColumns: Array<[string, string]> = [
    ['model', 'VARCHAR(80)'],
    ['manufacturing_year', 'VARCHAR(4)'],
    ['modifications', 'VARCHAR(255)'],
    ['engine_number', 'VARCHAR(50)'],
    ['chassis_number', 'VARCHAR(50)'],
    ['fuel_type', 'VARCHAR(30)'],
    ['insurance_status', 'VARCHAR(30)'],
    ['registration_date', 'DATE'],
  ];

  for (const [column, definition] of vehicleDetailColumns) {
    if (!names.has(column)) {
      await sequelize.query(`ALTER TABLE vehicles ADD COLUMN ${column} ${definition}`);
      logger.info(`Added vehicles.${column} column`);
    }
  }

  if (!names.has('status')) {
    await sequelize.query("ALTER TABLE vehicles ADD COLUMN status VARCHAR(20) DEFAULT 'active'");
    await sequelize.query("UPDATE vehicles SET status = 'suspicious' WHERE is_suspicious = 1 AND (status IS NULL OR status = 'active')");
    logger.info('Added vehicles.status column');
  }

  if (!names.has('violation_count')) {
    await sequelize.query('ALTER TABLE vehicles ADD COLUMN violation_count INTEGER DEFAULT 0');
    logger.info('Added vehicles.violation_count column');
  }
}

async function ensureMysqlColumns(): Promise<void> {
  const [columns] = await sequelize.query('SHOW COLUMNS FROM vehicles');
  const names = new Set((columns as Array<{ Field: string }>).map((column) => column.Field));

  if (!names.has('status')) {
    await sequelize.query("ALTER TABLE vehicles ADD COLUMN status VARCHAR(20) DEFAULT 'active'");
    await sequelize.query(
      "UPDATE vehicles SET status = 'suspicious' WHERE is_suspicious = 1 AND (status IS NULL OR status = 'active')"
    );
    logger.info('Added vehicles.status column (mysql)');
  }

  if (!names.has('violation_count')) {
    await sequelize.query('ALTER TABLE vehicles ADD COLUMN violation_count INT DEFAULT 0');
    logger.info('Added vehicles.violation_count column (mysql)');
  }
}

async function ensureSqliteCamerasTable(): Promise<void> {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_code VARCHAR(20) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      video_source VARCHAR(255) NOT NULL UNIQUE,
      latitude DECIMAL(10, 7),
      longitude DECIMAL(10, 7),
      place_name VARCHAR(255),
      gps_updated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('Ensured cameras table exists');
}
