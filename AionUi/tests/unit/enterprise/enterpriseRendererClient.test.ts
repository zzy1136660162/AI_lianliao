import { describe, expect, it, vi } from 'vitest';

import { ENTERPRISE_IPC_ERROR_MESSAGES } from '@/common/enterprise/constants';
import type {
  EnterpriseIpcResult,
  EnterpriseLoginPollResult,
  EnterpriseLoginSession,
  EnterpriseRequest,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '@/common/enterprise/contracts';
import {
  createEnterpriseClient,
  EnterpriseRendererError,
  type EnterpriseRawBridge,
} from '@/renderer/services/enterprise/enterpriseClient';

const LOGIN_SESSION: EnterpriseLoginSession = {
  loginKey: 'enterprise_desktop_123456789012345678',
  qrDataUrl: 'data:image/png;base64,AA==',
  expiresAt: '2026-07-14T12:00:00.000Z',
  pollIntervalMs: 2000,
};

const USER_CONTEXT: EnterpriseUserContext = {
  registered: true,
  openId: 'wx-open-id',
  userId: '101',
  companyId: '202',
};

const REQUEST: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };
const RESPONSE: EnterpriseResponse = {
  operation: 'project.dashboard',
  data: {
    projectCount: 0,
    categoryL1Count: 0,
    categoryL2Count: 0,
    materialShortNameCount: 0,
    materialNameCount: 0,
    investmentTotalYi: 0,
    regionDistribution: [],
    budgetDistribution: [],
    categoryDistribution: [],
    materialTop: [],
  },
};

const success = <T>(data: T): EnterpriseIpcResult<T> => structuredClone({ ok: true, data });

const makeRawBridge = (): EnterpriseRawBridge => ({
  createLoginSession: vi.fn(async () => success(LOGIN_SESSION)),
  pollLoginSession: vi.fn(async () => success<EnterpriseLoginPollResult>({ status: 'WAITING' })),
  completeRegistration: vi.fn(async () => success(USER_CONTEXT)),
  restoreSession: vi.fn(async () => success(USER_CONTEXT)),
  clearSession: vi.fn(async () => success(undefined)),
  request: vi.fn(async () => success(RESPONSE)),
});

const getRendererError = async (operation: () => Promise<unknown>): Promise<EnterpriseRendererError> => {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(EnterpriseRendererError);
    return error as EnterpriseRendererError;
  }
  throw new Error('Expected enterprise renderer operation to reject.');
};

describe('enterprise renderer client', () => {
  it('unwraps structured-cloned success envelopes for all six typed methods', async () => {
    const rawBridge = makeRawBridge();
    const client = createEnterpriseClient(() => rawBridge);

    await expect(client.createLoginSession()).resolves.toEqual(LOGIN_SESSION);
    await expect(client.pollLoginSession(LOGIN_SESSION.loginKey)).resolves.toEqual({ status: 'WAITING' });
    await expect(client.completeRegistration(USER_CONTEXT.openId)).resolves.toEqual(USER_CONTEXT);
    await expect(client.restoreSession()).resolves.toEqual(USER_CONTEXT);
    await expect(client.clearSession()).resolves.toBeUndefined();
    await expect(client.request(REQUEST)).resolves.toEqual(RESPONSE);
    expect(rawBridge.pollLoginSession).toHaveBeenCalledWith(LOGIN_SESSION.loginKey);
    expect(rawBridge.completeRegistration).toHaveBeenCalledWith(USER_CONTEXT.openId);
    expect(rawBridge.request).toHaveBeenCalledWith(REQUEST);
  });

  it('rebuilds a structured-cloned failure as a local error with an own readonly code', async () => {
    const rawBridge = makeRawBridge();
    vi.mocked(rawBridge.restoreSession).mockResolvedValue(
      structuredClone({
        ok: false,
        error: { code: 'TIMEOUT', message: ENTERPRISE_IPC_ERROR_MESSAGES.TIMEOUT },
      })
    );
    const client = createEnterpriseClient(() => rawBridge);

    const error = await getRendererError(() => client.restoreSession());

    expect(error.message).toBe(ENTERPRISE_IPC_ERROR_MESSAGES.TIMEOUT);
    expect(error.code).toBe('TIMEOUT');
    expect(Object.getOwnPropertyDescriptor(error, 'code')).toEqual({
      value: 'TIMEOUT',
      writable: false,
      enumerable: true,
      configurable: false,
    });
  });

  it.each([
    ['missing bridge', () => createEnterpriseClient(() => undefined).restoreSession()],
    [
      'throwing raw method',
      () => {
        const rawBridge = makeRawBridge();
        vi.mocked(rawBridge.restoreSession).mockRejectedValue(new Error('open-id C:/private/path'));
        return createEnterpriseClient(() => rawBridge).restoreSession();
      },
    ],
  ])('maps a %s to a fixed local IPC_UNAVAILABLE error', async (_label, operation) => {
    const error = await getRendererError(operation);

    expect(error.code).toBe('IPC_UNAVAILABLE');
    expect(error.message).toBe(ENTERPRISE_IPC_ERROR_MESSAGES.IPC_UNAVAILABLE);
    expect(String(error)).not.toContain('open-id');
    expect(String(error)).not.toContain('C:/private/path');
  });

  const symbolEnvelope = { ok: true, data: USER_CONTEXT, [Symbol('secret')]: true };
  const dangerousEnvelope = { ok: true, data: USER_CONTEXT } as Record<PropertyKey, unknown>;
  Object.defineProperty(dangerousEnvelope, '__proto__', { enumerable: true, value: { injected: true } });

  it.each([
    ['undefined', undefined],
    ['missing data', { ok: true }],
    ['extra key', { ok: true, data: USER_CONTEXT, extra: true }],
    ['symbol key', symbolEnvelope],
    ['dangerous key', dangerousEnvelope],
    ['function success data', { ok: true, data: () => undefined }],
    [
      'class success data',
      {
        ok: true,
        data: new (class UnsafeData {
          readonly value = true;
        })(),
      },
    ],
    [
      'custom prototype',
      Object.assign(Object.create({ injected: true }) as Record<string, unknown>, { ok: true, data: USER_CONTEXT }),
    ],
    ['missing error message', { ok: false, error: { code: 'TIMEOUT' } }],
    ['unknown error code', { ok: false, error: { code: 'SECRET_BACKEND', message: 'secret backend detail' } }],
    [
      'mismatched fixed message',
      { ok: false, error: { code: 'TIMEOUT', message: `${ENTERPRISE_IPC_ERROR_MESSAGES.TIMEOUT} detail` } },
    ],
  ])('maps a malformed %s envelope to INVALID_IPC_RESPONSE', async (_label, response) => {
    const rawBridge = makeRawBridge();
    vi.mocked(rawBridge.restoreSession).mockResolvedValue(response as never);
    const client = createEnterpriseClient(() => rawBridge);

    const error = await getRendererError(() => client.restoreSession());

    expect(error.code).toBe('INVALID_IPC_RESPONSE');
    expect(error.message).toBe(ENTERPRISE_IPC_ERROR_MESSAGES.INVALID_IPC_RESPONSE);
    expect(String(error)).not.toContain('SECRET_BACKEND');
  });

  it('rejects accessor envelopes without reading their getters', async () => {
    let getterRead = false;
    const response = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(response, 'ok', {
      enumerable: true,
      get: () => {
        getterRead = true;
        return true;
      },
    });
    Object.defineProperty(response, 'data', { enumerable: true, value: USER_CONTEXT });
    const rawBridge = makeRawBridge();
    vi.mocked(rawBridge.restoreSession).mockResolvedValue(response as never);
    const client = createEnterpriseClient(() => rawBridge);

    const error = await getRendererError(() => client.restoreSession());

    expect(getterRead).toBe(false);
    expect(error.code).toBe('INVALID_IPC_RESPONSE');
  });

  it('rejects nested success-data accessors without reading their getters', async () => {
    let getterRead = false;
    const data: Record<string, unknown> = {};
    Object.defineProperty(data, 'openId', {
      enumerable: true,
      get: () => {
        getterRead = true;
        return USER_CONTEXT.openId;
      },
    });
    const rawBridge = makeRawBridge();
    vi.mocked(rawBridge.restoreSession).mockResolvedValue({ ok: true, data } as never);
    const client = createEnterpriseClient(() => rawBridge);

    const error = await getRendererError(() => client.restoreSession());

    expect(getterRead).toBe(false);
    expect(error.code).toBe('INVALID_IPC_RESPONSE');
  });
});
