/**
 * Resolve the aioncore binary path.
 *
 * Search order:
 *  1. Development environment override
 *  2. Project resources in development or packaged resources in production
 *  3. System PATH
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const BINARY_NAME = 'aioncore';
const MAX_DIR_ENTRIES = 20;
const MAX_LOOKUP_TEXT_LENGTH = 1000;

export type BackendBinaryResolveContext = {
  appPath: string;
  env: NodeJS.ProcessEnv;
  isPackaged: boolean;
  resourcesPath?: string;
};

type BackendBinaryResolveDiagnostics = {
  resourcesPath?: string;
  runtimeKey: string;
  binaryName: string;
  checkedBundledPath?: string;
  bundledDirExists?: boolean;
  runtimeDirExists?: boolean;
  resourcesDirEntries?: string[];
  runtimeDirEntries?: string[];
  envOverridePath?: string;
  envOverrideExists?: boolean;
  pathLookupCommand: string;
  pathLookupResult?: string;
  pathLookupError?: string;
};

class BackendBinaryResolveError extends Error {
  readonly diagnostics: BackendBinaryResolveDiagnostics;

  constructor(message: string, diagnostics: BackendBinaryResolveDiagnostics) {
    super(message);
    this.name = 'BackendBinaryResolveError';
    this.diagnostics = diagnostics;
  }
}

function getBinaryName(): string {
  return process.platform === 'win32' ? `${BINARY_NAME}.exe` : BINARY_NAME;
}

function getRuntimeKey(): string {
  return `${process.platform}-${process.arch}`;
}

function listDirEntries(dirPath: string): string[] | undefined {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .slice(0, MAX_DIR_ENTRIES)
      .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`);
  } catch {
    return undefined;
  }
}

function trimLookupText(text: string): string {
  return text.trim().slice(0, MAX_LOOKUP_TEXT_LENGTH);
}

function resolveDevelopmentOverride(
  context: BackendBinaryResolveContext,
  diagnostics: BackendBinaryResolveDiagnostics
): string | null {
  if (context.isPackaged) return null;
  const configuredPath = context.env.AIONUI_BACKEND_BIN?.trim();
  if (!configuredPath) return null;

  const candidate = resolve(configuredPath);
  diagnostics.envOverridePath = candidate;
  diagnostics.envOverrideExists = existsSync(candidate);
  if (!diagnostics.envOverrideExists) {
    throw new BackendBinaryResolveError(`Configured AIONUI_BACKEND_BIN does not exist: ${candidate}`, diagnostics);
  }
  return candidate;
}

/**
 * Electron's `process.resourcesPath` points to Electron's own installation
 * while running `electron-vite dev`. Development builds must instead resolve
 * the Core prepared under this repository's `resources` directory.
 */
function resolveBundledResourcesPath(context: BackendBinaryResolveContext): string | undefined {
  if (context.isPackaged) return context.resourcesPath;
  return join(resolve(context.appPath), 'resources');
}

/**
 * Resolve the aioncore binary path.
 * Returns the absolute path to the binary, or throws if not found.
 */
export function resolveBinaryPath(context: BackendBinaryResolveContext): string {
  const runtimeKey = getRuntimeKey();
  const binaryName = getBinaryName();
  const diagnostics: BackendBinaryResolveDiagnostics = {
    runtimeKey,
    binaryName,
    pathLookupCommand: process.platform === 'win32' ? `where ${BINARY_NAME}` : `which ${BINARY_NAME}`,
  };

  const override = resolveDevelopmentOverride(context, diagnostics);
  if (override) return override;

  const bundled = bundledPath(resolveBundledResourcesPath(context), runtimeKey, binaryName, diagnostics);
  if (bundled) return bundled;

  // A packaged client must run exactly the Core bundled and verified during
  // the release build. Falling back to an arbitrary PATH binary would bypass
  // the LianLiaoAICore release lock and could break the Electron/Core contract.
  if (context.isPackaged) {
    throw new BackendBinaryResolveError(
      `Packaged LianLiaoAIPC cannot find its bundled "${BINARY_NAME}" binary.`,
      diagnostics
    );
  }

  const fromPath = resolveFromSystemPATH(diagnostics);
  if (fromPath) return fromPath;

  throw new BackendBinaryResolveError(
    `Cannot find "${BINARY_NAME}" binary. Checked bundled location and system PATH.`,
    diagnostics
  );
}

/**
 * Check bundled binary in resources directory.
 * Layout: bundled-aioncore/{platform}-{arch}/aioncore[.exe]
 */
function bundledPath(
  resourcesPath: string | undefined,
  runtimeKey: string,
  binaryName: string,
  diagnostics: BackendBinaryResolveDiagnostics
): string | null {
  if (!resourcesPath) return null;
  diagnostics.resourcesPath = resourcesPath;

  const bundledDir = join(resourcesPath, 'bundled-aioncore');
  const runtimeDir = join(bundledDir, runtimeKey);
  const candidate = join(runtimeDir, binaryName);
  diagnostics.checkedBundledPath = candidate;
  diagnostics.bundledDirExists = existsSync(bundledDir);
  diagnostics.runtimeDirExists = existsSync(runtimeDir);
  diagnostics.resourcesDirEntries = listDirEntries(resourcesPath);
  diagnostics.runtimeDirEntries = listDirEntries(runtimeDir);

  if (existsSync(candidate)) return candidate;
  return null;
}

/**
 * Try to find the binary on the system PATH.
 */
function resolveFromSystemPATH(diagnostics: BackendBinaryResolveDiagnostics): string | null {
  try {
    const result = execSync(diagnostics.pathLookupCommand, { encoding: 'utf-8', timeout: 5000 }).trim();
    diagnostics.pathLookupResult = trimLookupText(result);
    const firstMatch = result.split(/\r?\n/).find((line) => line.trim());
    if (firstMatch && existsSync(firstMatch.trim())) return firstMatch.trim();
  } catch (error) {
    diagnostics.pathLookupError = error instanceof Error ? trimLookupText(error.message) : String(error);
    return null;
  }
  return null;
}

export type { BackendBinaryResolveDiagnostics };
