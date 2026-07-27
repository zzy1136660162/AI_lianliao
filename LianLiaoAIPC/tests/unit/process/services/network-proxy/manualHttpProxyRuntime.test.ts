import { HttpsProxyAgent } from 'https-proxy-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MANAGED_PROXY_ENVIRONMENT_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'NO_PROXY',
  'no_proxy',
] as const;

let originalEnvironment: NodeJS.ProcessEnv;

function replaceProcessEnvironment(environment: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, environment);
}

async function loadRuntime() {
  vi.resetModules();
  return import('@process/services/network-proxy/manualHttpProxyRuntime');
}

beforeEach(() => {
  originalEnvironment = { ...process.env };
});

afterEach(() => {
  replaceProcessEnvironment(originalEnvironment);
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('manual HTTP proxy process environment', () => {
  it('overrides only managed proxy variables when enabled', async () => {
    process.env.RUNTIME_PROXY_UNRELATED = 'startup-value';
    const runtime = await loadRuntime();
    process.env.RUNTIME_PROXY_UNRELATED = 'current-value';

    runtime.configureManualHttpProxy({
      enabled: true,
      url: ' HTTPS://Proxy.Example.COM:8443/ ',
    });

    for (const key of MANAGED_PROXY_ENVIRONMENT_KEYS.slice(0, 6)) {
      expect(process.env[key]).toBe('https://proxy.example.com:8443');
    }
    expect(process.env.NO_PROXY).toBe('localhost,127.0.0.1,127.0.0.0/8,::1');
    expect(process.env.no_proxy).toBe('localhost,127.0.0.1,127.0.0.0/8,::1');
    expect(process.env.RUNTIME_PROXY_UNRELATED).toBe('current-value');
  });

  it('restores the startup baseline when disabled', async () => {
    for (const key of MANAGED_PROXY_ENVIRONMENT_KEYS) {
      delete process.env[key];
    }
    process.env.HTTP_PROXY = 'http://startup-proxy.example.com:8080';
    process.env.NO_PROXY = 'startup.internal';
    const runtime = await loadRuntime();

    runtime.configureManualHttpProxy({
      enabled: true,
      url: 'http://active-proxy.example.com:3128',
    });
    runtime.configureManualHttpProxy({ enabled: false, url: '' });

    expect(process.env.HTTP_PROXY).toBe('http://startup-proxy.example.com:8080');
    expect(process.env.NO_PROXY).toBe('startup.internal');
    expect(process.env.ALL_PROXY).toBeUndefined();
  });

  it.runIf(process.platform === 'win32')('restores the original mixed-case Windows baseline entry', async () => {
    for (const key of MANAGED_PROXY_ENVIRONMENT_KEYS) {
      delete process.env[key];
    }
    process.env.HtTp_PrOxY = 'http://mixed-case-startup.example.com:8080';
    const runtime = await loadRuntime();

    runtime.configureManualHttpProxy({
      enabled: true,
      url: 'http://active-proxy.example.com:3128',
    });
    runtime.configureManualHttpProxy({ enabled: false, url: '' });

    const restoredKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'http_proxy');
    expect(restoredKey).toBe('HtTp_PrOxY');
    expect(process.env.HtTp_PrOxY).toBe('http://mixed-case-startup.example.com:8080');
  });

  it('returns a copy of the active configuration', async () => {
    const runtime = await loadRuntime();
    runtime.configureManualHttpProxy({
      enabled: true,
      url: 'http://proxy.example.com:8080',
    });

    const firstRead = runtime.getActiveManualHttpProxyConfig();
    firstRead.enabled = false;
    firstRead.url = '';

    expect(runtime.getActiveManualHttpProxyConfig()).toEqual({
      enabled: true,
      url: 'http://proxy.example.com:8080',
    });
  });
});

describe('manual HTTP proxy Electron session', () => {
  it('applies a fixed proxy and closes existing connections when enabled', async () => {
    const runtime = await loadRuntime();
    runtime.configureManualHttpProxy({
      enabled: true,
      url: 'http://proxy.example.com:8080',
    });
    const setProxy = vi.fn(async () => {});
    const closeAllConnections = vi.fn(async () => {});

    await runtime.applyManualHttpProxyToSession({ setProxy, closeAllConnections });

    expect(setProxy).toHaveBeenCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'http://proxy.example.com:8080',
      proxyBypassRules: '<local>;localhost;127.0.0.1;127.0.0.0/8;[::1]',
    });
    expect(closeAllConnections).toHaveBeenCalledOnce();
  });

  it('restores system proxy mode and closes existing connections when disabled', async () => {
    const runtime = await loadRuntime();
    runtime.configureManualHttpProxy({ enabled: false, url: '' });
    const setProxy = vi.fn(async () => {});
    const closeAllConnections = vi.fn(async () => {});

    await runtime.applyManualHttpProxyToSession({ setProxy, closeAllConnections });

    expect(setProxy).toHaveBeenCalledWith({ mode: 'system' });
    expect(closeAllConnections).toHaveBeenCalledOnce();
  });

  it('does not close connections when applying session proxy settings fails', async () => {
    const runtime = await loadRuntime();
    const setProxy = vi.fn(async () => {
      throw new Error('session proxy failed');
    });
    const closeAllConnections = vi.fn(async () => {});

    await expect(runtime.applyManualHttpProxyToSession({ setProxy, closeAllConnections })).rejects.toThrow(
      'session proxy failed'
    );
    expect(closeAllConnections).not.toHaveBeenCalled();
  });
});

describe('manual HTTP proxy startup initialization', () => {
  it('falls back safely when the stored configuration is invalid', async () => {
    const runtime = await loadRuntime();
    const invalidUrl = 'socks5://private-proxy.example.com:1080';
    const setProxy = vi.fn(async () => {});
    const closeAllConnections = vi.fn(async () => {});
    const warn = vi.fn();

    await expect(
      runtime.initializeManualHttpProxyForStartup(
        { enabled: true, url: invalidUrl },
        { setProxy, closeAllConnections },
        warn
      )
    ).resolves.toBeUndefined();

    expect(runtime.getActiveManualHttpProxyConfig()).toEqual({ enabled: false, url: '' });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls.flat().join(' ')).not.toContain(invalidUrl);
  });

  it('keeps a valid active proxy when applying it to the session fails', async () => {
    const runtime = await loadRuntime();
    const setProxy = vi.fn(async () => {
      throw new Error('session proxy failed');
    });
    const closeAllConnections = vi.fn(async () => {});
    const warn = vi.fn();

    await expect(
      runtime.initializeManualHttpProxyForStartup(
        { enabled: true, url: 'http://proxy.example.com:8080' },
        { setProxy, closeAllConnections },
        warn
      )
    ).resolves.toBeUndefined();

    expect(runtime.getActiveManualHttpProxyConfig()).toEqual({
      enabled: true,
      url: 'http://proxy.example.com:8080',
    });
    expect(closeAllConnections).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('manual HTTP proxy WebSocket routing', () => {
  it('uses the active proxy configuration for WebSocket agents', async () => {
    const runtime = await loadRuntime();
    runtime.configureManualHttpProxy({
      enabled: true,
      url: 'http://proxy.example.com:8080',
    });

    expect(runtime.getActiveWebSocketProxyAgent('wss://events.example.com/socket')).toBeInstanceOf(HttpsProxyAgent);
    expect(runtime.getActiveWebSocketProxyAgent('ws://localhost:9527/socket')).toBeUndefined();
  });
});
