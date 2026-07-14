import type { EnterpriseRequest, EnterpriseResponse, EnterpriseUserContext } from '@/common/enterprise/contracts';
import {
  commonResultSchema,
  enterpriseRequestSchema,
  normalizeEnterpriseUserContext,
  parseEnterpriseResponse,
} from '@/common/enterprise/schemas';

import { ENTERPRISE_API_ROUTES, type EnterpriseApiRouteKey } from './enterpriseApiRoutes';

const DEFAULT_BASE_URL = 'https://cloud.lslnii.com/';
const DEFAULT_TIMEOUT_MS = 15_000;

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
    companyId: request.payload.companyId,
    id: request.payload.companyId,
    openId: context.openId,
    userId: context.userId as string,
    fromCompanyId: context.companyId as string,
    pageNum: 1,
    pageSize: 10,
  };
};

const serializeProductList = (
  request: Extract<EnterpriseRequest, { operation: 'product.list' }>
): EnterpriseRequestBody => {
  const { payload } = request;
  const body: EnterpriseRequestBody = {
    pageNum: payload.pageNum,
    pageSize: payload.pageSize,
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
      return serializeProductList(request);
    case 'product.detail':
      return serializeProductDetail(request, context);
    case 'project.dashboard':
    case 'project.drill':
    case 'project.list':
    case 'project.detail':
      return serializeProjectRequest(request, context);
  }
};

const unwrapCommonResult = (input: unknown): unknown => {
  if (
    typeof input === 'object' &&
    input !== null &&
    Object.hasOwn(input, 'success') &&
    (input as { success?: unknown }).success === false
  ) {
    throw apiError('API_FAILURE');
  }

  const result = commonResultSchema.safeParse(input);
  if (!result.success) throw apiError('INVALID_RESPONSE');
  return result.data.data;
};

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
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw apiError('INVALID_REQUEST');
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

  private async post(routeKey: EnterpriseApiRouteKey, body: EnterpriseRequestBody): Promise<unknown> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(apiError('TIMEOUT'));
      }, this.timeoutMs);
    });

    const url = new URL(ENTERPRISE_API_ROUTES[routeKey], this.baseUrl).toString();
    const transportPromise = Promise.resolve().then(() =>
      this.transport(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    );

    try {
      const response = await Promise.race([transportPromise, timeoutPromise]);
      if (!response.ok) throw apiError('HTTP');

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        throw apiError('INVALID_JSON');
      }
      return unwrapCommonResult(json);
    } catch (error) {
      if (error instanceof EnterpriseApiError) throw error;
      if (controller.signal.aborted) throw apiError('TIMEOUT');
      throw apiError('NETWORK');
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }
}
