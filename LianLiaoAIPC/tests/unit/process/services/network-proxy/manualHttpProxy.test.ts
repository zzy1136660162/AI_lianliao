import { HttpsProxyAgent } from 'https-proxy-agent';
import { describe, expect, it } from 'vitest';

import {
  ManualHttpProxyValidationError,
  buildProxyEnvironment,
  createWebSocketProxyAgent,
  isLoopbackWebSocketUrl,
  normalizeManualHttpProxyConfig,
} from '@process/services/network-proxy/manualHttpProxy';

function expectValidationFailure(action: () => unknown, reason: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ManualHttpProxyValidationError);
    if (error instanceof ManualHttpProxyValidationError) {
      expect(error.reason).toBe(reason);
    }
    return;
  }

  throw new Error('Expected proxy validation to fail.');
}

describe('normalizeManualHttpProxyConfig', () => {
  it.each([
    null,
    undefined,
    [],
    new Date(0),
    {},
    { enabled: true },
    { url: 'http://proxy.example.com:8080' },
    { enabled: 'true', url: 'http://proxy.example.com:8080' },
    { enabled: true, url: 8080 },
  ])('rejects a non-config runtime input: %j', (input) => {
    expectValidationFailure(() => normalizeManualHttpProxyConfig(input), 'INVALID_CONFIG');
  });

  it('trims and normalizes an enabled HTTP proxy URL', () => {
    expect(
      normalizeManualHttpProxyConfig({
        enabled: true,
        url: '  HTTPS://Proxy.Example.COM:8443/  ',
      })
    ).toEqual({
      enabled: true,
      url: 'https://proxy.example.com:8443',
    });
  });

  it('preserves an explicitly supplied default port', () => {
    expect(
      normalizeManualHttpProxyConfig({
        enabled: true,
        url: 'http://proxy.example.com:80',
      })
    ).toEqual({
      enabled: true,
      url: 'http://proxy.example.com:80',
    });
  });

  it('normalizes a legal IPv6 proxy authority', () => {
    expect(
      normalizeManualHttpProxyConfig({
        enabled: true,
        url: 'http://[2001:0db8:0:0:0:0:0:1]:8080',
      })
    ).toEqual({
      enabled: true,
      url: 'http://[2001:db8::1]:8080',
    });
  });

  it('accepts the highest legal proxy port', () => {
    expect(
      normalizeManualHttpProxyConfig({
        enabled: true,
        url: 'https://proxy.example.com:65535',
      })
    ).toEqual({
      enabled: true,
      url: 'https://proxy.example.com:65535',
    });
  });

  it.each(['http://proxy.example.com:0', 'http://proxy.example.com:65536'])(
    'rejects an out-of-range explicit port: %s',
    (url) => {
      expect(() => normalizeManualHttpProxyConfig({ enabled: true, url })).toThrow(ManualHttpProxyValidationError);
    }
  );

  it('returns an empty URL when a disabled proxy has no URL', () => {
    expect(normalizeManualHttpProxyConfig({ enabled: false, url: '   ' })).toEqual({
      enabled: false,
      url: '',
    });
  });

  it('validates and preserves a configured URL while disabled', () => {
    expect(
      normalizeManualHttpProxyConfig({
        enabled: false,
        url: ' https://proxy.example.com:9443/ ',
      })
    ).toEqual({
      enabled: false,
      url: 'https://proxy.example.com:9443',
    });
  });

  it('rejects an invalid configured URL while disabled', () => {
    expect(() =>
      normalizeManualHttpProxyConfig({
        enabled: false,
        url: 'socks5://proxy.example.com:1080',
      })
    ).toThrow(ManualHttpProxyValidationError);
  });

  it('reports a stable reason without echoing proxy credentials', () => {
    const input = 'http://proxy-user:proxy-secret@proxy.example.com:8080';

    try {
      normalizeManualHttpProxyConfig({ enabled: true, url: input });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ManualHttpProxyValidationError);
      if (error instanceof ManualHttpProxyValidationError) {
        expect(error.reason).toBe('AUTHENTICATION_UNSUPPORTED');
        expect(error.message).not.toContain('proxy-user');
        expect(error.message).not.toContain('proxy-secret');
      }
      return;
    }

    throw new Error('Expected authenticated proxy validation to fail.');
  });

  it.each(['http://proxy.example.com:8080/foo/..', 'http://proxy.example.com:8080/%2e%2e'])(
    'rejects a raw dot-segment path before URL normalization: %s',
    (url) => {
      expect(() => normalizeManualHttpProxyConfig({ enabled: true, url })).toThrow(ManualHttpProxyValidationError);
    }
  );

  it.each([
    ['an empty enabled URL', { enabled: true, url: '  ' }],
    ['a non-HTTP protocol', { enabled: true, url: 'socks5://proxy.example.com:1080' }],
    ['a malformed host', { enabled: true, url: 'http://:8080' }],
    ['a missing port', { enabled: true, url: 'https://proxy.example.com' }],
    ['proxy authentication', { enabled: true, url: 'http://user:secret@proxy.example.com:8080' }],
    ['a non-root path', { enabled: true, url: 'http://proxy.example.com:8080/connect' }],
    ['a query string', { enabled: true, url: 'http://proxy.example.com:8080?mode=tunnel' }],
    ['a URL fragment', { enabled: true, url: 'http://proxy.example.com:8080#proxy' }],
  ])('rejects %s', (_description, input) => {
    expect(() => normalizeManualHttpProxyConfig(input)).toThrow(ManualHttpProxyValidationError);
  });
});

describe('WebSocket proxy routing', () => {
  const enabledProxy = {
    enabled: true,
    url: 'http://proxy.example.com:8080',
  };

  const loopbackTargets = [
    'ws://localhost:9527/socket',
    'wss://localhost.:9527/socket',
    'wss://127.0.0.1/socket',
    'ws://127.1:9527/socket',
    'ws://127.255.255.254:9527/socket',
    'ws://[::1]:9527/socket',
    'wss://[::ffff:127.0.0.1]:9527/socket',
  ];

  it.each(loopbackTargets)('recognizes loopback target %s', (targetUrl) => {
    expect(isLoopbackWebSocketUrl(targetUrl)).toBe(true);
  });

  it.each(loopbackTargets)('does not proxy loopback WebSocket traffic: %s', (targetUrl) => {
    expect(createWebSocketProxyAgent(targetUrl, enabledProxy)).toBeUndefined();
  });

  it('does not create an agent when the proxy is disabled', () => {
    expect(
      createWebSocketProxyAgent('wss://events.example.com/socket', {
        enabled: false,
        url: '',
      })
    ).toBeUndefined();
  });

  it.each(['https://events.example.com/socket', 'not a valid URL'])(
    'ignores target validation when the proxy is disabled: %s',
    (targetUrl) => {
      expect(
        createWebSocketProxyAgent(targetUrl, {
          enabled: false,
          url: '',
        })
      ).toBeUndefined();
    }
  );

  it('creates an HTTPS proxy agent for a production WSS target', () => {
    expect(createWebSocketProxyAgent('wss://events.example.com/socket', enabledProxy)).toBeInstanceOf(HttpsProxyAgent);
  });

  it('rejects a non-WebSocket target protocol with a stable reason', () => {
    expectValidationFailure(
      () => createWebSocketProxyAgent('https://events.example.com/socket', enabledProxy),
      'UNSUPPORTED_WEBSOCKET_TARGET_PROTOCOL'
    );
  });

  it('rejects a malformed target URL while the proxy is enabled', () => {
    expectValidationFailure(
      () => createWebSocketProxyAgent('not a valid URL', enabledProxy),
      'INVALID_WEBSOCKET_TARGET_URL'
    );
  });
});

describe('buildProxyEnvironment', () => {
  it('overrides proxy variables and protects loopback targets when enabled', () => {
    const originalBaseline = {
      HTTP_PROXY: 'http://old-proxy.example.com:8080',
      PATH: '/usr/bin',
    };
    const baseline = Object.freeze({ ...originalBaseline });

    const environment = buildProxyEnvironment(baseline, {
      enabled: true,
      url: ' https://proxy.example.com:9443/ ',
    });

    expect(baseline).toEqual(originalBaseline);
    expect(environment).toEqual({
      ...originalBaseline,
      HTTP_PROXY: 'https://proxy.example.com:9443',
      HTTPS_PROXY: 'https://proxy.example.com:9443',
      ALL_PROXY: 'https://proxy.example.com:9443',
      http_proxy: 'https://proxy.example.com:9443',
      https_proxy: 'https://proxy.example.com:9443',
      all_proxy: 'https://proxy.example.com:9443',
      NO_PROXY: 'localhost,127.0.0.1,127.0.0.0/8,::1',
      no_proxy: 'localhost,127.0.0.1,127.0.0.0/8,::1',
    });
    expect(environment).not.toBe(baseline);
  });

  it('returns an unchanged baseline copy when disabled', () => {
    const originalBaseline = {
      HTTPS_PROXY: 'http://baseline.example.com:3128',
      NO_PROXY: 'internal.example.com',
    };
    const baseline = Object.freeze({ ...originalBaseline });

    const environment = buildProxyEnvironment(baseline, {
      enabled: false,
      url: '',
    });

    expect(baseline).toEqual(originalBaseline);
    expect(environment).toEqual(originalBaseline);
    expect(environment).not.toBe(baseline);
  });
});
