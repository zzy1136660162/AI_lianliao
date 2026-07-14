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
import { ADAPTER_BRIDGE_EVENT_KEY } from '../common/adapter/constant';
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
