import BetterSqlite3 from 'better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { markUserDataMigrationCoreValidated, migrateLegacyUserData } from '@/common/platform/userDataMigration';

const temporaryRoots: string[] = [];

function createTemporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'lianliao-user-data-migration-'));
  temporaryRoots.push(root);
  return root;
}

function createLegacyData(root: string, directoryName = 'AionUi-Dev'): string {
  const sourcePath = join(root, directoryName);
  const coreDataPath = join(sourcePath, 'aionui');
  mkdirSync(coreDataPath, { recursive: true });
  writeFileSync(join(sourcePath, 'settings.json'), '{"theme":"light"}\n', 'utf8');

  const databasePath = join(coreDataPath, 'aionui-backend.db');
  const database = new BetterSqlite3(databasePath);
  database.exec('CREATE TABLE migration_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  database.prepare('INSERT INTO migration_probe(value) VALUES (?)').run('preserved');
  database.close();

  return sourcePath;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('legacy Electron user data migration', () => {
  it('copies legacy data into LianLiaoAIPC and preserves the source', () => {
    const root = createTemporaryRoot();
    const sourcePath = createLegacyData(root);
    const targetPath = join(root, 'LianLiaoAIPC-Dev');

    const result = migrateLegacyUserData({
      sourcePath,
      targetPath,
      applicationVersion: '2.1.27',
    });

    expect(result.status).toBe('migrated');
    expect(existsSync(join(sourcePath, 'settings.json'))).toBe(true);
    expect(readFileSync(join(targetPath, 'settings.json'), 'utf8')).toContain('"theme":"light"');

    const record = JSON.parse(readFileSync(join(targetPath, 'lianliao-migration.json'), 'utf8')) as {
      schemaVersion: number;
      applicationVersion: string;
      validatedDatabases: string[];
      coreValidationStatus: string;
    };
    expect(record).toMatchObject({
      schemaVersion: 1,
      applicationVersion: '2.1.27',
      validatedDatabases: ['aionui/aionui-backend.db'],
      coreValidationStatus: 'pending',
    });

    expect(markUserDataMigrationCoreValidated(targetPath)).toBe(true);
    const validatedRecord = JSON.parse(readFileSync(join(targetPath, 'lianliao-migration.json'), 'utf8')) as {
      coreValidationStatus: string;
      coreValidatedAt?: string;
    };
    expect(validatedRecord.coreValidationStatus).toBe('validated');
    expect(validatedRecord.coreValidatedAt).toBeTruthy();
  });

  it('does not overwrite a non-empty LianLiaoAIPC directory', () => {
    const root = createTemporaryRoot();
    const sourcePath = createLegacyData(root);
    const targetPath = join(root, 'LianLiaoAIPC-Dev');
    mkdirSync(targetPath, { recursive: true });
    writeFileSync(join(targetPath, 'existing.txt'), 'keep', 'utf8');

    const result = migrateLegacyUserData({
      sourcePath,
      targetPath,
      applicationVersion: '2.1.27',
    });

    expect(result.status).toBe('target-in-use');
    expect(readFileSync(join(targetPath, 'existing.txt'), 'utf8')).toBe('keep');
    expect(existsSync(join(targetPath, 'settings.json'))).toBe(false);
  });

  it('is idempotent after a successful migration', () => {
    const root = createTemporaryRoot();
    const sourcePath = createLegacyData(root);
    const targetPath = join(root, 'LianLiaoAIPC-Dev');
    const options = { sourcePath, targetPath, applicationVersion: '2.1.27' };

    expect(migrateLegacyUserData(options).status).toBe('migrated');
    expect(markUserDataMigrationCoreValidated(targetPath)).toBe(true);
    expect(migrateLegacyUserData(options).status).toBe('target-in-use');
    expect(readFileSync(join(targetPath, 'settings.json'), 'utf8')).toContain('"theme":"light"');
  });

  it('falls back after a previous process never completed Core validation', () => {
    const root = createTemporaryRoot();
    const sourcePath = createLegacyData(root);
    const targetPath = join(root, 'LianLiaoAIPC-Dev');

    expect(
      migrateLegacyUserData({
        sourcePath,
        targetPath,
        applicationVersion: '2.1.27',
      }).status
    ).toBe('migrated');

    const recordPath = join(targetPath, 'lianliao-migration.json');
    const record = JSON.parse(readFileSync(recordPath, 'utf8')) as { migrationProcessId: number };
    writeFileSync(
      recordPath,
      `${JSON.stringify({ ...record, migrationProcessId: process.pid + 1 }, null, 2)}\n`,
      'utf8'
    );

    const retry = migrateLegacyUserData({
      sourcePath,
      targetPath,
      applicationVersion: '2.1.27',
    });
    expect(retry.status).toBe('failed');
    expect(retry.error).toContain('did not complete LianLiaoAICore validation');
    expect(existsSync(sourcePath)).toBe(true);
  });

  it('removes only temporary data after database validation fails', () => {
    const root = createTemporaryRoot();
    const sourcePath = join(root, 'AionUi-Dev');
    const databaseDirectory = join(sourcePath, 'aionui');
    const targetPath = join(root, 'LianLiaoAIPC-Dev');
    mkdirSync(databaseDirectory, { recursive: true });
    writeFileSync(join(databaseDirectory, 'aionui-backend.db'), 'not a sqlite database', 'utf8');

    const result = migrateLegacyUserData({
      sourcePath,
      targetPath,
      applicationVersion: '2.1.27',
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Invalid SQLite header');
    expect(existsSync(sourcePath)).toBe(true);
    expect(existsSync(targetPath)).toBe(false);
  });

  it('supports the legacy second development instance directory without mixing modes', () => {
    const root = createTemporaryRoot();
    const sourcePath = createLegacyData(root, 'AionUi-Dev-2');
    const targetPath = join(root, 'LianLiaoAIPC-Dev-2');

    const result = migrateLegacyUserData({
      sourcePath,
      targetPath,
      applicationVersion: '2.1.27',
    });

    expect(result.status).toBe('migrated');
    expect(existsSync(join(targetPath, 'settings.json'))).toBe(true);
    expect(existsSync(join(root, 'LianLiaoAIPC-Dev', 'settings.json'))).toBe(false);
  });
});
