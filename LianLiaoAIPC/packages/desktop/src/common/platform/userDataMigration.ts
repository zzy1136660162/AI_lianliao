import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  readSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

export type UserDataMigrationStatus = 'not-needed' | 'migrated' | 'source-missing' | 'target-in-use' | 'failed';

export interface UserDataMigrationResult {
  status: UserDataMigrationStatus;
  sourcePath: string;
  targetPath: string;
  error?: string;
}

export interface UserDataMigrationRecord {
  schemaVersion: 1;
  sourcePath: string;
  targetPath: string;
  applicationVersion: string;
  migratedAt: string;
  validatedDatabases: string[];
  migrationProcessId: number;
  coreValidationStatus: 'pending' | 'validated';
  coreValidatedAt?: string;
}

type ReadonlySqliteDatabase = {
  pragma(statement: string, options?: { simple?: boolean }): unknown;
  close(): void;
};

type ReadonlySqliteConstructor = new (
  filename: string,
  options: { readonly: true; fileMustExist: true }
) => ReadonlySqliteDatabase;

const MIGRATION_RECORD_FILE = 'lianliao-migration.json';
const SQLITE_HEADER = Buffer.from('SQLite format 3\u0000', 'utf8');
const KNOWN_DATABASE_PATHS = ['aionui.db', join('aionui', 'aionui-backend.db')] as const;

function isDirectoryEmpty(directoryPath: string): boolean {
  return readdirSync(directoryPath).length === 0;
}

function assertSiblingPath(sourcePath: string, targetPath: string): void {
  const sourceParent = resolve(dirname(sourcePath));
  const targetParent = resolve(dirname(targetPath));
  if (sourceParent !== targetParent) {
    throw new Error('Legacy and target user data directories must share the same parent');
  }
}

function listFiles(rootPath: string, currentPath = rootPath): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
    const absolutePath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(rootPath, absolutePath));
    } else if (entry.isFile()) {
      files.push(relative(rootPath, absolutePath));
    }
  }
  return files;
}

function assertCopiedFileSizes(sourcePath: string, copiedPath: string): void {
  for (const relativePath of listFiles(sourcePath)) {
    const sourceFile = join(sourcePath, relativePath);
    const copiedFile = join(copiedPath, relativePath);
    if (!existsSync(copiedFile)) {
      throw new Error(`Copied user data file is missing: ${relativePath}`);
    }
    if (statSync(sourceFile).size !== statSync(copiedFile).size) {
      throw new Error(`Copied user data file size mismatch: ${relativePath}`);
    }
  }
}

function validateSqliteHeader(databasePath: string): void {
  const descriptor = openSync(databasePath, 'r');
  try {
    const header = Buffer.alloc(SQLITE_HEADER.length);
    const bytesRead = readSync(descriptor, header, 0, header.length, 0);
    if (bytesRead !== SQLITE_HEADER.length || !header.equals(SQLITE_HEADER)) {
      throw new Error(`Invalid SQLite header: ${databasePath}`);
    }
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Open a copied database in read-only mode and run SQLite quick_check.
 *
 * `better-sqlite3` is required dynamically because this module runs during
 * Electron main-process bootstrap and must not become part of renderer code.
 */
function validateSqliteDatabase(databasePath: string): void {
  validateSqliteHeader(databasePath);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as ReadonlySqliteConstructor;
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const result = database.pragma('quick_check', { simple: true });
    if (result !== 'ok') {
      throw new Error(`SQLite quick_check failed for ${databasePath}: ${String(result)}`);
    }
  } finally {
    database.close();
  }
}

function validateCopiedDatabases(copiedPath: string): string[] {
  const validated: string[] = [];
  for (const relativePath of KNOWN_DATABASE_PATHS) {
    const databasePath = join(copiedPath, relativePath);
    if (!existsSync(databasePath)) continue;
    validateSqliteDatabase(databasePath);
    validated.push(relativePath.split(sep).join('/'));
  }
  return validated;
}

function normalizeMigrationError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readMigrationRecord(targetPath: string): UserDataMigrationRecord | null {
  const recordPath = join(targetPath, MIGRATION_RECORD_FILE);
  if (!existsSync(recordPath)) return null;

  try {
    const record = JSON.parse(readFileSync(recordPath, 'utf8')) as UserDataMigrationRecord;
    return record.schemaVersion === 1 ? record : null;
  } catch {
    return null;
  }
}

/** Mark the copied profile usable after LianLiaoAICore reports ready. */
export function markUserDataMigrationCoreValidated(targetPath: string): boolean {
  try {
    const resolvedTargetPath = resolve(targetPath);
    const record = readMigrationRecord(resolvedTargetPath);
    if (!record || record.coreValidationStatus === 'validated') return false;

    const updatedRecord: UserDataMigrationRecord = {
      ...record,
      coreValidationStatus: 'validated',
      coreValidatedAt: new Date().toISOString(),
    };
    writeFileSync(
      join(resolvedTargetPath, MIGRATION_RECORD_FILE),
      `${JSON.stringify(updatedRecord, null, 2)}\n`,
      'utf8'
    );
    return true;
  } catch (error) {
    console.warn(
      `[LianLiaoAIPC] Failed to record Core validation for migrated user data: ${normalizeMigrationError(error)}`
    );
    return false;
  }
}

/**
 * Copy legacy AionUi data to the new LianLiaoAIPC directory.
 *
 * The source is never moved or deleted. The copy is built in a sibling
 * temporary directory, validated, and renamed into place only after all
 * checks pass. Re-running after a completed migration is safe.
 */
export function migrateLegacyUserData(options: {
  sourcePath: string;
  targetPath: string;
  applicationVersion: string;
}): UserDataMigrationResult {
  const sourcePath = resolve(options.sourcePath);
  const targetPath = resolve(options.targetPath);

  try {
    assertSiblingPath(sourcePath, targetPath);

    if (sourcePath === targetPath) {
      return { status: 'not-needed', sourcePath, targetPath };
    }
    if (!existsSync(sourcePath) || isDirectoryEmpty(sourcePath)) {
      return { status: 'source-missing', sourcePath, targetPath };
    }

    if (existsSync(targetPath) && !isDirectoryEmpty(targetPath)) {
      const existingRecord = readMigrationRecord(targetPath);
      if (existingRecord?.coreValidationStatus === 'pending' && existingRecord.migrationProcessId !== process.pid) {
        return {
          status: 'failed',
          sourcePath,
          targetPath,
          error: 'Migrated user data did not complete LianLiaoAICore validation on the previous launch',
        };
      }
      return { status: 'target-in-use', sourcePath, targetPath };
    }

    const parentPath = dirname(targetPath);
    mkdirSync(parentPath, { recursive: true });
    const temporaryRoot = mkdtempSync(join(parentPath, `${basename(targetPath)}.migrating-`));
    const temporaryPath = join(temporaryRoot, 'data');
    let emptyTargetBackupPath: string | undefined;

    try {
      cpSync(sourcePath, temporaryPath, {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true,
      });
      assertCopiedFileSizes(sourcePath, temporaryPath);
      const validatedDatabases = validateCopiedDatabases(temporaryPath);

      const record: UserDataMigrationRecord = {
        schemaVersion: 1,
        sourcePath,
        targetPath,
        applicationVersion: options.applicationVersion,
        migratedAt: new Date().toISOString(),
        validatedDatabases,
        migrationProcessId: process.pid,
        coreValidationStatus: 'pending',
      };
      writeFileSync(join(temporaryPath, MIGRATION_RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`, 'utf8');

      if (existsSync(targetPath)) {
        emptyTargetBackupPath = `${targetPath}.empty-before-migration-${Date.now()}`;
        renameSync(targetPath, emptyTargetBackupPath);
      }
      renameSync(temporaryPath, targetPath);
      rmSync(temporaryRoot, { recursive: true, force: true });
      return { status: 'migrated', sourcePath, targetPath };
    } catch (error) {
      if (existsSync(temporaryRoot)) {
        rmSync(temporaryRoot, { recursive: true, force: true });
      }
      if (emptyTargetBackupPath && existsSync(emptyTargetBackupPath) && !existsSync(targetPath)) {
        renameSync(emptyTargetBackupPath, targetPath);
      }
      throw error;
    }
  } catch (error) {
    return {
      status: 'failed',
      sourcePath,
      targetPath,
      error: normalizeMigrationError(error),
    };
  }
}
