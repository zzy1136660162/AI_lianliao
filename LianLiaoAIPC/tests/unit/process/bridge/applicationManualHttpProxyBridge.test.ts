import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ManualHttpProxyConfig,
  ManualHttpProxyResult,
  SaveManualHttpProxyRequest,
} from '@/common/networkProxy/contracts';

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

import {
  loadManualHttpProxyConfig,
  registerManualHttpProxyProviders,
  saveManualHttpProxyConfig,
} from '@process/bridge/applicationBridge';
import { ManualHttpProxyValidationError } from '@process/services/network-proxy/manualHttpProxy';

type ManualHttpProxyStorage = {
  get: (key: 'system.httpProxy') => Promise<unknown>;
  set: (key: 'system.httpProxy', value: { enabled: boolean; url: string }) => Promise<unknown>;
};

const makeStorage = (storedValue?: unknown): ManualHttpProxyStorage => ({
  get: vi.fn(async () => storedValue),
  set: vi.fn(async (_key, value) => value),
});

type GetManualHttpProxyHandler = () => Promise<ManualHttpProxyConfig>;
type SaveManualHttpProxyHandler = (request: SaveManualHttpProxyRequest) => Promise<ManualHttpProxyResult>;

const makeApplicationBridge = () => {
  const handlers: {
    getManualHttpProxy?: GetManualHttpProxyHandler;
    saveManualHttpProxy?: SaveManualHttpProxyHandler;
  } = {};
  const applicationBridge = {
    getManualHttpProxy: {
      provider: vi.fn((handler: GetManualHttpProxyHandler) => {
        handlers.getManualHttpProxy = handler;
      }),
    },
    saveManualHttpProxy: {
      provider: vi.fn((handler: SaveManualHttpProxyHandler) => {
        handlers.saveManualHttpProxy = handler;
      }),
    },
  };
  return { applicationBridge, handlers };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('manual HTTP proxy application bridge helpers', () => {
  it('returns the disabled default when no proxy configuration is stored', async () => {
    const storage = makeStorage();
    const warn = vi.fn();

    await expect(loadManualHttpProxyConfig(storage, warn)).resolves.toEqual({
      enabled: false,
      url: '',
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back safely when stored configuration is invalid without logging its URL', async () => {
    const sensitiveUrl = 'http://secret-user:secret-pass@proxy.example:8080';
    const storage = makeStorage({ enabled: true, url: sensitiveUrl });
    const warn = vi.fn();

    await expect(loadManualHttpProxyConfig(storage, warn)).resolves.toEqual({
      enabled: false,
      url: '',
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(sensitiveUrl);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-pass');
  });

  it('normalizes the proxy before persisting it and requests a restart', async () => {
    const storage = makeStorage();

    await expect(
      saveManualHttpProxyConfig(storage, {
        enabled: true,
        url: ' HTTPS://Proxy.Example.COM:8443/ ',
      })
    ).resolves.toEqual({
      success: true,
      config: {
        enabled: true,
        url: 'https://proxy.example.com:8443',
      },
      restartRequired: true,
    });
    expect(storage.set).toHaveBeenCalledWith('system.httpProxy', {
      enabled: true,
      url: 'https://proxy.example.com:8443',
    });
  });

  it('returns a safe validation result without persisting invalid input', async () => {
    const sensitiveUrl = 'http://secret-user:secret-pass@proxy.example:8080';
    const storage = makeStorage();

    const result = await saveManualHttpProxyConfig(storage, {
      enabled: true,
      url: sensitiveUrl,
    });

    expect(result).toMatchObject({
      success: false,
      code: 'INVALID_PROXY_URL',
      reason: 'AUTHENTICATION_UNSUPPORTED',
    });
    expect(result.success || result.message).not.toContain(sensitiveUrl);
    expect(result.success || result.message).not.toContain('secret-pass');
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('returns a fixed persistence failure without exposing error or proxy details', async () => {
    const sensitiveUrl = 'http://private-proxy.internal:8080';
    const persistenceError = new Error(`disk unavailable for ${sensitiveUrl}`);
    const storage = makeStorage();
    vi.mocked(storage.set).mockRejectedValueOnce(persistenceError);

    const result = await saveManualHttpProxyConfig(storage, {
      enabled: true,
      url: sensitiveUrl,
    });

    expect(result).toEqual({
      success: false,
      code: 'PERSISTENCE_FAILED',
      reason: 'PERSISTENCE_FAILED',
      message: 'Failed to persist manual HTTP proxy configuration.',
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveUrl);
  });

  it('returns a persistence failure for validation-shaped storage errors', async () => {
    const persistenceError = new ManualHttpProxyValidationError(
      'INVALID_CONFIG',
      'storage rejected the persisted value'
    );
    const storage = makeStorage();
    vi.mocked(storage.set).mockRejectedValueOnce(persistenceError);

    await expect(
      saveManualHttpProxyConfig(storage, {
        enabled: true,
        url: 'http://proxy.example:8080',
      })
    ).resolves.toMatchObject({
      success: false,
      code: 'PERSISTENCE_FAILED',
      reason: 'PERSISTENCE_FAILED',
    });
  });
});

describe('manual HTTP proxy provider registration', () => {
  it('registers both manual proxy providers', () => {
    const storage = makeStorage();
    const { applicationBridge } = makeApplicationBridge();

    registerManualHttpProxyProviders(applicationBridge, storage);

    expect(applicationBridge.getManualHttpProxy.provider).toHaveBeenCalledOnce();
    expect(applicationBridge.saveManualHttpProxy.provider).toHaveBeenCalledOnce();
  });

  it('provides callbacks that resolve structured-clone plain objects', async () => {
    const storage = makeStorage();
    const { applicationBridge, handlers } = makeApplicationBridge();
    registerManualHttpProxyProviders(applicationBridge, storage);
    if (!handlers.getManualHttpProxy || !handlers.saveManualHttpProxy) {
      throw new Error('Manual HTTP proxy providers were not registered.');
    }

    const getResult = await handlers.getManualHttpProxy();
    const saveResult = await handlers.saveManualHttpProxy({
      enabled: true,
      url: 'HTTP://Proxy.Example:8080/',
    });

    expect(structuredClone(getResult)).toEqual({ enabled: false, url: '' });
    expect(structuredClone(saveResult)).toEqual({
      success: true,
      config: { enabled: true, url: 'http://proxy.example:8080' },
      restartRequired: true,
    });
    expect(Object.getPrototypeOf(saveResult)).toBe(Object.prototype);
  });

  it('resolves persistence failures through the registered save callback', async () => {
    const sensitiveUrl = 'http://private-proxy.internal:8080';
    const storage = makeStorage();
    vi.mocked(storage.set).mockRejectedValueOnce(new Error(`cannot persist ${sensitiveUrl}`));
    const { applicationBridge, handlers } = makeApplicationBridge();
    registerManualHttpProxyProviders(applicationBridge, storage);
    if (!handlers.saveManualHttpProxy) {
      throw new Error('Manual HTTP proxy save provider was not registered.');
    }

    const result = await handlers.saveManualHttpProxy({
      enabled: true,
      url: sensitiveUrl,
    });

    expect(structuredClone(result)).toEqual({
      success: false,
      code: 'PERSISTENCE_FAILED',
      reason: 'PERSISTENCE_FAILED',
      message: 'Failed to persist manual HTTP proxy configuration.',
    });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(JSON.stringify(result)).not.toContain(sensitiveUrl);
  });
});
