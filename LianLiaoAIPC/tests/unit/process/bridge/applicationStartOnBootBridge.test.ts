import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getLoginItemSettings: vi.fn(),
    isPackaged: false,
    setLoginItemSettings: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {},
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {},
}));

vi.mock('@process/utils/zoom', () => ({
  getZoomFactor: vi.fn(),
  setZoomFactor: vi.fn(),
}));

vi.mock('@process/utils/configureChromium', () => ({
  getCdpStatus: vi.fn(),
  updateCdpConfig: vi.fn(),
}));

vi.mock('@process/utils/devToolsPolicy', () => ({
  isDevToolsEnabled: vi.fn(),
}));

vi.mock('@process/utils/gpuRecovery', () => ({
  getGpuStatus: vi.fn(),
  setGpuUserOverride: vi.fn(),
}));

vi.mock('@process/bridge/applicationBridgeCore', () => ({
  initApplicationBridgeCore: vi.fn(),
}));

vi.mock('@process/bridge/restartApplication', () => ({
  restartApplication: vi.fn(),
}));

vi.mock('@process/startup/openclawFirstRun', () => ({
  getOpenClawFirstRunPrepareStatus: vi.fn(),
  prepareOpenClawFirstRun: vi.fn(),
}));

import { ensureStartOnBootDefaultEnabled, updateStartOnBootEnabled } from '@process/bridge/applicationBridge';

const START_ON_BOOT_DEFAULT_FLAG = 'system.startOnBootDefaultV1Applied' as const;

const status = (enabled: boolean, supported = true) => ({
  supported,
  enabled,
  isPackaged: supported,
  platform: supported ? 'win32' : 'linux',
});

describe('start-on-boot initialization', () => {
  it('enables a previously disabled login item when the versioned flag is absent', async () => {
    const storage = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
    };
    const controller = {
      getStatus: vi.fn(() => status(false)),
      setEnabled: vi.fn(() => status(true)),
    };

    const result = await ensureStartOnBootDefaultEnabled(storage, controller);

    expect(result.enabled).toBe(true);
    expect(controller.setEnabled).toHaveBeenCalledWith(true);
    expect(storage.set).toHaveBeenCalledWith(START_ON_BOOT_DEFAULT_FLAG, true);
  });

  it('preserves a user-disabled login item after the versioned flag is recorded', async () => {
    const storage = {
      get: vi.fn(async () => true),
      set: vi.fn(async () => undefined),
    };
    const controller = {
      getStatus: vi.fn(() => status(false)),
      setEnabled: vi.fn(() => status(true)),
    };

    const result = await ensureStartOnBootDefaultEnabled(storage, controller);

    expect(result.enabled).toBe(false);
    expect(controller.setEnabled).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('does not mark initialization when Electron cannot enable the login item', async () => {
    const storage = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
    };
    const controller = {
      getStatus: vi.fn(() => status(false)),
      setEnabled: vi.fn(() => status(false)),
    };

    await ensureStartOnBootDefaultEnabled(storage, controller);

    expect(storage.set).not.toHaveBeenCalled();
  });

  it('leaves unsupported platforms unchanged without writing a completion flag', async () => {
    const storage = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
    };
    const controller = {
      getStatus: vi.fn(() => status(false, false)),
      setEnabled: vi.fn(() => status(true)),
    };

    const result = await ensureStartOnBootDefaultEnabled(storage, controller);

    expect(result.supported).toBe(false);
    expect(storage.get).not.toHaveBeenCalled();
    expect(controller.setEnabled).not.toHaveBeenCalled();
  });

  it('records an explicit user choice so the default cannot override it', async () => {
    const storage = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
    };
    const controller = {
      getStatus: vi.fn(() => status(true)),
      setEnabled: vi.fn(() => status(false)),
    };

    const result = await updateStartOnBootEnabled(false, storage, controller);

    expect(result.enabled).toBe(false);
    expect(controller.setEnabled).toHaveBeenCalledWith(false);
    expect(storage.set).toHaveBeenCalledWith(START_ON_BOOT_DEFAULT_FLAG, true);
  });

  it('does not persist an explicit choice when the operating system reports the opposite state', async () => {
    const storage = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
    };
    const controller = {
      getStatus: vi.fn(() => status(false)),
      setEnabled: vi.fn(() => status(false)),
    };

    const result = await updateStartOnBootEnabled(true, storage, controller);

    expect(result.enabled).toBe(false);
    expect(storage.set).not.toHaveBeenCalled();
  });
});
