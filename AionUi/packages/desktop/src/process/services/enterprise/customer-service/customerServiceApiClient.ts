import type { z } from 'zod';

import {
  CUSTOMER_SERVICE_API_BASE_URLS,
  CUSTOMER_SERVICE_CONTROLLER_PATH,
  CUSTOMER_SERVICE_ENDPOINTS,
} from '@/common/enterprise/customer-service/constants';
import type {
  CustomerServiceAuthSession,
  CustomerServiceCloseRequest,
  CustomerServiceConversation,
  CustomerServiceConversationIdRequest,
  CustomerServiceConversationListRequest,
  CustomerServiceImage,
  CustomerServiceMessage,
  CustomerServiceMessageHistoryRequest,
  CustomerServicePage,
  CustomerServiceReadResult,
  CustomerServiceStaffCandidate,
  CustomerServiceStaffCandidatesRequest,
  CustomerServiceTransferRequest,
  CustomerServiceUploadImageRequest,
  CustomerServiceWebSocketTicket,
} from '@/common/enterprise/customer-service/contracts';
import {
  CUSTOMER_SERVICE_COMMAND_SCHEMAS,
  customerServiceAuthSessionSchema,
  customerServiceCommonResultSchema,
  customerServiceConversationSchema,
  customerServiceImageSchema,
  customerServiceMessageSchema,
  customerServicePageSchema,
  customerServiceReadResultSchema,
  customerServiceStaffCandidateSchema,
  customerServiceWebSocketTicketSchema,
} from '@/common/enterprise/customer-service/schemas';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const SUCCESS_CODE = 2_000;

export type CustomerServiceApiEnvironment = keyof typeof CUSTOMER_SERVICE_API_BASE_URLS;
export type CustomerServiceApiTransport = (url: string, init: RequestInit) => Promise<Response>;

export type CustomerServiceApiClientOptions = {
  baseUrl?: string;
  environment?: CustomerServiceApiEnvironment;
  timeoutMs?: number;
  transport?: CustomerServiceApiTransport;
};

/** Sanitized transport failure. It never contains tokens, openId, or message bodies. */
export class CustomerServiceApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super(`Customer-service API failed: ${code}.`);
    this.name = 'CustomerServiceApiError';
    this.code = code;
    this.status = status;
  }
}

const apiError = (code: string, status = 0): CustomerServiceApiError => new CustomerServiceApiError(code, status);

const defaultTransport: CustomerServiceApiTransport = async (url, init) => {
  const { net } = await import('electron');
  return net.fetch(url, init);
};

/** Resolves the fixed API origin for packaged and local Electron runtimes. */
export const resolveCustomerServiceApiClientOptions = (isPackaged: boolean): CustomerServiceApiClientOptions =>
  isPackaged
    ? {
        baseUrl: CUSTOMER_SERVICE_API_BASE_URLS.production,
        environment: 'production',
      }
    : {
        baseUrl: CUSTOMER_SERVICE_API_BASE_URLS.development,
        environment: 'development',
      };

const normalizeBaseUrl = (baseUrl: string, environment: CustomerServiceApiEnvironment): string => {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw apiError('INVALID_BASE_URL');
  }

  const expected = new URL(CUSTOMER_SERVICE_API_BASE_URLS[environment]);
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
  if (typeof value !== 'string') throw apiError('INVALID_OPEN_ID');
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /\p{C}/u.test(normalized)) throw apiError('INVALID_OPEN_ID');
  return normalized;
};

const parseAccessToken = (value: unknown): string => {
  if (typeof value !== 'string' || value.length < 16 || value.length > 512 || /\s|\p{C}/u.test(value)) {
    throw apiError('UNAUTHORIZED', 401);
  }
  return value;
};

const extractFailureCode = (data: unknown, status: number): string => {
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const descriptor = Object.getOwnPropertyDescriptor(data, 'errorCode');
    if (typeof descriptor?.value === 'string' && descriptor.value.length <= 100) return descriptor.value;
  }
  return status === 401 ? 'UNAUTHORIZED' : 'API_FAILURE';
};

/** Main-process REST client for the allowlisted customer-service controller. */
export class CustomerServiceApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly transport: CustomerServiceApiTransport;

  constructor(options: CustomerServiceApiClientOptions = {}) {
    const environment = options.environment ?? 'production';
    if (environment !== 'development' && environment !== 'production') throw apiError('INVALID_BASE_URL');
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? CUSTOMER_SERVICE_API_BASE_URLS[environment], environment);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > MAX_TIMEOUT_MS) {
      throw apiError('INVALID_REQUEST');
    }
    this.transport = options.transport ?? defaultTransport;
  }

  /** Authenticates a customer; the returned token stays in main-process memory. */
  authenticateCustomer(openId: string): Promise<CustomerServiceAuthSession> {
    return this.postJson<CustomerServiceAuthSession>(
      CUSTOMER_SERVICE_ENDPOINTS.customerAuth,
      { openId: parseOpenId(openId) },
      customerServiceAuthSessionSchema
    );
  }

  /** Authenticates from the persisted enterprise openId; the returned token stays in main-process memory. */
  authenticateStaff(openId: string): Promise<CustomerServiceAuthSession> {
    return this.postJson<CustomerServiceAuthSession>(
      CUSTOMER_SERVICE_ENDPOINTS.staffAuth,
      { openId: parseOpenId(openId) },
      customerServiceAuthSessionSchema
    );
  }

  /** Creates or resumes the authenticated customer's single open conversation. */
  openConversation(accessToken: string): Promise<CustomerServiceConversation> {
    return this.postJson<CustomerServiceConversation>(
      CUSTOMER_SERVICE_ENDPOINTS.conversationOpen,
      {},
      customerServiceConversationSchema,
      accessToken
    );
  }

  listConversations(
    accessToken: string,
    request: CustomerServiceConversationListRequest
  ): Promise<CustomerServicePage<CustomerServiceConversation>> {
    return this.postJson<CustomerServicePage<CustomerServiceConversation>>(
      CUSTOMER_SERVICE_ENDPOINTS.conversationList,
      CUSTOMER_SERVICE_COMMAND_SCHEMAS.listConversations.parse(request),
      customerServicePageSchema(customerServiceConversationSchema),
      accessToken
    );
  }

  getConversation(
    accessToken: string,
    request: CustomerServiceConversationIdRequest
  ): Promise<CustomerServiceConversation> {
    return this.postJson<CustomerServiceConversation>(
      CUSTOMER_SERVICE_ENDPOINTS.conversationDetail,
      CUSTOMER_SERVICE_COMMAND_SCHEMAS.getConversation.parse(request),
      customerServiceConversationSchema,
      accessToken
    );
  }

  getHistory(
    accessToken: string,
    request: CustomerServiceMessageHistoryRequest
  ): Promise<CustomerServicePage<CustomerServiceMessage>> {
    return this.postJson<CustomerServicePage<CustomerServiceMessage>>(
      CUSTOMER_SERVICE_ENDPOINTS.messageHistory,
      CUSTOMER_SERVICE_COMMAND_SCHEMAS.getHistory.parse(request),
      customerServicePageSchema(customerServiceMessageSchema),
      accessToken
    );
  }

  markRead(
    accessToken: string,
    request: { conversationId: string; messageId: string }
  ): Promise<CustomerServiceReadResult> {
    return this.postJson<CustomerServiceReadResult>(
      CUSTOMER_SERVICE_ENDPOINTS.messageRead,
      CUSTOMER_SERVICE_COMMAND_SCHEMAS.markRead.parse(request),
      customerServiceReadResultSchema,
      accessToken
    );
  }

  uploadImage(accessToken: string, request: CustomerServiceUploadImageRequest): Promise<CustomerServiceImage> {
    const parsed = CUSTOMER_SERVICE_COMMAND_SCHEMAS.uploadImage.parse(request) as CustomerServiceUploadImageRequest;
    const form = new FormData();
    form.append('conversationId', parsed.conversationId);
    const isolatedBytes = Uint8Array.from(parsed.bytes);
    form.append('file', new Blob([isolatedBytes.buffer], { type: parsed.mimeType }), parsed.fileName);
    return this.postMultipart<CustomerServiceImage>(
      CUSTOMER_SERVICE_ENDPOINTS.imageUpload,
      form,
      customerServiceImageSchema,
      accessToken
    );
  }

  listCandidates(
    accessToken: string,
    request: CustomerServiceStaffCandidatesRequest
  ): Promise<CustomerServicePage<CustomerServiceStaffCandidate>> {
    return this.postJson<CustomerServicePage<CustomerServiceStaffCandidate>>(
      CUSTOMER_SERVICE_ENDPOINTS.staffCandidates,
      CUSTOMER_SERVICE_COMMAND_SCHEMAS.listCandidates.parse(request),
      customerServicePageSchema(customerServiceStaffCandidateSchema),
      accessToken
    );
  }

  transferConversation(
    accessToken: string,
    request: CustomerServiceTransferRequest
  ): Promise<CustomerServiceConversation> {
    return this.postJson<CustomerServiceConversation>(
      CUSTOMER_SERVICE_ENDPOINTS.conversationTransfer,
      CUSTOMER_SERVICE_COMMAND_SCHEMAS.transferConversation.parse(request),
      customerServiceConversationSchema,
      accessToken
    );
  }

  closeConversation(accessToken: string, request: CustomerServiceCloseRequest): Promise<CustomerServiceConversation> {
    return this.postJson<CustomerServiceConversation>(
      CUSTOMER_SERVICE_ENDPOINTS.conversationClose,
      CUSTOMER_SERVICE_COMMAND_SCHEMAS.closeConversation.parse(request),
      customerServiceConversationSchema,
      accessToken
    );
  }

  issueWebSocketTicket(accessToken: string): Promise<CustomerServiceWebSocketTicket> {
    return this.postJson<CustomerServiceWebSocketTicket>(
      CUSTOMER_SERVICE_ENDPOINTS.websocketTicket,
      {},
      customerServiceWebSocketTicketSchema,
      accessToken
    );
  }

  private postJson<T>(endpoint: string, body: unknown, responseSchema: z.ZodTypeAny, accessToken?: string): Promise<T> {
    return this.request<T>(endpoint, responseSchema, accessToken, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  private postMultipart<T>(
    endpoint: string,
    body: FormData,
    responseSchema: z.ZodTypeAny,
    accessToken: string
  ): Promise<T> {
    return this.request<T>(endpoint, responseSchema, accessToken, {
      method: 'POST',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      body,
    });
  }

  private request<T>(
    endpoint: string,
    responseSchema: z.ZodTypeAny,
    accessToken: string | undefined,
    init: RequestInit
  ): Promise<T> {
    const url = new URL(endpoint, new URL(CUSTOMER_SERVICE_CONTROLLER_PATH, this.baseUrl)).toString();
    const headers = new Headers(init.headers);
    if (accessToken !== undefined) headers.set('Authorization', `Bearer ${parseAccessToken(accessToken)}`);

    return this.withDeadline(async (signal) => {
      const response = await this.transport(url, { ...init, headers, signal });
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        if (signal.aborted) throw apiError('TIMEOUT');
        throw apiError('INVALID_RESPONSE', response.status);
      }

      const envelope = customerServiceCommonResultSchema.safeParse(json);
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
      if (error instanceof CustomerServiceApiError) throw error;
      throw apiError('NETWORK');
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }
}
