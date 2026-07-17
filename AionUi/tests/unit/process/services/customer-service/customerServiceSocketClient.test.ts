import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  CustomerServiceServerEnvelope,
  CustomerServiceWebSocketTicket,
} from '@/common/enterprise/customer-service/contracts';
import {
  CustomerServiceSocketClient,
  type CustomerServiceSocketAdapter,
} from '@process/services/enterprise/customer-service/customerServiceSocketClient';

type SocketEvent = 'close' | 'error' | 'message' | 'open';
type SocketListener = (...args: unknown[]) => void;

class FakeSocket implements CustomerServiceSocketAdapter {
  readyState = 0;
  readonly sent: string[] = [];
  private readonly listeners = new Map<SocketEvent, SocketListener[]>();

  on(event: SocketEvent, listener: SocketListener): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close', 1000, Buffer.from('closed'));
  }

  open(): void {
    this.readyState = 1;
    this.emit('open');
  }

  receive(envelope: CustomerServiceServerEnvelope): void {
    this.emit('message', JSON.stringify(envelope));
  }

  drop(): void {
    this.readyState = 3;
    this.emit('close', 1006, Buffer.alloc(0));
  }

  private emit(event: SocketEvent, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

const readyEnvelope = (eventId: string): CustomerServiceServerEnvelope => ({
  event: 'connection.ready',
  eventId,
  requestId: null,
  conversationId: null,
  serverTime: 1_700_000_000_000,
  payload: {
    connectionId: 'connection-1',
    identity: {
      type: 'STAFF',
      userId: '-19',
      displayName: '客服人员',
      companyId: '-18',
      companyName: '沈阳航燃科技有限公司',
    },
    heartbeatIntervalSeconds: 1,
    presenceTimeoutSeconds: 90,
  },
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CustomerServiceSocketClient', () => {
  it('requests a fresh one-time ticket for every connection attempt', async () => {
    vi.useFakeTimers();
    const tickets: CustomerServiceWebSocketTicket[] = [
      { ticket: 'ticket-one-1234567890', expiresInSeconds: 60 },
      { ticket: 'ticket-two-123456789', expiresInSeconds: 60 },
    ];
    const sockets: FakeSocket[] = [];
    const urls: string[] = [];
    const client = new CustomerServiceSocketClient({
      baseUrl: 'http://127.0.0.1:12580/',
      ticketProvider: async () => tickets.shift() as CustomerServiceWebSocketTicket,
      socketFactory: (url) => {
        urls.push(url);
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      reconnectDelaysMs: [1_000],
    });

    await client.connect();
    sockets[0]?.open();
    sockets[0]?.receive(readyEnvelope('ready-1'));
    sockets[0]?.drop();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(urls).toHaveLength(2);
    expect(new URL(urls[0] ?? '').searchParams.get('ticket')).toBe('ticket-one-1234567890');
    expect(new URL(urls[1] ?? '').searchParams.get('ticket')).toBe('ticket-two-123456789');
    client.disconnect();
  });

  it('sends protocol pings after the validated ready event', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const client = new CustomerServiceSocketClient({
      baseUrl: 'http://127.0.0.1:12580/',
      ticketProvider: async () => ({ ticket: 'ticket-one-1234567890', expiresInSeconds: 60 }),
      socketFactory: () => socket,
    });

    await client.connect();
    socket.open();
    socket.receive(readyEnvelope('ready-1'));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(socket.sent.map((frame) => JSON.parse(frame))).toContainEqual(
      expect.objectContaining({ event: 'ping', payload: {} })
    );
    client.disconnect();
  });

  it('closes the socket when an untrusted server frame fails schema validation', async () => {
    const socket = new FakeSocket();
    const client = new CustomerServiceSocketClient({
      baseUrl: 'http://127.0.0.1:12580/',
      ticketProvider: async () => ({ ticket: 'ticket-one-1234567890', expiresInSeconds: 60 }),
      socketFactory: () => socket,
    });

    await client.connect();
    socket.open();
    socket.receive({ ...readyEnvelope('ready-1'), conversationId: 0 } as unknown as CustomerServiceServerEnvelope);

    expect(socket.readyState).toBe(3);
    client.disconnect();
  });
});
