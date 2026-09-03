import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  configureAppLogsPath,
  configureUserDataPath,
  getDevAppName,
  resolveLegacyUserDataPath,
  resolveUserDataPath,
} from '@/common/platform/userDataPath';

const readSource = (relativePath: string): string => readFileSync(path.resolve(relativePath), 'utf8');
const noOpEnsureDirectory = () => undefined;

const createAppProbe = (isPackaged: boolean, defaultUserDataPath: string) => {
  const events: string[] = [];
  const app = {
    isPackaged,
    getPath: (name: 'userData') => {
      events.push(`getPath:${name}`);
      return defaultUserDataPath;
    },
    getVersion: () => {
      events.push('getVersion');
      return '2.1.27';
    },
    setPath: (name: 'userData', targetPath: string) => events.push(`setPath:${name}:${targetPath}`),
  };
  const ensureDirectory = (targetPath: string, options: { recursive: true }) => {
    events.push(`mkdir:${String(options.recursive)}:${targetPath}`);
  };
  const migrateUserData = ({
    sourcePath,
    targetPath,
    applicationVersion,
  }: {
    sourcePath: string;
    targetPath: string;
    applicationVersion: string;
  }) => {
    events.push(`migrate:${sourcePath}:${targetPath}:${applicationVersion}`);
    return { status: 'source-missing' as const, sourcePath, targetPath };
  };

  return { app, ensureDirectory, migrateUserData, events };
};

describe('Electron user data path compatibility', () => {
  it('keeps packaged logs under the stable LianLiaoAIPC directory even when legacy data remains selected', () => {
    const selectedLegacyPath = path.join('appData', 'AionUi');
    const expectedLogsPath = path.join('appData', 'LianLiaoAIPC', 'logs');
    const events: string[] = [];
    const app = {
      isPackaged: true,
      setAppLogsPath: (targetPath: string) => events.push(`setAppLogsPath:${targetPath}`),
    };
    const ensureDirectory = (targetPath: string, options: { recursive: true }) => {
      events.push(`mkdir:${String(options.recursive)}:${targetPath}`);
    };

    expect(configureAppLogsPath(app, selectedLegacyPath, ensureDirectory, false)).toBe(expectedLogsPath);
    expect(events).toEqual([`mkdir:true:${expectedLogsPath}`, `setAppLogsPath:${expectedLogsPath}`]);
  });

  it('keeps development log directories isolated by instance', () => {
    const events: string[] = [];
    const app = {
      isPackaged: false,
      setAppLogsPath: (targetPath: string) => events.push(targetPath),
    };
    expect(configureAppLogsPath(app, path.join('appData', 'AionUi-Dev'), noOpEnsureDirectory, false)).toBe(
      path.join('appData', 'LianLiaoAIPC-Dev', 'logs')
    );
    expect(configureAppLogsPath(app, path.join('appData', 'AionUi-Dev-2'), noOpEnsureDirectory, true)).toBe(
      path.join('appData', 'LianLiaoAIPC-Dev-2', 'logs')
    );
    expect(events).toEqual([
      path.join('appData', 'LianLiaoAIPC-Dev', 'logs'),
      path.join('appData', 'LianLiaoAIPC-Dev-2', 'logs'),
    ]);
  });

  it('uses the LianLiaoAIPC packaged directory and resolves the paired legacy source', () => {
    const defaultPath = path.join('appData', '链上辽宁·产业云城 AI桌面平台');

    expect(resolveUserDataPath(defaultPath, { isPackaged: true, isMultiInstance: false })).toBe(
      path.join('appData', 'LianLiaoAIPC')
    );
    expect(resolveLegacyUserDataPath(defaultPath, { isPackaged: true, isMultiInstance: false })).toBe(
      path.join('appData', 'AionUi')
    );
  });

  it('keeps development storage isolated with stable single and multi-instance directories', () => {
    const defaultPath = path.join('appData', '链上辽宁·产业云城 AI桌面平台');

    expect(resolveUserDataPath(defaultPath, { isPackaged: false, isMultiInstance: false })).toBe(
      path.join('appData', 'LianLiaoAIPC-Dev')
    );
    expect(resolveUserDataPath(defaultPath, { isPackaged: false, isMultiInstance: true })).toBe(
      path.join('appData', 'LianLiaoAIPC-Dev-2')
    );
    expect(resolveLegacyUserDataPath(defaultPath, { isPackaged: false, isMultiInstance: false })).toBe(
      path.join('appData', 'AionUi-Dev')
    );
    expect(resolveLegacyUserDataPath(defaultPath, { isPackaged: false, isMultiInstance: true })).toBe(
      path.join('appData', 'AionUi-Dev-2')
    );
  });

  it('returns stable development app names for explicit instance modes', () => {
    expect(getDevAppName(false)).toBe('LianLiaoAIPC-Dev');
    expect(getDevAppName(true)).toBe('LianLiaoAIPC-Dev-2');
  });

  it.each(['', '   ', '\t\r\n'])('rejects an empty Electron userData path', (defaultPath) => {
    expect(() => resolveUserDataPath(defaultPath, { isPackaged: true, isMultiInstance: false })).toThrowError(
      'Electron userData path is required'
    );
  });

  it('migrates packaged legacy storage before assigning the new Electron path', () => {
    const defaultPath = path.join('appData', '链上辽宁·产业云城 AI桌面平台');
    const sourcePath = path.join('appData', 'AionUi');
    const targetPath = path.join('appData', 'LianLiaoAIPC');
    const { app, ensureDirectory, migrateUserData, events } = createAppProbe(true, defaultPath);

    expect(configureUserDataPath(app, ensureDirectory, false, migrateUserData)).toBe(targetPath);
    expect(events).toEqual([
      'getPath:userData',
      'getVersion',
      `migrate:${sourcePath}:${targetPath}:2.1.27`,
      `mkdir:true:${targetPath}`,
      `setPath:userData:${targetPath}`,
    ]);
  });

  it('migrates single-instance development storage without changing the display name', () => {
    const defaultPath = path.join('appData', '链上辽宁·产业云城 AI桌面平台');
    const sourcePath = path.join('appData', 'AionUi-Dev');
    const targetPath = path.join('appData', 'LianLiaoAIPC-Dev');
    const { app, ensureDirectory, migrateUserData, events } = createAppProbe(false, defaultPath);

    expect(configureUserDataPath(app, ensureDirectory, false, migrateUserData)).toBe(targetPath);
    expect(events).toEqual([
      'getPath:userData',
      'getVersion',
      `migrate:${sourcePath}:${targetPath}:2.1.27`,
      `mkdir:true:${targetPath}`,
      `setPath:userData:${targetPath}`,
    ]);
  });

  it('uses the stable multi-instance development name and storage path', () => {
    const defaultPath = path.join('appData', '链上辽宁·产业云城 AI桌面平台');
    const sourcePath = path.join('appData', 'AionUi-Dev-2');
    const targetPath = path.join('appData', 'LianLiaoAIPC-Dev-2');
    const { app, ensureDirectory, migrateUserData, events } = createAppProbe(false, defaultPath);

    expect(configureUserDataPath(app, ensureDirectory, true, migrateUserData)).toBe(targetPath);
    expect(events).toEqual([
      'getPath:userData',
      'getVersion',
      `migrate:${sourcePath}:${targetPath}:2.1.27`,
      `mkdir:true:${targetPath}`,
      `setPath:userData:${targetPath}`,
    ]);
  });

  it('keeps using the untouched legacy directory when migration fails', () => {
    const defaultPath = path.join('appData', '链上辽宁·产业云城 AI桌面平台');
    const sourcePath = path.join('appData', 'AionUi-Dev');
    const targetPath = path.join('appData', 'LianLiaoAIPC-Dev');
    const { app, ensureDirectory, events } = createAppProbe(false, defaultPath);
    const failedMigration = () => ({
      status: 'failed' as const,
      sourcePath,
      targetPath,
      error: 'validation failed',
    });

    expect(configureUserDataPath(app, ensureDirectory, false, failedMigration)).toBe(sourcePath);
    expect(events).toContain(`mkdir:true:${sourcePath}`);
    expect(events.at(-1)).toBe(`setPath:userData:${sourcePath}`);
  });

  it('configures Chromium before importing startup failure capture', () => {
    const entrySource = readSource('packages/desktop/src/index.ts');
    const configureImport = entrySource.indexOf("import './process/utils/configureChromium';");
    const sentryImport = entrySource.indexOf('import { captureBackendStartupFailure');

    expect(configureImport).toBeGreaterThanOrEqual(0);
    expect(sentryImport).toBeGreaterThan(configureImport);
  });

  it('invokes the shared userData setup unconditionally in the early Chromium entry', () => {
    const source = readSource('packages/desktop/src/process/utils/configureChromium.ts');
    const startupSetup = source.slice(0, source.indexOf('applyGpuRecoveryFlags();'));

    expect(startupSetup).toContain("import { configureDesktopIdentity } from './configureDesktopIdentity';");
    expect(startupSetup).toContain('configureDesktopIdentity(app);');
    expect(startupSetup).toContain("import { configureUserDataPath } from '@/common/platform/userDataPath';");
    expect(startupSetup).toContain('configureUserDataPath(app, fs.mkdirSync, isMultiInstance);');
    expect(startupSetup).not.toContain('if (!app.isPackaged)');
    expect(startupSetup).not.toContain("app.setName('AionUi')");
  });

  it('invokes the shared userData setup unconditionally in the platform fallback', () => {
    const source = readSource('packages/desktop/src/common/platform/index.ts');
    const browserFallback = source.slice(
      source.indexOf("const { app, net } = require('electron')"),
      source.indexOf('// Typed as IPlatformPaths')
    );

    expect(browserFallback).toContain('configureUserDataPath(app, mkdirSync, isMultiInstance);');
    expect(browserFallback).not.toContain('if (!app.isPackaged)');
    expect(browserFallback).not.toContain("app.setName('AionUi')");
  });
});
