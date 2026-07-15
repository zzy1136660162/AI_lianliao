# Development AionCore Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Electron desktop development resolve the repository-local AionCore automatically, support an explicit development override, and report a missing development backend accurately.

**Architecture:** Pass explicit Electron app metadata into the main-process resolver instead of relying on Electron's global `process.resourcesPath`. Keep packaged resolution isolated, add development-only override and repository candidates, then classify unpackaged resolution failures separately so the renderer can use a diagnostics-only configuration dialog.

**Tech Stack:** Electron, TypeScript, React, i18next, Vitest 4, npm package scripts, Oxfmt, TypeScript compiler.

---

### Task 1: Add an explicit desktop resolver context and development override

**Files:**

- Modify: `packages/desktop/src/process/backend/binaryResolver.test.ts`
- Modify: `packages/desktop/src/process/backend/binaryResolver.ts`
- Modify: `packages/desktop/src/index.ts:194-202`

- [ ] **Step 1: Write failing tests for valid and invalid development overrides**

Update the resolver test imports and add a context factory:

```ts
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type BackendBinaryResolveContext, resolveBinaryPath } from './binaryResolver';

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
```

Delete the old `originalResourcesPath`, `setResourcesPath`, and `afterEach` process mutation helpers; every test now
passes its resource path through `createContext`.

Add these behaviors inside `describe('resolveBinaryPath')`:

```ts
it('uses a valid development environment override before bundled resources and PATH', () => {
  const override = resolve('/custom/aioncore');
  vi.mocked(existsSync).mockImplementation((candidate) => candidate === override);

  const result = resolveBinaryPath(
    createContext({
      env: { AIONUI_BACKEND_BIN: override },
    })
  );

  expect(result).toBe(override);
  expect(execSync).not.toHaveBeenCalled();
});

it('fails fast when the development environment override does not exist', () => {
  const override = resolve('/missing/aioncore');
  vi.mocked(existsSync).mockReturnValue(false);

  const resolveMissingOverride = () =>
    resolveBinaryPath(
      createContext({
        env: { AIONUI_BACKEND_BIN: override },
      })
    );

  expect(resolveMissingOverride).toThrow(`Configured AIONUI_BACKEND_BIN does not exist: ${override}`);
  expect(execSync).not.toHaveBeenCalled();

  try {
    resolveMissingOverride();
  } catch (error) {
    expect(error).toMatchObject({
      diagnostics: {
        envOverrideExists: false,
        envOverridePath: override,
      },
    });
  }
});
```

Adapt the existing missing-binary diagnostics test to call `resolveBinaryPath(createContext({ resourcesPath }))` instead of mutating `process.resourcesPath`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- packages/desktop/src/process/backend/binaryResolver.test.ts
```

Expected: FAIL because `BackendBinaryResolveContext` does not exist and `resolveBinaryPath` does not accept a context.

- [ ] **Step 3: Implement the explicit context and development-only override**

In `binaryResolver.ts`, import `resolve` and define the context and new diagnostics fields:

```ts
import { join, resolve } from 'node:path';

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
```

Add an authoritative development override helper:

```ts
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
```

Change `resolveBinaryPath` and the installed-resource helper to accept the context rather than reading the global process path:

```ts
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

  const bundled = bundledPath(context.resourcesPath, runtimeKey, binaryName, diagnostics);
  if (bundled) return bundled;

  const fromPath = resolveFromSystemPATH(diagnostics);
  if (fromPath) return fromPath;

  throw new BackendBinaryResolveError(
    `Cannot find "${BINARY_NAME}" binary. Checked bundled location and system PATH.`,
    diagnostics
  );
}

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
  return existsSync(candidate) ? candidate : null;
}
```

In `packages/desktop/src/index.ts`, make the backend callback explicit:

```ts
const backendManager = new BackendLifecycleManager(
  {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath('userData'),
  },
  () =>
    resolveBinaryPath({
      appPath: app.getAppPath(),
      env: process.env,
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    })
);
```

- [ ] **Step 4: Run the focused resolver tests and verify GREEN**

Run:

```powershell
npm test -- packages/desktop/src/process/backend/binaryResolver.test.ts
```

Expected: PASS, including the pre-existing missing-binary diagnostics behavior.

- [ ] **Step 5: Format, run the full unit suite, and commit**

Run:

```powershell
npx oxfmt packages/desktop/src/process/backend/binaryResolver.ts packages/desktop/src/process/backend/binaryResolver.test.ts packages/desktop/src/index.ts
npx tsc --noEmit
npm test
git add packages/desktop/src/process/backend/binaryResolver.ts packages/desktop/src/process/backend/binaryResolver.test.ts packages/desktop/src/index.ts
git commit -m "feat(desktop): support explicit development aioncore path"
```

Expected: type checking and all tests PASS; commit contains only the three listed files.

### Task 2: Discover repository-local AionCore without affecting packaged builds

**Files:**

- Modify: `packages/desktop/src/process/backend/binaryResolver.test.ts`
- Modify: `packages/desktop/src/process/backend/binaryResolver.ts`

- [ ] **Step 1: Write failing tests for development discovery and packaged isolation**

Add these tests:

```ts
it('discovers the repository-local bundled backend in an unpackaged build', () => {
  const context = createContext();
  const expected = join(context.appPath, 'resources', 'bundled-aioncore', runtimeKey, binaryName);
  vi.mocked(existsSync).mockImplementation((candidate) => candidate === expected);

  expect(resolveBinaryPath(context)).toBe(expected);
  expect(execSync).not.toHaveBeenCalled();
});

it('does not use development override sources in a packaged build', () => {
  const context = createContext({
    env: { AIONUI_BACKEND_BIN: '/custom/aioncore' },
    isPackaged: true,
  });
  const developmentCandidate = join(context.appPath, 'resources', 'bundled-aioncore', runtimeKey, binaryName);
  const pathCandidate = resolve('/path/aioncore');
  vi.mocked(existsSync).mockImplementation(
    (candidate) => candidate === developmentCandidate || candidate === pathCandidate
  );
  vi.mocked(execSync).mockImplementation(() => pathCandidate);

  expect(resolveBinaryPath(context)).toBe(pathCandidate);
  expect(execSync).toHaveBeenCalledOnce();
});

it('prefers installed resources over the repository candidate', () => {
  const context = createContext();
  const installed = join(context.resourcesPath!, 'bundled-aioncore', runtimeKey, binaryName);
  const development = join(context.appPath, 'resources', 'bundled-aioncore', runtimeKey, binaryName);
  vi.mocked(existsSync).mockImplementation((candidate) => candidate === installed || candidate === development);

  expect(resolveBinaryPath(context)).toBe(installed);
});

it('reports the repository candidate when development resolution fails', () => {
  const context = createContext();
  const developmentResourcesPath = join(context.appPath, 'resources');
  const checkedDevelopmentBundledPath = join(
    developmentResourcesPath,
    'bundled-aioncore',
    runtimeKey,
    binaryName
  );
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(execSync).mockImplementation(() => {
    throw new Error('not found on PATH');
  });

  try {
    resolveBinaryPath(context);
  } catch (error) {
    expect(error).toMatchObject({
      diagnostics: expect.objectContaining({
        checkedDevelopmentBundledPath,
        developmentBundledDirExists: false,
        developmentResourcesPath,
        developmentRuntimeDirExists: false,
      }),
    });
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- packages/desktop/src/process/backend/binaryResolver.test.ts
```

Expected: the unpackaged repository-local discovery test FAILS because the development candidate is not checked.

- [ ] **Step 3: Add the development resource candidate and diagnostics**

Extend the diagnostics type:

```ts
developmentResourcesPath?: string;
checkedDevelopmentBundledPath?: string;
developmentBundledDirExists?: boolean;
developmentRuntimeDirExists?: boolean;
developmentResourcesDirEntries?: string[];
developmentRuntimeDirEntries?: string[];
```

Add this helper:

```ts
function developmentBundledPath(
  context: BackendBinaryResolveContext,
  runtimeKey: string,
  binaryName: string,
  diagnostics: BackendBinaryResolveDiagnostics
): string | null {
  if (context.isPackaged) return null;

  const resourcesPath = join(context.appPath, 'resources');
  const bundledDir = join(resourcesPath, 'bundled-aioncore');
  const runtimeDir = join(bundledDir, runtimeKey);
  const candidate = join(runtimeDir, binaryName);
  diagnostics.developmentResourcesPath = resourcesPath;
  diagnostics.checkedDevelopmentBundledPath = candidate;
  diagnostics.developmentBundledDirExists = existsSync(bundledDir);
  diagnostics.developmentRuntimeDirExists = existsSync(runtimeDir);
  diagnostics.developmentResourcesDirEntries = listDirEntries(resourcesPath);
  diagnostics.developmentRuntimeDirEntries = listDirEntries(runtimeDir);
  return existsSync(candidate) ? candidate : null;
}
```

Call it between installed resources and PATH:

```ts
const developmentBundled = developmentBundledPath(context, runtimeKey, binaryName, diagnostics);
if (developmentBundled) return developmentBundled;

const fromPath = resolveFromSystemPATH(diagnostics);
```

- [ ] **Step 4: Run the resolver tests and verify GREEN**

Run:

```powershell
npm test -- packages/desktop/src/process/backend/binaryResolver.test.ts
```

Expected: PASS for override priority, installed-resource priority, development discovery, packaged isolation, PATH fallback, and diagnostics.

- [ ] **Step 5: Run full checks and commit**

Run:

```powershell
npx oxfmt packages/desktop/src/process/backend/binaryResolver.ts packages/desktop/src/process/backend/binaryResolver.test.ts
npx tsc --noEmit
npm test
git add packages/desktop/src/process/backend/binaryResolver.ts packages/desktop/src/process/backend/binaryResolver.test.ts
git commit -m "feat(desktop): discover bundled aioncore in development"
```

Expected: all commands PASS.

### Task 3: Classify an unpackaged missing backend separately

**Files:**

- Modify: `packages/desktop/src/common/types/platform/electron.ts:43-50`
- Modify: `packages/desktop/src/process/startup/backendStartupFailure.ts:178-220`
- Modify: `tests/unit/bootstrap/backendStartupFailure.test.ts`

- [ ] **Step 1: Write the failing classifier test**

Add this test beside the existing packaged incomplete-installation cases:

```ts
it('classifies an unpackaged binary resolution failure as a missing development backend', () => {
  const error = new Error('aioncore startup failed while resolving backend binary') as Error & {
    details?: Record<string, unknown>;
  };
  error.details = {
    stage: 'resolve_binary',
    isPackaged: false,
    runtimeKey: 'win32-x64',
    binaryName: 'aioncore.exe',
  };

  expect(classifyBackendStartupFailure(error)).toEqual({
    reason: 'backend_binary_not_found',
  });
});
```

- [ ] **Step 2: Run the classifier test and verify RED**

Run:

```powershell
npm test -- tests/unit/bootstrap/backendStartupFailure.test.ts
```

Expected: FAIL because the failure is currently classified as `backend_startup_failed`.

- [ ] **Step 3: Add the new reason and classifier**

Add the reason to `BackendStartupFailureReason`:

```ts
export type BackendStartupFailureReason =
  | 'backend_incompatible_runtime'
  | 'backend_incomplete_installation'
  | 'backend_binary_not_found'
  | 'backend_package_architecture_mismatch'
  | 'backend_data_migration_failed'
  | 'backend_local_data_repair_failed'
  | 'backend_startup_failed';
```

Add this classifier before `classifyIncompleteInstallation` is evaluated:

```ts
function classifyMissingDevelopmentBackend(
  details: ErrorWithDetails['details']
): BackendStartupFailureInfo | undefined {
  if (!details) return undefined;
  if (details.stage !== 'resolve_binary' || details.isPackaged !== false) return undefined;
  return { reason: 'backend_binary_not_found' };
}
```

Wire it into `classifyBackendStartupFailure` after architecture mismatch and before packaged installation checks:

```ts
const missingDevelopmentBackend = classifyMissingDevelopmentBackend(details);
if (missingDevelopmentBackend) return missingDevelopmentBackend;
```

- [ ] **Step 4: Run the classifier tests and verify GREEN**

Run:

```powershell
npm test -- tests/unit/bootstrap/backendStartupFailure.test.ts
```

Expected: PASS; packaged missing resources remain `backend_incomplete_installation` and unrelated failures remain generic.

- [ ] **Step 5: Run full checks and commit**

Run:

```powershell
npx oxfmt packages/desktop/src/common/types/platform/electron.ts packages/desktop/src/process/startup/backendStartupFailure.ts tests/unit/bootstrap/backendStartupFailure.test.ts
npx tsc --noEmit
npm test
git add packages/desktop/src/common/types/platform/electron.ts packages/desktop/src/process/startup/backendStartupFailure.ts tests/unit/bootstrap/backendStartupFailure.test.ts
git commit -m "fix(desktop): classify missing development backend"
```

Expected: all commands PASS.

### Task 4: Present a diagnostics-only development configuration dialog

**Files:**

- Modify: `packages/desktop/src/renderer/components/layout/InstallationIntegrityDialog.tsx`
- Modify: `packages/desktop/src/renderer/main.tsx`
- Modify: `tests/unit/bootstrap/backendStartupFailure.test.ts`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/{zh-CN,en-US,ja-JP,zh-TW,ko-KR,tr-TR,ru-RU,uk-UA,pt-BR,de-DE}/common.json`
- Regenerate: `packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`

- [ ] **Step 1: Write a failing diagnostics-action and copy test**

Extend the helper imports in `backendStartupFailure.test.ts`:

```ts
import {
  getBackendStartupConfigurationDescription,
  getInstallationIntegrityModalActions,
  getInstallationIntegrityTitle,
} from '@/renderer/components/layout/InstallationIntegrityDialog';
```

Add this test:

```ts
it('uses development configuration copy and omits the download action', () => {
  const t = vi.fn((key: string) => key) as any;
  const actions = getInstallationIntegrityModalActions(t, {
    diagnosticsKind: 'backend_configuration',
  });

  expect(getInstallationIntegrityTitle(t, 'backend_configuration')).toBe(
    'common.backendStartup.backendBinaryNotFound.title'
  );
  expect(getBackendStartupConfigurationDescription(t)).toBe(
    'common.backendStartup.backendBinaryNotFound.description'
  );
  expect(actions.reportText).toBe('common.backendStartup.backendBinaryNotFound.sendDiagnostics');
  expect(actions.downloadText).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- tests/unit/bootstrap/backendStartupFailure.test.ts
```

Expected: FAIL because `backend_configuration` and its helper do not exist.

- [ ] **Step 3: Extend the reusable dialog helpers**

Extend the dialog kind:

```ts
type InstallationIntegrityDialogKind =
  | 'incomplete_installation'
  | 'backend_configuration'
  | 'data_migration'
  | 'local_data_repair';
```

Add the description helper:

```ts
export function getBackendStartupConfigurationDescription(t: TFunction): string {
  return t('common.backendStartup.backendBinaryNotFound.description');
}
```

Implement the new title, description, sent-state, and report-result helpers as follows:

```ts
export function getInstallationIntegrityTitle(
  t: TFunction,
  diagnosticsKind: InstallationIntegrityDialogKind = 'incomplete_installation'
): string {
  if (diagnosticsKind === 'backend_configuration') {
    return t('common.backendStartup.backendBinaryNotFound.title');
  }
  if (diagnosticsKind === 'local_data_repair') return t('common.backendStartup.localDataRepair.title');
  return diagnosticsKind === 'data_migration'
    ? t('common.backendStartup.dataMigration.title')
    : t('common.backendStartup.incompleteInstallation.title');
}

export function getBackendStartupConfigurationDescription(t: TFunction): string {
  return t('common.backendStartup.backendBinaryNotFound.description');
}

export function getInstallationIntegrityDiagnosticsSentText(
  t: TFunction,
  diagnosticsKind: InstallationIntegrityDialogKind = 'incomplete_installation'
): string {
  if (diagnosticsKind === 'backend_configuration') {
    return t('common.backendStartup.backendBinaryNotFound.diagnosticsSent');
  }
  if (diagnosticsKind === 'local_data_repair') return t('common.backendStartup.localDataRepair.diagnosticsSent');
  return diagnosticsKind === 'data_migration'
    ? t('common.backendStartup.dataMigration.diagnosticsSent')
    : t('common.backendStartup.incompleteInstallation.diagnosticsSent');
}

function getDiagnosticsReportSuccessText(t: TFunction, diagnosticsKind: InstallationIntegrityDialogKind): string {
  if (diagnosticsKind === 'backend_configuration') {
    return t('common.backendStartup.backendBinaryNotFound.diagnosticsReportSuccess');
  }
  if (diagnosticsKind === 'local_data_repair') {
    return t('common.backendStartup.localDataRepair.diagnosticsReportSuccess');
  }
  return diagnosticsKind === 'data_migration'
    ? t('common.backendStartup.dataMigration.diagnosticsReportSuccess')
    : t('common.backendStartup.incompleteInstallation.diagnosticsReportSuccess');
}

function getDiagnosticsReportFailedText(t: TFunction, diagnosticsKind: InstallationIntegrityDialogKind): string {
  if (diagnosticsKind === 'backend_configuration') {
    return t('common.backendStartup.backendBinaryNotFound.diagnosticsReportFailed');
  }
  if (diagnosticsKind === 'local_data_repair') {
    return t('common.backendStartup.localDataRepair.diagnosticsReportFailed');
  }
  return diagnosticsKind === 'data_migration'
    ? t('common.backendStartup.dataMigration.diagnosticsReportFailed')
    : t('common.backendStartup.incompleteInstallation.diagnosticsReportFailed');
}
```

Update `getInstallationIntegrityModalActions` so the new kind is diagnostics-only:

```ts
return {
  downloadText: diagnosticsKind === 'incomplete_installation' ? getInstallationIntegrityDownloadText(t) : undefined,
  onDownloadLatest: options.onDownloadLatest ?? openDownloadLatest,
  onReportDiagnostics: options.onReportDiagnostics ?? (() => Promise.resolve()),
  reportText:
    diagnosticsKind === 'backend_configuration'
      ? t('common.backendStartup.backendBinaryNotFound.sendDiagnostics')
      : diagnosticsKind === 'local_data_repair'
        ? t('common.backendStartup.localDataRepair.sendDiagnostics')
        : diagnosticsKind === 'data_migration'
          ? t('common.backendStartup.dataMigration.sendDiagnostics')
          : getInstallationIntegritySendDiagnosticsText(t),
};
```

Replace the duplicated success and failure ternaries in `handleReportDiagnostics` with the helpers:

```ts
try {
  await actions.onReportDiagnostics();
  setReported(true);
  Message.success(getDiagnosticsReportSuccessText(t, diagnosticsKind));
} catch {
  Message.error(getDiagnosticsReportFailedText(t, diagnosticsKind));
} finally {
  setReporting(false);
}
```

- [ ] **Step 4: Route the new startup failure through the configuration dialog**

Import `getBackendStartupConfigurationDescription` in `main.tsx`, then add:

```ts
const isBackendBinaryNotFound = failure.reason === 'backend_binary_not_found';
```

Select the new description before the incomplete-installation fallback:

```ts
: isLocalDataRepairFailure
  ? t('common.backendStartup.localDataRepair.description')
  : isBackendBinaryNotFound
    ? getBackendStartupConfigurationDescription(t)
    : getBackendStartupInstallationDescription(t);
```

Select the new diagnostics kind:

```ts
diagnosticsKind={
  isLocalDataRepairFailure
    ? 'local_data_repair'
    : isDataMigrationFailure
      ? 'data_migration'
      : isBackendBinaryNotFound
        ? 'backend_configuration'
        : 'incomplete_installation'
}
```

Add the reason to the renderer startup gate:

```ts
backendStartupFailure?.reason === 'backend_binary_not_found' ||
```

- [ ] **Step 5: Add keys to every configured locale**

Add this native English block under `backendStartup` in `en-US/common.json`:

```json
"backendBinaryNotFound": {
  "title": "AionCore was not found",
  "description": "AionUi is running in development mode but could not find AionCore. Place it under resources/bundled-aioncore/<platform>-<arch>, set AIONUI_BACKEND_BIN, or add aioncore to PATH, then restart AionUi.",
  "sendDiagnostics": "Send diagnostics",
  "diagnosticsSent": "Diagnostics sent",
  "diagnosticsReportSuccess": "Diagnostics report sent",
  "diagnosticsReportFailed": "Failed to send diagnostics report"
}
```

Add this native Simplified Chinese block to `zh-CN/common.json`:

```json
"backendBinaryNotFound": {
  "title": "开发环境未找到 AionCore",
  "description": "当前以开发模式运行，但未找到 AionCore。请将后端放入 resources/bundled-aioncore/<平台>-<架构>，设置 AIONUI_BACKEND_BIN，或将 aioncore 加入 PATH，然后重启 AionUi。",
  "sendDiagnostics": "发送诊断报告",
  "diagnosticsSent": "诊断报告已发送",
  "diagnosticsReportSuccess": "诊断报告已发送",
  "diagnosticsReportFailed": "诊断报告发送失败"
}
```

Add the English block unchanged to `ja-JP`, `zh-TW`, `ko-KR`, `tr-TR`, `ru-RU`, `uk-UA`, `pt-BR`, and `de-DE` so all ten configured locales have identical key structure.

- [ ] **Step 6: Regenerate i18n types and verify GREEN**

Run in this order:

```powershell
npm run i18n:types
node scripts/check-i18n.js
npm test -- tests/unit/bootstrap/backendStartupFailure.test.ts tests/unit/settings/managedNodeRuntimeI18n.test.ts
```

Expected: generated key types include `common.backendStartup.backendBinaryNotFound.*`; i18n validation and focused tests PASS.

- [ ] **Step 7: Format, run full checks, and commit**

Run:

```powershell
npx oxfmt packages/desktop/src/renderer/components/layout/InstallationIntegrityDialog.tsx packages/desktop/src/renderer/main.tsx tests/unit/bootstrap/backendStartupFailure.test.ts packages/desktop/src/renderer/services/i18n/locales/*/common.json
npm run i18n:types
node scripts/check-i18n.js
npx tsc --noEmit
npm test
git add packages/desktop/src/renderer/components/layout/InstallationIntegrityDialog.tsx packages/desktop/src/renderer/main.tsx tests/unit/bootstrap/backendStartupFailure.test.ts packages/desktop/src/renderer/services/i18n/locales packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts
git commit -m "fix(desktop): explain missing development aioncore"
```

Expected: all commands PASS and no download action is exposed for `backend_configuration`.

### Task 5: Verify the complete development startup path

**Files:**

- Verify only; no source changes expected.

- [ ] **Step 1: Verify the prepared backend fixture is executable**

Run:

```powershell
$binary = 'E:\ZZY_PROJECT\AI_lianliao\AionUi\resources\bundled-aioncore\win32-x64\aioncore.exe'
Test-Path -LiteralPath $binary
& $binary --version
```

Expected:

```text
True
aioncore 0.1.40
```

- [ ] **Step 2: Run the full verification suite**

Run:

```powershell
npm run format:check
npx tsc --noEmit
npm run i18n:types
node scripts/check-i18n.js
npm test
npm run test:coverage
git diff --check
```

Expected: every command exits with code 0 and coverage remains at or above the configured target.

- [ ] **Step 3: Smoke-test desktop development without PATH injection**

Open a fresh PowerShell that does not add the bundled directory to `PATH`, then run:

```powershell
cd E:\ZZY_PROJECT\AI_lianliao\AionUi
Remove-Item Env:AIONUI_BACKEND_BIN -ErrorAction SilentlyContinue
where.exe aioncore
npm run start
```

Expected:

- `where.exe aioncore` finds nothing.
- AionUi logs show the backend starting from `resources\bundled-aioncore\win32-x64\aioncore.exe`.
- The installation-incomplete dialog does not appear.
- The local backend reaches its ready state and renderer API requests succeed.

- [ ] **Step 4: Confirm repository state**

After closing the smoke-test app, run:

```powershell
git status --short
git log -5 --oneline
```

Expected: no uncommitted source changes; the four implementation commits appear above the design and plan commits.
