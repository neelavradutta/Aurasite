import {
  Model,
  ModelAttributeColumnOptions,
  ModelStatic,
  QueryInterface,
  Utils,
} from 'sequelize';
import { Alert, Camera, Detection, User, Vehicle } from '../models';
import { env } from '../config/env';
import { logger } from './logger';
import { sequelize } from './database';

/**
 * Keeps the live database (local or cloud) in sync with Sequelize models on every
 * backend restart: creates tables, adds columns, updates column definitions,
 * and removes columns deleted from models. Also update docs/schema.sql for
 * fresh installs, then deploy and restart the backend.
 */
const MODELS: ModelStatic<Model>[] = [Vehicle, Camera, Detection, Alert, User];

type ColumnMap = Record<string, Set<string>>;
type AddedColumnsMap = Record<string, string[]>;
type TableDescription = Record<
  string,
  {
    type: string;
    allowNull: boolean;
    defaultValue: string | null;
    primaryKey?: boolean;
  }
>;

type TableHook = (addedColumns: string[]) => Promise<void>;

const TABLE_HOOKS: Record<string, TableHook> = {
  vehicles: async (addedColumns) => {
    if (addedColumns.includes('status')) {
      await sequelize.query(
        "UPDATE vehicles SET status = 'suspicious' WHERE is_suspicious = 1 AND (status IS NULL OR status = 'active')"
      );
      logger.info('Backfilled vehicles.status from is_suspicious');
    }
  },
};

function getTableName(model: ModelStatic<Model>): string {
  const tableName = model.getTableName();
  return typeof tableName === 'string' ? tableName : tableName.tableName;
}

function resolveDbColumnName(
  model: ModelStatic<Model>,
  attributeName: string,
  attribute: ModelAttributeColumnOptions
): string {
  if (attribute.field) {
    return attribute.field;
  }
  if (model.options.underscored) {
    return Utils.underscore(attributeName);
  }
  return attributeName;
}

function modelColumnNames(model: ModelStatic<Model>): Set<string> {
  return new Set(
    Object.entries(model.rawAttributes).map(([attributeName, attribute]) =>
      resolveDbColumnName(model, attributeName, attribute)
    )
  );
}

function buildColumnDefinition(attribute: ModelAttributeColumnOptions): Record<string, unknown> {
  const columnDef: Record<string, unknown> = {
    type: attribute.type,
    allowNull: attribute.allowNull ?? true,
  };

  if (attribute.defaultValue !== undefined && attribute.defaultValue !== null) {
    columnDef.defaultValue = attribute.defaultValue;
  }

  return columnDef;
}

function normalizeSqlType(type: string): string {
  return type.toUpperCase().replace(/\s+/g, '');
}

function typesEquivalent(currentType: string, expectedType: string): boolean {
  const normalize = (type: string) =>
    type
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/INT\(\d+\)/g, 'INT')
      .replace(/INTEGER/g, 'INT')
      .replace(/BOOL/g, 'TINYINT(1)');

  return normalize(currentType) === normalize(expectedType);
}

function columnNeedsUpdate(
  existing: TableDescription[string],
  attribute: ModelAttributeColumnOptions,
  attributeName: string
): boolean {
  if (existing.primaryKey || attribute.primaryKey || attributeName === 'id') {
    return false;
  }

  const expectedNullable = attribute.allowNull ?? true;
  if (Boolean(existing.allowNull) !== expectedNullable) {
    return true;
  }

  const sqlType = attribute.type as { key?: string; toSql?: () => string } | undefined;
  if (!sqlType || sqlType.key === 'ENUM' || existing.type.toUpperCase().startsWith('ENUM')) {
    return false;
  }

  if (typeof sqlType.toSql !== 'function') {
    return false;
  }

  try {
    const expectedType = normalizeSqlType(sqlType.toSql());
    const currentType = normalizeSqlType(existing.type);
    return !typesEquivalent(currentType, expectedType);
  } catch {
    return false;
  }
}

async function captureColumns(queryInterface: QueryInterface): Promise<ColumnMap> {
  const columns: ColumnMap = {};

  for (const model of MODELS) {
    const table = getTableName(model);
    try {
      const description = (await queryInterface.describeTable(table)) as TableDescription;
      columns[table] = new Set(Object.keys(description));
    } catch {
      // Table may not exist yet; sync will create it.
    }
  }

  return columns;
}

function diffAddedColumns(before: ColumnMap, after: ColumnMap): AddedColumnsMap {
  const added: AddedColumnsMap = {};

  for (const [table, afterColumns] of Object.entries(after)) {
    const beforeColumns = before[table] ?? new Set<string>();
    const newColumns = [...afterColumns].filter((column) => !beforeColumns.has(column));
    if (newColumns.length > 0) {
      added[table] = newColumns;
    }
  }

  return added;
}

async function syncTableColumns(
  queryInterface: QueryInterface,
  model: ModelStatic<Model>
): Promise<void> {
  const table = getTableName(model);

  let description: TableDescription;
  try {
    description = (await queryInterface.describeTable(table)) as TableDescription;
  } catch {
    return;
  }

  for (const [attributeName, attribute] of Object.entries(model.rawAttributes)) {
    const columnName = resolveDbColumnName(model, attributeName, attribute);
    const columnDef = buildColumnDefinition(attribute);
    const existing = description[columnName];

    if (!existing) {
      await queryInterface.addColumn(table, columnName, columnDef);
      logger.info(`Added ${table}.${columnName} column`);
      continue;
    }

    if (!columnNeedsUpdate(existing, attribute, attributeName)) {
      continue;
    }

    try {
      await queryInterface.changeColumn(table, columnName, columnDef);
      logger.info(`Updated ${table}.${columnName} column`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Skipped ${table}.${columnName} update`, { error: message });
    }
  }
}

async function pruneOrphanColumns(queryInterface: QueryInterface): Promise<void> {
  for (const model of MODELS) {
    const table = getTableName(model);
    let description: TableDescription;

    try {
      description = (await queryInterface.describeTable(table)) as TableDescription;
    } catch {
      continue;
    }

    const expected = modelColumnNames(model);

    for (const dbColumn of Object.keys(description)) {
      if (expected.has(dbColumn)) {
        continue;
      }

      const underscored = Utils.underscore(dbColumn);
      if (expected.has(underscored)) {
        try {
          await queryInterface.removeColumn(table, dbColumn);
          logger.info(`Removed ${table}.${dbColumn} column`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn(`Skipped removing ${table}.${dbColumn}`, { error: message });
        }
        continue;
      }

      try {
        await queryInterface.removeColumn(table, dbColumn);
        logger.info(`Removed ${table}.${dbColumn} column`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Skipped removing ${table}.${dbColumn}`, { error: message });
      }
    }
  }
}

async function runSchemaHooks(addedByTable: AddedColumnsMap): Promise<void> {
  for (const [table, addedColumns] of Object.entries(addedByTable)) {
    const hook = TABLE_HOOKS[table];
    if (hook) {
      await hook(addedColumns);
    }
  }
}

export async function syncSchemaFromModels(isSqlite: boolean): Promise<void> {
  const forceSync = isSqlite && env.nodeEnv === 'development' && process.env.DB_FORCE_SYNC === 'true';
  const queryInterface = sequelize.getQueryInterface();

  if (forceSync) {
    await sequelize.sync({ force: true });
    logger.info('Database schema reset from models (DB_FORCE_SYNC=true)');
    return;
  }

  const before = await captureColumns(queryInterface);

  await sequelize.sync();

  for (const model of MODELS) {
    await syncTableColumns(queryInterface, model);
  }

  await pruneOrphanColumns(queryInterface);

  const after = await captureColumns(queryInterface);
  await runSchemaHooks(diffAddedColumns(before, after));

  logger.info('Database schema synced from models');
}
