import { dirname, join } from 'node:path';

export const LEGACY_PACKAGED_USER_DATA_DIRECTORY = 'AionUi';
export const DEV_USER_DATA_DIRECTORY = 'AionUi-Dev';
export const MULTI_INSTANCE_DEV_USER_DATA_DIRECTORY = 'AionUi-Dev-2';

export type UserDataPathOptions = {
  isPackaged: boolean;
  isMultiInstance: boolean;
};

export type UserDataPathApp = {
  readonly isPackaged: boolean;
  getPath(name: 'userData'): string;
  setName(name: string): void;
  setPath(name: 'userData', targetPath: string): void;
};

export type EnsureUserDataDirectory = (targetPath: string, options: { recursive: true }) => unknown;

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

  const directoryName = options.isPackaged
    ? LEGACY_PACKAGED_USER_DATA_DIRECTORY
    : getDevAppName(options.isMultiInstance);

  return join(dirname(defaultUserDataPath), directoryName);
}

/**
 * Configure Electron to use a stable storage directory, creating it before
 * calling setPath as required by Electron.
 */
export function configureUserDataPath(
  app: UserDataPathApp,
  ensureDirectory: EnsureUserDataDirectory,
  isMultiInstance = process.env.AIONUI_MULTI_INSTANCE === '1'
): string {
  const defaultUserDataPath = app.getPath('userData');
  const targetPath = resolveUserDataPath(defaultUserDataPath, {
    isPackaged: app.isPackaged,
    isMultiInstance,
  });

  if (!app.isPackaged) {
    app.setName(getDevAppName(isMultiInstance));
  }

  ensureDirectory(targetPath, { recursive: true });
  app.setPath('userData', targetPath);
  return targetPath;
}
