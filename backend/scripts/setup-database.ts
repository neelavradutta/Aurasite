import 'dotenv/config';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env';
import { connectDatabase, sequelize } from '../src/utils/database';
import { authService } from '../src/services/authService';
import '../src/models';

function parseMysqlUrl(url: string) {
  const parsed = new URL(url.replace(/^mysql:\/\//, 'http://'));
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

async function ensureMysqlDatabase(): Promise<void> {
  const cfg = parseMysqlUrl(env.databaseUrl);
  const rootUser = process.env.MYSQL_ROOT_USER || 'root';
  const rootPassword = process.env.MYSQL_ROOT_PASSWORD || '';

  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: rootUser,
    password: rootPassword,
    multipleStatements: true,
  });

  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.query(
    `CREATE USER IF NOT EXISTS '${cfg.user.replace(/'/g, "''")}'@'%' IDENTIFIED BY '${cfg.password.replace(/'/g, "''")}'`
  );
  await conn.query(`GRANT ALL PRIVILEGES ON \`${cfg.database}\`.* TO '${cfg.user.replace(/'/g, "''")}'@'%'`);
  await conn.query('FLUSH PRIVILEGES');
  await conn.end();
}

async function main(): Promise<void> {
  const isSqlite = env.databaseUrl.startsWith('sqlite:');

  if (!isSqlite) {
    console.log('Creating MySQL database and user (if needed)...');
    await ensureMysqlDatabase();
  }

  console.log('Syncing schema and seeding defaults...');
  await connectDatabase();
  await authService.ensureDefaultAdmin();

  const dialect = isSqlite ? 'sqlite' : 'mysql';
  console.log(`Database ready (${dialect}).`);
  await sequelize.close();
}

main().catch((error) => {
  console.error('Database setup failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
