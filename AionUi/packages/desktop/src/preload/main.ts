/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Hook Sentry IPC so the renderer SDK uses ipcRenderer.send instead of falling
// back to fetch('sentry-ipc://...'), which floods the DevTools Network panel.
// Bundled into this preload via `externalizeDepsPlugin({ exclude: [...] })` so
// Electron's sandbox-mode preload doesn't try to resolve it from node_modules.
import '@sentry/electron/preload';
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { z } from 'zod';
import { ADAPTER_BRIDGE_EVENT_KEY } from '../common/adapter/constant';
import {
  CUSTOMER_SERVICE_IPC_CHANNELS,
  CUSTOMER_SERVICE_IPC_ERROR_MESSAGES,
  CUSTOMER_SERVICE_NAVIGATE_CHANNEL,
} from '../common/enterprise/customer-service/constants';
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
} from '../common/enterprise/customer-service/contracts';
import {
  CUSTOMER_SERVICE_COMMAND_SCHEMAS,
  customerServiceConnectionSnapshotSchema,
  customerServiceConversationSchema,
  customerServiceImageSchema,
  customerServiceIpcResultSchema,
  customerServiceMessageSchema,
  customerServiceNavigationDetailSchema,
  customerServicePageSchema,
  customerServiceReadResultSchema,
  customerServiceServerEnvelopeSchema,
  customerServiceStaffCandidateSchema,
} from '../common/enterprise/customer-service/schemas';
import { ENTERPRISE_IPC_CHANNELS, ENTERPRISE_IPC_ERROR_MESSAGES } from '../common/enterprise/constants';
import type {
  EnterpriseIpcErrorCode,
  EnterpriseIpcResult,
  EnterpriseLoginPollResult,
  EnterpriseLoginSession,
  EnterpriseRequest,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '../common/enterprise/contracts';

const DANGEROUS_DATA_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const hasExactPlainDataProperties = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))) {
    return false;
  }
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor !== undefined && descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    );
  });
};

const getOwnDataValue = (value: Record<string, unknown>, key: string): unknown =>
  Object.getOwnPropertyDescriptor(value, key)?.value;

const isEnterpriseIpcErrorCode = (value: unknown): value is EnterpriseIpcErrorCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ENTERPRISE_IPC_ERROR_MESSAGES, value);

const isSafePlainCloneValue = (value: unknown, ancestors = new WeakSet<object>()): boolean => {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return true;
  }
  if (typeof value !== 'object') return false;

  try {
    if (ancestors.has(value)) return false;
    ancestors.add(value);
    const prototype = Object.getPrototypeOf(value);
    const keys = Reflect.ownKeys(value);

    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) return false;
      for (const key of keys) {
        if (typeof key !== 'string') return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false;
        if (key === 'length') continue;
        if (!/^(0|[1-9][0-9]*)$/.test(key) || !descriptor.enumerable) return false;
        if (!isSafePlainCloneValue(descriptor.value, ancestors)) return false;
      }
      ancestors.delete(value);
      return true;
    }

    if (prototype !== Object.prototype) return false;
    for (const key of keys) {
      if (typeof key !== 'string' || DANGEROUS_DATA_KEYS.has(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        !isSafePlainCloneValue(descriptor.value, ancestors)
      ) {
        return false;
      }
    }
    ancestors.delete(value);
    return true;
  } catch {
    return false;
  }
};

const parseEnterpriseIpcResult = <T>(value: unknown): EnterpriseIpcResult<T> | undefined => {
  try {
    if (!hasExactPlainDataProperties(value, ['ok', 'data']) && !hasExactPlainDataProperties(value, ['ok', 'error'])) {
      return undefined;
    }
    const ok = getOwnDataValue(value, 'ok');
    if (ok === true && hasExactPlainDataProperties(value, ['ok', 'data'])) {
      const data = getOwnDataValue(value, 'data');
      if (!isSafePlainCloneValue(data)) return undefined;
      return { ok: true, data: data as T };
    }
    if (ok !== false || !hasExactPlainDataProperties(value, ['ok', 'error'])) return undefined;

    const error = getOwnDataValue(value, 'error');
    if (!hasExactPlainDataProperties(error, ['code', 'message'])) return undefined;
    const code = getOwnDataValue(error, 'code');
    const message = getOwnDataValue(error, 'message');
    if (!isEnterpriseIpcErrorCode(code) || message !== ENTERPRISE_IPC_ERROR_MESSAGES[code]) return undefined;
    return { ok: false, error: { code, message } };
  } catch {
    return undefined;
  }
};

const enterpriseFailureResult = (code: EnterpriseIpcErrorCode): EnterpriseIpcResult<never> => ({
  ok: false,
  error: { code, message: ENTERPRISE_IPC_ERROR_MESSAGES[code] },
});

const invokeEnterprise = async <T>(channel: string, ...args: unknown[]): Promise<EnterpriseIpcResult<T>> => {
  let untrustedResult: unknown;
  try {
    untrustedResult = await ipcRenderer.invoke(channel, ...args);
  } catch {
    return enterpriseFailureResult('IPC_UNAVAILABLE');
  }

  return parseEnterpriseIpcResult<T>(untrustedResult) ?? enterpriseFailureResult('INVALID_IPC_RESPONSE');
};

const customerServiceFailureResult = (code: CustomerServiceIpcErrorCode): CustomerServiceIpcResult<never> => ({
  ok: false,
  error: { code, message: CUSTOMER_SERVICE_IPC_ERROR_MESSAGES[code] },
});

type CustomerServicePreloadRequest = {
  schema: z.ZodTypeAny;
  value: unknown;
};

const invokeCustomerService = async <T>(
  channel: string,
  responseSchema: z.ZodTypeAny,
  request?: CustomerServicePreloadRequest
): Promise<CustomerServiceIpcResult<T>> => {
  const args: unknown[] = [];
  if (request) {
    const parsedRequest = request.schema.safeParse(request.value);
    if (!parsedRequest.success) return customerServiceFailureResult('INVALID_REQUEST');
    args.push(parsedRequest.data);
  }

  let untrustedResult: unknown;
  try {
    untrustedResult = await ipcRenderer.invoke(channel, ...args);
  } catch {
    return customerServiceFailureResult('IPC_UNAVAILABLE');
  }

  const parsedResult = customerServiceIpcResultSchema(responseSchema).safeParse(untrustedResult);
  if (!parsedResult.success) return customerServiceFailureResult('INVALID_IPC_RESPONSE');
  const result = parsedResult.data as CustomerServiceIpcResult<T>;
  if (result.ok === false && result.error.message !== CUSTOMER_SERVICE_IPC_ERROR_MESSAGES[result.error.code]) {
    return customerServiceFailureResult('INVALID_IPC_RESPONSE');
  }
  return result;
};

const subscribeCustomerServiceEvents = (callback: (event: CustomerServiceServerEnvelope) => void): (() => void) => {
  if (typeof callback !== 'function') return () => undefined;
  const handler = (_event: unknown, untrustedEvent: unknown): void => {
    const parsed = customerServiceServerEnvelopeSchema.safeParse(untrustedEvent);
    if (parsed.success) callback(parsed.data as CustomerServiceServerEnvelope);
  };
  ipcRenderer.on(CUSTOMER_SERVICE_IPC_CHANNELS.EVENT, handler);
  return () => ipcRenderer.off(CUSTOMER_SERVICE_IPC_CHANNELS.EVENT, handler);
};

/**
 * @description 注入到renderer进程中, 用于与main进程通信
 * */
contextBridge.exposeInMainWorld('electronAPI', {
  emit: (name: string, data: unknown) => {
    return ipcRenderer
      .invoke(
        ADAPTER_BRIDGE_EVENT_KEY,
        JSON.stringify({
          name: name,
          data: data,
        })
      )
      .catch((error) => {
        console.error('IPC invoke error:', error);
        throw error;
      });
  },
  on: (callback: (payload: { event: unknown; value: unknown }) => void) => {
    const handler = (event: unknown, value: unknown) => {
      callback({ event, value });
    };
    ipcRenderer.on(ADAPTER_BRIDGE_EVENT_KEY, handler);
    return () => {
      ipcRenderer.off(ADAPTER_BRIDGE_EVENT_KEY, handler);
    };
  },
  // 获取拖拽文件/目录的绝对路径 / Get absolute path for dragged file/directory
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  // Feedback: collect and compress recent log files
  collectFeedbackLogs: () => ipcRenderer.invoke('feedback:collect-logs'),
  // Feedback: capture a screenshot of the current window
  captureFeedbackScreenshot: () => ipcRenderer.invoke('feedback:capture-screenshot'),
  // Feedback: forward diagnostics logs to the main process console
  logFeedbackEvent: (payload: { details?: unknown; level: 'info' | 'warn' | 'error'; message: string }) =>
    ipcRenderer.send('feedback:renderer-log', payload),
  enterprise: {
    createLoginSession: () => invokeEnterprise<EnterpriseLoginSession>(ENTERPRISE_IPC_CHANNELS.AUTH_CREATE),
    pollLoginSession: (loginKey: string) =>
      invokeEnterprise<EnterpriseLoginPollResult>(ENTERPRISE_IPC_CHANNELS.AUTH_POLL, loginKey),
    completeRegistration: (openId: string) =>
      invokeEnterprise<EnterpriseUserContext>(ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, openId),
    restoreSession: () => invokeEnterprise<EnterpriseUserContext | null>(ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE),
    clearSession: () => invokeEnterprise<void>(ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR),
    request: (request: EnterpriseRequest) =>
      invokeEnterprise<EnterpriseResponse>(ENTERPRISE_IPC_CHANNELS.REQUEST, request),
  },
  customerService: {
    connect: () =>
      invokeCustomerService<CustomerServiceConnectionSnapshot>(
        CUSTOMER_SERVICE_IPC_CHANNELS.CONNECT,
        customerServiceConnectionSnapshotSchema
      ),
    disconnect: () => invokeCustomerService<void>(CUSTOMER_SERVICE_IPC_CHANNELS.DISCONNECT, z.void()),
    listConversations: (request: CustomerServiceConversationListRequest) =>
      invokeCustomerService<CustomerServicePage<CustomerServiceConversation>>(
        CUSTOMER_SERVICE_IPC_CHANNELS.LIST_CONVERSATIONS,
        customerServicePageSchema(customerServiceConversationSchema),
        { schema: CUSTOMER_SERVICE_COMMAND_SCHEMAS.listConversations, value: request }
      ),
    getConversation: (request: CustomerServiceConversationIdRequest) =>
      invokeCustomerService<CustomerServiceConversation>(
        CUSTOMER_SERVICE_IPC_CHANNELS.GET_CONVERSATION,
        customerServiceConversationSchema,
        { schema: CUSTOMER_SERVICE_COMMAND_SCHEMAS.getConversation, value: request }
      ),
    getHistory: (request: CustomerServiceMessageHistoryRequest) =>
      invokeCustomerService<CustomerServicePage<CustomerServiceMessage>>(
        CUSTOMER_SERVICE_IPC_CHANNELS.GET_HISTORY,
        customerServicePageSchema(customerServiceMessageSchema),
        { schema: CUSTOMER_SERVICE_COMMAND_SCHEMAS.getHistory, value: request }
      ),
    sendMessage: (request: CustomerServiceSendMessageRequest) =>
      invokeCustomerService<string>(CUSTOMER_SERVICE_IPC_CHANNELS.SEND_MESSAGE, z.string().uuid(), {
        schema: CUSTOMER_SERVICE_COMMAND_SCHEMAS.sendMessage,
        value: request,
      }),
    markRead: (request: CustomerServiceMarkReadRequest) =>
      invokeCustomerService<CustomerServiceReadResult>(
        CUSTOMER_SERVICE_IPC_CHANNELS.MARK_READ,
        customerServiceReadResultSchema,
        { schema: CUSTOMER_SERVICE_COMMAND_SCHEMAS.markRead, value: request }
      ),
    uploadImage: (request: CustomerServiceUploadImageRequest) =>
      invokeCustomerService<CustomerServiceImage>(
        CUSTOMER_SERVICE_IPC_CHANNELS.UPLOAD_IMAGE,
        customerServiceImageSchema,
        { schema: CUSTOMER_SERVICE_COMMAND_SCHEMAS.uploadImage, value: request }
      ),
    listCandidates: (request: CustomerServiceStaffCandidatesRequest) =>
      invokeCustomerService<CustomerServicePage<CustomerServiceStaffCandidate>>(
        CUSTOMER_SERVICE_IPC_CHANNELS.LIST_CANDIDATES,
        customerServicePageSchema(customerServiceStaffCandidateSchema),
        { schema: CUSTOMER_SERVICE_COMMAND_SCHEMAS.listCandidates, value: request }
      ),
    transferConversation: (request: CustomerServiceTransferRequest) =>
      invokeCustomerService<CustomerServiceConversation>(
        CUSTOMER_SERVICE_IPC_CHANNELS.TRANSFER_CONVERSATION,
        customerServiceConversationSchema,
        { schema: CUSTOMER_SERVICE_COMMAND_SCHEMAS.transferConversation, value: request }
      ),
    closeConversation: (request: CustomerServiceCloseRequest) =>
      invokeCustomerService<CustomerServiceConversation>(
        CUSTOMER_SERVICE_IPC_CHANNELS.CLOSE_CONVERSATION,
        customerServiceConversationSchema,
        { schema: CUSTOMER_SERVICE_COMMAND_SCHEMAS.closeConversation, value: request }
      ),
    onEvent: subscribeCustomerServiceEvents,
  },
});

// Synchronously fetch the aioncore port and expose it to the renderer
// via contextBridge (direct window assignment is invisible under contextIsolation).
const backendPort = ipcRenderer.sendSync('get-backend-port') as number;
const initialLanguage = ipcRenderer.sendSync('get-initial-language') as string | null;
const backendStartupFailed = ipcRenderer.sendSync('get-backend-startup-failed') as boolean;
const backendStartupFailure = ipcRenderer.sendSync('get-backend-startup-failure') as unknown;
contextBridge.exposeInMainWorld('__backendPort', backendPort > 0 ? backendPort : 0);
contextBridge.exposeInMainWorld('__initialLanguage', initialLanguage ?? null);
contextBridge.exposeInMainWorld('__aionuiE2ETest', process.env.AIONUI_E2E_TEST === '1');
contextBridge.exposeInMainWorld('__backendStartupFailed', backendStartupFailed === true);
contextBridge.exposeInMainWorld('__backendStartupFailure', backendStartupFailure ?? null);

// 托盘事件监听 - 将 IPC 事件转换为 DOM 事件
// Tray event listeners - convert IPC events to DOM events
const trayEvents = [
  'tray:navigate-to-guid',
  'tray:navigate-to-conversation',
  'tray:open-about',
  'tray:pause-all-tasks',
  'tray:check-update',
];

for (const channel of trayEvents) {
  ipcRenderer.on(channel, (_event, ...args) => {
    window.dispatchEvent(new CustomEvent(channel, { detail: args[0] }));
  });
}

// Customer-service notification navigation has a stricter signed-ID boundary
// than generic tray events, so validate it before exposing a DOM event.
ipcRenderer.on(CUSTOMER_SERVICE_NAVIGATE_CHANNEL, (_event, untrustedDetail) => {
  const detail = customerServiceNavigationDetailSchema.safeParse(untrustedDetail);
  if (detail.success) {
    window.dispatchEvent(new CustomEvent(CUSTOMER_SERVICE_NAVIGATE_CHANNEL, { detail: detail.data }));
  }
});
