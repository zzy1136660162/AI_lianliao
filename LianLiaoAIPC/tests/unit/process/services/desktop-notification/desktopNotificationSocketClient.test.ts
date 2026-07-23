import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DesktopNotificationSocketClient,
  type DesktopNotificationSocketAdapter,
} from '@process/services/enterprise/desktop-notification/desktopNotificationSocketClient';

type SocketEvent = 'close' | 'error' | 'message' | 'open';

class FakeSocket implements DesktopNotificationSocketAdapter {
  readyState = 0;
  readonly sent: string[] = [];
  private readonly listeners = new Map<SocketEvent, Array<(...args: unknown[]) => void>>();

  on(event: SocketEvent, listener: (...args: unknown[]) => void): this {
    const current = this.listeners.get(event) ?? [];
    current.push(listener);
    this.listeners.set(event, current);
    return this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.emit('close');
  }

  emit(event: SocketEvent, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DesktopNotificationSocketClient', () => {
  it('sends the minimal heartbeat envelope accepted by cloud-api', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const client = new DesktopNotificationSocketClient({
      baseUrl: 'http://127.0.0.1:12580/',
      ticketProvider: async () => ({ ticket: 'desktop-notification-ticket', expiresInSeconds: 60 }),
      socketFactory: () => socket,
    });

    await client.connect();
    socket.readyState = 1;
    socket.emit('open');
    socket.emit(
      'message',
      JSON.stringify({
        event: 'connection.ready',
        eventId: 'ready-1',
        serverTime: 1_700_000_000_000,
        payload: { connectionId: 'connection-1', heartbeatIntervalSeconds: 1 },
      })
    );
    await vi.advanceTimersByTimeAsync(1_000);

    expect(socket.sent.map((frame) => JSON.parse(frame))).toEqual([{ event: 'ping' }]);
    client.disconnect();
  });
});
