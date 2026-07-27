import {
  DESKTOP_NOTIFICATION_API_BASE_URLS,
  DESKTOP_NOTIFICATION_RECONNECT_DELAYS_MS,
  DESKTOP_NOTIFICATION_WEBSOCKET_PATH,
} from '@/common/enterprise/desktop-notification/constants';
import type {
  DesktopNotificationConnectionReadyPayload,
  DesktopNotificationConnectionSnapshot,
  DesktopNotificationConnectionState,
  DesktopNotificationServerEnvelope,
  DesktopNotificationWebSocketTicket,
} from '@/common/enterprise/desktop-notification/contracts';
import {
  desktopNotificationServerEnvelopeSchema,
  desktopNotificationWebSocketTicketSchema,
} from '@/common/enterprise/desktop-notification/schemas';
import { createEnterpriseWebSocket } from '@process/services/enterprise/enterpriseWebSocketFactory';

import { DesktopNotificationApiError } from './desktopNotificationApiClient';

const INACTIVITY_TIMEOUT_MS = 60_000;
const MAX_SERVER_FRAME_BYTES = 1024 * 1024;
const MAX_RECENT_EVENT_IDS = 2_000;

type DesktopNotificationSocketEvent = 'close' | 'error' | 'message' | 'open';
type DesktopNotificationSocketListener = (...args: unknown[]) => void;

/** Minimal injectable `ws` surface used by deterministic main-process unit tests. */
export type DesktopNotificationSocketAdapter = {
  readyState: number;
  on: (event: DesktopNotificationSocketEvent, listener: DesktopNotificationSocketListener) => unknown;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

export type DesktopNotificationSocketClientOptions = {
  baseUrl: string;
  ticketProvider: () => Promise<DesktopNotificationWebSocketTicket>;
  socketFactory?: (url: string) => DesktopNotificationSocketAdapter;
  reconnectDelaysMs?: readonly number[];
};

export type DesktopNotificationSocketEventListener = (event: DesktopNotificationServerEnvelope) => void;
export type DesktopNotificationSocketStateListener = (snapshot: DesktopNotificationConnectionSnapshot) => void;

const defaultSocketFactory = (url: string): DesktopNotificationSocketAdapter =>
  createEnterpriseWebSocket(url) as unknown as DesktopNotificationSocketAdapter;

const normalizeSocketBaseUrl = (baseUrl: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new DesktopNotificationApiError('INVALID_BASE_URL');
  }
  const allowed = Object.values(DESKTOP_NOTIFICATION_API_BASE_URLS).some(
    (candidate) => parsed.toString() === candidate
  );
  if (!allowed) throw new DesktopNotificationApiError('INVALID_BASE_URL');
  return parsed.toString();
};

const parseReconnectDelays = (values: readonly number[] | undefined): readonly number[] => {
  const delays = values ?? DESKTOP_NOTIFICATION_RECONNECT_DELAYS_MS;
  if (delays.length === 0 || delays.some((value) => !Number.isInteger(value) || value < 1 || value > 60_000)) {
    throw new DesktopNotificationApiError('INVALID_REQUEST');
  }
  return [...delays];
};

const frameToText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString('utf8');
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8');
  throw new DesktopNotificationApiError('INVALID_RESPONSE');
};

/** Owns the Electron-main WebSocket, one-time tickets, heartbeat, and reconnect policy. */
export class DesktopNotificationSocketClient {
  private readonly baseUrl: string;
  private readonly ticketProvider: () => Promise<DesktopNotificationWebSocketTicket>;
  private readonly socketFactory: (url: string) => DesktopNotificationSocketAdapter;
  private readonly reconnectDelaysMs: readonly number[];
  private readonly eventListeners = new Set<DesktopNotificationSocketEventListener>();
  private readonly stateListeners = new Set<DesktopNotificationSocketStateListener>();
  private readonly recentEventIds = new Set<string>();

  private socket: DesktopNotificationSocketAdapter | null = null;
  private state: DesktopNotificationConnectionState = 'IDLE';
  private shouldReconnect = false;
  private reconnectAttempt = 0;
  private connectionRevision = 0;
  private openingPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: DesktopNotificationSocketClientOptions) {
    this.baseUrl = normalizeSocketBaseUrl(options.baseUrl);
    this.ticketProvider = options.ticketProvider;
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
    this.reconnectDelaysMs = parseReconnectDelays(options.reconnectDelaysMs);
  }

  /** Starts or resumes realtime delivery. A new one-time ticket is requested for each connection attempt. */
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

  /** Stops reconnecting and removes all main-process timers. */
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

  subscribe(listener: DesktopNotificationSocketEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  subscribeState(listener: DesktopNotificationSocketStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  getSnapshot(unreadCount = 0): DesktopNotificationConnectionSnapshot {
    return { state: this.state, reconnectAttempt: this.reconnectAttempt, unreadCount };
  }

  private async openConnection(): Promise<void> {
    const revision = ++this.connectionRevision;
    this.setState(this.reconnectAttempt > 0 ? 'RECONNECTING' : 'CONNECTING');
    try {
      const ticket = desktopNotificationWebSocketTicketSchema.parse(await this.ticketProvider());
      if (!this.shouldReconnect || revision !== this.connectionRevision) return;
      const socket = this.socketFactory(this.buildWebSocketUrl(ticket.ticket));
      this.socket = socket;
      socket.on('open', () => {
        if (this.isCurrentSocket(socket, revision)) this.armInactivityTimeout(socket, revision);
      });
      socket.on('message', (data) => {
        if (this.isCurrentSocket(socket, revision)) this.handleServerFrame(socket, revision, data);
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
      if (error instanceof DesktopNotificationApiError) throw error;
      throw new DesktopNotificationApiError('WEBSOCKET_ERROR');
    }
  }

  private handleServerFrame(socket: DesktopNotificationSocketAdapter, revision: number, raw: unknown): void {
    let parsed: DesktopNotificationServerEnvelope;
    try {
      const text = frameToText(raw);
      if (Buffer.byteLength(text, 'utf8') > MAX_SERVER_FRAME_BYTES) throw new Error('oversized');
      parsed = desktopNotificationServerEnvelopeSchema.parse(JSON.parse(text)) as DesktopNotificationServerEnvelope;
    } catch {
      this.safeClose(socket, 4_002, 'invalid server event');
      return;
    }
    this.armInactivityTimeout(socket, revision);
    if (!this.rememberEvent(parsed.eventId)) return;
    if (parsed.event === 'connection.ready') {
      const payload = parsed.payload as DesktopNotificationConnectionReadyPayload;
      this.reconnectAttempt = 0;
      this.setState('CONNECTED');
      this.startHeartbeat(
        socket,
        revision,
        Math.max(1_000, Math.min(300_000, payload.heartbeatIntervalSeconds * 1_000))
      );
    }
    for (const listener of this.eventListeners) {
      try {
        listener(parsed);
      } catch {
        // Renderer-facing observers are isolated from the transport state machine.
      }
    }
  }

  private startHeartbeat(socket: DesktopNotificationSocketAdapter, revision: number, intervalMs: number): void {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = setInterval(() => {
      if (!this.isCurrentSocket(socket, revision) || socket.readyState !== 1) return;
      try {
        // cloud-api intentionally accepts a minimal, two-field-at-most client
        // envelope. Keeping heartbeat frames to the single required field
        // avoids INVALID_ENVELOPE responses and reconnect gaps during delivery.
        this.sendFrame({ event: 'ping' });
      } catch {
        this.safeClose(socket, 4_003, 'heartbeat failed');
      }
    }, intervalMs);
  }

  private sendFrame(frame: unknown): void {
    if (!this.socket || this.socket.readyState !== 1 || this.state !== 'CONNECTED') {
      throw new DesktopNotificationApiError('NOT_CONNECTED');
    }
    this.socket.send(JSON.stringify(frame));
  }

  private armInactivityTimeout(socket: DesktopNotificationSocketAdapter, revision: number): void {
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
    const url = new URL(DESKTOP_NOTIFICATION_WEBSOCKET_PATH, this.baseUrl);
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

  private isCurrentSocket(socket: DesktopNotificationSocketAdapter, revision: number): boolean {
    return this.socket === socket && this.connectionRevision === revision;
  }

  private setState(state: DesktopNotificationConnectionState): void {
    this.state = state;
    this.emitState();
  }

  private emitState(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.stateListeners) {
      try {
        listener(snapshot);
      } catch {
        // State observers cannot interfere with reconnect cleanup.
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

  private safeClose(socket: DesktopNotificationSocketAdapter, code: number, reason: string): void {
    try {
      socket.close(code, reason);
    } catch {
      // Failed close cannot restore a stale transport, so it is intentionally ignored.
    }
  }
}
