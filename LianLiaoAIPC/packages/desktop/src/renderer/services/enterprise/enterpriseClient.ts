import { ENTERPRISE_IPC_ERROR_MESSAGES } from '@/common/enterprise/constants';
import type {
  EnterpriseIpcErrorCode,
  EnterpriseIpcResult,
  EnterpriseLoginPollResult,
  EnterpriseLoginSession,
  EnterpriseRequest,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '@/common/enterprise/contracts';
import type { ElectronBridgeAPI } from '@/common/types/platform/electron';

export type EnterpriseRawBridge = NonNullable<ElectronBridgeAPI['enterprise']>;

export type EnterpriseClient = {
  createLoginSession: () => Promise<EnterpriseLoginSession>;
  pollLoginSession: (loginKey: string) => Promise<EnterpriseLoginPollResult>;
  completeRegistration: (openId: string) => Promise<EnterpriseUserContext>;
  restoreSession: () => Promise<EnterpriseUserContext | null>;
  clearSession: () => Promise<void>;
  request: (request: EnterpriseRequest) => Promise<EnterpriseResponse>;
};

export type EnterpriseRawBridgeProvider = () => EnterpriseRawBridge | undefined;

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

/** Error reconstructed in the renderer so its stable code never depends on contextBridge Error cloning. */
export class EnterpriseRendererError extends Error {
  declare readonly code: EnterpriseIpcErrorCode;

  constructor(code: EnterpriseIpcErrorCode) {
    super(ENTERPRISE_IPC_ERROR_MESSAGES[code]);
    this.name = 'EnterpriseRendererError';
    Object.defineProperty(this, 'code', {
      value: code,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
}

const rendererError = (code: EnterpriseIpcErrorCode): EnterpriseRendererError => new EnterpriseRendererError(code);

const invokeEnterprise = async <T>(
  getRawBridge: EnterpriseRawBridgeProvider,
  operation: (bridge: EnterpriseRawBridge) => Promise<EnterpriseIpcResult<T>>
): Promise<T> => {
  let untrustedResult: unknown;
  try {
    const bridge = getRawBridge();
    if (!bridge) throw rendererError('IPC_UNAVAILABLE');
    untrustedResult = await operation(bridge);
  } catch {
    throw rendererError('IPC_UNAVAILABLE');
  }

  const result = parseEnterpriseIpcResult<T>(untrustedResult);
  if (!result) throw rendererError('INVALID_IPC_RESPONSE');
  if (result.ok === false) throw rendererError(result.error.code);
  return result.data;
};

/** Creates a typed renderer client with an injectable raw bridge provider for non-DOM tests. */
export const createEnterpriseClient = (getRawBridge: EnterpriseRawBridgeProvider): EnterpriseClient => ({
  createLoginSession: () => invokeEnterprise(getRawBridge, (bridge) => bridge.createLoginSession()),
  pollLoginSession: (loginKey) => invokeEnterprise(getRawBridge, (bridge) => bridge.pollLoginSession(loginKey)),
  completeRegistration: (openId) => invokeEnterprise(getRawBridge, (bridge) => bridge.completeRegistration(openId)),
  restoreSession: () => invokeEnterprise(getRawBridge, (bridge) => bridge.restoreSession()),
  clearSession: () => invokeEnterprise(getRawBridge, (bridge) => bridge.clearSession()),
  request: (request) => invokeEnterprise(getRawBridge, (bridge) => bridge.request(request)),
});

const getWindowEnterpriseBridge = (): EnterpriseRawBridge | undefined =>
  typeof window === 'undefined' ? undefined : window.electronAPI?.enterprise;

/** Default enterprise client for renderer application code. */
export const enterpriseClient = createEnterpriseClient(getWindowEnterpriseBridge);
