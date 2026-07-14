import { z } from 'zod';

import type {
  EnterpriseLoginPollResult,
  EnterpriseLoginSession,
  EnterpriseRequest,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '@/common/enterprise/contracts';
import { ENTERPRISE_REGISTRATION_URL } from '@/common/enterprise/constants';
import {
  commonResultSchema,
  enterpriseRequestSchema,
  enterpriseLoginStatusSchema,
  normalizeEnterpriseUserContext,
  parseEnterpriseResponse,
} from '@/common/enterprise/schemas';

import { ENTERPRISE_API_ROUTES, type EnterpriseApiRouteKey } from './enterpriseApiRoutes';

const DEFAULT_BASE_URL = 'https://cloud.lslnii.com/';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const MAX_LOGIN_EXPIRY_MS = 330_000;
const MAX_QR_BYTES = 2 * 1024 * 1024;
const QR_PATHNAME = '/cloud-api/CommonWxGZHQrCodeLogIn/ln1433/getNewJJGCLoginQRCode_ln1433';
const LOGIN_KEY_PATTERN = /^enterprise_desktop_[A-Za-z0-9]{18}$/;
const PNG_MAGIC = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FORBIDDEN_ENVELOPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const loginSessionResponseSchema = z.object({
  loginKey: z.string().regex(LOGIN_KEY_PATTERN),
  qrPath: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  pollIntervalMs: z.number().int().min(1000).max(10_000),
});

const loginPollResponseSchema = z.object({
  status: enterpriseLoginStatusSchema,
  openId: z.string().optional(),
  userContext: z.unknown().optional(),
});

const commonFailureResultSchema = z
  .object({
    success: z.literal(false),
    data: z.unknown(),
    message: z.string(),
    code: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export type EnterpriseApiEnvironment = 'production' | 'development';

export type EnterpriseApiTransport = (url: string, init: RequestInit) => Promise<Response>;

export type EnterpriseApiErrorCode =
  | 'INVALID_BASE_URL'
  | 'INVALID_REQUEST'
  | 'MISSING_CONTEXT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'HTTP'
  | 'INVALID_JSON'
  | 'API_FAILURE'
  | 'INVALID_RESPONSE';

export type EnterpriseApiClientOptions = {
  baseUrl?: string;
  environment?: EnterpriseApiEnvironment;
  timeoutMs?: number;
  transport?: EnterpriseApiTransport;
};

/** A sanitized enterprise API failure with a stable machine-readable code. */
export class EnterpriseApiError extends Error {
  readonly code: EnterpriseApiErrorCode;

  constructor(code: EnterpriseApiErrorCode, message: string) {
    super(message);
    this.name = 'EnterpriseApiError';
    this.code = code;
  }
}

type EnterpriseRequestBody = Record<string, string | number | boolean>;

const errorMessages: Record<EnterpriseApiErrorCode, string> = {
  INVALID_BASE_URL: 'Enterprise API base URL is not allowed.',
  INVALID_REQUEST: 'Enterprise API request is invalid.',
  MISSING_CONTEXT: 'Enterprise API user context is incomplete.',
  TIMEOUT: 'Enterprise API request timed out.',
  NETWORK: 'Enterprise API request failed.',
  HTTP: 'Enterprise API request returned an unsuccessful HTTP status.',
  INVALID_JSON: 'Enterprise API response is not valid JSON.',
  API_FAILURE: 'Enterprise API rejected the request.',
  INVALID_RESPONSE: 'Enterprise API response is invalid.',
};

const apiError = (code: EnterpriseApiErrorCode): EnterpriseApiError =>
  new EnterpriseApiError(code, errorMessages[code]);

const normalizeBaseUrl = (baseUrl: string, environment: EnterpriseApiEnvironment): string => {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw apiError('INVALID_BASE_URL');
  }

  const hasUnsafeComponents =
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.pathname !== '/';
  if (hasUnsafeComponents) throw apiError('INVALID_BASE_URL');

  const isProductionCloud =
    parsed.protocol === 'https:' && parsed.hostname === 'cloud.lslnii.com' && parsed.port === '';
  if (environment === 'production') {
    if (!isProductionCloud) throw apiError('INVALID_BASE_URL');
  } else {
    const isLocalDevelopment =
      ['http:', 'https:'].includes(parsed.protocol) && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (!isProductionCloud && !isLocalDevelopment) throw apiError('INVALID_BASE_URL');
  }

  return parsed.toString();
};

const defaultTransport: EnterpriseApiTransport = async (url, init) => {
  const { net } = await import('electron');
  return net.fetch(url, init);
};

const setDefined = (target: EnterpriseRequestBody, key: string, value: string | number | boolean | undefined): void => {
  if (value !== undefined) target[key] = value;
};

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

const requireRegisteredIdentity = (context: EnterpriseUserContext): void => {
  if (context?.registered !== true || !hasText(context.openId)) throw apiError('MISSING_CONTEXT');
};

const requireCompanyIdentity = (context: EnterpriseUserContext): void => {
  requireRegisteredIdentity(context);
  if (!hasText(context.userId) || !hasText(context.companyId)) throw apiError('MISSING_CONTEXT');
};

const requireProductDetailIdentity = (context: EnterpriseUserContext): void => {
  requireRegisteredIdentity(context);
  if (!hasText(context.userId)) throw apiError('MISSING_CONTEXT');
};

const requireProjectIdentity = (context: EnterpriseUserContext): void => {
  requireRegisteredIdentity(context);
  if (!hasText(context.companyId)) throw apiError('MISSING_CONTEXT');
};

const serializeCompanyList = (
  request: Extract<EnterpriseRequest, { operation: 'company.list' }>,
  context: EnterpriseUserContext
): EnterpriseRequestBody => {
  requireCompanyIdentity(context);
  const { payload } = request;
  const body: EnterpriseRequestBody = {
    pageNum: payload.pageNum,
    pageSize: payload.pageSize,
    openId: context.openId,
    fromCompanyId: context.companyId as string,
    fromUserId: context.userId as string,
  };
  setDefined(body, 'name', payload.keyword);
  setDefined(body, 'industry', payload.industry);
  setDefined(body, 'city', payload.city);
  setDefined(body, 'district', payload.district);
  setDefined(body, 'comLevel', payload.companyLevel ?? (payload.vip === true ? -2 : undefined));
  setDefined(body, 'vip', payload.vip);
  return body;
};

const serializeCompanyDetail = (
  request: Extract<EnterpriseRequest, { operation: 'company.detail' }>,
  context: EnterpriseUserContext
): EnterpriseRequestBody => {
  requireCompanyIdentity(context);
  return {
    id: request.payload.companyId,
    openId: context.openId,
    userId: context.userId as string,
    fromCompanyId: context.companyId as string,
    pageNum: 1,
    pageSize: 10,
  };
};

const serializeProductList = (
  request: Extract<EnterpriseRequest, { operation: 'product.list' }>,
  context: EnterpriseUserContext
): EnterpriseRequestBody => {
  requireCompanyIdentity(context);
  const { payload } = request;
  const body: EnterpriseRequestBody = {
    pageNum: payload.pageNum,
    pageSize: payload.pageSize,
    openId: context.openId,
    fromCompanyId: context.companyId as string,
    fromUserId: context.userId as string,
  };
  setDefined(body, 'name', payload.keyword);
  setDefined(body, 'industry', payload.industry);
  setDefined(body, 'companyId', payload.companyId);
  setDefined(body, 'parkId', payload.parkId);
  setDefined(body, 'sorted', payload.sort);
  return body;
};

const serializeProductDetail = (
  request: Extract<EnterpriseRequest, { operation: 'product.detail' }>,
  context: EnterpriseUserContext
): EnterpriseRequestBody => {
  requireProductDetailIdentity(context);
  return {
    id: request.payload.productId,
    userId: context.userId as string,
  };
};

const serializeProjectRequest = (
  request: Extract<EnterpriseRequest, { operation: `project.${string}` }>,
  context: EnterpriseUserContext
): EnterpriseRequestBody => {
  requireProjectIdentity(context);
  const body: EnterpriseRequestBody = {
    openId: context.openId,
    companyId: context.companyId as string,
  };

  switch (request.operation) {
    case 'project.dashboard':
      setDefined(body, 'runId', request.payload.runId);
      return body;
    case 'project.drill':
      setDefined(body, 'level', request.payload.level);
      setDefined(body, 'runId', request.payload.runId);
      setDefined(body, 'province', request.payload.province);
      setDefined(body, 'city', request.payload.city);
      setDefined(body, 'budgetRange', request.payload.budgetRange);
      setDefined(body, 'categoryL1', request.payload.categoryL1);
      setDefined(body, 'categoryL2', request.payload.categoryL2);
      setDefined(body, 'materialShortName', request.payload.materialShortName);
      setDefined(body, 'materialName', request.payload.materialName);
      setDefined(body, 'minProjectCount', request.payload.minProjectCount);
      return body;
    case 'project.list':
      setDefined(body, 'keyword', request.payload.keyword);
      setDefined(body, 'runId', request.payload.runId);
      setDefined(body, 'categoryL1', request.payload.categoryL1);
      setDefined(body, 'categoryL2', request.payload.categoryL2);
      setDefined(body, 'materialShortName', request.payload.materialShortName);
      setDefined(body, 'materialName', request.payload.materialName);
      setDefined(body, 'province', request.payload.province);
      setDefined(body, 'city', request.payload.city);
      setDefined(body, 'budgetRange', request.payload.budgetRange);
      setDefined(body, 'constructionNature', request.payload.constructionNature);
      setDefined(body, 'investmentType', request.payload.investmentType);
      setDefined(body, 'publishedFrom', request.payload.publishedFrom);
      setDefined(body, 'publishedTo', request.payload.publishedTo);
      setDefined(body, 'pageNum', request.payload.pageNum);
      setDefined(body, 'pageSize', request.payload.pageSize);
      return body;
    case 'project.detail':
      setDefined(body, 'hpInfoId', request.payload.hpInfoId);
      return body;
  }
};

const serializeRequest = (request: EnterpriseRequest, context: EnterpriseUserContext): EnterpriseRequestBody => {
  switch (request.operation) {
    case 'company.list':
      return serializeCompanyList(request, context);
    case 'company.detail':
      return serializeCompanyDetail(request, context);
    case 'product.list':
      return serializeProductList(request, context);
    case 'product.detail':
      return serializeProductDetail(request, context);
    case 'project.dashboard':
    case 'project.drill':
    case 'project.list':
    case 'project.detail':
      return serializeProjectRequest(request, context);
  }
};

const sanitizeEnvelope = (input: unknown): Record<string, unknown> | undefined => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;

  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return undefined;

    const sanitized = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string' || FORBIDDEN_ENVELOPE_KEYS.has(key)) return undefined;

      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || 'get' in descriptor || 'set' in descriptor) return undefined;
      if (!descriptor.enumerable) continue;
      Object.defineProperty(sanitized, key, {
        value: descriptor.value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    for (const key in input) {
      if (!Object.hasOwn(input, key)) return undefined;
    }
    return sanitized;
  } catch {
    return undefined;
  }
};

const sanitizeAuthObject = (
  input: unknown,
  depth = 0,
  ancestors: WeakSet<object> = new WeakSet()
): Record<string, unknown> | undefined => {
  if (depth > 4 || typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  if (ancestors.has(input)) return undefined;
  ancestors.add(input);

  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return undefined;

    const sanitized = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string' || FORBIDDEN_ENVELOPE_KEYS.has(key)) return undefined;

      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || 'get' in descriptor || 'set' in descriptor) return undefined;
      if (!descriptor.enumerable) continue;

      let value = descriptor.value;
      if (typeof value === 'object' && value !== null) {
        value = sanitizeAuthObject(value, depth + 1, ancestors);
        if (!value) return undefined;
      }
      Object.defineProperty(sanitized, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    for (const key in input) {
      if (!Object.hasOwn(input, key)) return undefined;
    }
    return sanitized;
  } catch {
    return undefined;
  } finally {
    ancestors.delete(input);
  }
};

const unwrapCommonResult = (input: unknown): unknown => {
  const sanitized = sanitizeEnvelope(input);
  if (!sanitized) throw apiError('INVALID_RESPONSE');

  if (sanitized.success === false) {
    if (
      !Object.hasOwn(sanitized, 'success') ||
      !Object.hasOwn(sanitized, 'data') ||
      !Object.hasOwn(sanitized, 'message')
    ) {
      throw apiError('INVALID_RESPONSE');
    }
    const failureResult = commonFailureResultSchema.safeParse(sanitized);
    if (!failureResult.success) throw apiError('INVALID_RESPONSE');
    throw apiError('API_FAILURE');
  }

  const result = commonResultSchema.safeParse(sanitized);
  if (!result.success) throw apiError('INVALID_RESPONSE');
  return result.data.data;
};

const parseQrUrl = (qrPath: string, baseUrl: string, loginKey: string): string => {
  const queryStart = qrPath.indexOf('?');
  const rawPath = queryStart === -1 ? qrPath : qrPath.slice(0, queryStart);
  const rawQuery = queryStart === -1 ? '' : qrPath.slice(queryStart + 1).split('#', 1)[0];
  const hasUnsafeLexicalForm =
    qrPath !== qrPath.trim() ||
    qrPath.includes('\\') ||
    queryStart === -1 ||
    qrPath.indexOf('?', queryStart + 1) !== -1 ||
    /(^|\/)\.{1,2}(\/|$)/.test(rawPath) ||
    rawQuery.split('&').length !== 2 ||
    rawQuery.split('&').some((segment) => segment === '');
  if (hasUnsafeLexicalForm) throw apiError('INVALID_RESPONSE');

  let parsed: URL;
  try {
    parsed = new URL(qrPath, baseUrl);
  } catch {
    throw apiError('INVALID_RESPONSE');
  }

  const base = new URL(baseUrl);
  const queryKeys = [...parsed.searchParams.keys()];
  const isValid =
    parsed.origin === base.origin &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.hash === '' &&
    parsed.pathname === QR_PATHNAME &&
    !parsed.pathname.includes('%') &&
    !parsed.search.includes('%') &&
    queryKeys.length === 2 &&
    parsed.searchParams.getAll('ratio').length === 1 &&
    parsed.searchParams.get('ratio') === '8' &&
    parsed.searchParams.getAll('front_sign').length === 1 &&
    parsed.searchParams.get('front_sign') === loginKey;
  if (!isValid) throw apiError('INVALID_RESPONSE');
  return parsed.toString();
};

const isPng = (bytes: Uint8Array): boolean =>
  bytes.length >= PNG_MAGIC.length && PNG_MAGIC.every((byte, index) => bytes[index] === byte);

/** Main-process client for the fixed Chain Liaoning enterprise API surface. */
export class EnterpriseApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly transport: EnterpriseApiTransport;

  constructor(options: EnterpriseApiClientOptions = {}) {
    const environment = options.environment ?? 'production';
    if (environment !== 'production' && environment !== 'development') throw apiError('INVALID_BASE_URL');
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL, environment);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > MAX_TIMEOUT_MS) {
      throw apiError('INVALID_REQUEST');
    }
    this.transport = options.transport ?? defaultTransport;
  }

  /** Validates a stable request, injects trusted identity, and returns a normalized response. */
  async request(request: EnterpriseRequest, context: EnterpriseUserContext): Promise<EnterpriseResponse> {
    const parsedRequest = enterpriseRequestSchema.safeParse(request);
    if (!parsedRequest.success) throw apiError('INVALID_REQUEST');
    const validRequest = parsedRequest.data as EnterpriseRequest;
    const responseData = await this.post(validRequest.operation, serializeRequest(validRequest, context));

    try {
      return parseEnterpriseResponse(validRequest.operation, responseData);
    } catch {
      throw apiError('INVALID_RESPONSE');
    }
  }

  /** Fetches and normalizes the registered enterprise identity for a WeChat openId. */
  async getUserContext(openId: string): Promise<EnterpriseUserContext> {
    if (!hasText(openId)) throw apiError('INVALID_REQUEST');
    const responseData = await this.post('auth.userContext', { openId: openId.trim() });

    try {
      return normalizeEnterpriseUserContext(responseData);
    } catch {
      throw apiError('INVALID_RESPONSE');
    }
  }

  /** Creates a short-lived desktop login session and returns an embedded, validated QR image. */
  async createLoginSession(): Promise<EnterpriseLoginSession> {
    const responseData = await this.post('auth.create', {});
    const sanitized = sanitizeAuthObject(responseData);
    const parsed = loginSessionResponseSchema.safeParse(sanitized);
    if (!parsed.success) throw apiError('INVALID_RESPONSE');

    const expiresAtMs = Date.parse(parsed.data.expiresAt);
    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs <= 0 || remainingMs > MAX_LOGIN_EXPIRY_MS) throw apiError('INVALID_RESPONSE');

    const qrUrl = parseQrUrl(parsed.data.qrPath, this.baseUrl, parsed.data.loginKey);
    const bytes = await this.downloadQr(qrUrl);
    return {
      loginKey: parsed.data.loginKey,
      qrDataUrl: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,
      expiresAt: parsed.data.expiresAt,
      pollIntervalMs: parsed.data.pollIntervalMs,
    };
  }

  /** Polls a short-lived desktop login session without exposing backend-only fields. */
  async pollLoginSession(loginKey: string): Promise<EnterpriseLoginPollResult> {
    if (typeof loginKey !== 'string' || !LOGIN_KEY_PATTERN.test(loginKey)) throw apiError('INVALID_REQUEST');
    const responseData = await this.post('auth.poll', { loginKey });
    const sanitized = sanitizeAuthObject(responseData);
    const parsed = loginPollResponseSchema.safeParse(sanitized);
    if (!parsed.success) throw apiError('INVALID_RESPONSE');
    let sanitizedContext: Record<string, unknown> | undefined;
    if (typeof parsed.data.userContext === 'object' && parsed.data.userContext !== null) {
      sanitizedContext = sanitizeAuthObject(parsed.data.userContext);
      if (!sanitizedContext) throw apiError('INVALID_RESPONSE');
    }

    if (parsed.data.status === 'WAITING' || parsed.data.status === 'EXPIRED') {
      return { status: parsed.data.status };
    }
    if (parsed.data.status === 'REGISTER_REQUIRED' && hasText(parsed.data.openId)) {
      return {
        status: 'REGISTER_REQUIRED',
        openId: parsed.data.openId,
        registrationUrl: ENTERPRISE_REGISTRATION_URL,
      };
    }
    if (parsed.data.status === 'AUTHENTICATED' && hasText(parsed.data.openId)) {
      if (!sanitizedContext) throw apiError('INVALID_RESPONSE');

      let userContext: EnterpriseUserContext;
      try {
        userContext = normalizeEnterpriseUserContext(sanitizedContext);
      } catch {
        throw apiError('INVALID_RESPONSE');
      }
      const hasRealIdentity =
        userContext.registered === true &&
        userContext.openId === parsed.data.openId &&
        typeof userContext.userId === 'string' &&
        /^[1-9][0-9]*$/.test(userContext.userId) &&
        typeof userContext.companyId === 'string' &&
        /^[1-9][0-9]*$/.test(userContext.companyId);
      if (!hasRealIdentity) throw apiError('INVALID_RESPONSE');
      return { status: 'AUTHENTICATED', openId: parsed.data.openId, userContext };
    }
    throw apiError('INVALID_RESPONSE');
  }

  private async post(routeKey: EnterpriseApiRouteKey, body: EnterpriseRequestBody): Promise<unknown> {
    const url = new URL(ENTERPRISE_API_ROUTES[routeKey], this.baseUrl).toString();
    return this.withDeadline(async (signal) => {
      const response = await this.transport(url, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) throw apiError('HTTP');

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        if (signal.aborted) throw apiError('TIMEOUT');
        throw apiError('INVALID_JSON');
      }
      return unwrapCommonResult(json);
    });
  }

  private async downloadQr(url: string): Promise<Uint8Array> {
    return this.withDeadline(async (signal) => {
      const response = await this.transport(url, {
        method: 'GET',
        redirect: 'error',
        headers: { Accept: 'image/png' },
        signal,
      });
      if (!response.ok) throw apiError('HTTP');
      if (response.url !== '' && response.url !== url) throw apiError('INVALID_RESPONSE');

      const declaredLength = response.headers.get('Content-Length');
      if (declaredLength !== null && /^\d+$/.test(declaredLength) && BigInt(declaredLength) > BigInt(MAX_QR_BYTES)) {
        throw apiError('INVALID_RESPONSE');
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_QR_BYTES || !isPng(bytes)) throw apiError('INVALID_RESPONSE');
      return bytes;
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
      if (error instanceof EnterpriseApiError) throw error;
      throw apiError('NETWORK');
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }
}
