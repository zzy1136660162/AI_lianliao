import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { types as nodeTypes } from 'node:util';

import { app, BrowserWindow, ipcMain as electronIpcMain, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

import { ENTERPRISE_IPC_CHANNELS, ENTERPRISE_IPC_ERROR_MESSAGES } from '@/common/enterprise/constants';
import {
  CUSTOMER_CONSULTATION_IPC_CHANNELS,
  CUSTOMER_SERVICE_IPC_CHANNELS,
  CUSTOMER_SERVICE_IPC_ERROR_MESSAGES,
} from '@/common/enterprise/customer-service/constants';
import {
  DESKTOP_NOTIFICATION_IPC_CHANNELS,
  DESKTOP_NOTIFICATION_IPC_ERROR_MESSAGES,
} from '@/common/enterprise/desktop-notification/constants';
import {
  DESKTOP_VERSION_IPC_CHANNELS,
  DESKTOP_VERSION_IPC_ERROR_MESSAGES,
} from '@/common/enterprise/desktop-version/constants';
import type {
  CustomerServiceCloseRequest,
  CustomerServiceConnectionSnapshot,
  CustomerServiceConversation,
  CustomerServiceConversationIdRequest,
  CustomerServiceConversationListRequest,
  CustomerServiceImage,
  CustomerServiceIpcErrorCode,
  CustomerServiceIpcResult,
  CustomerServiceMarkReadRequest,
  CustomerServiceMessage,
  CustomerServiceMessageHistoryRequest,
  CustomerServicePage,
  CustomerServiceReadResult,
  CustomerServiceSendMessageRequest,
  CustomerServiceServerEnvelope,
  CustomerServiceStaffCandidate,
  CustomerServiceStaffCandidatesRequest,
  CustomerServiceTransferRequest,
  CustomerServiceUploadImageRequest,
} from '@/common/enterprise/customer-service/contracts';
import {
  CUSTOMER_CONSULTATION_COMMAND_SCHEMAS,
  CUSTOMER_SERVICE_COMMAND_SCHEMAS,
  customerServiceConnectionSnapshotSchema,
  customerServiceConversationSchema,
  customerServiceImageSchema,
  customerServiceMessageSchema,
  customerServicePageSchema,
  customerServiceReadResultSchema,
  customerServiceServerEnvelopeSchema,
  customerServiceStaffCandidateSchema,
} from '@/common/enterprise/customer-service/schemas';
import type {
  DesktopNotificationChangedResult,
  DesktopNotificationConnectionSnapshot,
  DesktopNotificationIpcErrorCode,
  DesktopNotificationIpcResult,
  DesktopNotificationListRequest,
  DesktopNotificationMarkAllReadResult,
  DesktopNotificationPage,
  DesktopNotificationServerEnvelope,
  DesktopNotificationUnreadCount,
} from '@/common/enterprise/desktop-notification/contracts';
import type {
  DesktopVersionCheckResult,
  DesktopVersionDownloadResult,
  DesktopVersionIpcErrorCode,
  DesktopVersionIpcResult,
  DesktopVersionOpenDownloadedResult,
} from '@/common/enterprise/desktop-version/contracts';
import {
  DESKTOP_NOTIFICATION_COMMAND_SCHEMAS,
  desktopNotificationChangedResultSchema,
  desktopNotificationConnectionSnapshotSchema,
  desktopNotificationMarkAllReadResultSchema,
  desktopNotificationPageSchema,
  desktopNotificationServerEnvelopeSchema,
  desktopNotificationUnreadCountSchema,
} from '@/common/enterprise/desktop-notification/schemas';
import {
  desktopVersionCheckResultSchema,
  desktopVersionDownloadResultSchema,
  desktopVersionOpenDownloadedResultSchema,
} from '@/common/enterprise/desktop-version/schemas';
import type {
  EnterpriseIpcErrorCode,
  EnterpriseIpcResult,
  EnterpriseLoginPollResult,
  EnterpriseLoginSession,
  EnterpriseRequest,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '@/common/enterprise/contracts';
import { isEnterpriseEntityId } from '@/common/enterprise/entityId';
import { maskEnterprisePhone } from '@/common/enterprise/phonePrivacy';
import { enterpriseRequestSchema } from '@/common/enterprise/schemas';
import { EnterpriseApiClient, EnterpriseApiError } from '@process/services/enterprise/enterpriseApiClient';
import i18n from '@process/services/i18n';
import { resolveEnterpriseApiClientOptions } from '@process/services/enterprise/enterpriseRuntimeConfig';
import { enterpriseSessionEvents } from '@process/services/enterprise/enterpriseSessionEvents';
import { EnterpriseSessionStore } from '@process/services/enterprise/enterpriseSessionStore';
import { CustomerConsultationGateway } from '@process/services/enterprise/customer-service/customerConsultationGateway';
import {
  CustomerServiceGateway,
  type CustomerServiceGatewayEventListener,
} from '@process/services/enterprise/customer-service/customerServiceGateway';
import { CustomerServiceApiError } from '@process/services/enterprise/customer-service/customerServiceApiClient';
import {
  DesktopNotificationGateway,
  type DesktopNotificationGatewayEventListener,
} from '@process/services/enterprise/desktop-notification/desktopNotificationGateway';
import { DesktopNotificationApiError } from '@process/services/enterprise/desktop-notification/desktopNotificationApiClient';
import {
  DesktopVersionGateway,
  DesktopVersionGatewayError,
} from '@process/services/enterprise/desktop-version/desktopVersionGateway';
import { DesktopVersionApiError } from '@process/services/enterprise/desktop-version/desktopVersionApiClient';
import { DesktopVersionDownloadError } from '@process/services/enterprise/desktop-version/desktopVersionDownloader';
import { showNotification } from '@process/bridge/notificationBridge';
import {
  setCustomerConsultationUnreadCount,
  setCustomerServiceUnreadCount,
  setDesktopNotificationUnreadCount,
  shouldNotifyCustomerConsultationMessage,
  shouldNotifyCustomerServiceMessage,
  shouldNotifyDesktopNotification,
} from '@process/utils/tray';

type EnterpriseIpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<EnterpriseIpcResult<unknown>>;

export type EnterpriseIpcMain = {
  handle: (channel: string, handler: EnterpriseIpcHandler) => void;
  removeHandler: (channel: string) => void;
};

export type EnterpriseApiClientDependency = {
  createLoginSession: () => Promise<EnterpriseLoginSession>;
  pollLoginSession: (loginKey: string) => Promise<EnterpriseLoginPollResult>;
  getUserContext: (openId: string) => Promise<EnterpriseUserContext>;
  request: (request: EnterpriseRequest, context: EnterpriseUserContext) => Promise<EnterpriseResponse>;
};

export type EnterpriseSessionStoreDependency = {
  loadOpenId: () => Promise<string | null>;
  saveOpenId: (openId: string) => Promise<void>;
  clear: () => Promise<void>;
};

export type EnterpriseSenderGuard = (event: IpcMainInvokeEvent) => boolean;

export type EnterpriseBridgeDependencies = {
  apiClient?: EnterpriseApiClientDependency;
  ipcMain?: EnterpriseIpcMain;
  senderGuard?: EnterpriseSenderGuard;
  sessionStore?: EnterpriseSessionStoreDependency;
};

type CustomerServiceIpcHandler = (event: unknown, ...args: unknown[]) => Promise<CustomerServiceIpcResult<unknown>>;

export type CustomerServiceIpcMain = {
  handle: (channel: string, handler: CustomerServiceIpcHandler) => void;
  removeHandler: (channel: string) => void;
};

export type CustomerServiceBridgeGateway = {
  connect: () => Promise<CustomerServiceConnectionSnapshot>;
  disconnect: () => Promise<void>;
  listConversations: (
    request: CustomerServiceConversationListRequest
  ) => Promise<CustomerServicePage<CustomerServiceConversation>>;
  getConversation: (request: CustomerServiceConversationIdRequest) => Promise<CustomerServiceConversation>;
  getHistory: (request: CustomerServiceMessageHistoryRequest) => Promise<CustomerServicePage<CustomerServiceMessage>>;
  sendMessage: (request: CustomerServiceSendMessageRequest) => string;
  markRead: (request: CustomerServiceMarkReadRequest) => Promise<CustomerServiceReadResult>;
  uploadImage: (request: CustomerServiceUploadImageRequest) => Promise<CustomerServiceImage>;
  listCandidates: (
    request: CustomerServiceStaffCandidatesRequest
  ) => Promise<CustomerServicePage<CustomerServiceStaffCandidate>>;
  transferConversation: (request: CustomerServiceTransferRequest) => Promise<CustomerServiceConversation>;
  closeConversation: (request: CustomerServiceCloseRequest) => Promise<CustomerServiceConversation>;
  subscribe: (listener: CustomerServiceGatewayEventListener) => () => void;
};

export type CustomerServiceBridgeDependencies = {
  gateway?: CustomerServiceBridgeGateway;
  ipcMain?: CustomerServiceIpcMain;
  senderGuard?: (event: unknown) => boolean;
  eventSink?: (event: CustomerServiceServerEnvelope) => void;
};

/** Narrow customer-side gateway used by the consultation IPC namespace. */
export type CustomerConsultationBridgeGateway = {
  connect: () => Promise<CustomerServiceConnectionSnapshot>;
  disconnect: () => Promise<void>;
  openConversation: () => Promise<CustomerServiceConversation>;
  startConversation: () => Promise<CustomerServiceConversation>;
  getConversation: (request: CustomerServiceConversationIdRequest) => Promise<CustomerServiceConversation>;
  getHistory: (request: CustomerServiceMessageHistoryRequest) => Promise<CustomerServicePage<CustomerServiceMessage>>;
  sendMessage: (request: CustomerServiceSendMessageRequest) => string;
  markRead: (request: CustomerServiceMarkReadRequest) => Promise<CustomerServiceReadResult>;
  uploadImage: (request: CustomerServiceUploadImageRequest) => Promise<CustomerServiceImage>;
  closeConversation: (request: CustomerServiceCloseRequest) => Promise<CustomerServiceConversation>;
  subscribe: (listener: (event: CustomerServiceServerEnvelope) => void) => () => void;
};

export type CustomerConsultationBridgeDependencies = {
  gateway?: CustomerConsultationBridgeGateway;
  ipcMain?: CustomerServiceIpcMain;
  senderGuard?: (event: unknown) => boolean;
  eventSink?: (event: CustomerServiceServerEnvelope) => void;
};

type DesktopNotificationIpcHandler = (
  event: unknown,
  ...args: unknown[]
) => Promise<DesktopNotificationIpcResult<unknown>>;

export type DesktopNotificationIpcMain = {
  handle: (channel: string, handler: DesktopNotificationIpcHandler) => void;
  removeHandler: (channel: string) => void;
};

export type DesktopNotificationBridgeGateway = {
  connect: () => Promise<DesktopNotificationConnectionSnapshot>;
  disconnect: () => Promise<void>;
  list: (request: DesktopNotificationListRequest) => Promise<DesktopNotificationPage>;
  getUnreadCount: () => Promise<DesktopNotificationUnreadCount>;
  markRead: (notificationId: string) => Promise<DesktopNotificationChangedResult>;
  markAllRead: () => Promise<DesktopNotificationMarkAllReadResult>;
  subscribe: (listener: DesktopNotificationGatewayEventListener) => () => void;
};

export type DesktopNotificationBridgeDependencies = {
  gateway?: DesktopNotificationBridgeGateway;
  ipcMain?: DesktopNotificationIpcMain;
  senderGuard?: (event: unknown) => boolean;
  eventSink?: (event: DesktopNotificationServerEnvelope) => void;
};

type DesktopVersionIpcHandler = (event: unknown, ...args: unknown[]) => Promise<DesktopVersionIpcResult<unknown>>;

export type DesktopVersionIpcMain = {
  handle: (channel: string, handler: DesktopVersionIpcHandler) => void;
  removeHandler: (channel: string) => void;
};

export type DesktopVersionBridgeGateway = {
  check: () => Promise<DesktopVersionCheckResult>;
  downloadLatest: () => Promise<DesktopVersionDownloadResult>;
  openDownloadedInstaller: () => Promise<DesktopVersionOpenDownloadedResult>;
};

export type DesktopVersionBridgeDependencies = {
  gateway?: DesktopVersionBridgeGateway;
  ipcMain?: DesktopVersionIpcMain;
  senderGuard?: (event: unknown) => boolean;
};

type EnterpriseOperation = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const loginKeySchema = z.string().regex(/^enterprise_desktop_[A-Za-z0-9]{18}$/);
const registrationOpenIdSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(256)
      .refine((value) => !/\p{C}/u.test(value))
  );

const hasRequiredEnterpriseRequestFields = (
  value: z.output<typeof enterpriseRequestSchema>
): value is EnterpriseRequest => value.operation !== undefined && value.payload !== undefined;

const parseStrictEnterpriseRequest = (value: unknown): EnterpriseRequest | undefined => {
  const parsed = enterpriseRequestSchema.safeParse(value);
  if (!parsed.success || !hasRequiredEnterpriseRequestFields(parsed.data)) return undefined;
  return parsed.data;
};

const DANGEROUS_RESPONSE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_RESPONSE_CLONE_DEPTH = 8;
const MAX_RESPONSE_CLONE_NODES = 4096;
const MAX_RESPONSE_CLONE_OWN_KEYS = 8192;
const MAX_RESPONSE_ARRAY_LENGTH = 1000;

type EnterpriseResponseCloneBudget = {
  nodesRemaining: number;
  ownKeysRemaining: number;
};

/** Copies only plain clone data without touching accessors or accepting Proxy-backed values. */
const cloneEnterpriseResponseData = (
  value: unknown,
  ancestors: WeakSet<object> = new WeakSet<object>(),
  depth = 0,
  budget: EnterpriseResponseCloneBudget = {
    nodesRemaining: MAX_RESPONSE_CLONE_NODES,
    ownKeysRemaining: MAX_RESPONSE_CLONE_OWN_KEYS,
  }
): unknown => {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (
    typeof value !== 'object' ||
    depth > MAX_RESPONSE_CLONE_DEPTH ||
    nodeTypes.isProxy(value) ||
    ancestors.has(value) ||
    budget.nodesRemaining <= 0
  ) {
    throw bridgeError('REQUEST_FAILED');
  }

  budget.nodesRemaining -= 1;
  ancestors.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length > budget.ownKeysRemaining) throw bridgeError('REQUEST_FAILED');
    budget.ownKeysRemaining -= ownKeys.length;
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) throw bridgeError('REQUEST_FAILED');
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      const length = lengthDescriptor?.value;
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > MAX_RESPONSE_ARRAY_LENGTH ||
        ownKeys.length !== length + 1
      ) {
        throw bridgeError('REQUEST_FAILED');
      }
      const result: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          throw bridgeError('REQUEST_FAILED');
        }
        result.push(cloneEnterpriseResponseData(descriptor.value, ancestors, depth + 1, budget));
      }
      return result;
    }

    if (prototype !== Object.prototype && prototype !== null) throw bridgeError('REQUEST_FAILED');
    const result: Record<string, unknown> = {};
    for (const key of ownKeys) {
      if (typeof key !== 'string' || DANGEROUS_RESPONSE_KEYS.has(key)) throw bridgeError('REQUEST_FAILED');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw bridgeError('REQUEST_FAILED');
      }
      result[key] = cloneEnterpriseResponseData(descriptor.value, ancestors, depth + 1, budget);
    }
    return result;
  } catch (error) {
    if (error instanceof EnterpriseBridgeError) throw error;
    throw bridgeError('REQUEST_FAILED');
  } finally {
    ancestors.delete(value);
  }
};

/** Defense in depth for injected API clients: validate a plain response before applying phone policy. */
const protectEnterpriseResponse = (untrustedResponse: unknown, expectedOperation: EnterpriseRequest['operation']) => {
  const cloned = cloneEnterpriseResponseData(untrustedResponse);
  if (typeof cloned !== 'object' || cloned === null || Array.isArray(cloned)) throw bridgeError('REQUEST_FAILED');
  const fields = Object.keys(cloned);
  if (fields.length !== 2 || !fields.includes('operation') || !fields.includes('data')) {
    throw bridgeError('REQUEST_FAILED');
  }
  const envelope = cloned as Record<string, unknown>;
  if (envelope.operation !== expectedOperation) throw bridgeError('REQUEST_FAILED');
  const response = envelope as unknown as EnterpriseResponse;

  if (response.operation === 'company.detail' && response.data.phone !== undefined) {
    return {
      operation: 'company.detail',
      data: { ...response.data, phone: maskEnterprisePhone(response.data.phone) },
    };
  }
  if (response.operation === 'product.detail' && response.data.phone !== undefined) {
    return {
      operation: 'product.detail',
      data: { ...response.data, phone: maskEnterprisePhone(response.data.phone) },
    };
  }
  if (response.operation === 'product.list') {
    return {
      operation: 'product.list',
      data: {
        ...response.data,
        list: response.data.list.map((product) =>
          product.phone === undefined ? product : { ...product, phone: maskEnterprisePhone(product.phone) }
        ),
      },
    };
  }
  if (
    response.operation === 'project.detail' &&
    response.data.phone !== undefined &&
    response.data.purchased !== true
  ) {
    return {
      operation: 'project.detail',
      data: { ...response.data, phone: maskEnterprisePhone(response.data.phone) },
    };
  }
  return response;
};

/** Internal typed failure; handlers always convert it to a plain IPC result. */
export class EnterpriseBridgeError extends Error {
  readonly code: EnterpriseIpcErrorCode;

  constructor(code: EnterpriseIpcErrorCode, message = ENTERPRISE_IPC_ERROR_MESSAGES[code]) {
    super(`[${code}] ${message}`);
    this.name = 'EnterpriseBridgeError';
    this.code = code;
  }
}

const bridgeError = (code: EnterpriseIpcErrorCode): EnterpriseBridgeError => new EnterpriseBridgeError(code);

const getOwnFailureCode = (error: object): EnterpriseIpcErrorCode | undefined => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return undefined;
    const code = descriptor.value;
    if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(ENTERPRISE_IPC_ERROR_MESSAGES, code)) {
      return undefined;
    }
    return code as EnterpriseIpcErrorCode;
  } catch {
    return undefined;
  }
};

const sanitizeFailureCode = (error: unknown, fallbackCode: EnterpriseIpcErrorCode): EnterpriseIpcErrorCode => {
  if (error instanceof EnterpriseBridgeError || error instanceof EnterpriseApiError) {
    return getOwnFailureCode(error) ?? fallbackCode;
  }
  return fallbackCode;
};

const successResult = <T>(data: T): EnterpriseIpcResult<T> => ({ ok: true, data });

const failureResult = (code: EnterpriseIpcErrorCode): EnterpriseIpcResult<never> => ({
  ok: false,
  error: { code, message: ENTERPRISE_IPC_ERROR_MESSAGES[code] },
});

const normalizeUntrustedText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 256 || /\p{C}/u.test(normalized)) return undefined;
  return normalized;
};

const isRegisteredContext = (
  context: EnterpriseUserContext,
  expectedOpenId?: string
): context is EnterpriseUserContext & { companyId: string; userId: string } => {
  const openId = normalizeUntrustedText(context?.openId);
  return (
    context?.registered === true &&
    openId !== undefined &&
    (expectedOpenId === undefined || openId === expectedOpenId) &&
    isEnterpriseEntityId(context.userId) &&
    isEnterpriseEntityId(context.companyId)
  );
};

const hasExactRendererLocation = (actualUrl: string, expectedUrl: string): boolean => {
  try {
    const actual = new URL(actualUrl);
    const expected = new URL(expectedUrl);
    if (actual.username !== '' || actual.password !== '' || expected.username !== '' || expected.password !== '') {
      return false;
    }
    return (
      actual.protocol === expected.protocol &&
      actual.hostname === expected.hostname &&
      actual.port === expected.port &&
      actual.pathname === expected.pathname &&
      actual.search === expected.search
    );
  } catch {
    return false;
  }
};

const getExpectedRendererUrl = (): string | undefined => {
  const fileRendererUrl = pathToFileURL(path.join(__dirname, '../renderer/index.html')).href;
  if (app.isPackaged) return fileRendererUrl;

  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  if (developmentUrl !== undefined && developmentUrl !== '') {
    try {
      const parsedUrl = new URL(developmentUrl);
      const isLoopbackHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname);
      const isHttpProtocol = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
      if (isHttpProtocol && isLoopbackHost && parsedUrl.username === '' && parsedUrl.password === '') {
        return parsedUrl.href;
      }
    } catch {
      // Invalid development configuration falls back to the packaged renderer URL.
    }
  }
  return fileRendererUrl;
};

/** Verifies the actual Electron sender/window/frame binding and exact renderer location. */
export const isTrustedEnterpriseSender: EnterpriseSenderGuard = (event) => {
  try {
    const sender = event.sender;
    if (!sender || sender.isDestroyed()) return false;
    if (!event.senderFrame || event.senderFrame !== sender.mainFrame) return false;
    const ownerWindow = BrowserWindow.fromWebContents(sender);
    if (!ownerWindow || ownerWindow.isDestroyed() || ownerWindow.webContents !== sender) return false;
    const expectedUrl = getExpectedRendererUrl();
    return expectedUrl !== undefined && hasExactRendererLocation(event.senderFrame.url, expectedUrl);
  } catch {
    return false;
  }
};

let lifecycleEpoch = 0;
let defaultSessionStore: EnterpriseSessionStoreDependency | undefined;
let sessionMutationQueue: Promise<void> = Promise.resolve();
let pendingSessionWrites = 0;

type EnterpriseSessionOperationKind = 'read' | 'write';

const getDefaultSessionStore = (): EnterpriseSessionStoreDependency => {
  defaultSessionStore ??= new EnterpriseSessionStore(app.getPath('userData'));
  return defaultSessionStore;
};

const enqueueSessionMutation = <T>(kind: EnterpriseSessionOperationKind, operation: () => Promise<T>): Promise<T> => {
  if (kind === 'write') pendingSessionWrites += 1;
  const current = sessionMutationQueue.then(operation, operation);
  sessionMutationQueue = current.then(
    (): undefined => undefined,
    (): undefined => undefined
  );
  return current.finally(() => {
    if (kind === 'write') pendingSessionWrites -= 1;
  });
};

/** Registers the fixed enterprise IPC surface and owns its trusted in-memory identity. */
export function initEnterpriseBridge(dependencies: EnterpriseBridgeDependencies = {}): void {
  const epoch = lifecycleEpoch + 1;
  lifecycleEpoch = epoch;
  const apiClient =
    dependencies.apiClient ?? new EnterpriseApiClient(resolveEnterpriseApiClientOptions(app.isPackaged));
  const sessionStore = dependencies.sessionStore ?? getDefaultSessionStore();
  const ipcMain = dependencies.ipcMain ?? (electronIpcMain as EnterpriseIpcMain);
  const senderGuard = dependencies.senderGuard ?? isTrustedEnterpriseSender;
  const needsReinitializationCleanup = pendingSessionWrites > 0;
  const lifecycleReady = needsReinitializationCleanup
    ? enqueueSessionMutation('write', () => sessionStore.clear())
    : Promise.resolve();
  void lifecycleReady.catch((): undefined => undefined);

  let activeContext: EnterpriseUserContext | null = null;
  let hydrationPromise: Promise<EnterpriseUserContext | null> | null = null;
  let clearSessionPromise: Promise<void> | null = null;
  let sessionGeneration = 0;
  let automaticHydrationBlocked = false;

  const assertCurrentLifecycle = (): void => {
    if (lifecycleEpoch !== epoch) throw bridgeError('MISSING_CONTEXT');
  };

  const runSessionMutation = async <T>(
    kind: EnterpriseSessionOperationKind,
    operation: () => Promise<T>
  ): Promise<T> => {
    assertCurrentLifecycle();
    const result = await enqueueSessionMutation(kind, async () => {
      assertCurrentLifecycle();
      return operation();
    });
    assertCurrentLifecycle();
    return result;
  };

  const performClearSessionState = async (): Promise<void> => {
    const previousActiveContext = activeContext;
    const previousAutomaticHydrationBlocked = automaticHydrationBlocked;
    sessionGeneration += 1;
    const clearGeneration = sessionGeneration;
    activeContext = null;
    automaticHydrationBlocked = true;

    try {
      await runSessionMutation('write', () => sessionStore.clear());
    } catch {
      if (lifecycleEpoch !== epoch) throw bridgeError('MISSING_CONTEXT');
      if (sessionGeneration === clearGeneration) {
        activeContext = previousActiveContext;
        automaticHydrationBlocked = previousAutomaticHydrationBlocked;
      }
      throw bridgeError('SESSION_CLEAR_FAILED');
    }

    assertCurrentLifecycle();
    if (sessionGeneration !== clearGeneration) throw bridgeError('MISSING_CONTEXT');
    automaticHydrationBlocked = false;
    enterpriseSessionEvents.emitCleared();
  };

  const clearSessionState = (): Promise<void> => {
    assertCurrentLifecycle();
    if (clearSessionPromise) return clearSessionPromise;

    const clearPromise = performClearSessionState();
    clearSessionPromise = clearPromise;
    void clearPromise
      .finally(() => {
        if (clearSessionPromise === clearPromise) clearSessionPromise = null;
      })
      .catch((): undefined => undefined);
    return clearPromise;
  };

  const refreshPersistedContext = (): Promise<EnterpriseUserContext | null> => {
    assertCurrentLifecycle();
    if (activeContext) return Promise.resolve(activeContext);
    if (automaticHydrationBlocked) return Promise.resolve(null);
    if (hydrationPromise) return hydrationPromise;

    const generationAtStart = sessionGeneration;
    const hydration = (async (): Promise<EnterpriseUserContext | null> => {
      const openId = await runSessionMutation('read', () => sessionStore.loadOpenId());
      assertCurrentLifecycle();
      if (sessionGeneration !== generationAtStart) throw bridgeError('MISSING_CONTEXT');
      if (openId === null) return null;

      const context = await apiClient.getUserContext(openId);
      assertCurrentLifecycle();
      if (sessionGeneration !== generationAtStart) throw bridgeError('MISSING_CONTEXT');
      if (context.registered === false) {
        await clearSessionState();
        assertCurrentLifecycle();
        return null;
      }
      if (!isRegisteredContext(context, openId)) throw bridgeError('INVALID_RESPONSE');

      assertCurrentLifecycle();
      activeContext = context;
      return context;
    })();
    hydrationPromise = hydration;
    void hydration
      .finally(() => {
        if (hydrationPromise === hydration) hydrationPromise = null;
      })
      .catch((): undefined => undefined);
    return hydration;
  };

  const requireActiveContext = async (): Promise<EnterpriseUserContext> => {
    const context = await refreshPersistedContext();
    assertCurrentLifecycle();
    if (!context) throw bridgeError('MISSING_CONTEXT');
    return context;
  };

  const commitAuthenticatedContext = async (
    openId: string,
    context: EnterpriseUserContext,
    generationAtStart: number
  ): Promise<void> => {
    assertCurrentLifecycle();
    if (sessionGeneration !== generationAtStart) throw bridgeError('MISSING_CONTEXT');
    sessionGeneration += 1;
    const commitGeneration = sessionGeneration;
    activeContext = null;
    automaticHydrationBlocked = true;

    await runSessionMutation('write', () => sessionStore.saveOpenId(openId));
    assertCurrentLifecycle();
    if (sessionGeneration !== commitGeneration) throw bridgeError('MISSING_CONTEXT');
    activeContext = context;
    automaticHydrationBlocked = false;
  };

  const wrapHandler = (fallbackCode: EnterpriseIpcErrorCode, operation: EnterpriseOperation): EnterpriseIpcHandler => {
    return async (event, ...args) => {
      let trustedSender = false;
      try {
        trustedSender = senderGuard(event);
      } catch {
        trustedSender = false;
      }
      if (!trustedSender) return failureResult('UNTRUSTED_SENDER');

      try {
        await lifecycleReady;
        assertCurrentLifecycle();
        const data = await operation(event, ...args);
        assertCurrentLifecycle();
        return successResult(data);
      } catch (error) {
        return failureResult(sanitizeFailureCode(error, fallbackCode));
      }
    };
  };

  const handlers: ReadonlyArray<readonly [string, EnterpriseIpcHandler]> = [
    [
      ENTERPRISE_IPC_CHANNELS.AUTH_CREATE,
      wrapHandler('AUTH_CREATE_FAILED', async () => {
        const session = await apiClient.createLoginSession();
        assertCurrentLifecycle();
        return session;
      }),
    ],
    [
      ENTERPRISE_IPC_CHANNELS.AUTH_POLL,
      wrapHandler('AUTH_POLL_FAILED', async (_event, loginKey) => {
        const parsedLoginKey = loginKeySchema.safeParse(loginKey);
        if (!parsedLoginKey.success) throw bridgeError('INVALID_REQUEST');
        const generationAtStart = sessionGeneration;
        const result = await apiClient.pollLoginSession(parsedLoginKey.data);
        assertCurrentLifecycle();
        if (result.status !== 'AUTHENTICATED') return result;
        if (!isRegisteredContext(result.userContext, result.openId)) throw bridgeError('INVALID_AUTH_RESULT');

        await commitAuthenticatedContext(result.openId, result.userContext, generationAtStart);
        assertCurrentLifecycle();
        return result;
      }),
    ],
    [
      ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION,
      wrapHandler('REGISTRATION_FAILED', async (_event, untrustedOpenId) => {
        const parsedOpenId = registrationOpenIdSchema.safeParse(untrustedOpenId);
        if (!parsedOpenId.success) throw bridgeError('INVALID_REQUEST');
        const openId = parsedOpenId.data;
        const generationAtStart = sessionGeneration;
        const context = await apiClient.getUserContext(openId);
        assertCurrentLifecycle();
        if (!isRegisteredContext(context, openId)) throw bridgeError('REGISTRATION_INCOMPLETE');

        await commitAuthenticatedContext(openId, context, generationAtStart);
        assertCurrentLifecycle();
        return context;
      }),
    ],
    [
      ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE,
      wrapHandler('SESSION_RESTORE_FAILED', async () => {
        const context = await refreshPersistedContext();
        assertCurrentLifecycle();
        return context;
      }),
    ],
    [
      ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR,
      wrapHandler('SESSION_CLEAR_FAILED', async () => {
        await clearSessionState();
        assertCurrentLifecycle();
      }),
    ],
    [
      ENTERPRISE_IPC_CHANNELS.REQUEST,
      wrapHandler('REQUEST_FAILED', async (_event, request) => {
        const parsedRequest = parseStrictEnterpriseRequest(request);
        if (!parsedRequest) throw bridgeError('INVALID_REQUEST');
        const generationAtStart = sessionGeneration;
        const context = await requireActiveContext();
        assertCurrentLifecycle();
        if (sessionGeneration !== generationAtStart) throw bridgeError('MISSING_CONTEXT');
        const response = await apiClient.request(parsedRequest, context);
        assertCurrentLifecycle();
        if (sessionGeneration !== generationAtStart) throw bridgeError('MISSING_CONTEXT');
        return protectEnterpriseResponse(response, parsedRequest.operation);
      }),
    ],
  ];

  for (const [channel] of handlers) ipcMain.removeHandler(channel);
  for (const [channel, handler] of handlers) ipcMain.handle(channel, handler);
}

let defaultCustomerServiceGateway: CustomerServiceBridgeGateway | undefined;
let unsubscribeCustomerServiceBridgeEvents: (() => void) | undefined;

const customerServiceFailure = (code: CustomerServiceIpcErrorCode): CustomerServiceIpcResult<never> => ({
  ok: false,
  error: { code, message: CUSTOMER_SERVICE_IPC_ERROR_MESSAGES[code] },
});

const normalizeCustomerServiceBridgeError = (error: unknown): CustomerServiceIpcErrorCode => {
  if (error instanceof z.ZodError) return 'INVALID_REQUEST';
  if (error instanceof CustomerServiceApiError) {
    if (error.status === 401 || error.code === 'UNAUTHORIZED') return 'UNAUTHORIZED';
    if (error.code === 'MISSING_ENTERPRISE_SESSION') return 'MISSING_ENTERPRISE_SESSION';
    if (error.code === 'FORBIDDEN_CUSTOMER') return 'FORBIDDEN_CUSTOMER';
    if (error.code === 'FORBIDDEN_STAFF' || error.status === 403) return 'FORBIDDEN_STAFF';
    if (Object.prototype.hasOwnProperty.call(CUSTOMER_SERVICE_IPC_ERROR_MESSAGES, error.code)) {
      return error.code as CustomerServiceIpcErrorCode;
    }
    if (error.status >= 400) return error.status === 408 ? 'TIMEOUT' : 'API_FAILURE';
  }
  return 'REQUEST_FAILED';
};

const broadcastCustomerServiceEvent = (event: CustomerServiceServerEnvelope): void => {
  const expectedUrl = getExpectedRendererUrl();
  if (!expectedUrl) return;
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      if (
        !window.isDestroyed() &&
        !window.webContents.isDestroyed() &&
        hasExactRendererLocation(window.webContents.getURL(), expectedUrl)
      ) {
        window.webContents.send(CUSTOMER_SERVICE_IPC_CHANNELS.EVENT, event);
      }
    } catch {
      // A closing window is skipped without interrupting delivery to other windows.
    }
  }
};

const getDefaultCustomerServiceGateway = (): CustomerServiceBridgeGateway => {
  defaultCustomerServiceGateway ??= new CustomerServiceGateway({
    sessionStore: getDefaultSessionStore(),
    desktopIntegration: {
      shouldNotify: shouldNotifyCustomerServiceMessage,
      showMessageNotification: async ({ conversationId, message }) => {
        const fallbackTitle = i18n.t('enterprise.customerService.title');
        const title = message.senderName?.trim() || fallbackTitle;
        const rawBody =
          message.messageType === 'TEXT' && message.textContent?.trim()
            ? message.textContent.trim()
            : message.messageType === 'IMAGE'
              ? i18n.t('enterprise.customerService.timeline.imageAlt')
              : i18n.t('enterprise.customerService.list.noPreview');
        const body = rawBody.length > 120 ? `${rawBody.slice(0, 120)}…` : rawBody;
        await showNotification({
          title,
          body,
          customer_service_conversation_id: conversationId,
        });
      },
      setUnreadCount: setCustomerServiceUnreadCount,
    },
    isPackaged: app.isPackaged,
  });
  return defaultCustomerServiceGateway;
};

/** Registers the fixed customer-service IPC commands under the enterprise trust boundary. */
export function initCustomerServiceBridge(dependencies: CustomerServiceBridgeDependencies = {}): void {
  const gateway = dependencies.gateway ?? getDefaultCustomerServiceGateway();
  const ipcMain = dependencies.ipcMain ?? (electronIpcMain as unknown as CustomerServiceIpcMain);
  const senderGuard =
    dependencies.senderGuard ?? ((event: unknown) => isTrustedEnterpriseSender(event as IpcMainInvokeEvent));
  const eventSink = dependencies.eventSink ?? broadcastCustomerServiceEvent;

  const createHandler =
    (
      inputSchema: z.ZodTypeAny | undefined,
      outputSchema: z.ZodTypeAny,
      operation: (input: unknown) => unknown | Promise<unknown>
    ): CustomerServiceIpcHandler =>
    async (event, ...args) => {
      if (!senderGuard(event)) return customerServiceFailure('UNTRUSTED_SENDER');
      try {
        let input: unknown;
        if (inputSchema) {
          if (args.length !== 1) return customerServiceFailure('INVALID_REQUEST');
          input = inputSchema.parse(args[0]);
        } else if (args.length !== 0) {
          return customerServiceFailure('INVALID_REQUEST');
        }
        const result = await operation(input);
        const output = outputSchema.safeParse(result);
        if (!output.success) return customerServiceFailure('INVALID_RESPONSE');
        return { ok: true, data: output.data };
      } catch (error) {
        return customerServiceFailure(normalizeCustomerServiceBridgeError(error));
      }
    };

  const handlers: Array<[string, CustomerServiceIpcHandler]> = [
    [
      CUSTOMER_SERVICE_IPC_CHANNELS.CONNECT,
      createHandler(undefined, customerServiceConnectionSnapshotSchema, () => gateway.connect()),
    ],
    [CUSTOMER_SERVICE_IPC_CHANNELS.DISCONNECT, createHandler(undefined, z.void(), () => gateway.disconnect())],
    [
      CUSTOMER_SERVICE_IPC_CHANNELS.LIST_CONVERSATIONS,
      createHandler(
        CUSTOMER_SERVICE_COMMAND_SCHEMAS.listConversations,
        customerServicePageSchema(customerServiceConversationSchema),
        (request) => gateway.listConversations(request as CustomerServiceConversationListRequest)
      ),
    ],
    [
      CUSTOMER_SERVICE_IPC_CHANNELS.GET_CONVERSATION,
      createHandler(CUSTOMER_SERVICE_COMMAND_SCHEMAS.getConversation, customerServiceConversationSchema, (request) =>
        gateway.getConversation(request as CustomerServiceConversationIdRequest)
      ),
    ],
    [
      CUSTOMER_SERVICE_IPC_CHANNELS.GET_HISTORY,
      createHandler(
        CUSTOMER_SERVICE_COMMAND_SCHEMAS.getHistory,
        customerServicePageSchema(customerServiceMessageSchema),
        (request) => gateway.getHistory(request as CustomerServiceMessageHistoryRequest)
      ),
    ],
    [
      CUSTOMER_SERVICE_IPC_CHANNELS.SEND_MESSAGE,
      createHandler(CUSTOMER_SERVICE_COMMAND_SCHEMAS.sendMessage, z.string().uuid(), (request) =>
        gateway.sendMessage(request as CustomerServiceSendMessageRequest)
      ),
    ],
    [
      CUSTOMER_SERVICE_IPC_CHANNELS.MARK_READ,
      createHandler(CUSTOMER_SERVICE_COMMAND_SCHEMAS.markRead, customerServiceReadResultSchema, (request) =>
        gateway.markRead(request as CustomerServiceMarkReadRequest)
      ),
    ],
    [
      CUSTOMER_SERVICE_IPC_CHANNELS.UPLOAD_IMAGE,
      createHandler(CUSTOMER_SERVICE_COMMAND_SCHEMAS.uploadImage, customerServiceImageSchema, (request) =>
        gateway.uploadImage(request as CustomerServiceUploadImageRequest)
      ),
    ],
    [
      CUSTOMER_SERVICE_IPC_CHANNELS.LIST_CANDIDATES,
      createHandler(
        CUSTOMER_SERVICE_COMMAND_SCHEMAS.listCandidates,
        customerServicePageSchema(customerServiceStaffCandidateSchema),
        (request) => gateway.listCandidates(request as CustomerServiceStaffCandidatesRequest)
      ),
    ],
    [
      CUSTOMER_SERVICE_IPC_CHANNELS.TRANSFER_CONVERSATION,
      createHandler(
        CUSTOMER_SERVICE_COMMAND_SCHEMAS.transferConversation,
        customerServiceConversationSchema,
        (request) => gateway.transferConversation(request as CustomerServiceTransferRequest)
      ),
    ],
    [
      CUSTOMER_SERVICE_IPC_CHANNELS.CLOSE_CONVERSATION,
      createHandler(CUSTOMER_SERVICE_COMMAND_SCHEMAS.closeConversation, customerServiceConversationSchema, (request) =>
        gateway.closeConversation(request as CustomerServiceCloseRequest)
      ),
    ],
  ];

  for (const [channel] of handlers) ipcMain.removeHandler(channel);
  for (const [channel, handler] of handlers) ipcMain.handle(channel, handler);

  unsubscribeCustomerServiceBridgeEvents?.();
  unsubscribeCustomerServiceBridgeEvents = gateway.subscribe((untrustedEvent) => {
    const parsed = customerServiceServerEnvelopeSchema.safeParse(untrustedEvent);
    if (parsed.success) eventSink(parsed.data as CustomerServiceServerEnvelope);
  });
}

let defaultCustomerConsultationGateway: CustomerConsultationBridgeGateway | undefined;
let unsubscribeCustomerConsultationBridgeEvents: (() => void) | undefined;

const broadcastCustomerConsultationEvent = (event: CustomerServiceServerEnvelope): void => {
  const expectedUrl = getExpectedRendererUrl();
  if (!expectedUrl) return;
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      if (
        !window.isDestroyed() &&
        !window.webContents.isDestroyed() &&
        hasExactRendererLocation(window.webContents.getURL(), expectedUrl)
      ) {
        window.webContents.send(CUSTOMER_CONSULTATION_IPC_CHANNELS.EVENT, event);
      }
    } catch {
      // A closing window is skipped without interrupting delivery to other windows.
    }
  }
};

const getDefaultCustomerConsultationGateway = (): CustomerConsultationBridgeGateway => {
  defaultCustomerConsultationGateway ??= new CustomerConsultationGateway({
    sessionStore: getDefaultSessionStore(),
    desktopIntegration: {
      shouldNotify: shouldNotifyCustomerConsultationMessage,
      showMessageNotification: async ({ message }) => {
        const title = message.senderName?.trim() || i18n.t('enterprise.consultation.timeline.staff');
        // Keep message content off desktop lock screens. A fixed localized
        // summary still tells the customer why the notification appeared.
        const body = i18n.t('enterprise.consultation.timeline.newMessages');
        await showNotification({ title, body, customer_consultation: true });
      },
      setUnreadCount: setCustomerConsultationUnreadCount,
    },
    isPackaged: app.isPackaged,
  });
  return defaultCustomerConsultationGateway;
};

/** Registers the customer-only IPC surface under the enterprise sender boundary. */
export function initCustomerConsultationBridge(dependencies: CustomerConsultationBridgeDependencies = {}): void {
  const gateway = dependencies.gateway ?? getDefaultCustomerConsultationGateway();
  const ipcMain = dependencies.ipcMain ?? (electronIpcMain as unknown as CustomerServiceIpcMain);
  const senderGuard =
    dependencies.senderGuard ?? ((event: unknown) => isTrustedEnterpriseSender(event as IpcMainInvokeEvent));
  const eventSink = dependencies.eventSink ?? broadcastCustomerConsultationEvent;

  const createHandler =
    (
      inputSchema: z.ZodTypeAny | undefined,
      outputSchema: z.ZodTypeAny,
      operation: (input: unknown) => unknown | Promise<unknown>
    ): CustomerServiceIpcHandler =>
    async (event, ...args) => {
      if (!senderGuard(event)) return customerServiceFailure('UNTRUSTED_SENDER');
      try {
        let input: unknown;
        if (inputSchema) {
          if (args.length !== 1) return customerServiceFailure('INVALID_REQUEST');
          input = inputSchema.parse(args[0]);
        } else if (args.length !== 0) {
          return customerServiceFailure('INVALID_REQUEST');
        }
        const output = outputSchema.safeParse(await operation(input));
        if (!output.success) return customerServiceFailure('INVALID_RESPONSE');
        return { ok: true, data: output.data };
      } catch (error) {
        return customerServiceFailure(normalizeCustomerServiceBridgeError(error));
      }
    };

  const handlers: Array<[string, CustomerServiceIpcHandler]> = [
    [
      CUSTOMER_CONSULTATION_IPC_CHANNELS.CONNECT,
      createHandler(undefined, customerServiceConnectionSnapshotSchema, () => gateway.connect()),
    ],
    [CUSTOMER_CONSULTATION_IPC_CHANNELS.DISCONNECT, createHandler(undefined, z.void(), () => gateway.disconnect())],
    [
      CUSTOMER_CONSULTATION_IPC_CHANNELS.OPEN_CONVERSATION,
      createHandler(undefined, customerServiceConversationSchema, () => gateway.openConversation()),
    ],
    [
      CUSTOMER_CONSULTATION_IPC_CHANNELS.START_CONVERSATION,
      createHandler(undefined, customerServiceConversationSchema, () => gateway.startConversation()),
    ],
    [
      CUSTOMER_CONSULTATION_IPC_CHANNELS.GET_CONVERSATION,
      createHandler(
        CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.getConversation,
        customerServiceConversationSchema,
        (request) => gateway.getConversation(request as CustomerServiceConversationIdRequest)
      ),
    ],
    [
      CUSTOMER_CONSULTATION_IPC_CHANNELS.GET_HISTORY,
      createHandler(
        CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.getHistory,
        customerServicePageSchema(customerServiceMessageSchema),
        (request) => gateway.getHistory(request as CustomerServiceMessageHistoryRequest)
      ),
    ],
    [
      CUSTOMER_CONSULTATION_IPC_CHANNELS.SEND_MESSAGE,
      createHandler(CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.sendMessage, z.string().uuid(), (request) =>
        gateway.sendMessage(request as CustomerServiceSendMessageRequest)
      ),
    ],
    [
      CUSTOMER_CONSULTATION_IPC_CHANNELS.MARK_READ,
      createHandler(CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.markRead, customerServiceReadResultSchema, (request) =>
        gateway.markRead(request as CustomerServiceMarkReadRequest)
      ),
    ],
    [
      CUSTOMER_CONSULTATION_IPC_CHANNELS.UPLOAD_IMAGE,
      createHandler(CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.uploadImage, customerServiceImageSchema, (request) =>
        gateway.uploadImage(request as CustomerServiceUploadImageRequest)
      ),
    ],
    [
      CUSTOMER_CONSULTATION_IPC_CHANNELS.CLOSE_CONVERSATION,
      createHandler(
        CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.closeConversation,
        customerServiceConversationSchema,
        (request) => gateway.closeConversation(request as CustomerServiceCloseRequest)
      ),
    ],
  ];

  for (const [channel] of handlers) ipcMain.removeHandler(channel);
  for (const [channel, handler] of handlers) ipcMain.handle(channel, handler);

  unsubscribeCustomerConsultationBridgeEvents?.();
  unsubscribeCustomerConsultationBridgeEvents = gateway.subscribe((untrustedEvent) => {
    const parsed = customerServiceServerEnvelopeSchema.safeParse(untrustedEvent);
    if (parsed.success) eventSink(parsed.data as CustomerServiceServerEnvelope);
  });
}

let defaultDesktopNotificationGateway: DesktopNotificationBridgeGateway | undefined;
let unsubscribeDesktopNotificationBridgeEvents: (() => void) | undefined;

const desktopNotificationFailure = (code: DesktopNotificationIpcErrorCode): DesktopNotificationIpcResult<never> => ({
  ok: false,
  error: { code, message: DESKTOP_NOTIFICATION_IPC_ERROR_MESSAGES[code] },
});

const normalizeDesktopNotificationBridgeError = (error: unknown): DesktopNotificationIpcErrorCode => {
  if (error instanceof z.ZodError) return 'INVALID_REQUEST';
  if (error instanceof DesktopNotificationApiError) {
    if (error.code === 'MISSING_ENTERPRISE_SESSION' || error.status === 401) return 'MISSING_ENTERPRISE_SESSION';
    if (Object.prototype.hasOwnProperty.call(DESKTOP_NOTIFICATION_IPC_ERROR_MESSAGES, error.code)) {
      return error.code as DesktopNotificationIpcErrorCode;
    }
    if (error.status >= 400) return error.status === 408 ? 'TIMEOUT' : 'API_FAILURE';
  }
  return 'REQUEST_FAILED';
};

const broadcastDesktopNotificationEvent = (event: DesktopNotificationServerEnvelope): void => {
  const expectedUrl = getExpectedRendererUrl();
  if (!expectedUrl) return;
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      if (
        !window.isDestroyed() &&
        !window.webContents.isDestroyed() &&
        hasExactRendererLocation(window.webContents.getURL(), expectedUrl)
      ) {
        window.webContents.send(DESKTOP_NOTIFICATION_IPC_CHANNELS.EVENT, event);
      }
    } catch {
      // A closing window is skipped without interrupting other trusted renderer windows.
    }
  }
};

const getDefaultDesktopNotificationGateway = (): DesktopNotificationBridgeGateway => {
  defaultDesktopNotificationGateway ??= new DesktopNotificationGateway({
    sessionStore: getDefaultSessionStore(),
    desktopIntegration: {
      shouldNotify: shouldNotifyDesktopNotification,
      showNotification: ({ notification }) => {
        // Customer-service notification content is intentionally replaced even
        // if an upstream publisher accidentally included a message preview.
        const body =
          notification.type === 'CUSTOMER_SERVICE'
            ? i18n.t('enterprise.customerService.timeline.newMessages')
            : (notification.content?.trim() || notification.title).slice(0, 160);
        return showNotification({
          title: notification.title,
          body,
          desktop_notification: notification.action
            ? {
                action: notification.action,
                businessId: notification.businessId,
                notificationId: notification.notificationId,
              }
            : undefined,
        });
      },
      setUnreadCount: setDesktopNotificationUnreadCount,
    },
    isPackaged: app.isPackaged,
  });
  return defaultDesktopNotificationGateway;
};

/** Registers the notification-center IPC allowlist at the same enterprise sender boundary as the workbench. */
export function initDesktopNotificationBridge(dependencies: DesktopNotificationBridgeDependencies = {}): void {
  const gateway = dependencies.gateway ?? getDefaultDesktopNotificationGateway();
  const ipcMain = dependencies.ipcMain ?? (electronIpcMain as unknown as DesktopNotificationIpcMain);
  const senderGuard =
    dependencies.senderGuard ?? ((event: unknown) => isTrustedEnterpriseSender(event as IpcMainInvokeEvent));
  const eventSink = dependencies.eventSink ?? broadcastDesktopNotificationEvent;

  const createHandler =
    (
      inputSchema: z.ZodTypeAny | undefined,
      outputSchema: z.ZodTypeAny,
      operation: (input: unknown) => unknown | Promise<unknown>
    ): DesktopNotificationIpcHandler =>
    async (event, ...args) => {
      if (!senderGuard(event)) return desktopNotificationFailure('UNTRUSTED_SENDER');
      try {
        let input: unknown;
        if (inputSchema) {
          if (args.length !== 1) return desktopNotificationFailure('INVALID_REQUEST');
          input = inputSchema.parse(args[0]);
        } else if (args.length !== 0) {
          return desktopNotificationFailure('INVALID_REQUEST');
        }
        const output = outputSchema.safeParse(await operation(input));
        if (!output.success) return desktopNotificationFailure('INVALID_RESPONSE');
        return { ok: true, data: output.data };
      } catch (error) {
        return desktopNotificationFailure(normalizeDesktopNotificationBridgeError(error));
      }
    };

  const handlers: Array<[string, DesktopNotificationIpcHandler]> = [
    [
      DESKTOP_NOTIFICATION_IPC_CHANNELS.CONNECT,
      createHandler(undefined, desktopNotificationConnectionSnapshotSchema, () => gateway.connect()),
    ],
    [DESKTOP_NOTIFICATION_IPC_CHANNELS.DISCONNECT, createHandler(undefined, z.void(), () => gateway.disconnect())],
    [
      DESKTOP_NOTIFICATION_IPC_CHANNELS.LIST,
      createHandler(DESKTOP_NOTIFICATION_COMMAND_SCHEMAS.list, desktopNotificationPageSchema, (request) =>
        gateway.list(request as DesktopNotificationListRequest)
      ),
    ],
    [
      DESKTOP_NOTIFICATION_IPC_CHANNELS.GET_UNREAD_COUNT,
      createHandler(undefined, desktopNotificationUnreadCountSchema, () => gateway.getUnreadCount()),
    ],
    [
      DESKTOP_NOTIFICATION_IPC_CHANNELS.MARK_READ,
      createHandler(DESKTOP_NOTIFICATION_COMMAND_SCHEMAS.markRead, desktopNotificationChangedResultSchema, (request) =>
        gateway.markRead((request as { notificationId: string }).notificationId)
      ),
    ],
    [
      DESKTOP_NOTIFICATION_IPC_CHANNELS.MARK_ALL_READ,
      createHandler(undefined, desktopNotificationMarkAllReadResultSchema, () => gateway.markAllRead()),
    ],
  ];

  for (const [channel] of handlers) ipcMain.removeHandler(channel);
  for (const [channel, handler] of handlers) ipcMain.handle(channel, handler);

  unsubscribeDesktopNotificationBridgeEvents?.();
  unsubscribeDesktopNotificationBridgeEvents = gateway.subscribe((untrustedEvent) => {
    const parsed = desktopNotificationServerEnvelopeSchema.safeParse(untrustedEvent);
    if (parsed.success) eventSink(parsed.data as DesktopNotificationServerEnvelope);
  });
}

let defaultDesktopVersionGateway: DesktopVersionBridgeGateway | undefined;

const desktopVersionFailure = (code: DesktopVersionIpcErrorCode): DesktopVersionIpcResult<never> => ({
  ok: false,
  error: { code, message: DESKTOP_VERSION_IPC_ERROR_MESSAGES[code] },
});

const normalizeDesktopVersionBridgeError = (error: unknown): DesktopVersionIpcErrorCode => {
  if (error instanceof DesktopVersionGatewayError) return error.code;
  if (error instanceof DesktopVersionDownloadError) return error.code;
  if (error instanceof DesktopVersionApiError) {
    if (error.code === 'MISSING_ENTERPRISE_SESSION' || error.status === 401) return 'MISSING_ENTERPRISE_SESSION';
    return error.code;
  }
  return 'REQUEST_FAILED';
};

const getDefaultDesktopVersionGateway = (): DesktopVersionBridgeGateway => {
  defaultDesktopVersionGateway ??= new DesktopVersionGateway({
    sessionStore: getDefaultSessionStore(),
    runtime: {
      getVersion: () => app.getVersion(),
      getPath: (name) => app.getPath(name),
      platform: process.platform,
      arch: process.arch,
      openPath: (filePath) => shell.openPath(filePath),
    },
    isPackaged: app.isPackaged,
  });
  return defaultDesktopVersionGateway;
};

/**
 * Exposes only a no-argument update flow to a trusted enterprise renderer.
 * Installer URL, hash, OpenID and final file selection all remain in the main process.
 */
export function initDesktopVersionBridge(dependencies: DesktopVersionBridgeDependencies = {}): void {
  const gateway = dependencies.gateway ?? getDefaultDesktopVersionGateway();
  const ipcMain = dependencies.ipcMain ?? (electronIpcMain as unknown as DesktopVersionIpcMain);
  const senderGuard =
    dependencies.senderGuard ?? ((event: unknown) => isTrustedEnterpriseSender(event as IpcMainInvokeEvent));

  const createHandler =
    (outputSchema: z.ZodTypeAny, operation: () => unknown | Promise<unknown>): DesktopVersionIpcHandler =>
    async (event, ...args) => {
      if (!senderGuard(event)) return desktopVersionFailure('UNTRUSTED_SENDER');
      if (args.length !== 0) return desktopVersionFailure('INVALID_REQUEST');
      try {
        const output = outputSchema.safeParse(await operation());
        if (!output.success) return desktopVersionFailure('INVALID_RESPONSE');
        return { ok: true, data: output.data };
      } catch (error) {
        return desktopVersionFailure(normalizeDesktopVersionBridgeError(error));
      }
    };

  const handlers: Array<[string, DesktopVersionIpcHandler]> = [
    [DESKTOP_VERSION_IPC_CHANNELS.CHECK, createHandler(desktopVersionCheckResultSchema, () => gateway.check())],
    [
      DESKTOP_VERSION_IPC_CHANNELS.DOWNLOAD,
      createHandler(desktopVersionDownloadResultSchema, () => gateway.downloadLatest()),
    ],
    [
      DESKTOP_VERSION_IPC_CHANNELS.OPEN_DOWNLOADED,
      createHandler(desktopVersionOpenDownloadedResultSchema, () => gateway.openDownloadedInstaller()),
    ],
  ];

  for (const [channel] of handlers) ipcMain.removeHandler(channel);
  for (const [channel, handler] of handlers) ipcMain.handle(channel, handler);
}
