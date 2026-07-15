# Enterprise Development Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Electron development builds use the local enterprise API at `http://127.0.0.1:12580/`, add an in-window `F12` DevTools toggle, and prevent every DevTools entry point in packaged builds.

**Architecture:** Add two small main-process policy modules: one resolves the fixed enterprise API client options from `app.isPackaged`, and one owns the DevTools availability and `F12` input policy. Existing bridge, window, menu, and IPC code consumes these policies so production restrictions are centralized and testable.

**Tech Stack:** Electron 37, TypeScript, Vitest 4, electron-vite

---

## File map

- Create `packages/desktop/src/process/services/enterprise/enterpriseRuntimeConfig.ts`: resolve fixed development and production `EnterpriseApiClient` options.
- Create `tests/unit/enterprise/enterpriseRuntimeConfig.test.ts`: verify the exact URL and environment selected for both runtime modes.
- Modify `packages/desktop/src/process/bridge/enterpriseBridge.ts`: construct the default API client from the runtime configuration.
- Create `packages/desktop/src/process/utils/devToolsPolicy.ts`: centralize packaged-build denial and focused-window `F12` handling.
- Create `tests/unit/process/devToolsPolicy.test.ts`: verify open, close, ignored-input, and packaged-build behavior.
- Modify `packages/desktop/src/index.ts`: set `webPreferences.devTools` from the policy and attach the development shortcut.
- Modify `packages/desktop/src/process/bridge/applicationBridge.ts`: reject the DevTools IPC entry point in packaged builds.
- Modify `packages/desktop/src/process/utils/appMenu.ts`: omit `toggleDevTools` from the packaged application menu.
- Create `tests/unit/process/appMenu.test.ts`: verify development and packaged View menu composition.

### Task 1: Select the enterprise API endpoint from the runtime mode

**Files:**

- Create: `tests/unit/enterprise/enterpriseRuntimeConfig.test.ts`
- Create: `packages/desktop/src/process/services/enterprise/enterpriseRuntimeConfig.ts`
- Modify: `packages/desktop/src/process/bridge/enterpriseBridge.ts`

- [ ] **Step 1: Write the failing runtime configuration test**

```ts
import { describe, expect, it } from 'vitest';

import { resolveEnterpriseApiClientOptions } from '@process/services/enterprise/enterpriseRuntimeConfig';

describe('enterprise runtime configuration', () => {
  it('uses the local cloud-api host in an Electron development build', () => {
    expect(resolveEnterpriseApiClientOptions(false)).toEqual({
      baseUrl: 'http://127.0.0.1:12580/',
      environment: 'development',
    });
  });

  it('pins a packaged build to the production cloud host', () => {
    expect(resolveEnterpriseApiClientOptions(true)).toEqual({
      baseUrl: 'https://cloud.lslnii.com/',
      environment: 'production',
    });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npx vitest run tests/unit/enterprise/enterpriseRuntimeConfig.test.ts
```

Expected: FAIL because `enterpriseRuntimeConfig.ts` does not exist.

- [ ] **Step 3: Implement the fixed runtime configuration**

Create `enterpriseRuntimeConfig.ts`:

```ts
import type { EnterpriseApiClientOptions } from './enterpriseApiClient';

const DEVELOPMENT_ENTERPRISE_API_BASE_URL = 'http://127.0.0.1:12580/';
const PRODUCTION_ENTERPRISE_API_BASE_URL = 'https://cloud.lslnii.com/';

/** Resolves the only enterprise API origin allowed for the current Electron runtime. */
export const resolveEnterpriseApiClientOptions = (isPackaged: boolean): EnterpriseApiClientOptions =>
  isPackaged
    ? {
        baseUrl: PRODUCTION_ENTERPRISE_API_BASE_URL,
        environment: 'production',
      }
    : {
        baseUrl: DEVELOPMENT_ENTERPRISE_API_BASE_URL,
        environment: 'development',
      };
```

Wire the resolver into `enterpriseBridge.ts`:

```ts
import { resolveEnterpriseApiClientOptions } from '@process/services/enterprise/enterpriseRuntimeConfig';
```

Replace the default construction with:

```ts
const apiClient =
  dependencies.apiClient ?? new EnterpriseApiClient(resolveEnterpriseApiClientOptions(app.isPackaged));
```

- [ ] **Step 4: Run the focused enterprise tests and verify GREEN**

Run:

```powershell
npx vitest run tests/unit/enterprise/enterpriseRuntimeConfig.test.ts tests/unit/enterprise/enterpriseBridge.test.ts tests/unit/enterprise/enterpriseApiClient.test.ts
```

Expected: all tests PASS. The existing injected-client bridge tests must remain unchanged.

- [ ] **Step 5: Commit the enterprise runtime selection**

```powershell
git add packages/desktop/src/process/services/enterprise/enterpriseRuntimeConfig.ts packages/desktop/src/process/bridge/enterpriseBridge.ts tests/unit/enterprise/enterpriseRuntimeConfig.test.ts
git commit -m "fix(enterprise): use local API in development"
```

### Task 2: Add the development-only F12 policy and hard BrowserWindow boundary

**Files:**

- Create: `tests/unit/process/devToolsPolicy.test.ts`
- Create: `packages/desktop/src/process/utils/devToolsPolicy.ts`
- Modify: `packages/desktop/src/index.ts`

- [ ] **Step 1: Write the failing DevTools policy tests**

```ts
import { describe, expect, it, vi } from 'vitest';

import { handleDevToolsShortcut, isDevToolsEnabled } from '@process/utils/devToolsPolicy';

const input = (overrides: Record<string, unknown> = {}) => ({
  type: 'keyDown',
  key: 'F12',
  code: 'F12',
  isAutoRepeat: false,
  isComposing: false,
  ...overrides,
});

const makeWebContents = (opened: boolean) => ({
  isDevToolsOpened: vi.fn(() => opened),
  openDevTools: vi.fn(),
  closeDevTools: vi.fn(),
});

describe('DevTools runtime policy', () => {
  it('enables DevTools only outside packaged builds', () => {
    expect(isDevToolsEnabled(false)).toBe(true);
    expect(isDevToolsEnabled(true)).toBe(false);
  });

  it('opens DevTools for a development F12 keyDown', () => {
    const event = { preventDefault: vi.fn() };
    const webContents = makeWebContents(false);

    expect(handleDevToolsShortcut(event, input(), webContents, false)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(webContents.openDevTools).toHaveBeenCalledOnce();
    expect(webContents.closeDevTools).not.toHaveBeenCalled();
  });

  it('closes open DevTools for a development F12 keyDown', () => {
    const event = { preventDefault: vi.fn() };
    const webContents = makeWebContents(true);

    expect(handleDevToolsShortcut(event, input(), webContents, false)).toBe(true);
    expect(webContents.closeDevTools).toHaveBeenCalledOnce();
    expect(webContents.openDevTools).not.toHaveBeenCalled();
  });

  it.each([
    ['packaged build', true, input()],
    ['keyUp', false, input({ type: 'keyUp' })],
    ['auto repeat', false, input({ isAutoRepeat: true })],
    ['composition', false, input({ isComposing: true })],
    ['another key', false, input({ key: 'F11', code: 'F11' })],
  ])('ignores %s', (_name, isPackaged, keyboardInput) => {
    const event = { preventDefault: vi.fn() };
    const webContents = makeWebContents(false);

    expect(handleDevToolsShortcut(event, keyboardInput, webContents, isPackaged)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(webContents.openDevTools).not.toHaveBeenCalled();
    expect(webContents.closeDevTools).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npx vitest run tests/unit/process/devToolsPolicy.test.ts
```

Expected: FAIL because `devToolsPolicy.ts` does not exist.

- [ ] **Step 3: Implement the DevTools policy**

Create `devToolsPolicy.ts`:

```ts
import type { BrowserWindow, Event, Input, WebContents } from 'electron';

type DevToolsEvent = Pick<Event, 'preventDefault'>;
type DevToolsInput = Pick<Input, 'type' | 'key' | 'code' | 'isAutoRepeat' | 'isComposing'>;
type DevToolsWebContents = Pick<WebContents, 'isDevToolsOpened' | 'openDevTools' | 'closeDevTools'>;

/** Packaged builds intentionally expose no local or remote DevTools entry point. */
export const isDevToolsEnabled = (isPackaged: boolean): boolean => !isPackaged;

export const handleDevToolsShortcut = (
  event: DevToolsEvent,
  input: DevToolsInput,
  webContents: DevToolsWebContents,
  isPackaged: boolean
): boolean => {
  const isF12 = input.key === 'F12' || input.code === 'F12';
  if (
    !isDevToolsEnabled(isPackaged) ||
    input.type !== 'keyDown' ||
    input.isAutoRepeat ||
    input.isComposing ||
    !isF12
  ) {
    return false;
  }

  event.preventDefault();
  if (webContents.isDevToolsOpened()) webContents.closeDevTools();
  else webContents.openDevTools();
  return true;
};

/** Attaches the focused-window shortcut without claiming a system-wide hotkey. */
export const attachDevToolsShortcutToWindow = (win: BrowserWindow, isPackaged: boolean): void => {
  win.webContents.on('before-input-event', (event, input) => {
    handleDevToolsShortcut(event, input, win.webContents, isPackaged);
  });
};
```

Wire the policy into `index.ts`:

```ts
import { attachDevToolsShortcutToWindow, isDevToolsEnabled } from './process/utils/devToolsPolicy';
```

Add the hard BrowserWindow option:

```ts
webPreferences: {
  preload: path.join(__dirname, '../preload/index.js'),
  webviewTag: true,
  devTools: isDevToolsEnabled(app.isPackaged),
},
```

Attach the focused-window shortcut immediately after creating the main window:

```ts
attachDevToolsShortcutToWindow(mainWindow, app.isPackaged);
```

- [ ] **Step 4: Run the policy test and verify GREEN**

Run:

```powershell
npx vitest run tests/unit/process/devToolsPolicy.test.ts
```

Expected: all DevTools policy tests PASS.

- [ ] **Step 5: Commit the window-level DevTools policy**

```powershell
git add packages/desktop/src/process/utils/devToolsPolicy.ts packages/desktop/src/index.ts tests/unit/process/devToolsPolicy.test.ts
git commit -m "feat(desktop): toggle devtools with F12 in development"
```

### Task 3: Close the packaged menu and IPC DevTools entry points

**Files:**

- Create: `tests/unit/process/appMenu.test.ts`
- Modify: `packages/desktop/src/process/utils/appMenu.ts`
- Modify: `packages/desktop/src/process/bridge/applicationBridge.ts`

- [ ] **Step 1: Write the failing application-menu test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: { update: { open: { emit: vi.fn() } } },
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, name: 'AionUi' },
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
}));

import { buildViewMenuItems } from '@process/utils/appMenu';

describe('application View menu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('contains toggleDevTools in development', () => {
    expect(buildViewMenuItems(false).map((item) => item.role)).toContain('toggleDevTools');
  });

  it('omits toggleDevTools in a packaged build', () => {
    expect(buildViewMenuItems(true).map((item) => item.role)).not.toContain('toggleDevTools');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npx vitest run tests/unit/process/appMenu.test.ts
```

Expected: FAIL because `buildViewMenuItems` is not exported.

- [ ] **Step 3: Extract the View menu builder and guard the IPC provider**

In `appMenu.ts`, import the shared policy and extract the current View items:

```ts
import { isDevToolsEnabled } from './devToolsPolicy';

export const buildViewMenuItems = (isPackaged: boolean): MenuItemConstructorOptions[] => [
  { role: 'reload' },
  { role: 'forceReload' },
  ...(isDevToolsEnabled(isPackaged)
    ? ([{ role: 'toggleDevTools' }] as MenuItemConstructorOptions[])
    : []),
  { type: 'separator' },
  { role: 'resetZoom' },
  { role: 'zoomIn' },
  { role: 'zoomOut' },
  { type: 'separator' },
  { role: 'togglefullscreen' },
];
```

Use the helper in the View submenu:

```ts
template.push({
  label: 'View',
  submenu: buildViewMenuItems(app.isPackaged),
});
```

In `applicationBridge.ts`, import the policy:

```ts
import { isDevToolsEnabled } from '../utils/devToolsPolicy';
```

Add the packaged-build guard before accessing the main window:

```ts
ipcBridge.application.openDevTools.provider(() => {
  if (!isDevToolsEnabled(app.isPackaged)) return Promise.resolve(false);

  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    const win = mainWindowRef;
    const wasOpen = win.webContents.isDevToolsOpened();

    if (wasOpen) {
      win.webContents.closeDevTools();
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const onOpened = () => {
        win.webContents.off('devtools-opened', onOpened);
        resolve(true);
      };

      win.webContents.once('devtools-opened', onOpened);
      win.webContents.openDevTools();

      setTimeout(() => {
        win.webContents.off('devtools-opened', onOpened);
        if (win.isDestroyed()) {
          resolve(false);
          return;
        }
        resolve(win.webContents.isDevToolsOpened());
      }, 500);
    });
  }
  return Promise.resolve(false);
});
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npx vitest run tests/unit/process/appMenu.test.ts tests/unit/process/devToolsPolicy.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the packaged-build entry-point guards**

```powershell
git add packages/desktop/src/process/utils/appMenu.ts packages/desktop/src/process/bridge/applicationBridge.ts tests/unit/process/appMenu.test.ts
git commit -m "fix(desktop): disable devtools in packaged builds"
```

### Task 4: Format, build, and perform runtime verification

**Files:**

- Verify all files changed in Tasks 1-3.

- [ ] **Step 1: Format only the scoped files**

Run:

```powershell
npx oxfmt packages/desktop/src/process/services/enterprise/enterpriseRuntimeConfig.ts packages/desktop/src/process/bridge/enterpriseBridge.ts packages/desktop/src/process/utils/devToolsPolicy.ts packages/desktop/src/process/utils/appMenu.ts packages/desktop/src/process/bridge/applicationBridge.ts packages/desktop/src/index.ts tests/unit/enterprise/enterpriseRuntimeConfig.test.ts tests/unit/process/devToolsPolicy.test.ts tests/unit/process/appMenu.test.ts
```

Expected: command exits successfully and changes only the listed files.

- [ ] **Step 2: Run the complete scoped regression set**

Run:

```powershell
npx vitest run tests/unit/enterprise/enterpriseRuntimeConfig.test.ts tests/unit/enterprise/enterpriseBridge.test.ts tests/unit/enterprise/enterpriseApiClient.test.ts tests/unit/process/devToolsPolicy.test.ts tests/unit/process/appMenu.test.ts
```

Expected: all scoped tests PASS.

- [ ] **Step 3: Build the Electron application**

Run:

```powershell
npm run package
```

Expected: electron-vite main, preload, and renderer builds complete successfully.

- [ ] **Step 4: Verify the development runtime manually**

Start the local backend on port `12580`, then run:

```powershell
npm run dev
```

Verify:

1. Opening the enterprise login page sends `POST http://127.0.0.1:12580/cloud-api/CommonWxGZHQrCodeLogIn/desktop/create`.
2. The request does not fall back to `https://cloud.lslnii.com/` when the local backend is unavailable.
3. Pressing `F12` once opens DevTools and pressing it again closes DevTools.

- [ ] **Step 5: Review the final diff and commit formatting changes if present**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and no unrelated files staged. If formatting changed tracked files after the task commits, commit only those scoped paths with:

```powershell
git add packages/desktop/src/process/services/enterprise/enterpriseRuntimeConfig.ts packages/desktop/src/process/bridge/enterpriseBridge.ts packages/desktop/src/process/utils/devToolsPolicy.ts packages/desktop/src/process/utils/appMenu.ts packages/desktop/src/process/bridge/applicationBridge.ts packages/desktop/src/index.ts tests/unit/enterprise/enterpriseRuntimeConfig.test.ts tests/unit/process/devToolsPolicy.test.ts tests/unit/process/appMenu.test.ts
git commit -m "style(desktop): format development runtime changes"
```
