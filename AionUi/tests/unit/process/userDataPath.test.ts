import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { configureUserDataPath, getDevAppName, resolveUserDataPath } from '@/common/platform/userDataPath';

const readSource = (relativePath: string): string => readFileSync(path.resolve(relativePath), 'utf8');

const createAppProbe = (isPackaged: boolean, defaultUserDataPath: string) => {
  const events: string[] = [];
  const app = {
    isPackaged,
    getPath: (name: 'userData') => {
      events.push(`getPath:${name}`);
      return defaultUserDataPath;
    },
    setName: (name: string) => events.push(`setName:${name}`),
    setPath: (name: 'userData', targetPath: string) => events.push(`setPath:${name}:${targetPath}`),
  };
  const ensureDirectory = (targetPath: string, options: { recursive: true }) => {
    events.push(`mkdir:${String(options.recursive)}:${targetPath}`);
  };

  return { app, ensureDirectory, events };
};

describe('Electron user data path compatibility', () => {
  it('keeps packaged storage in the legacy AionUi sibling directory', () => {
    const defaultPath = path.join('appData', '链辽AI');

    expect(resolveUserDataPath(defaultPath, { isPackaged: true, isMultiInstance: false })).toBe(
      path.join('appData', 'AionUi')
    );
  });

  it('keeps development storage isolated with stable single and multi-instance directories', () => {
    const defaultPath = path.join('appData', '链辽AI');

    expect(resolveUserDataPath(defaultPath, { isPackaged: false, isMultiInstance: false })).toBe(
      path.join('appData', 'AionUi-Dev')
    );
    expect(resolveUserDataPath(defaultPath, { isPackaged: false, isMultiInstance: true })).toBe(
      path.join('appData', 'AionUi-Dev-2')
    );
  });

  it('returns stable development app names for explicit instance modes', () => {
    expect(getDevAppName(false)).toBe('AionUi-Dev');
    expect(getDevAppName(true)).toBe('AionUi-Dev-2');
  });

  it.each(['', '   ', '\t\r\n'])('rejects an empty Electron userData path', (defaultPath) => {
    expect(() => resolveUserDataPath(defaultPath, { isPackaged: true, isMultiInstance: false })).toThrowError(
      'Electron userData path is required'
    );
  });

  it('creates packaged legacy storage before assigning the Electron path', () => {
    const defaultPath = path.join('appData', '链辽AI');
    const targetPath = path.join('appData', 'AionUi');
    const { app, ensureDirectory, events } = createAppProbe(true, defaultPath);

    expect(configureUserDataPath(app, ensureDirectory, false)).toBe(targetPath);
    expect(events).toEqual(['getPath:userData', `mkdir:true:${targetPath}`, `setPath:userData:${targetPath}`]);
  });

  it('sets the development app name before creating and assigning its storage path', () => {
    const defaultPath = path.join('appData', '链辽AI');
    const targetPath = path.join('appData', 'AionUi-Dev');
    const { app, ensureDirectory, events } = createAppProbe(false, defaultPath);

    expect(configureUserDataPath(app, ensureDirectory, false)).toBe(targetPath);
    expect(events).toEqual([
      'getPath:userData',
      'setName:AionUi-Dev',
      `mkdir:true:${targetPath}`,
      `setPath:userData:${targetPath}`,
    ]);
  });

  it('uses the stable multi-instance development name and storage path', () => {
    const defaultPath = path.join('appData', '链辽AI');
    const targetPath = path.join('appData', 'AionUi-Dev-2');
    const { app, ensureDirectory, events } = createAppProbe(false, defaultPath);

    expect(configureUserDataPath(app, ensureDirectory, true)).toBe(targetPath);
    expect(events).toEqual([
      'getPath:userData',
      'setName:AionUi-Dev-2',
      `mkdir:true:${targetPath}`,
      `setPath:userData:${targetPath}`,
    ]);
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
