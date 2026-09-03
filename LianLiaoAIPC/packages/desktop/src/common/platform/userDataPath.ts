import { dirname, join } from 'node:path';
import { migrateLegacyUserData, type UserDataMigrationResult } from './userDataMigration';

export const PACKAGED_USER_DATA_DIRECTORY = 'LianLiaoAIPC';
export const LEGACY_PACKAGED_USER_DATA_DIRECTORY = 'AionUi';
export const DEV_USER_DATA_DIRECTORY = 'LianLiaoAIPC-Dev';
export const LEGACY_DEV_USER_DATA_DIRECTORY = 'AionUi-Dev';
export const MULTI_INSTANCE_DEV_USER_DATA_DIRECTORY = 'LianLiaoAIPC-Dev-2';
export const LEGACY_MULTI_INSTANCE_DEV_USER_DATA_DIRECTORY = 'AionUi-Dev-2';

export type UserDataPathOptions = {
  isPackaged: boolean;
  isMultiInstance: boolean;
};

export type UserDataPathApp = {
  readonly isPackaged: boolean;
  getPath(name: 'userData'): string;
  getVersion(): string;
  setPath(name: 'userData', targetPath: string): void;
};

export type AppLogsPathApp = {
  readonly isPackaged: boolean;
  setAppLogsPath(targetPath: string): void;
};

export type EnsureUserDataDirectory = (targetPath: string, options: { recursive: true }) => unknown;
export type MigrateUserDataDirectory = (options: {
  sourcePath: string;
  targetPath: string;
  applicationVersion: string;
}) => UserDataMigrationResult;

/** Return the stable Electron application name used for development isolation. */
export function getDevAppName(isMultiInstance = process.env.AIONUI_MULTI_INSTANCE === '1'): string {
  return isMultiInstance ? MULTI_INSTANCE_DEV_USER_DATA_DIRECTORY : DEV_USER_DATA_DIRECTORY;
}

/**
 * Resolve the stable userData sibling without coupling the storage directory to
 * the application's current display name.
 */
export function resolveUserDataPath(defaultUserDataPath: string, options: UserDataPathOptions): string {
  if (!defaultUserDataPath.trim()) {
    throw new Error('Electron userData path is required');
  }

  const directoryName = options.isPackaged ? PACKAGED_USER_DATA_DIRECTORY : getDevAppName(options.isMultiInstance);

  return join(dirname(defaultUserDataPath), directoryName);
}

/** Resolve the legacy data directory paired with the requested new directory. */
export function resolveLegacyUserDataPath(defaultUserDataPath: string, options: UserDataPathOptions): string {
  if (!defaultUserDataPath.trim()) {
    throw new Error('Electron userData path is required');
  }

  const directoryName = options.isPackaged
    ? LEGACY_PACKAGED_USER_DATA_DIRECTORY
    : options.isMultiInstance
      ? LEGACY_MULTI_INSTANCE_DEV_USER_DATA_DIRECTORY
      : LEGACY_DEV_USER_DATA_DIRECTORY;

  return join(dirname(defaultUserDataPath), directoryName);
}

/**
 * Migrate legacy storage when necessary, then configure Electron to use the
 * stable LianLiaoAIPC directory.
 */
export function configureUserDataPath(
  app: UserDataPathApp,
  ensureDirectory: EnsureUserDataDirectory,
  isMultiInstance = process.env.AIONUI_MULTI_INSTANCE === '1',
  migrateUserData: MigrateUserDataDirectory = migrateLegacyUserData
): string {
  const defaultUserDataPath = app.getPath('userData');
  const options = {
    isPackaged: app.isPackaged,
    isMultiInstance,
  };
  const targetPath = resolveUserDataPath(defaultUserDataPath, options);
  const sourcePath = resolveLegacyUserDataPath(defaultUserDataPath, options);

  const migration = migrateUserData({
    sourcePath,
    targetPath,
    applicationVersion: app.getVersion(),
  });
  if (migration.status === 'failed') {
    console.warn(`[LianLiaoAIPC] Legacy user data migration failed: ${migration.error}`);
  }

  // A failed copy must not strand an existing user in a fresh empty profile.
  // Keep using the untouched legacy directory until a later launch can retry.
  const selectedPath = migration.status === 'failed' ? sourcePath : targetPath;
  ensureDirectory(selectedPath, { recursive: true });
  app.setPath('userData', selectedPath);
  return selectedPath;
}

/**
 * Keep logs under the stable storage identity instead of the user-visible
 * product name. This prevents future branding changes from splitting logs
 * across additional Windows roaming-profile directories.
 */
export function configureAppLogsPath(
  app: AppLogsPathApp,
  configuredUserDataPath: string,
  ensureDirectory: EnsureUserDataDirectory,
  isMultiInstance = process.env.AIONUI_MULTI_INSTANCE === '1'
): string {
  const stableUserDataPath = resolveUserDataPath(configuredUserDataPath, {
    isPackaged: app.isPackaged,
    isMultiInstance,
  });
  const logsPath = join(stableUserDataPath, 'logs');
  ensureDirectory(logsPath, { recursive: true });
  app.setAppLogsPath(logsPath);
  return logsPath;
}
