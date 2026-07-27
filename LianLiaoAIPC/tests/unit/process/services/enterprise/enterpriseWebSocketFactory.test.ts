import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const socketInstance = { readyState: 0 };
  return {
    getActiveWebSocketProxyAgent: vi.fn<(targetUrl: string) => unknown>(),
    socketInstance,
    webSocketConstructor: vi.fn(function MockWebSocket(_url: string, _options?: unknown) {
      return socketInstance;
    }),
  };
});

vi.mock('ws', () => ({
  default: mocks.webSocketConstructor,
}));

vi.mock('@process/services/network-proxy/manualHttpProxyRuntime', () => ({
  getActiveWebSocketProxyAgent: mocks.getActiveWebSocketProxyAgent,
}));

import { DesktopNotificationSocketClient } from '@process/services/enterprise/desktop-notification/desktopNotificationSocketClient';
import { createEnterpriseWebSocket } from '@process/services/enterprise/enterpriseWebSocketFactory';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActiveWebSocketProxyAgent.mockReturnValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createEnterpriseWebSocket', () => {
  it('constructs a direct WebSocket with only the target URL when no proxy agent is active', () => {
    const targetUrl = 'ws://127.0.0.1:12580/api/desktop-notifications/ws';

    const socket = createEnterpriseWebSocket(targetUrl);

    expect(mocks.getActiveWebSocketProxyAgent).toHaveBeenCalledWith(targetUrl);
    expect(mocks.webSocketConstructor).toHaveBeenCalledWith(targetUrl);
    expect(socket).toBe(mocks.socketInstance);
  });

  it('passes the active proxy agent to a production WebSocket', () => {
    const targetUrl = 'wss://cloud.lslnii.com/api/customer-service/ws';
    const proxyAgent = { name: 'manual-proxy-agent' };
    mocks.getActiveWebSocketProxyAgent.mockReturnValue(proxyAgent);

    createEnterpriseWebSocket(targetUrl);

    expect(mocks.webSocketConstructor).toHaveBeenCalledWith(targetUrl, { agent: proxyAgent });
  });

  it('does not construct a socket when proxy resolution fails', () => {
    const proxyError = new Error('invalid WebSocket proxy target');
    mocks.getActiveWebSocketProxyAgent.mockImplementation(() => {
      throw proxyError;
    });

    expect(() => createEnterpriseWebSocket('https://cloud.lslnii.com/not-a-websocket')).toThrow(proxyError);
    expect(mocks.webSocketConstructor).not.toHaveBeenCalled();
  });

  it('lets the existing client connection path schedule a retry after proxy resolution fails', async () => {
    vi.useFakeTimers();
    mocks.getActiveWebSocketProxyAgent.mockImplementation(() => {
      throw new Error('proxy resolution failed');
    });
    const client = new DesktopNotificationSocketClient({
      baseUrl: 'http://127.0.0.1:12580/',
      ticketProvider: async () => ({
        ticket: 'desktop-notification-ticket',
        expiresInSeconds: 60,
      }),
      reconnectDelaysMs: [1_000],
    });

    await expect(client.connect()).rejects.toMatchObject({ code: 'WEBSOCKET_ERROR' });

    expect(client.getSnapshot()).toMatchObject({
      state: 'RECONNECTING',
      reconnectAttempt: 1,
    });
    expect(mocks.webSocketConstructor).not.toHaveBeenCalled();
    client.disconnect();
  });
});
