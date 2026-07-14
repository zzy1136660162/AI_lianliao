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
  EnterpriseLoginPollResult,
  EnterpriseLoginSession,
  EnterpriseRequest,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '../common/enterprise/contracts';

type ParsedEnterpriseIpcResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: EnterpriseIpcErrorCode; message: string } };

const hasExactPlainDataProperties = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))) {
    return false;
  }
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value');
  });
};

const getOwnDataValue = (value: Record<string, unknown>, key: string): unknown =>
  Object.getOwnPropertyDescriptor(value, key)?.value;

const isEnterpriseIpcErrorCode = (value: unknown): value is EnterpriseIpcErrorCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ENTERPRISE_IPC_ERROR_MESSAGES, value);

const parseEnterpriseIpcResult = (value: unknown): ParsedEnterpriseIpcResult | undefined => {
  try {
    if (!hasExactPlainDataProperties(value, ['ok', 'data']) && !hasExactPlainDataProperties(value, ['ok', 'error'])) {
      return undefined;
    }
    const ok = getOwnDataValue(value, 'ok');
    if (ok === true && hasExactPlainDataProperties(value, ['ok', 'data'])) {
      return { ok: true, data: getOwnDataValue(value, 'data') };
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

const createEnterpriseRendererError = (
  code: EnterpriseIpcErrorCode
): Error & { readonly code: EnterpriseIpcErrorCode } => {
  const error = new Error(ENTERPRISE_IPC_ERROR_MESSAGES[code]);
  Object.defineProperty(error, 'code', {
    value: code,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  return error as Error & { readonly code: EnterpriseIpcErrorCode };
};

const invokeEnterprise = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
  let untrustedResult: unknown;
  try {
    untrustedResult = await ipcRenderer.invoke(channel, ...args);
  } catch {
    throw createEnterpriseRendererError('IPC_UNAVAILABLE');
  }

  const result = parseEnterpriseIpcResult(untrustedResult);
  if (!result) throw createEnterpriseRendererError('INVALID_IPC_RESPONSE');
  if (result.ok === false) throw createEnterpriseRendererError(result.error.code);
  return result.data as T;
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
