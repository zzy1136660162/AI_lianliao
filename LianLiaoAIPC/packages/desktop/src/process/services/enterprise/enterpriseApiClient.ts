import { z } from 'zod';

import type {
  EnterpriseLoginPollResult,
  EnterpriseLoginSession,
  EnterpriseRequest,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '@/common/enterprise/contracts';
import { ENTERPRISE_REGISTRATION_URL } from '@/common/enterprise/constants';
import { isEnterpriseEntityId } from '@/common/enterprise/entityId';
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
// MiniMax classification and extraction can run sequentially; keep ordinary API calls fast while
// allowing the model workflow to finish instead of turning a successful backend result into TIMEOUT.
const DEMAND_AI_TIMEOUT_MS = 90_000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const MAX_LOGIN_EXPIRY_MS = 330_000;
const MAX_QR_BYTES = 2 * 1024 * 1024;
const MAX_AUTH_SANITIZE_NODES = 256;
const MAX_AUTH_SANITIZE_OWN_KEYS = 2048;
const MAX_AUTH_SANITIZE_DEPTH = 4;
const QR_PATHNAME = '/cloud-api/CommonWxGZHQrCodeLogIn/ln1433/getNewJJGCLoginQRCode_ln1433';
const LOGIN_KEY_PATTERN = /^enterprise_desktop_[A-Za-z0-9]{18}$/;
const PNG_MAGIC = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FORBIDDEN_ENVELOPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

type AuthSanitizeBudget = {
  nodesRemaining: number;
  ownKeysRemaining: number;
};

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

const desktopAiModelConfigSchema = z
  .object({
    providerCode: z.string().trim().min(1),
    modelName: z.string().trim().min(1),
    baseUrl: z
      .string()
      .url()
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
    protocolType: z.literal('OPENAI_CHAT_COMPLETIONS'),
    apiKey: z.string().trim().min(1),
    timeoutMs: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
    configVersion: z.string().trim().min(1),
  })
  .strict();

/** Main-process-only cloud model configuration; never use it in a preload contract. */
export type DesktopAiModelConfig = z.infer<typeof desktopAiModelConfigSchema>;

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
  readonly status?: number;

  constructor(code: EnterpriseApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'EnterpriseApiError';
    this.code = code;
    this.status = status;
  }
}

type EnterpriseRequestBodyValue = string | number | boolean | readonly string[] | Readonly<Record<string, string>>;
type EnterpriseRequestBody = Record<string, EnterpriseRequestBodyValue>;

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

const apiError = (code: EnterpriseApiErrorCode, status?: number): EnterpriseApiError =>
  new EnterpriseApiError(code, errorMessages[code], status);

/**
 * Persists only routing and failure metadata through the main-process console.
 *
 * The console is redirected to electron-log during application startup, so
 * operators can diagnose missing cloud routes without storing OpenID, resource
 * IDs, request bodies, telephone numbers, or backend response content.
 */
const recordEnterpriseApiFailure = (
  routeKey: EnterpriseApiRouteKey,
  url: string,
  error: unknown,
  startedAt: number
): void => {
  const code = error instanceof EnterpriseApiError ? error.code : 'NETWORK';
  const status = error instanceof EnterpriseApiError ? error.status : undefined;
  const endpoint = new URL(url).pathname;
  console.error('[enterprise-api] request failed', {
    operation: routeKey,
    endpoint,
    code,
    ...(status === undefined ? {} : { status }),
    durationMs: Math.max(0, Date.now() - startedAt),
  });
};

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

const setDefined = (
  target: EnterpriseRequestBody,
  key: string,
  value: EnterpriseRequestBodyValue | undefined
): void => {
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

/**
 * Converts renderer-friendly filters to the H5 controller contract.
 * Identity fields come only from the validated desktop session; `keyword` and
 * `companyLevel` intentionally become the legacy controller keys `name` and `comLevel`.
 */
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
  setDefined(body, 'province', payload.province);
  setDefined(body, 'city', payload.city);
  setDefined(body, 'district', payload.district);
  setDefined(body, 'comLevel', payload.companyLevel ?? (payload.vip === true ? -2 : undefined));
  if (payload.companyLevel === undefined) setDefined(body, 'vip', payload.vip);
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
  setDefined(body, 'province', payload.province);
  setDefined(body, 'city', payload.city);
  setDefined(body, 'district', payload.district);
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

/**
 * Catalog AI receives only the already validated natural-language request and compact candidates.
 * Registered-session validation prevents anonymous model use; identity fields are intentionally not
 * appended because the catalog model never needs openId, userId or companyId.
 */
const serializeCatalogAssistantRequest = (
  request: Extract<EnterpriseRequest, { operation: `catalogAssistant.${string}` | 'enterpriseAssistant.plan' }>,
  context: EnterpriseUserContext
): EnterpriseRequestBody => {
  requireRegisteredIdentity(context);
  return JSON.parse(JSON.stringify(request.payload)) as EnterpriseRequestBody;
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
    case 'project.filterOptions':
      setDefined(body, 'dimension', request.payload.dimension);
      setDefined(body, 'runId', request.payload.runId);
      setDefined(body, 'province', request.payload.province);
      setDefined(body, 'city', request.payload.city);
      setDefined(body, 'categoryL1', request.payload.categoryL1);
      setDefined(body, 'categoryL2', request.payload.categoryL2);
      setDefined(body, 'materialShortName', request.payload.materialShortName);
      setDefined(body, 'limit', request.payload.limit);
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
      setDefined(body, 'minInvestment', request.payload.minInvestment);
      setDefined(body, 'maxInvestment', request.payload.maxInvestment);
      setDefined(body, 'pageNum', request.payload.pageNum);
      setDefined(body, 'pageSize', request.payload.pageSize);
      return body;
    case 'project.detail':
      setDefined(body, 'hpInfoId', request.payload.hpInfoId);
      return body;
    case 'project.contactUnlock':
      setDefined(body, 'hpInfoId', request.payload.hpInfoId);
      setDefined(body, 'companyLevel', context.companyLevel);
      return body;
  }
};

const serializeDemandRequest = (
  request: Extract<EnterpriseRequest, { operation: `demand.${string}` }>,
  context: EnterpriseUserContext
): EnterpriseRequestBody => {
  requireRegisteredIdentity(context);
  const body: EnterpriseRequestBody = {};
  switch (request.operation) {
    case 'demand.types':
      return body;
    case 'demand.detail':
      setDefined(body, 'demandId', request.payload.demandId);
      setDefined(body, 'typeId', request.payload.typeId);
      return body;
    case 'demand.contactStatus':
    case 'demand.contactAcquire':
      setDefined(body, 'demandId', request.payload.demandId);
      setDefined(body, 'typeId', request.payload.typeId);
      setDefined(body, 'openId', context.openId);
      return body;
    case 'demand.publishTypes':
      return body;
    case 'demand.publishSchema':
      setDefined(body, 'typeId', request.payload.typeId);
      setDefined(body, 'variantCode', request.payload.variantCode);
      return body;
    case 'demand.aiParse':
      setDefined(body, 'typeId', request.payload.typeId);
      setDefined(body, 'variantCode', request.payload.variantCode);
      setDefined(body, 'description', request.payload.description);
      setDefined(body, 'openId', context.openId);
      return body;
    case 'demand.aiConversation.start':
    case 'demand.aiConversation.turn':
    case 'demand.aiConversation.confirmLine':
    case 'demand.aiConversation.patch':
    case 'demand.aiConversation.resume':
    case 'demand.aiConversation.cancel':
    case 'demand.aiConversation.complete':
      Object.assign(body, request.payload);
      setDefined(body, 'openId', context.openId);
      return body;
    case 'demand.publish':
      Object.assign(body, request.payload);
      setDefined(body, 'openId', context.openId);
      return body;
    case 'demand.uploadImage':
      return body;
    case 'demand.list':
      setDefined(body, 'keyword', request.payload.keyword);
      setDefined(body, 'typeId', request.payload.typeId);
      setDefined(body, 'city', request.payload.city);
      setDefined(body, 'district', request.payload.district);
      setDefined(body, 'status', request.payload.status);
      setDefined(body, 'pageNum', request.payload.pageNum);
      setDefined(body, 'pageSize', request.payload.pageSize);
      return body;
  }
};

const serializeUnifiedRequest = (
  request: Extract<EnterpriseRequest, { operation: `unified.${string}` }>,
  context: EnterpriseUserContext
): EnterpriseRequestBody => {
  requireRegisteredIdentity(context);
  if (request.operation === 'unified.suggest') {
    return { keyword: request.payload.keyword };
  }
  const body: EnterpriseRequestBody = {
    keyword: request.payload.keyword,
    pageNum: request.payload.pageNum,
    pageSize: request.payload.pageSize,
    enableGroupTop: request.payload.enableGroupTop,
    groupTopN: request.payload.groupTopN,
  };
  setDefined(body, 'resourceTypes', request.payload.resourceTypes);
  return body;
};

const BEHAVIOR_TYPE_LABELS = Object.freeze({
  PAGE_VIEW: '页面访问',
  CONTACT_ACQUIRE: '获取联系方式',
  PHONE_DIAL: '拨打电话',
  DEMAND_PUBLISH: '发布需求',
});

/**
 * Adapts desktop behavior events to the legacy H5 `addgzhLogs` storage contract.
 * Identity and runtime fields are sourced here rather than accepted from the renderer.
 */
const serializeBehaviorLog = (
  request: Extract<EnterpriseRequest, { operation: 'behavior.log' }>,
  context: EnterpriseUserContext
): EnterpriseRequestBody => {
  requireRegisteredIdentity(context);
  const { payload } = request;
  const body: EnterpriseRequestBody = {
    userId: context.openId,
    userName: context.userName ?? '',
    fromCompanyId: context.companyId ?? '',
    fromCompanyName: context.companyName ?? '',
    osType: process.platform,
    userAgent: `LianLiaoAIPC Electron/${process.versions.electron} ${process.platform}/${process.arch}`,
    newsTitle: payload.title,
    type: BEHAVIOR_TYPE_LABELS[payload.eventType],
    moudelName: payload.moduleName,
    newsId: payload.targetId ?? '',
    newsUrl: `lianliao://desktop${payload.pagePath}`,
    params: JSON.stringify({
      eventType: payload.eventType,
      ...payload.params,
    }),
  };
  setDefined(body, 'toCompanyId', payload.toCompanyId);
  setDefined(body, 'toCompanyName', payload.toCompanyName);
  return body;
};

const serializeRequest = (request: EnterpriseRequest, context: EnterpriseUserContext): EnterpriseRequestBody => {
  switch (request.operation) {
    case 'company.list':
      return serializeCompanyList(request, context);
    case 'company.detail':
      return serializeCompanyDetail(request, context);
    case 'company.industries':
      requireCompanyIdentity(context);
      return {};
    case 'product.list':
      return serializeProductList(request, context);
    case 'product.detail':
      return serializeProductDetail(request, context);
    case 'catalogAssistant.plan':
    case 'catalogAssistant.rank':
    case 'enterpriseAssistant.plan':
      return serializeCatalogAssistantRequest(request, context);
    case 'project.dashboard':
    case 'project.drill':
    case 'project.filterOptions':
    case 'project.list':
    case 'project.detail':
    case 'project.contactUnlock':
      return serializeProjectRequest(request, context);
    case 'contact.acquire':
      requireRegisteredIdentity(context);
      return {};
    case 'demand.types':
    case 'demand.list':
    case 'demand.detail':
    case 'demand.contactStatus':
    case 'demand.contactAcquire':
    case 'demand.publishTypes':
    case 'demand.publishSchema':
    case 'demand.aiParse':
    case 'demand.aiConversation.start':
    case 'demand.aiConversation.turn':
    case 'demand.aiConversation.confirmLine':
    case 'demand.aiConversation.patch':
    case 'demand.aiConversation.resume':
    case 'demand.aiConversation.cancel':
    case 'demand.aiConversation.complete':
    case 'demand.publish':
    case 'demand.uploadImage':
      return serializeDemandRequest(request, context);
    case 'behavior.log':
      return serializeBehaviorLog(request, context);
    case 'unified.suggest':
    case 'unified.search':
      return serializeUnifiedRequest(request, context);
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
  ancestors: WeakSet<object> = new WeakSet(),
  budget: AuthSanitizeBudget = {
    nodesRemaining: MAX_AUTH_SANITIZE_NODES,
    ownKeysRemaining: MAX_AUTH_SANITIZE_OWN_KEYS,
  }
): Record<string, unknown> | undefined => {
  if (depth > MAX_AUTH_SANITIZE_DEPTH || typeof input !== 'object' || input === null || Array.isArray(input)) {
    return undefined;
  }
  if (ancestors.has(input)) return undefined;
  if (budget.nodesRemaining <= 0) return undefined;
  budget.nodesRemaining -= 1;
  ancestors.add(input);

  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return undefined;

    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.length > budget.ownKeysRemaining) return undefined;
    budget.ownKeysRemaining -= ownKeys.length;

    const sanitized = Object.create(null) as Record<string, unknown>;
    for (const key of ownKeys) {
      if (typeof key !== 'string' || FORBIDDEN_ENVELOPE_KEYS.has(key)) return undefined;

      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || 'get' in descriptor || 'set' in descriptor) return undefined;
      if (!descriptor.enumerable) continue;

      let value = descriptor.value;
      if (typeof value === 'object' && value !== null) {
        value = sanitizeAuthObject(value, depth + 1, ancestors, budget);
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
  const expectedRelative = `${QR_PATHNAME}?ratio=8&front_sign=${loginKey}`;
  const expectedAbsolute = new URL(expectedRelative, baseUrl).toString();
  if (qrPath !== expectedRelative && qrPath !== expectedAbsolute) throw apiError('INVALID_RESPONSE');

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

const parseQrContentLength = (value: string | null): number | undefined => {
  if (value === null) return undefined;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw apiError('INVALID_RESPONSE');

  const length = Number(value);
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_QR_BYTES) {
    throw apiError('INVALID_RESPONSE');
  }
  return length;
};

const cancelReaderWithoutWaiting = (reader: ReadableStreamDefaultReader<Uint8Array>): void => {
  try {
    void Promise.resolve(reader.cancel()).catch((): undefined => undefined);
  } catch {
    // Cancellation is best-effort; the public request must settle independently.
  }
};

const readBoundedQrBody = async (response: Response, signal: AbortSignal): Promise<Uint8Array> => {
  if (!response.body) throw apiError('INVALID_RESPONSE');

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = response.body.getReader();
  } catch {
    throw apiError('INVALID_RESPONSE');
  }

  let activeRead: Promise<ReadableStreamReadResult<Uint8Array>> | undefined;
  let released = false;
  const releaseReader = (): void => {
    if (released) return;
    try {
      reader.releaseLock();
      released = true;
    } catch {
      // A native reader can remain locked until its cancelled read settles.
    }
  };
  let handleAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    handleAbort = () => {
      cancelReaderWithoutWaiting(reader);
      reject(apiError('TIMEOUT'));
    };
    if (signal.aborted) handleAbort();
    else signal.addEventListener('abort', handleAbort, { once: true });
  });

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      activeRead = Promise.resolve().then(() => reader.read());
      // eslint-disable-next-line no-await-in-loop -- Stream chunks must be read sequentially to enforce the byte limit.
      const result = await Promise.race([activeRead, abortPromise]);
      activeRead = undefined;
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) throw apiError('INVALID_RESPONSE');
      if (result.value.byteLength > MAX_QR_BYTES - totalBytes) {
        cancelReaderWithoutWaiting(reader);
        throw apiError('INVALID_RESPONSE');
      }
      if (result.value.byteLength === 0) continue;

      totalBytes += result.value.byteLength;
      chunks.push(Buffer.from(result.value));
    }
    if (totalBytes === 0) throw apiError('INVALID_RESPONSE');
    return Buffer.concat(chunks, totalBytes);
  } finally {
    if (handleAbort) signal.removeEventListener('abort', handleAbort);
    releaseReader();
    if (!released && activeRead) {
      void activeRead.then(releaseReader, releaseReader).catch((): undefined => undefined);
    }
  }
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
    if (validRequest.operation === 'contact.acquire') {
      return this.acquireContact(validRequest, context);
    }
    if (validRequest.operation === 'demand.uploadImage') {
      requireRegisteredIdentity(context);
      const form = new FormData();
      form.append('openId', context.openId);
      const isolatedBytes = Uint8Array.from(validRequest.payload.bytes);
      form.append(
        'file',
        new Blob([isolatedBytes.buffer], { type: validRequest.payload.mimeType }),
        validRequest.payload.fileName
      );
      const responseData = await this.postMultipart(validRequest.operation, form);
      try {
        return parseEnterpriseResponse(validRequest.operation, responseData);
      } catch {
        throw apiError('INVALID_RESPONSE');
      }
    }
    if (validRequest.operation === 'behavior.log') {
      await this.post(validRequest.operation, serializeBehaviorLog(validRequest, context));
      return { operation: 'behavior.log', data: { recorded: true } };
    }
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

  /** Fetches the centrally managed AI model for the Electron main process. */
  async getDesktopAiModelConfig(): Promise<DesktopAiModelConfig> {
    const responseData = await this.post('desktopAi.defaultConfig', {});
    const parsed = desktopAiModelConfigSchema.safeParse(responseData);
    if (!parsed.success) throw apiError('INVALID_RESPONSE');
    return parsed.data;
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
    if (expiresAtMs <= Date.now()) throw apiError('INVALID_RESPONSE');
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
        isEnterpriseEntityId(userContext.userId) &&
        isEnterpriseEntityId(userContext.companyId);
      if (!hasRealIdentity) throw apiError('INVALID_RESPONSE');
      return { status: 'AUTHENTICATED', openId: parsed.data.openId, userContext };
    }
    throw apiError('INVALID_RESPONSE');
  }

  private async post(routeKey: EnterpriseApiRouteKey, body: EnterpriseRequestBody): Promise<unknown> {
    const url = new URL(ENTERPRISE_API_ROUTES[routeKey], this.baseUrl).toString();
    const startedAt = Date.now();
    const timeoutMs =
      routeKey.startsWith('demand.ai') ||
      routeKey.startsWith('catalogAssistant.') ||
      routeKey.startsWith('enterpriseAssistant.')
        ? Math.max(this.timeoutMs, DEMAND_AI_TIMEOUT_MS)
        : this.timeoutMs;
    try {
      return await this.withDeadline(async (signal) => {
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
        if (!response.ok) throw apiError('HTTP', response.status);

        let json: unknown;
        try {
          json = await response.json();
        } catch {
          if (signal.aborted) throw apiError('TIMEOUT');
          throw apiError('INVALID_JSON');
        }
        return unwrapCommonResult(json);
      }, timeoutMs);
    } catch (error) {
      recordEnterpriseApiFailure(routeKey, url, error, startedAt);
      throw error;
    }
  }

  private async postMultipart(routeKey: EnterpriseApiRouteKey, body: FormData): Promise<unknown> {
    const url = new URL(ENTERPRISE_API_ROUTES[routeKey], this.baseUrl).toString();
    return this.withDeadline(async (signal) => {
      const response = await this.transport(url, {
        method: 'POST',
        redirect: 'error',
        headers: { Accept: 'application/json' },
        body,
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

  private async acquireContact(
    request: Extract<EnterpriseRequest, { operation: 'contact.acquire' }>,
    context: EnterpriseUserContext
  ): Promise<EnterpriseResponse> {
    requireRegisteredIdentity(context);
    const consumeQuota = request.payload.consumeQuota !== false;
    const responseData = await this.post('contact.acquire', {
      openId: context.openId,
      resourceType: request.payload.resourceType,
      resourceId: request.payload.resourceId,
      consumeQuota,
    });
    try {
      return parseEnterpriseResponse('contact.acquire', responseData);
    } catch {
      throw apiError('INVALID_RESPONSE');
    }
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
      // Electron net.fetch may omit Response.url even when a non-redirected request succeeds.
      // Redirects are still rejected by redirect: 'error'; reject every non-empty mismatch.
      if (response.url !== '' && response.url !== url) throw apiError('INVALID_RESPONSE');

      parseQrContentLength(response.headers.get('Content-Length'));
      const bytes = await readBoundedQrBody(response, signal);
      if (!isPng(bytes)) throw apiError('INVALID_RESPONSE');
      return bytes;
    });
  }

  private async withDeadline<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs = this.timeoutMs
  ): Promise<T> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(apiError('TIMEOUT'));
      }, timeoutMs);
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
