import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type BackendBinaryResolveContext, resolveBinaryPath } from './binaryResolver';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

const runtimeKey = `${process.platform}-${process.arch}`;
const binaryName = process.platform === 'win32' ? 'aioncore.exe' : 'aioncore';

function createContext(overrides: Partial<BackendBinaryResolveContext> = {}): BackendBinaryResolveContext {
  return {
    appPath: '/repo/AionUi',
    env: {},
    isPackaged: false,
    resourcesPath: '/electron/resources',
    ...overrides,
  };
}

function dirEntry(name: string, isDirectory = false): ReturnType<typeof readdirSync>[number] {
  return {
    name,
    isDirectory: () => isDirectory,
  } as unknown as ReturnType<typeof readdirSync>[number];
}

describe('resolveBinaryPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a valid development environment override before bundled resources and PATH', () => {
    const override = resolve('/custom/aioncore');
    vi.mocked(existsSync).mockImplementation((candidate) => candidate === override);

    const result = resolveBinaryPath(
      createContext({
        env: { AIONUI_BACKEND_BIN: `  ${override}  ` },
      })
    );

    expect(result).toBe(override);
    expect(execSync).not.toHaveBeenCalled();
  });

  it('fails fast when the development environment override does not exist', () => {
    const override = resolve('/missing/aioncore');
    vi.mocked(existsSync).mockReturnValue(false);

    let thrown: unknown;
    try {
      resolveBinaryPath(
        createContext({
          env: { AIONUI_BACKEND_BIN: override },
        })
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      message: `Configured AIONUI_BACKEND_BIN does not exist: ${override}`,
      diagnostics: {
        envOverrideExists: false,
        envOverridePath: override,
      },
    });
    expect(execSync).not.toHaveBeenCalled();
  });

  it('ignores the development environment override in a packaged build', () => {
    const resourcesPath = '/app/resources';
    const bundled = join(resourcesPath, 'bundled-aioncore', runtimeKey, binaryName);
    const ignoredOverride = resolve('/missing/aioncore');
    vi.mocked(existsSync).mockImplementation((candidate) => candidate === bundled);

    const result = resolveBinaryPath(
      createContext({
        env: { AIONUI_BACKEND_BIN: ignoredOverride },
        isPackaged: true,
        resourcesPath,
      })
    );

    expect(result).toBe(bundled);
    expect(existsSync).not.toHaveBeenCalledWith(ignoredOverride);
    expect(execSync).not.toHaveBeenCalled();
  });

  it('never falls back to a system PATH binary in a packaged build', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() =>
      resolveBinaryPath(
        createContext({
          isPackaged: true,
          resourcesPath: '/app/resources',
        })
      )
    ).toThrow('Packaged LianLiaoAIPC cannot find its bundled "aioncore" binary');
    expect(execSync).not.toHaveBeenCalled();
  });

  it('attaches bundled path diagnostics when aioncore cannot be resolved', () => {
    const resourcesPath = '/app/resources';
    const bundledDir = join(resourcesPath, 'bundled-aioncore');
    const runtimeDir = join(bundledDir, runtimeKey);
    const checkedBundledPath = join(runtimeDir, binaryName);

    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockImplementation((path) => {
      if (path === resourcesPath) return [dirEntry('bundled-aioncore', true)];
      if (path === runtimeDir) return [dirEntry('manifest.json')];
      return [] as ReturnType<typeof readdirSync>;
    });
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found on PATH');
    });

    expect(() => resolveBinaryPath(createContext({ resourcesPath }))).toThrow('Cannot find "aioncore" binary');

    try {
      resolveBinaryPath(createContext({ resourcesPath }));
    } catch (error) {
      expect(error).toMatchObject({
        name: 'BackendBinaryResolveError',
        diagnostics: expect.objectContaining({
          resourcesPath,
          runtimeKey,
          binaryName,
          checkedBundledPath,
          bundledDirExists: false,
          runtimeDirExists: false,
          resourcesDirEntries: ['bundled-aioncore/'],
          runtimeDirEntries: ['manifest.json'],
          pathLookupCommand: process.platform === 'win32' ? 'where aioncore' : 'which aioncore',
          pathLookupError: expect.stringContaining('not found on PATH'),
        }),
      });
    }
  });
});
