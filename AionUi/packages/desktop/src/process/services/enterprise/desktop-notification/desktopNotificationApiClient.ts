import type { z } from 'zod';

import {
  DESKTOP_NOTIFICATION_API_BASE_URLS,
  DESKTOP_NOTIFICATION_CONTROLLER_PATH,
} from '@/common/enterprise/desktop-notification/constants';
import type {
  DesktopNotificationChangedResult,
  DesktopNotificationFailureCode,
  DesktopNotificationListRequest,
  DesktopNotificationMarkAllReadResult,
  DesktopNotificationPage,
  DesktopNotificationUnreadCount,
  DesktopNotificationWebSocketTicket,
} from '@/common/enterprise/desktop-notification/contracts';
import {
  desktopNotificationChangedResultSchema,
  desktopNotificationCommonResultSchema,
  desktopNotificationMarkAllReadResultSchema,
  desktopNotificationPageSchema,
  desktopNotificationUnreadCountSchema,
  desktopNotificationWebSocketTicketSchema,
} from '@/common/enterprise/desktop-notification/schemas';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const SUCCESS_CODE = 2_000;

export type DesktopNotificationApiEnvironment = keyof typeof DESKTOP_NOTIFICATION_API_BASE_URLS;
export type DesktopNotificationApiTransport = (url: string, init: RequestInit) => Promise<Response>;

export type DesktopNotificationApiClientOptions = {
  baseUrl?: string;
  environment?: DesktopNotificationApiEnvironment;
  timeoutMs?: number;
  transport?: DesktopNotificationApiTransport;
};

/** Sanitized transport failure. Its fields never contain OpenID or websocket tickets. */
export class DesktopNotificationApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super(`Desktop notification API failed: ${code}.`);
    this.name = 'DesktopNotificationApiError';
    this.code = code;
    this.status = status;
  }
}

const apiError = (code: string, status = 0): DesktopNotificationApiError =>
  new DesktopNotificationApiError(code, status);

const defaultTransport: DesktopNotificationApiTransport = async (url, init) => {
  const { net } = await import('electron');
  return net.fetch(url, init);
};

/** Resolves the fixed desktop-notification API origin for local and packaged Electron runs. */
export const resolveDesktopNotificationApiClientOptions = (isPackaged: boolean): DesktopNotificationApiClientOptions =>
  isPackaged
    ? { baseUrl: DESKTOP_NOTIFICATION_API_BASE_URLS.production, environment: 'production' }
    : { baseUrl: DESKTOP_NOTIFICATION_API_BASE_URLS.development, environment: 'development' };

const normalizeBaseUrl = (baseUrl: string, environment: DesktopNotificationApiEnvironment): string => {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw apiError('INVALID_BASE_URL');
  }

  const expected = new URL(DESKTOP_NOTIFICATION_API_BASE_URLS[environment]);
  const matchesFixedOrigin =
    parsed.protocol === expected.protocol &&
    parsed.hostname === expected.hostname &&
    parsed.port === expected.port &&
    parsed.pathname === '/' &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.search === '' &&
    parsed.hash === '';
  if (!matchesFixedOrigin) throw apiError('INVALID_BASE_URL');
  return parsed.toString();
};

const parseOpenId = (value: unknown): string => {
  if (typeof value !== 'string') throw apiError('MISSING_ENTERPRISE_SESSION', 401);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /\p{C}/u.test(normalized)) {
    throw apiError('MISSING_ENTERPRISE_SESSION', 401);
  }
  return normalized;
};

const extractFailureCode = (data: unknown, status: number): string => {
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const descriptor = Object.getOwnPropertyDescriptor(data, 'errorCode');
    if (typeof descriptor?.value === 'string' && descriptor.value.length <= 100) return descriptor.value;
  }
  return status >= 500 ? 'HTTP' : 'API_FAILURE';
};

/**
 * Electron-main-only client. The legacy desktop login sends OpenID in the request body,
 * while this client ensures it can never be supplied by the renderer.
 */
export class DesktopNotificationApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly transport: DesktopNotificationApiTransport;

  constructor(options: DesktopNotificationApiClientOptions = {}) {
    const environment = options.environment ?? 'production';
    if (environment !== 'development' && environment !== 'production') throw apiError('INVALID_BASE_URL');
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DESKTOP_NOTIFICATION_API_BASE_URLS[environment], environment);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > MAX_TIMEOUT_MS) {
      throw apiError('INVALID_REQUEST');
    }
    this.transport = options.transport ?? defaultTransport;
  }

  issueWebSocketTicket(openId: string): Promise<DesktopNotificationWebSocketTicket> {
    return this.postJson('getWsTicket', { openId: parseOpenId(openId) }, desktopNotificationWebSocketTicketSchema);
  }

  list(openId: string, request: DesktopNotificationListRequest): Promise<DesktopNotificationPage> {
    return this.postJson('list', { openId: parseOpenId(openId), ...request }, desktopNotificationPageSchema);
  }

  getUnreadCount(openId: string): Promise<DesktopNotificationUnreadCount> {
    return this.postJson('getUnreadCount', { openId: parseOpenId(openId) }, desktopNotificationUnreadCountSchema);
  }

  markRead(openId: string, notificationId: string): Promise<DesktopNotificationChangedResult> {
    return this.postJson(
      'markRead',
      { openId: parseOpenId(openId), notificationId },
      desktopNotificationChangedResultSchema
    );
  }

  markAllRead(openId: string): Promise<DesktopNotificationMarkAllReadResult> {
    return this.postJson('markAllRead', { openId: parseOpenId(openId) }, desktopNotificationMarkAllReadResultSchema);
  }

  acknowledgeDelivery(openId: string, notificationId: string): Promise<DesktopNotificationChangedResult> {
    return this.postJson(
      'deliveryAck',
      { openId: parseOpenId(openId), notificationId },
      desktopNotificationChangedResultSchema
    );
  }

  markDesktopNotified(openId: string, notificationId: string): Promise<DesktopNotificationChangedResult> {
    return this.postJson(
      'desktopNotified',
      { openId: parseOpenId(openId), notificationId },
      desktopNotificationChangedResultSchema
    );
  }

  reportDeliveryFailure(
    openId: string,
    notificationId: string,
    failureCode: DesktopNotificationFailureCode
  ): Promise<DesktopNotificationChangedResult> {
    return this.postJson(
      'deliveryFailed',
      { openId: parseOpenId(openId), notificationId, failureCode },
      desktopNotificationChangedResultSchema
    );
  }

  private postJson<T>(endpoint: string, body: unknown, responseSchema: z.ZodTypeAny): Promise<T> {
    return this.request<T>(endpoint, responseSchema, {
      method: 'POST',
      redirect: 'error',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private request<T>(endpoint: string, responseSchema: z.ZodTypeAny, init: RequestInit): Promise<T> {
    const url = new URL(endpoint, new URL(DESKTOP_NOTIFICATION_CONTROLLER_PATH, this.baseUrl)).toString();
    return this.withDeadline(async (signal) => {
      const response = await this.transport(url, { ...init, signal });
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        if (signal.aborted) throw apiError('TIMEOUT');
        throw apiError('INVALID_RESPONSE', response.status);
      }

      const envelope = desktopNotificationCommonResultSchema.safeParse(json);
      if (!envelope.success) throw apiError('INVALID_RESPONSE', response.status);
      if (!response.ok || envelope.data.success !== true || envelope.data.code !== SUCCESS_CODE) {
        throw apiError(extractFailureCode(envelope.data.data, response.status), response.status);
      }
      const parsed = responseSchema.safeParse(envelope.data.data);
      if (!parsed.success) throw apiError('INVALID_RESPONSE', response.status);
      return parsed.data as T;
    });
  }

  private async withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(apiError('TIMEOUT'));
      }, this.timeoutMs);
    });
    const requestPromise = Promise.resolve().then(() => operation(controller.signal));
    try {
      return await Promise.race([requestPromise, timeoutPromise]);
    } catch (error) {
      if (controller.signal.aborted) throw apiError('TIMEOUT');
      if (error instanceof DesktopNotificationApiError) throw error;
      throw apiError('NETWORK');
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }
}
