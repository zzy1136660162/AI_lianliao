import { randomUUID } from 'node:crypto';

import WebSocket from 'ws';

import {
  CUSTOMER_SERVICE_API_BASE_URLS,
  CUSTOMER_SERVICE_RECONNECT_DELAYS_MS,
  CUSTOMER_SERVICE_WEBSOCKET_PATH,
} from '@/common/enterprise/customer-service/constants';
import type {
  CustomerServiceConnectionReadyPayload,
  CustomerServiceConnectionSnapshot,
  CustomerServiceConnectionState,
  CustomerServiceSendMessageRequest,
  CustomerServiceServerEnvelope,
  CustomerServiceWebSocketTicket,
} from '@/common/enterprise/customer-service/contracts';
import {
  CUSTOMER_SERVICE_COMMAND_SCHEMAS,
  customerServiceServerEnvelopeSchema,
  customerServiceWebSocketTicketSchema,
} from '@/common/enterprise/customer-service/schemas';

import { CustomerServiceApiError } from './customerServiceApiClient';

const INACTIVITY_TIMEOUT_MS = 60_000;
const MAX_SERVER_FRAME_BYTES = 1024 * 1024;
const MAX_RECENT_EVENT_IDS = 2_000;

type CustomerServiceSocketEvent = 'close' | 'error' | 'message' | 'open';
type CustomerServiceSocketListener = (...args: unknown[]) => void;

/** Minimal ws surface kept injectable for deterministic node tests. */
export type CustomerServiceSocketAdapter = {
  readyState: number;
  on: (event: CustomerServiceSocketEvent, listener: CustomerServiceSocketListener) => unknown;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

export type CustomerServiceSocketClientOptions = {
  baseUrl: string;
  ticketProvider: () => Promise<CustomerServiceWebSocketTicket>;
  socketFactory?: (url: string) => CustomerServiceSocketAdapter;
  reconnectDelaysMs?: readonly number[];
};

export type CustomerServiceSocketEventListener = (event: CustomerServiceServerEnvelope) => void;
export type CustomerServiceSocketStateListener = (snapshot: CustomerServiceConnectionSnapshot) => void;

const defaultSocketFactory = (url: string): CustomerServiceSocketAdapter => {
  return new WebSocket(url) as unknown as CustomerServiceSocketAdapter;
};

const normalizeSocketBaseUrl = (baseUrl: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new CustomerServiceApiError('INVALID_BASE_URL');
  }

  const allowed = Object.values(CUSTOMER_SERVICE_API_BASE_URLS).some((candidate) => parsed.toString() === candidate);
  if (!allowed) throw new CustomerServiceApiError('INVALID_BASE_URL');
  return parsed.toString();
};

const parseReconnectDelays = (values: readonly number[] | undefined): readonly number[] => {
  const delays = values ?? CUSTOMER_SERVICE_RECONNECT_DELAYS_MS;
  if (delays.length === 0 || delays.some((value) => !Number.isInteger(value) || value < 1 || value > 60_000)) {
    throw new CustomerServiceApiError('INVALID_REQUEST');
  }
  return [...delays];
};

const frameToText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString('utf8');
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8');
  }
  throw new CustomerServiceApiError('INVALID_SERVER_EVENT');
};

/** Owns the main-process WebSocket, one-time tickets, heartbeat, and reconnect policy. */
export class CustomerServiceSocketClient {
  private readonly baseUrl: string;
  private readonly ticketProvider: () => Promise<CustomerServiceWebSocketTicket>;
  private readonly socketFactory: (url: string) => CustomerServiceSocketAdapter;
  private readonly reconnectDelaysMs: readonly number[];
  private readonly eventListeners = new Set<CustomerServiceSocketEventListener>();
  private readonly stateListeners = new Set<CustomerServiceSocketStateListener>();
  private readonly recentEventIds = new Set<string>();

  private socket: CustomerServiceSocketAdapter | null = null;
  private state: CustomerServiceConnectionState = 'IDLE';
  private shouldReconnect = false;
  private reconnectAttempt = 0;
  private connectionRevision = 0;
  private openingPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: CustomerServiceSocketClientOptions) {
    this.baseUrl = normalizeSocketBaseUrl(options.baseUrl);
    this.ticketProvider = options.ticketProvider;
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
    this.reconnectDelaysMs = parseReconnectDelays(options.reconnectDelaysMs);
  }

  /** Starts or resumes realtime delivery. A fresh ticket is requested for every attempt. */
  connect(): Promise<void> {
    this.shouldReconnect = true;
    this.clearReconnectTimer();
    if (this.socket && (this.socket.readyState === 0 || this.socket.readyState === 1)) return Promise.resolve();
    if (this.openingPromise) return this.openingPromise;

    const opening = this.openConnection();
    this.openingPromise = opening;
    void opening
      .finally(() => {
        if (this.openingPromise === opening) this.openingPromise = null;
      })
      .catch((): undefined => undefined);
    return opening;
  }

  /** Stops reconnecting and removes every main-process timer. */
  disconnect(): void {
    this.shouldReconnect = false;
    this.connectionRevision += 1;
    this.openingPromise = null;
    this.clearReconnectTimer();
    this.clearConnectionTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket) this.safeClose(socket, 1_000, 'client disconnect');
    this.reconnectAttempt = 0;
    this.setState('DISCONNECTED');
  }

  /** Sends a validated text or image command and returns its main-process request ID. */
  sendMessage(request: CustomerServiceSendMessageRequest): string {
    const parsed = CUSTOMER_SERVICE_COMMAND_SCHEMAS.sendMessage.parse(request);
    const requestId = randomUUID();
    const { conversationId, ...payload } = parsed;
    this.sendFrame({ event: 'message.send', requestId, conversationId, payload });
    return requestId;
  }

  subscribe(listener: CustomerServiceSocketEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  subscribeState(listener: CustomerServiceSocketStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  getSnapshot(unreadCount = 0): CustomerServiceConnectionSnapshot {
    return { state: this.state, reconnectAttempt: this.reconnectAttempt, unreadCount };
  }

  private async openConnection(): Promise<void> {
    const revision = ++this.connectionRevision;
    this.setState(this.reconnectAttempt > 0 ? 'RECONNECTING' : 'CONNECTING');

    try {
      const ticket = customerServiceWebSocketTicketSchema.parse(await this.ticketProvider());
      if (!this.shouldReconnect || revision !== this.connectionRevision) return;
      const socket = this.socketFactory(this.buildWebSocketUrl(ticket.ticket));
      this.socket = socket;

      socket.on('open', () => {
        if (!this.isCurrentSocket(socket, revision)) return;
        this.armInactivityTimeout(socket, revision);
      });
      socket.on('message', (data) => {
        if (!this.isCurrentSocket(socket, revision)) return;
        this.handleServerFrame(socket, revision, data);
      });
      socket.on('error', () => {
        if (this.isCurrentSocket(socket, revision)) this.safeClose(socket, 4_001, 'socket error');
      });
      socket.on('close', () => {
        if (!this.isCurrentSocket(socket, revision)) return;
        this.socket = null;
        this.clearConnectionTimers();
        if (this.shouldReconnect) this.scheduleReconnect();
        else this.setState('DISCONNECTED');
      });
    } catch (error) {
      if (!this.shouldReconnect || revision !== this.connectionRevision) return;
      this.scheduleReconnect();
      if (error instanceof CustomerServiceApiError) throw error;
      throw new CustomerServiceApiError('WEBSOCKET_ERROR');
    }
  }

  private handleServerFrame(socket: CustomerServiceSocketAdapter, revision: number, raw: unknown): void {
    let parsed: CustomerServiceServerEnvelope;
    try {
      const text = frameToText(raw);
      if (Buffer.byteLength(text, 'utf8') > MAX_SERVER_FRAME_BYTES) throw new Error('oversized');
      const json: unknown = JSON.parse(text);
      parsed = customerServiceServerEnvelopeSchema.parse(json) as CustomerServiceServerEnvelope;
    } catch {
      this.safeClose(socket, 4_002, 'invalid server event');
      return;
    }

    this.armInactivityTimeout(socket, revision);
    if (!this.rememberEvent(parsed.eventId)) return;
    if (parsed.event === 'connection.ready') {
      const payload = parsed.payload as CustomerServiceConnectionReadyPayload;
      const heartbeatMs = Math.max(1_000, Math.min(300_000, payload.heartbeatIntervalSeconds * 1_000));
      this.reconnectAttempt = 0;
      this.setState('CONNECTED');
      this.startHeartbeat(socket, revision, heartbeatMs);
    }
    for (const listener of this.eventListeners) {
      try {
        listener(parsed);
      } catch {
        // A renderer subscriber cannot stop the transport state machine.
      }
    }
  }

  private sendFrame(frame: unknown): void {
    if (!this.socket || this.socket.readyState !== 1 || this.state !== 'CONNECTED') {
      throw new CustomerServiceApiError('NOT_CONNECTED');
    }
    this.socket.send(JSON.stringify(frame));
  }

  private startHeartbeat(socket: CustomerServiceSocketAdapter, revision: number, intervalMs: number): void {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = setInterval(() => {
      if (!this.isCurrentSocket(socket, revision) || socket.readyState !== 1) return;
      try {
        this.sendFrame({ event: 'ping', requestId: randomUUID(), payload: {} });
      } catch {
        this.safeClose(socket, 4_003, 'heartbeat failed');
      }
    }, intervalMs);
  }

  private armInactivityTimeout(socket: CustomerServiceSocketAdapter, revision: number): void {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      if (this.isCurrentSocket(socket, revision)) this.safeClose(socket, 4_000, 'heartbeat timeout');
    }, INACTIVITY_TIMEOUT_MS);
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer) return;
    this.setState('RECONNECTING');
    const index = Math.min(this.reconnectAttempt, this.reconnectDelaysMs.length - 1);
    const delay = this.reconnectDelaysMs[index] as number;
    this.reconnectAttempt += 1;
    this.emitState();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch((): undefined => undefined);
    }, delay);
  }

  private buildWebSocketUrl(ticket: string): string {
    const url = new URL(CUSTOMER_SERVICE_WEBSOCKET_PATH, this.baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', ticket);
    return url.toString();
  }

  private rememberEvent(eventId: string): boolean {
    if (this.recentEventIds.has(eventId)) return false;
    this.recentEventIds.add(eventId);
    if (this.recentEventIds.size > MAX_RECENT_EVENT_IDS) {
      const oldest = this.recentEventIds.values().next().value;
      if (typeof oldest === 'string') this.recentEventIds.delete(oldest);
    }
    return true;
  }

  private isCurrentSocket(socket: CustomerServiceSocketAdapter, revision: number): boolean {
    return this.socket === socket && this.connectionRevision === revision;
  }

  private setState(state: CustomerServiceConnectionState): void {
    this.state = state;
    this.emitState();
  }

  private emitState(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.stateListeners) {
      try {
        listener(snapshot);
      } catch {
        // State observers are isolated from transport cleanup.
      }
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearConnectionTimers(): void {
    this.clearHeartbeatTimer();
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = null;
  }

  private safeClose(socket: CustomerServiceSocketAdapter, code: number, reason: string): void {
    try {
      socket.close(code, reason);
    } catch {
      // A failed close cannot restore a compromised or stale connection.
    }
  }
}
