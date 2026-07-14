import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EnterpriseLoginPollResult,
  EnterpriseRequest,
  EnterpriseUserContext,
} from '@/common/enterprise/contracts';
import { ENTERPRISE_IPC_CHANNELS } from '@/common/enterprise/constants';
import { EnterpriseBridgeError } from '@/process/bridge/enterpriseBridge';
import { EnterpriseApiError } from '@/process/services/enterprise/enterpriseApiClient';

const electronMocks = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  send: vi.fn(),
  sendSync: vi.fn(),
}));

vi.mock('@sentry/electron/preload', () => ({}));
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:/safe-user-data') },
  contextBridge: {
    exposeInMainWorld: vi.fn((name: string, value: unknown) => electronMocks.exposed.set(name, value)),
  },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    off: electronMocks.off,
    send: electronMocks.send,
    sendSync: electronMocks.sendSync,
  },
  webUtils: { getPathForFile: vi.fn() },
}));

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

type ApiClientDouble = {
  createLoginSession: ReturnType<typeof vi.fn>;
  pollLoginSession: ReturnType<typeof vi.fn>;
  getUserContext: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
};

type SessionStoreDouble = {
  loadOpenId: ReturnType<typeof vi.fn>;
  saveOpenId: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
};

const OPEN_ID = 'wx-open-id-sensitive-value';
const OLD_OPEN_ID = 'old-open-id';
const LOGIN_KEY = 'enterprise_desktop_123456789012345678';
const USER_CONTEXT: EnterpriseUserContext = {
  registered: true,
  openId: OPEN_ID,
  userId: '101',
  companyId: '202',
  userName: 'User',
  companyName: 'Company',
};
const OLD_USER_CONTEXT: EnterpriseUserContext = {
  registered: true,
  openId: OLD_OPEN_ID,
  userId: '301',
  companyId: '302',
};

const makeApiClient = (): ApiClientDouble => ({
  createLoginSession: vi.fn(),
  pollLoginSession: vi.fn(),
  getUserContext: vi.fn(),
  request: vi.fn(),
});

const makeSessionStore = (): SessionStoreDouble => ({
  loadOpenId: vi.fn().mockResolvedValue(null),
  saveOpenId: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
});

const initializeBridge = async (apiClient = makeApiClient(), sessionStore = makeSessionStore()) => {
  const handlers = new Map<string, Handler>();
  const callOrder: string[] = [];
  const ipcMain = {
    removeHandler: vi.fn((channel: string) => {
      callOrder.push(`remove:${channel}`);
      handlers.delete(channel);
    }),
    handle: vi.fn((channel: string, handler: Handler) => {
      callOrder.push(`handle:${channel}`);
      handlers.set(channel, handler);
    }),
  };
  const { initEnterpriseBridge } = await import('@/process/bridge/enterpriseBridge');
  initEnterpriseBridge({ apiClient, ipcMain, sessionStore });
  return { apiClient, callOrder, handlers, ipcMain, sessionStore };
};

const invokeHandler = async (handlers: Map<string, Handler>, channel: string, ...args: unknown[]): Promise<unknown> => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`Missing test handler: ${channel}`);
  return handler({}, ...args);
};

const createDeferred = <T>() => {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve: (value: T) => resolve?.(value),
    reject: (reason?: unknown) => reject?.(reason),
  };
};

describe('enterprise bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMocks.exposed.clear();
  });

  it('removes all six handlers before registering the exact fixed channel set', async () => {
    const { callOrder, handlers } = await initializeBridge();
    const channels = Object.values(ENTERPRISE_IPC_CHANNELS);

    expect([...handlers.keys()]).toEqual(channels);
    expect(callOrder.slice(0, channels.length)).toEqual(channels.map((channel) => `remove:${channel}`));
    expect(callOrder.slice(channels.length)).toEqual(channels.map((channel) => `handle:${channel}`));
  });

  it('can be initialized twice without duplicate Electron handlers', async () => {
    const apiClient = makeApiClient();
    const sessionStore = makeSessionStore();
    const first = await initializeBridge(apiClient, sessionStore);
    const { initEnterpriseBridge } = await import('@/process/bridge/enterpriseBridge');

    initEnterpriseBridge({ apiClient, ipcMain: first.ipcMain, sessionStore });

    expect(first.ipcMain.removeHandler).toHaveBeenCalledTimes(12);
    expect(first.ipcMain.handle).toHaveBeenCalledTimes(12);
  });

  it('delegates login creation without renderer-provided identity', async () => {
    const expected = {
      loginKey: 'enterprise_desktop_123456789012345678',
      qrDataUrl: 'data:image/png;base64,AA==',
      expiresAt: '2026-07-14T12:00:00.000Z',
      pollIntervalMs: 2000,
    };
    const apiClient = makeApiClient();
    apiClient.createLoginSession.mockResolvedValue(expected);
    const { handlers } = await initializeBridge(apiClient);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CREATE, { openId: OPEN_ID })).resolves.toEqual(
      expected
    );
    expect(apiClient.createLoginSession).toHaveBeenCalledWith();
  });

  it.each(['WAITING', 'EXPIRED', 'REGISTER_REQUIRED'] as const)('does not persist a %s poll result', async (status) => {
    const result: EnterpriseLoginPollResult =
      status === 'REGISTER_REQUIRED'
        ? { status, openId: OPEN_ID, registrationUrl: 'https://registration.invalid/' }
        : { status };
    const apiClient = makeApiClient();
    apiClient.pollLoginSession.mockResolvedValue(result);
    const sessionStore = makeSessionStore();
    const { handlers } = await initializeBridge(apiClient, sessionStore);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_POLL, LOGIN_KEY)).resolves.toEqual(result);
    expect(sessionStore.saveOpenId).not.toHaveBeenCalled();
  });

  it('persists and activates only a valid authenticated poll identity', async () => {
    const result: EnterpriseLoginPollResult = {
      status: 'AUTHENTICATED',
      openId: OPEN_ID,
      userContext: USER_CONTEXT,
    };
    const apiClient = makeApiClient();
    apiClient.pollLoginSession.mockResolvedValue(result);
    const sessionStore = makeSessionStore();
    const { handlers } = await initializeBridge(apiClient, sessionStore);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_POLL, LOGIN_KEY)).resolves.toEqual(result);
    expect(sessionStore.saveOpenId).toHaveBeenCalledWith(OPEN_ID);
  });

  it.each([123, 'valid-login-key', ` ${LOGIN_KEY}`, `${LOGIN_KEY} `])(
    'rejects an inexact poll argument before session or API access: %j',
    async (loginKey) => {
      const apiClient = makeApiClient();
      const sessionStore = makeSessionStore();
      const { handlers } = await initializeBridge(apiClient, sessionStore);

      await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_POLL, loginKey)).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
      });
      expect(apiClient.pollLoginSession).not.toHaveBeenCalled();
      expect(sessionStore.loadOpenId).not.toHaveBeenCalled();
      expect(sessionStore.saveOpenId).not.toHaveBeenCalled();
      expect(sessionStore.clear).not.toHaveBeenCalled();
    }
  );

  it('rejects malformed authenticated identities without persistence', async () => {
    const apiClient = makeApiClient();
    apiClient.pollLoginSession.mockResolvedValue({
      status: 'AUTHENTICATED',
      openId: OPEN_ID,
      userContext: { ...USER_CONTEXT, companyId: '0' },
    });
    const sessionStore = makeSessionStore();
    const { handlers } = await initializeBridge(apiClient, sessionStore);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_POLL, LOGIN_KEY)).rejects.toMatchObject({
      code: 'INVALID_AUTH_RESULT',
    });
    expect(sessionStore.saveOpenId).not.toHaveBeenCalled();
  });

  it('completes registration only for a matching registered identity with real IDs', async () => {
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    const sessionStore = makeSessionStore();
    const { handlers } = await initializeBridge(apiClient, sessionStore);

    await expect(
      invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, ` ${OPEN_ID} `)
    ).resolves.toEqual(USER_CONTEXT);
    expect(apiClient.getUserContext).toHaveBeenCalledWith(OPEN_ID);
    expect(sessionStore.saveOpenId).toHaveBeenCalledWith(OPEN_ID);
  });

  it('does not persist incomplete or mismatched registration results', async () => {
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValueOnce({ registered: false, openId: OPEN_ID });
    const sessionStore = makeSessionStore();
    const { handlers } = await initializeBridge(apiClient, sessionStore);

    await expect(
      invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID)
    ).rejects.toMatchObject({ code: 'REGISTRATION_INCOMPLETE' });
    apiClient.getUserContext.mockResolvedValueOnce({ ...USER_CONTEXT, openId: 'different-open-id' });
    await expect(
      invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID)
    ).rejects.toMatchObject({ code: 'REGISTRATION_INCOMPLETE' });
    expect(sessionStore.saveOpenId).not.toHaveBeenCalled();
  });

  it.each([123, '', '   ', `${OPEN_ID}\u0000`])(
    'rejects an invalid registration openId before session or API access: %j',
    async (openId) => {
      const apiClient = makeApiClient();
      const sessionStore = makeSessionStore();
      const { handlers } = await initializeBridge(apiClient, sessionStore);

      await expect(
        invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, openId)
      ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
      expect(apiClient.getUserContext).not.toHaveBeenCalled();
      expect(sessionStore.loadOpenId).not.toHaveBeenCalled();
      expect(sessionStore.saveOpenId).not.toHaveBeenCalled();
    }
  );

  it('restores by loading only openId and refreshing the user context', async () => {
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OPEN_ID);
    const { handlers } = await initializeBridge(apiClient, sessionStore);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE)).resolves.toEqual(USER_CONTEXT);
    expect(apiClient.getUserContext).toHaveBeenCalledWith(OPEN_ID);
  });

  it('clears a persisted session when refresh explicitly reports unregistered', async () => {
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue({ registered: false, openId: OPEN_ID });
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OPEN_ID);
    const { handlers } = await initializeBridge(apiClient, sessionStore);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE)).resolves.toBeNull();
    expect(sessionStore.clear).toHaveBeenCalledOnce();
  });

  it('keeps the persisted session on refresh failure and returns a sanitized error', async () => {
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockRejectedValue(new Error(`${OPEN_ID} at C:/private/path`));
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OPEN_ID);
    const { handlers } = await initializeBridge(apiClient, sessionStore);

    const error = await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE).catch(
      (reason: unknown) => reason
    );

    expect(error).toMatchObject({ code: 'SESSION_RESTORE_FAILED' });
    expect(String(error)).not.toContain(OPEN_ID);
    expect(String(error)).not.toContain('C:/private/path');
    expect(sessionStore.clear).not.toHaveBeenCalled();
  });

  it('clears memory before storage and prevents a stale in-flight restore from reactivating it', async () => {
    let resolveContext: ((context: EnterpriseUserContext) => void) | undefined;
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockReturnValue(
      new Promise<EnterpriseUserContext>((resolve) => {
        resolveContext = resolve;
      })
    );
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OPEN_ID);
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    const restoring = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE);

    await Promise.resolve();
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR);
    resolveContext?.(USER_CONTEXT);

    await expect(restoring).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    expect(sessionStore.clear).toHaveBeenCalledOnce();
  });

  it('rejects business requests before transport when no active or persisted session exists', async () => {
    const apiClient = makeApiClient();
    const { handlers } = await initializeBridge(apiClient);
    const request: EnterpriseRequest = {
      operation: 'company.detail',
      payload: { companyId: '303' },
    };

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).rejects.toMatchObject({
      code: 'MISSING_CONTEXT',
    });
    expect(apiClient.getUserContext).not.toHaveBeenCalled();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('clears an explicitly unregistered persisted identity without business transport', async () => {
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue({ registered: false, openId: OPEN_ID });
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OPEN_ID);
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    const request: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).rejects.toMatchObject({
      code: 'MISSING_CONTEXT',
    });
    expect(sessionStore.clear).toHaveBeenCalledOnce();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('rejects renderer-injected context before hydration or business transport', async () => {
    const request: EnterpriseRequest = {
      operation: 'company.detail',
      payload: { companyId: '303' },
    };
    const apiClient = makeApiClient();
    const sessionStore = makeSessionStore();
    const { handlers } = await initializeBridge(apiClient, sessionStore);

    await expect(
      invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, {
        ...request,
        context: { openId: 'renderer-injected' },
      })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(sessionStore.loadOpenId).not.toHaveBeenCalled();
    expect(apiClient.getUserContext).not.toHaveBeenCalled();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('rejects malformed, prototype-bearing, and accessor requests before touching session state', async () => {
    let accessorRead = false;
    const accessorPayload = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessorPayload, 'runId', {
      enumerable: true,
      get: () => {
        accessorRead = true;
        return 'run';
      },
    });
    const inheritedRequest = Object.assign(Object.create({ injected: true }) as Record<string, unknown>, {
      operation: 'project.dashboard',
      payload: {},
    });
    const invalidRequests: unknown[] = [
      null,
      {},
      { operation: 'unknown', payload: {} },
      { operation: 'project.dashboard', payload: accessorPayload },
      inheritedRequest,
    ];
    const apiClient = makeApiClient();
    const sessionStore = makeSessionStore();
    const { handlers } = await initializeBridge(apiClient, sessionStore);

    await Promise.all(
      invalidRequests.map((request) =>
        expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).rejects.toMatchObject({
          code: 'INVALID_REQUEST',
        })
      )
    );
    expect(accessorRead).toBe(false);
    expect(sessionStore.loadOpenId).not.toHaveBeenCalled();
    expect(apiClient.getUserContext).not.toHaveBeenCalled();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent persisted-session hydration', async () => {
    const request: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    apiClient.request.mockResolvedValue({ operation: 'project.dashboard', data: {} });
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OPEN_ID);
    const { handlers } = await initializeBridge(apiClient, sessionStore);

    await Promise.all([
      invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request),
      invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request),
    ]);

    expect(sessionStore.loadOpenId).toHaveBeenCalledOnce();
    expect(apiClient.getUserContext).toHaveBeenCalledOnce();
    expect(apiClient.request).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['registered', OLD_USER_CONTEXT],
    ['unregistered', { registered: false, openId: OLD_OPEN_ID }],
  ] as const)('prevents an old %s restore from overriding or clearing a polled identity', async (_label, oldResult) => {
    const oldContext = createDeferred<EnterpriseUserContext>();
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockReturnValue(oldContext.promise);
    apiClient.pollLoginSession.mockResolvedValue({
      status: 'AUTHENTICATED',
      openId: OPEN_ID,
      userContext: USER_CONTEXT,
    });
    apiClient.request.mockResolvedValue({ operation: 'project.dashboard', data: {} });
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OLD_OPEN_ID);
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    const restoring = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE);
    await vi.waitFor(() => expect(apiClient.getUserContext).toHaveBeenCalledWith(OLD_OPEN_ID));

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_POLL, LOGIN_KEY)).resolves.toMatchObject({
      status: 'AUTHENTICATED',
    });
    oldContext.resolve(oldResult);

    await expect(restoring).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    await expect(
      invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, { operation: 'project.dashboard', payload: {} })
    ).resolves.toMatchObject({ operation: 'project.dashboard' });
    expect(apiClient.request).toHaveBeenCalledWith({ operation: 'project.dashboard', payload: {} }, USER_CONTEXT);
    expect(sessionStore.clear).not.toHaveBeenCalled();
  });

  it('prevents an old restore from overriding an identity committed by registration completion', async () => {
    const oldContext = createDeferred<EnterpriseUserContext>();
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockReturnValueOnce(oldContext.promise).mockResolvedValueOnce(USER_CONTEXT);
    apiClient.request.mockResolvedValue({ operation: 'project.dashboard', data: {} });
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OLD_OPEN_ID);
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    const restoring = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE);
    await vi.waitFor(() => expect(apiClient.getUserContext).toHaveBeenCalledWith(OLD_OPEN_ID));

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID)).resolves.toEqual(
      USER_CONTEXT
    );
    oldContext.resolve(OLD_USER_CONTEXT);

    await expect(restoring).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, {
      operation: 'project.dashboard',
      payload: {},
    });
    expect(apiClient.request).toHaveBeenCalledWith({ operation: 'project.dashboard', payload: {} }, USER_CONTEXT);
  });

  it('fails a polled auth commit closed when clear wins while its save is in flight', async () => {
    const save = createDeferred<void>();
    const apiClient = makeApiClient();
    apiClient.pollLoginSession.mockResolvedValue({
      status: 'AUTHENTICATED',
      openId: OPEN_ID,
      userContext: USER_CONTEXT,
    });
    const sessionStore = makeSessionStore();
    sessionStore.saveOpenId.mockReturnValue(save.promise);
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    const polling = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_POLL, LOGIN_KEY);
    await vi.waitFor(() => expect(sessionStore.saveOpenId).toHaveBeenCalledWith(OPEN_ID));

    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR);
    save.resolve();

    await expect(polling).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    await expect(
      invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, { operation: 'project.dashboard', payload: {} })
    ).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('does not revive an old hydration after an authenticated session save fails', async () => {
    const oldContext = createDeferred<EnterpriseUserContext>();
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockReturnValue(oldContext.promise);
    apiClient.pollLoginSession.mockResolvedValue({
      status: 'AUTHENTICATED',
      openId: OPEN_ID,
      userContext: USER_CONTEXT,
    });
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OLD_OPEN_ID);
    sessionStore.saveOpenId.mockRejectedValue(new Error(`${OPEN_ID} save failed`));
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    const restoring = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE);
    await vi.waitFor(() => expect(apiClient.getUserContext).toHaveBeenCalledWith(OLD_OPEN_ID));

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_POLL, LOGIN_KEY)).rejects.toMatchObject({
      code: 'AUTH_POLL_FAILED',
    });
    oldContext.resolve(OLD_USER_CONTEXT);

    await expect(restoring).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    expect(sessionStore.clear).not.toHaveBeenCalled();
  });

  it('preserves stable API error codes but masks arbitrary dependency failures', async () => {
    const request: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    apiClient.request
      .mockRejectedValueOnce(new EnterpriseApiError('TIMEOUT', 'Enterprise API request timed out.'))
      .mockRejectedValueOnce(new Error(`${OPEN_ID} backend response`))
      .mockRejectedValueOnce(new EnterpriseBridgeError('REQUEST_FAILED', `${OPEN_ID} forged bridge error`));
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OPEN_ID);
    const { handlers } = await initializeBridge(apiClient, sessionStore);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    const error = await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request).catch(
      (reason: unknown) => reason
    );
    expect(error).toMatchObject({ code: 'REQUEST_FAILED' });
    expect(String(error)).not.toContain(OPEN_ID);
    const forgedError = await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request).catch(
      (reason: unknown) => reason
    );
    expect(String(forgedError)).toBe('EnterpriseBridgeError: [REQUEST_FAILED] Enterprise request failed.');
  });
});

describe('enterprise preload surface', () => {
  it('exposes only the six typed enterprise methods on fixed channels', async () => {
    electronMocks.sendSync.mockReturnValue(null);
    await import('@/preload/main');
    const electronAPI = electronMocks.exposed.get('electronAPI') as {
      enterprise: Record<string, (...args: unknown[]) => Promise<unknown>>;
    };

    expect(Object.keys(electronAPI.enterprise)).toEqual([
      'createLoginSession',
      'pollLoginSession',
      'completeRegistration',
      'restoreSession',
      'clearSession',
      'request',
    ]);

    const request: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };
    electronAPI.enterprise.createLoginSession();
    electronAPI.enterprise.pollLoginSession('login-key');
    electronAPI.enterprise.completeRegistration(OPEN_ID);
    electronAPI.enterprise.restoreSession();
    electronAPI.enterprise.clearSession();
    electronAPI.enterprise.request(request);

    expect(electronMocks.invoke.mock.calls).toEqual([
      [ENTERPRISE_IPC_CHANNELS.AUTH_CREATE],
      [ENTERPRISE_IPC_CHANNELS.AUTH_POLL, 'login-key'],
      [ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID],
      [ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE],
      [ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR],
      [ENTERPRISE_IPC_CHANNELS.REQUEST, request],
    ]);
  });
});
