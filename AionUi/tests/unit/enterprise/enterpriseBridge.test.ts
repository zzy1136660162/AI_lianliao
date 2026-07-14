import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

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
  browserWindows: new Map<object, unknown>(),
  fromWebContents: vi.fn(),
  getPath: vi.fn(() => 'C:/safe-user-data'),
  isPackaged: false,
  exposed: new Map<string, unknown>(),
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  send: vi.fn(),
  sendSync: vi.fn(),
}));

vi.mock('@sentry/electron/preload', () => ({}));
vi.mock('electron', () => ({
  app: {
    getPath: electronMocks.getPath,
    get isPackaged() {
      return electronMocks.isPackaged;
    },
  },
  BrowserWindow: { fromWebContents: electronMocks.fromWebContents },
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

type TestIpcResult<T = unknown> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

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

const ERROR_MESSAGES = {
  INVALID_REQUEST: 'Enterprise API request is invalid.',
  MISSING_CONTEXT: 'Enterprise API user context is incomplete.',
  TIMEOUT: 'Enterprise API request timed out.',
  AUTH_POLL_FAILED: 'Enterprise login polling failed.',
  SESSION_RESTORE_FAILED: 'Enterprise session restoration failed.',
  REQUEST_FAILED: 'Enterprise request failed.',
  UNTRUSTED_SENDER: 'Enterprise IPC sender is not trusted.',
  IPC_UNAVAILABLE: 'Enterprise IPC is unavailable.',
  INVALID_IPC_RESPONSE: 'Enterprise IPC response is invalid.',
} as const;

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
  initEnterpriseBridge({ apiClient, ipcMain, sessionStore, senderGuard: () => true });
  return { apiClient, callOrder, handlers, ipcMain, sessionStore };
};

const invokeRawHandler = async (
  handlers: Map<string, Handler>,
  event: unknown,
  channel: string,
  ...args: unknown[]
): Promise<TestIpcResult> => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`Missing test handler: ${channel}`);
  return (await handler(event, ...args)) as TestIpcResult;
};

const invokeHandler = async (handlers: Map<string, Handler>, channel: string, ...args: unknown[]): Promise<unknown> => {
  const result = await invokeRawHandler(handlers, {}, channel, ...args);
  if (result.ok) return result.data;
  const error = new Error(result.error.message);
  Object.defineProperty(error, 'code', { value: result.error.code });
  throw error;
};

const makeTrustedEvent = (url: string) => {
  const mainFrame = { url };
  const sender = { isDestroyed: vi.fn(() => false), mainFrame };
  const browserWindow = { isDestroyed: vi.fn(() => false), webContents: sender };
  electronMocks.browserWindows.set(sender, browserWindow);
  return { event: { sender, senderFrame: mainFrame }, sender, mainFrame, browserWindow };
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
    vi.unstubAllEnvs();
    electronMocks.isPackaged = false;
    electronMocks.browserWindows.clear();
    electronMocks.fromWebContents.mockImplementation((sender: object) => electronMocks.browserWindows.get(sender));
    electronMocks.exposed.clear();
  });

  it('returns strict success and sanitized failure envelopes from direct handlers', async () => {
    const expected = {
      loginKey: LOGIN_KEY,
      qrDataUrl: 'data:image/png;base64,AA==',
      expiresAt: '2026-07-14T12:00:00.000Z',
      pollIntervalMs: 2000,
    };
    const apiClient = makeApiClient();
    apiClient.createLoginSession.mockResolvedValueOnce(expected).mockRejectedValueOnce(new Error(`${OPEN_ID} leak`));
    const { handlers } = await initializeBridge(apiClient);

    await expect(invokeRawHandler(handlers, {}, ENTERPRISE_IPC_CHANNELS.AUTH_CREATE)).resolves.toEqual({
      ok: true,
      data: expected,
    });
    await expect(invokeRawHandler(handlers, {}, ENTERPRISE_IPC_CHANNELS.AUTH_CREATE)).resolves.toEqual({
      ok: false,
      error: {
        code: 'AUTH_CREATE_FAILED',
        message: 'Enterprise login session creation failed.',
      },
    });
  });

  it('rejects every enterprise channel before parsing or side effects when the default sender guard fails', async () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://127.0.0.1:5173/app?mode=desktop');
    const apiClient = makeApiClient();
    const sessionStore = makeSessionStore();
    const handlers = new Map<string, Handler>();
    const ipcMain = {
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
      handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
    };
    const { initEnterpriseBridge } = await import('@/process/bridge/enterpriseBridge');
    initEnterpriseBridge({ apiClient, ipcMain, sessionStore });

    for (const channel of Object.values(ENTERPRISE_IPC_CHANNELS)) {
      // eslint-disable-next-line no-await-in-loop -- Each fixed channel must independently prove fail-closed behavior.
      await expect(invokeRawHandler(handlers, {}, channel, OPEN_ID)).resolves.toEqual({
        ok: false,
        error: { code: 'UNTRUSTED_SENDER', message: ERROR_MESSAGES.UNTRUSTED_SENDER },
      });
    }
    expect(apiClient.createLoginSession).not.toHaveBeenCalled();
    expect(apiClient.pollLoginSession).not.toHaveBeenCalled();
    expect(apiClient.getUserContext).not.toHaveBeenCalled();
    expect(apiClient.request).not.toHaveBeenCalled();
    expect(sessionStore.loadOpenId).not.toHaveBeenCalled();
    expect(sessionStore.saveOpenId).not.toHaveBeenCalled();
    expect(sessionStore.clear).not.toHaveBeenCalled();
  });

  it('accepts only the exact configured development URL components while allowing hash changes', async () => {
    const configuredUrl = 'http://127.0.0.1:5173/app/index.html?mode=desktop#configured';
    vi.stubEnv('ELECTRON_RENDERER_URL', configuredUrl);
    const apiClient = makeApiClient();
    apiClient.createLoginSession.mockResolvedValue({
      loginKey: LOGIN_KEY,
      qrDataUrl: 'data:image/png;base64,AA==',
      expiresAt: '2026-07-14T12:00:00.000Z',
      pollIntervalMs: 2000,
    });
    const sessionStore = makeSessionStore();
    const handlers = new Map<string, Handler>();
    const ipcMain = {
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
      handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
    };
    const { initEnterpriseBridge } = await import('@/process/bridge/enterpriseBridge');
    initEnterpriseBridge({ apiClient, ipcMain, sessionStore });
    const trusted = makeTrustedEvent('http://127.0.0.1:5173/app/index.html?mode=desktop#runtime');

    await expect(invokeRawHandler(handlers, trusted.event, ENTERPRISE_IPC_CHANNELS.AUTH_CREATE)).resolves.toMatchObject(
      { ok: true }
    );

    const invalidEvents: unknown[] = [
      { sender: trusted.sender, senderFrame: { url: configuredUrl } },
      { sender: { ...trusted.sender, isDestroyed: () => true }, senderFrame: trusted.mainFrame },
      makeTrustedEvent('http://127.0.0.1:5174/app/index.html?mode=desktop').event,
      makeTrustedEvent('http://localhost:5173/app/index.html?mode=desktop').event,
      makeTrustedEvent('http://127.0.0.1:5173/other/index.html?mode=desktop').event,
      makeTrustedEvent('http://127.0.0.1:5173/app/index.html?mode=other').event,
      makeTrustedEvent('http://user@127.0.0.1:5173/app/index.html?mode=desktop').event,
      makeTrustedEvent('not a URL').event,
    ];
    const missingOwner = makeTrustedEvent(configuredUrl);
    electronMocks.browserWindows.delete(missingOwner.sender);
    invalidEvents.push(missingOwner.event);
    const destroyedOwner = makeTrustedEvent(configuredUrl);
    destroyedOwner.browserWindow.isDestroyed.mockReturnValue(true);
    invalidEvents.push(destroyedOwner.event);
    const mismatchedOwner = makeTrustedEvent(configuredUrl);
    Object.assign(mismatchedOwner.browserWindow, { webContents: {} });
    invalidEvents.push(mismatchedOwner.event);

    for (const event of invalidEvents) {
      // eslint-disable-next-line no-await-in-loop -- Each URL/frame mutation is an independent trust-boundary case.
      await expect(invokeRawHandler(handlers, event, ENTERPRISE_IPC_CHANNELS.AUTH_CREATE)).resolves.toEqual({
        ok: false,
        error: { code: 'UNTRUSTED_SENDER', message: ERROR_MESSAGES.UNTRUSTED_SENDER },
      });
    }
  });

  it.each([
    ['localhost', 'http://localhost:5173/app/index.html?mode=desktop'],
    ['IPv4 loopback', 'https://127.0.0.1:5173/app/index.html?mode=desktop'],
    ['IPv6 loopback', 'http://[::1]:5173/app/index.html?mode=desktop'],
  ])('accepts an exact %s development renderer URL with hash-only navigation', async (_label, configuredUrl) => {
    vi.stubEnv('ELECTRON_RENDERER_URL', `${configuredUrl}#configured`);
    const { isTrustedEnterpriseSender } = await import('@/process/bridge/enterpriseBridge');

    expect(isTrustedEnterpriseSender(makeTrustedEvent(`${configuredUrl}#runtime`).event as never)).toBe(true);
  });

  it.each([
    ['external origin', 'https://example.com/app/index.html?mode=desktop'],
    ['userinfo', 'http://user:secret@localhost:5173/app/index.html?mode=desktop'],
    ['non-HTTP protocol', 'ftp://localhost:5173/app/index.html?mode=desktop'],
  ])('fails closed to the file renderer when the development URL uses %s', async (_label, configuredUrl) => {
    vi.stubEnv('ELECTRON_RENDERER_URL', configuredUrl);
    const expectedFileUrl = pathToFileURL(
      path.join(process.cwd(), 'packages/desktop/src/process/renderer/index.html')
    ).href;
    const { isTrustedEnterpriseSender } = await import('@/process/bridge/enterpriseBridge');

    expect(isTrustedEnterpriseSender(makeTrustedEvent(`${expectedFileUrl}#route`).event as never)).toBe(true);
    expect(isTrustedEnterpriseSender(makeTrustedEvent(configuredUrl).event as never)).toBe(false);
  });

  it('ignores a residual development URL in packaged builds and trusts only the file renderer', async () => {
    electronMocks.isPackaged = true;
    const residualUrl = 'https://example.com/app/index.html?mode=desktop';
    vi.stubEnv('ELECTRON_RENDERER_URL', residualUrl);
    const expectedFileUrl = pathToFileURL(
      path.join(process.cwd(), 'packages/desktop/src/process/renderer/index.html')
    ).href;
    const { isTrustedEnterpriseSender } = await import('@/process/bridge/enterpriseBridge');

    expect(isTrustedEnterpriseSender(makeTrustedEvent(`${expectedFileUrl}#route`).event as never)).toBe(true);
    expect(isTrustedEnterpriseSender(makeTrustedEvent(residualUrl).event as never)).toBe(false);
  });

  it('accepts only the exact production file URL when no development URL is configured', async () => {
    electronMocks.isPackaged = true;
    vi.stubEnv('ELECTRON_RENDERER_URL', '');
    const expectedUrl = pathToFileURL(
      path.join(process.cwd(), 'packages/desktop/src/process/renderer/index.html')
    ).href;
    const trusted = makeTrustedEvent(`${expectedUrl}#route`);
    const apiClient = makeApiClient();
    apiClient.createLoginSession.mockResolvedValue({
      loginKey: LOGIN_KEY,
      qrDataUrl: 'data:image/png;base64,AA==',
      expiresAt: '2026-07-14T12:00:00.000Z',
      pollIntervalMs: 2000,
    });
    const handlers = new Map<string, Handler>();
    const ipcMain = {
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
      handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
    };
    const { initEnterpriseBridge } = await import('@/process/bridge/enterpriseBridge');
    initEnterpriseBridge({ apiClient, ipcMain, sessionStore: makeSessionStore() });

    await expect(invokeRawHandler(handlers, trusted.event, ENTERPRISE_IPC_CHANNELS.AUTH_CREATE)).resolves.toMatchObject(
      { ok: true }
    );
    const remote = makeTrustedEvent('https://example.com/index.html').event;
    await expect(invokeRawHandler(handlers, remote, ENTERPRISE_IPC_CHANNELS.AUTH_CREATE)).resolves.toEqual({
      ok: false,
      error: { code: 'UNTRUSTED_SENDER', message: ERROR_MESSAGES.UNTRUSTED_SENDER },
    });
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

    initEnterpriseBridge({ apiClient, ipcMain: first.ipcMain, sessionStore, senderGuard: () => true });

    expect(first.ipcMain.removeHandler).toHaveBeenCalledTimes(12);
    expect(first.ipcMain.handle).toHaveBeenCalledTimes(12);
  });

  it('lazily reuses one default session store across bridge initialization', async () => {
    const handlers = new Map<string, Handler>();
    const ipcMain = {
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
      handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
    };
    const { initEnterpriseBridge } = await import('@/process/bridge/enterpriseBridge');

    initEnterpriseBridge({ apiClient: makeApiClient(), ipcMain, senderGuard: () => true });
    initEnterpriseBridge({ apiClient: makeApiClient(), ipcMain, senderGuard: () => true });

    expect(electronMocks.getPath).toHaveBeenCalledOnce();
    expect(electronMocks.getPath).toHaveBeenCalledWith('userData');
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

  it('restores the authenticated context when persisted clear fails and removes it after a successful retry', async () => {
    const request: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };
    const response = { operation: 'project.dashboard' as const, data: { available: true } };
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    apiClient.request.mockResolvedValue(response);
    const sessionStore = makeSessionStore();
    sessionStore.clear.mockRejectedValueOnce(new Error(`${OPEN_ID} clear failed`)).mockResolvedValueOnce(undefined);
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR)).rejects.toMatchObject({
      code: 'SESSION_CLEAR_FAILED',
    });
    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).resolves.toEqual(response);
    expect(apiClient.request).toHaveBeenLastCalledWith(request, USER_CONTEXT);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR)).resolves.toBeUndefined();
    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).rejects.toMatchObject({
      code: 'MISSING_CONTEXT',
    });
  });

  it('shares one failed clear across concurrent callers, restores context, and releases the retry reference', async () => {
    const pendingClear = createDeferred<void>();
    const request: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };
    const response = { operation: 'project.dashboard' as const, data: { available: true } };
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    apiClient.request.mockResolvedValue(response);
    const sessionStore = makeSessionStore();
    sessionStore.clear.mockReturnValueOnce(pendingClear.promise).mockResolvedValue(undefined);
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);

    const firstClear = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR);
    const secondClear = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR);
    const concurrentResults = Promise.allSettled([firstClear, secondClear]);
    await vi.waitFor(() => expect(sessionStore.clear).toHaveBeenCalledOnce());
    pendingClear.reject(new Error(`${OPEN_ID} clear failed`));

    await expect(concurrentResults).resolves.toEqual([
      { status: 'rejected', reason: expect.objectContaining({ code: 'SESSION_CLEAR_FAILED' }) },
      { status: 'rejected', reason: expect.objectContaining({ code: 'SESSION_CLEAR_FAILED' }) },
    ]);
    expect(sessionStore.clear).toHaveBeenCalledOnce();
    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).resolves.toEqual(response);
    expect(apiClient.request).toHaveBeenLastCalledWith(request, USER_CONTEXT);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR)).resolves.toBeUndefined();
    expect(sessionStore.clear).toHaveBeenCalledTimes(2);
    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).rejects.toMatchObject({
      code: 'MISSING_CONTEXT',
    });
  });

  it('shares one successful clear across concurrent callers and releases the completed reference', async () => {
    const pendingClear = createDeferred<void>();
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    const sessionStore = makeSessionStore();
    sessionStore.clear.mockReturnValueOnce(pendingClear.promise).mockResolvedValue(undefined);
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);

    const concurrentClears = Promise.all([
      invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR),
      invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR),
    ]);
    await vi.waitFor(() => expect(sessionStore.clear).toHaveBeenCalledOnce());
    pendingClear.resolve();

    await expect(concurrentClears).resolves.toEqual([undefined, undefined]);
    expect(sessionStore.clear).toHaveBeenCalledOnce();
    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR)).resolves.toBeUndefined();
    expect(sessionStore.clear).toHaveBeenCalledTimes(2);
  });

  it('does not roll an old context back when a newer login wins during a failed clear', async () => {
    const pendingClear = createDeferred<void>();
    const request: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValueOnce(OLD_USER_CONTEXT).mockResolvedValueOnce(USER_CONTEXT);
    apiClient.request.mockResolvedValue({ operation: 'project.dashboard', data: {} });
    const sessionStore = makeSessionStore();
    sessionStore.clear.mockReturnValueOnce(pendingClear.promise);
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OLD_OPEN_ID);

    const clearing = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR);
    await vi.waitFor(() => expect(sessionStore.clear).toHaveBeenCalledOnce());
    const newLogin = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);
    await vi.waitFor(() => expect(apiClient.getUserContext).toHaveBeenCalledWith(OPEN_ID));
    pendingClear.reject(new Error(`${OLD_OPEN_ID} clear failed`));

    await expect(clearing).rejects.toMatchObject({ code: 'SESSION_CLEAR_FAILED' });
    await expect(newLogin).resolves.toEqual(USER_CONTEXT);
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request);
    expect(apiClient.request).toHaveBeenLastCalledWith(request, USER_CONTEXT);
  });

  it('does not let an old successful clear unlock a newer login generation', async () => {
    const pendingClear = createDeferred<void>();
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValueOnce(OLD_USER_CONTEXT).mockResolvedValueOnce(USER_CONTEXT);
    const sessionStore = makeSessionStore();
    sessionStore.clear.mockReturnValueOnce(pendingClear.promise);
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OLD_OPEN_ID);

    const clearing = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR);
    await vi.waitFor(() => expect(sessionStore.clear).toHaveBeenCalledOnce());
    const newLogin = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);
    await vi.waitFor(() => expect(apiClient.getUserContext).toHaveBeenCalledWith(OPEN_ID));
    pendingClear.resolve();

    await expect(clearing).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    await expect(newLogin).resolves.toEqual(USER_CONTEXT);
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

  it.each(['project-7', '0', '-1', '1.2', '901?phone=13800000000', '1'.repeat(32)])(
    'rejects the noncanonical project detail identity %s before session hydration',
    async (hpInfoId) => {
      const apiClient = makeApiClient();
      const sessionStore = makeSessionStore();
      const { handlers } = await initializeBridge(apiClient, sessionStore);

      await expect(
        invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, {
          operation: 'project.detail',
          payload: { hpInfoId },
        })
      ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
      expect(sessionStore.loadOpenId).not.toHaveBeenCalled();
      expect(apiClient.getUserContext).not.toHaveBeenCalled();
      expect(apiClient.request).not.toHaveBeenCalled();
    }
  );

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

  it('masks a company-detail phone again at the final main-process IPC boundary', async () => {
    const rawPhone = '13800000000';
    const request: EnterpriseRequest = { operation: 'company.detail', payload: { companyId: '42' } };
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    apiClient.request.mockResolvedValue({
      operation: 'company.detail',
      data: { companyId: '42', name: 'Acme', phone: rawPhone },
    });
    const { handlers } = await initializeBridge(apiClient);
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);

    const response = await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request);

    expect(response).toMatchObject({ data: { phone: '138********' } });
    expect(JSON.stringify(response)).not.toContain(rawPhone);
  });

  it.each(['product.list', 'product.detail'] as const)(
    'masks a product phone again at the final main-process IPC boundary for %s',
    async (operation) => {
      const rawPhone = '13800000000';
      const request: EnterpriseRequest =
        operation === 'product.list'
          ? { operation, payload: { pageNum: 1, pageSize: 20 } }
          : { operation, payload: { productId: '9' } };
      const apiClient = makeApiClient();
      apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
      apiClient.request.mockResolvedValue(
        operation === 'product.list'
          ? {
              operation,
              data: {
                list: [{ productId: '9', companyId: '42', name: 'Pump', phone: rawPhone }],
                pageNum: 1,
                pageSize: 20,
                pages: 1,
                total: 1,
              },
            }
          : { operation, data: { productId: '9', companyId: '42', name: 'Pump', phone: rawPhone } }
      );
      const { handlers } = await initializeBridge(apiClient);
      await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);

      const response = await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request);

      expect(response).toMatchObject(
        operation === 'product.list'
          ? { data: { list: [{ phone: '138********' }] } }
          : { data: { phone: '138********' } }
      );
      expect(JSON.stringify(response)).not.toContain(rawPhone);
    }
  );

  it.each([
    ['explicitly unpurchased', false],
    ['missing purchase state', undefined],
  ] as const)(
    'masks a project phone again at the final main-process IPC boundary when access is %s',
    async (_label, purchased) => {
      const rawPhone = '13800000000';
      const request: EnterpriseRequest = { operation: 'project.detail', payload: { hpInfoId: '901' } };
      const apiClient = makeApiClient();
      apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
      apiClient.request.mockResolvedValue({
        operation: 'project.detail',
        data: { hpInfoId: '901', projectName: 'Factory', phone: rawPhone, purchased },
      });
      const { handlers } = await initializeBridge(apiClient);
      await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);

      const response = await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request);

      expect(response).toMatchObject({ data: { phone: '138********' } });
      if (purchased === false) expect(response).toMatchObject({ data: { purchased: false } });
      expect(JSON.stringify(response)).not.toContain(rawPhone);
    }
  );

  it.each([
    ['slash grouping', '138/0000/0000 WeChat', '138/****/**** WeChat', false],
    ['full-width digits', '１３８００００００００****', '１３８************', undefined],
    ['slash-connected phones', '13800000000/02412345678', '138********/***********', false],
    ['existing stars', '13800000000****', '138************', undefined],
  ] as const)(
    'applies whole-field Unicode decimal masking at the final IPC boundary for %s',
    async (_label, rawPhone, expectedPhone, purchased) => {
      const request: EnterpriseRequest = { operation: 'project.detail', payload: { hpInfoId: '901' } };
      const apiClient = makeApiClient();
      apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
      apiClient.request.mockResolvedValue({
        operation: 'project.detail',
        data: { hpInfoId: '901', projectName: 'Factory', phone: rawPhone, purchased },
      });
      const { handlers } = await initializeBridge(apiClient);
      await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);

      const response = (await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)) as {
        data: { phone: string };
      };

      expect(response.data.phone).toBe(expectedPhone);
      expect((response.data.phone.match(/\p{Nd}/gu) ?? []).length).toBeLessThan(7);
    }
  );

  it('keeps a slash-formatted Unicode phone unchanged at IPC when purchase access is explicit', async () => {
    const rawPhone = '１３８/0000/0000 WeChat';
    const request: EnterpriseRequest = { operation: 'project.detail', payload: { hpInfoId: '901' } };
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    apiClient.request.mockResolvedValue({
      operation: 'project.detail',
      data: { hpInfoId: '901', projectName: 'Factory', phone: rawPhone, purchased: true },
    });
    const { handlers } = await initializeBridge(apiClient);
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).resolves.toMatchObject({
      data: { phone: rawPhone, purchased: true },
    });
  });

  it.each(['operation', 'data', 'phone', 'purchased'] as const)(
    'rejects an injected business response with a %s accessor without invoking it',
    async (accessorField) => {
      let getterCalls = 0;
      const response: Record<string, unknown> = {
        operation: 'project.detail',
        data: { hpInfoId: '901', projectName: 'Factory', phone: '13800000000', purchased: false },
      };
      const accessorOwner = accessorField === 'operation' || accessorField === 'data' ? response : response.data;
      Object.defineProperty(accessorOwner, accessorField, {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return accessorField === 'purchased' ? false : '13800000000';
        },
      });
      const request: EnterpriseRequest = { operation: 'project.detail', payload: { hpInfoId: '901' } };
      const apiClient = makeApiClient();
      apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
      apiClient.request.mockResolvedValue(response);
      const { handlers } = await initializeBridge(apiClient);
      await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);

      await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).rejects.toMatchObject({
        code: 'REQUEST_FAILED',
      });
      expect(getterCalls).toBe(0);
    }
  );

  it('rejects an injected Proxy response before reading its operation or data', async () => {
    let sensitiveReads = 0;
    const response = new Proxy(
      {
        operation: 'project.detail',
        data: { hpInfoId: '901', projectName: 'Factory', phone: '13800000000', purchased: false },
      },
      {
        get: (target, key, receiver) => {
          if (key === 'operation' || key === 'data') sensitiveReads += 1;
          return Reflect.get(target, key, receiver);
        },
      }
    );
    const request: EnterpriseRequest = { operation: 'project.detail', payload: { hpInfoId: '901' } };
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    apiClient.request.mockResolvedValue(response);
    const { handlers } = await initializeBridge(apiClient);
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
    });
    expect(sensitiveReads).toBe(0);
  });

  it.each([
    [
      'excessive depth',
      () => {
        const data: Record<string, unknown> = { hpInfoId: '901', projectName: 'Factory' };
        let cursor = data;
        for (let depth = 0; depth < 10; depth += 1) {
          const next: Record<string, unknown> = {};
          cursor.extra = next;
          cursor = next;
        }
        return data;
      },
    ],
    [
      'oversized array',
      () => ({ hpInfoId: '901', projectName: 'Factory', extra: Array.from({ length: 1001 }, () => null) }),
    ],
  ] as const)('rejects an injected business response with an %s budget violation', async (_label, makeData) => {
    const request: EnterpriseRequest = { operation: 'project.detail', payload: { hpInfoId: '901' } };
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    apiClient.request.mockResolvedValue({ operation: 'project.detail', data: makeData() });
    const { handlers } = await initializeBridge(apiClient);
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);

    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
    });
  });

  it('discards a pending business response after a successful clear changes the session generation', async () => {
    const pendingResponse = createDeferred<{ operation: 'project.dashboard'; data: { secret: string } }>();
    const request: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    apiClient.request.mockReturnValue(pendingResponse.promise);
    const { handlers } = await initializeBridge(apiClient);
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);

    const requesting = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request);
    await vi.waitFor(() => expect(apiClient.request).toHaveBeenCalledWith(request, USER_CONTEXT));
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR);
    pendingResponse.resolve({ operation: 'project.dashboard', data: { secret: OPEN_ID } });

    await expect(requesting).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
  });

  it('discards an old business response when a newer authenticated identity wins', async () => {
    const pendingResponse = createDeferred<{ operation: 'project.dashboard'; data: { owner: string } }>();
    const request: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValueOnce(OLD_USER_CONTEXT).mockResolvedValueOnce(USER_CONTEXT);
    apiClient.request
      .mockReturnValueOnce(pendingResponse.promise)
      .mockResolvedValueOnce({ operation: 'project.dashboard', data: { owner: OPEN_ID } });
    const { handlers } = await initializeBridge(apiClient);
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OLD_OPEN_ID);

    const oldRequest = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request);
    await vi.waitFor(() => expect(apiClient.request).toHaveBeenCalledWith(request, OLD_USER_CONTEXT));
    await invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);
    pendingResponse.resolve({ operation: 'project.dashboard', data: { owner: OLD_OPEN_ID } });

    await expect(oldRequest).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).resolves.toMatchObject({
      data: { owner: OPEN_ID },
    });
    expect(apiClient.request).toHaveBeenLastCalledWith(request, USER_CONTEXT);
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

    const clearing = invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR);
    save.resolve();

    await clearing;
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
    await expect(invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE)).resolves.toBeNull();
    await expect(
      invokeHandler(handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, {
        operation: 'project.dashboard',
        payload: {},
      })
    ).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    expect(sessionStore.loadOpenId).toHaveBeenCalledOnce();
    expect(sessionStore.clear).not.toHaveBeenCalled();
  });

  it('invalidates an old network poll across re-init so a new clear and commit remain authoritative', async () => {
    const oldPoll = createDeferred<EnterpriseLoginPollResult>();
    let persistedOpenId: string | null = OLD_OPEN_ID;
    const operationOrder: string[] = [];
    const sessionStore: SessionStoreDouble = {
      loadOpenId: vi.fn(async () => persistedOpenId),
      saveOpenId: vi.fn(async (openId: string) => {
        operationOrder.push(`save:${openId}`);
        persistedOpenId = openId;
      }),
      clear: vi.fn(async () => {
        operationOrder.push('clear');
        persistedOpenId = null;
      }),
    };
    const oldApi = makeApiClient();
    oldApi.pollLoginSession.mockReturnValue(oldPoll.promise);
    const first = await initializeBridge(oldApi, sessionStore);
    const polling = invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.AUTH_POLL, LOGIN_KEY);
    await vi.waitFor(() => expect(oldApi.pollLoginSession).toHaveBeenCalledOnce());

    const newApi = makeApiClient();
    newApi.getUserContext.mockResolvedValue(USER_CONTEXT);
    newApi.request.mockResolvedValue({ operation: 'project.dashboard', data: {} });
    const { initEnterpriseBridge } = await import('@/process/bridge/enterpriseBridge');
    initEnterpriseBridge({
      apiClient: newApi,
      ipcMain: first.ipcMain,
      sessionStore,
      senderGuard: () => true,
    });
    await invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR);
    await invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);
    oldPoll.resolve({ status: 'AUTHENTICATED', openId: OLD_OPEN_ID, userContext: OLD_USER_CONTEXT });

    await expect(polling).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    expect(persistedOpenId).toBe(OPEN_ID);
    expect(operationOrder).toEqual(['clear', `save:${OPEN_ID}`]);
    await invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, {
      operation: 'project.dashboard',
      payload: {},
    });
    expect(newApi.request).toHaveBeenCalledWith({ operation: 'project.dashboard', payload: {} }, USER_CONTEXT);
  });

  it('waits for an old pending load across re-init without clearing the persisted session', async () => {
    const oldLoad = createDeferred<string | null>();
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockReturnValueOnce(oldLoad.promise).mockResolvedValue(OLD_OPEN_ID);
    const oldApi = makeApiClient();
    const first = await initializeBridge(oldApi, sessionStore);
    const oldRestore = invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE);
    await vi.waitFor(() => expect(sessionStore.loadOpenId).toHaveBeenCalledOnce());

    const newApi = makeApiClient();
    newApi.getUserContext.mockResolvedValue(OLD_USER_CONTEXT);
    const { initEnterpriseBridge } = await import('@/process/bridge/enterpriseBridge');
    initEnterpriseBridge({
      apiClient: newApi,
      ipcMain: first.ipcMain,
      sessionStore,
      senderGuard: () => true,
    });
    const newRestore = invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE);
    expect(sessionStore.loadOpenId).toHaveBeenCalledOnce();
    oldLoad.resolve(OLD_OPEN_ID);

    await expect(oldRestore).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    await expect(newRestore).resolves.toEqual(OLD_USER_CONTEXT);
    expect(sessionStore.loadOpenId).toHaveBeenCalledTimes(2);
    expect(sessionStore.clear).not.toHaveBeenCalled();
    expect(oldApi.getUserContext).not.toHaveBeenCalled();
    expect(newApi.getUserContext).toHaveBeenCalledWith(OLD_OPEN_ID);
  });

  it('does not clear a session when re-init occurs during old network hydration after load', async () => {
    const oldContext = createDeferred<EnterpriseUserContext>();
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OLD_OPEN_ID);
    const oldApi = makeApiClient();
    oldApi.getUserContext.mockReturnValue(oldContext.promise);
    const first = await initializeBridge(oldApi, sessionStore);
    const oldRestore = invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE);
    await vi.waitFor(() => expect(oldApi.getUserContext).toHaveBeenCalledWith(OLD_OPEN_ID));

    const newApi = makeApiClient();
    newApi.getUserContext.mockResolvedValue(OLD_USER_CONTEXT);
    const { initEnterpriseBridge } = await import('@/process/bridge/enterpriseBridge');
    initEnterpriseBridge({
      apiClient: newApi,
      ipcMain: first.ipcMain,
      sessionStore,
      senderGuard: () => true,
    });

    await expect(invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE)).resolves.toEqual(
      OLD_USER_CONTEXT
    );
    oldContext.resolve(OLD_USER_CONTEXT);
    await expect(oldRestore).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    expect(sessionStore.clear).not.toHaveBeenCalled();
    expect(newApi.getUserContext).toHaveBeenCalledWith(OLD_OPEN_ID);
  });

  it('orders an old in-flight save before re-init cleanup and a new restore', async () => {
    const oldSave = createDeferred<void>();
    let persistedOpenId: string | null = null;
    const operationOrder: string[] = [];
    const sessionStore: SessionStoreDouble = {
      loadOpenId: vi.fn(async () => {
        operationOrder.push('load');
        return persistedOpenId;
      }),
      saveOpenId: vi.fn(async (openId: string) => {
        operationOrder.push(`save:start:${openId}`);
        await oldSave.promise;
        persistedOpenId = openId;
        operationOrder.push(`save:end:${openId}`);
      }),
      clear: vi.fn(async () => {
        operationOrder.push('cleanup');
        persistedOpenId = null;
      }),
    };
    const oldApi = makeApiClient();
    oldApi.pollLoginSession.mockResolvedValue({
      status: 'AUTHENTICATED',
      openId: OLD_OPEN_ID,
      userContext: OLD_USER_CONTEXT,
    });
    const first = await initializeBridge(oldApi, sessionStore);
    const polling = invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.AUTH_POLL, LOGIN_KEY);
    await vi.waitFor(() => expect(sessionStore.saveOpenId).toHaveBeenCalledWith(OLD_OPEN_ID));

    const newApi = makeApiClient();
    newApi.getUserContext.mockResolvedValue(USER_CONTEXT);
    newApi.request.mockResolvedValue({ operation: 'project.dashboard', data: {} });
    const { initEnterpriseBridge } = await import('@/process/bridge/enterpriseBridge');
    initEnterpriseBridge({
      apiClient: newApi,
      ipcMain: first.ipcMain,
      sessionStore,
      senderGuard: () => true,
    });
    const restoring = invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE);
    expect(sessionStore.loadOpenId).not.toHaveBeenCalled();
    oldSave.resolve();

    await expect(polling).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    await expect(restoring).resolves.toBeNull();
    await expect(
      invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID)
    ).resolves.toEqual(USER_CONTEXT);
    await invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, {
      operation: 'project.dashboard',
      payload: {},
    });
    expect(operationOrder).toEqual([
      `save:start:${OLD_OPEN_ID}`,
      `save:end:${OLD_OPEN_ID}`,
      'cleanup',
      'load',
      `save:start:${OPEN_ID}`,
      `save:end:${OPEN_ID}`,
    ]);
    expect(persistedOpenId).toBe(OPEN_ID);
    expect(newApi.request).toHaveBeenCalledWith({ operation: 'project.dashboard', payload: {} }, USER_CONTEXT);
  });

  it('prevents an old unregistered hydrate from clearing a new committed identity after re-init', async () => {
    const oldContext = createDeferred<EnterpriseUserContext>();
    let persistedOpenId: string | null = OLD_OPEN_ID;
    const sessionStore: SessionStoreDouble = {
      loadOpenId: vi.fn(async () => persistedOpenId),
      saveOpenId: vi.fn(async (openId: string) => {
        persistedOpenId = openId;
      }),
      clear: vi.fn(async () => {
        persistedOpenId = null;
      }),
    };
    const oldApi = makeApiClient();
    oldApi.getUserContext.mockReturnValue(oldContext.promise);
    const first = await initializeBridge(oldApi, sessionStore);
    const restoring = invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE);
    await vi.waitFor(() => expect(oldApi.getUserContext).toHaveBeenCalledWith(OLD_OPEN_ID));

    const newApi = makeApiClient();
    newApi.getUserContext.mockResolvedValue(USER_CONTEXT);
    newApi.request.mockResolvedValue({ operation: 'project.dashboard', data: {} });
    const { initEnterpriseBridge } = await import('@/process/bridge/enterpriseBridge');
    initEnterpriseBridge({
      apiClient: newApi,
      ipcMain: first.ipcMain,
      sessionStore,
      senderGuard: () => true,
    });
    await invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID);
    oldContext.resolve({ registered: false, openId: OLD_OPEN_ID });

    await expect(restoring).rejects.toMatchObject({ code: 'MISSING_CONTEXT' });
    expect(persistedOpenId).toBe(OPEN_ID);
    expect(sessionStore.clear).not.toHaveBeenCalled();
    await invokeHandler(first.handlers, ENTERPRISE_IPC_CHANNELS.REQUEST, {
      operation: 'project.dashboard',
      payload: {},
    });
    expect(newApi.request).toHaveBeenCalledWith({ operation: 'project.dashboard', payload: {} }, USER_CONTEXT);
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
    await expect(invokeRawHandler(handlers, {}, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).resolves.toEqual({
      ok: false,
      error: { code: 'REQUEST_FAILED', message: ERROR_MESSAGES.REQUEST_FAILED },
    });
  });

  it('does not read accessor error codes from bridge or API failures', async () => {
    let bridgeGetterRead = false;
    let apiGetterRead = false;
    const bridgeFailure = new EnterpriseBridgeError('TIMEOUT');
    Object.defineProperty(bridgeFailure, 'code', {
      configurable: true,
      get: () => {
        bridgeGetterRead = true;
        return 'TIMEOUT';
      },
    });
    const apiFailure = new EnterpriseApiError('TIMEOUT', ERROR_MESSAGES.TIMEOUT);
    Object.defineProperty(apiFailure, 'code', {
      configurable: true,
      get: () => {
        apiGetterRead = true;
        return 'TIMEOUT';
      },
    });
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    apiClient.request.mockRejectedValueOnce(bridgeFailure).mockRejectedValueOnce(apiFailure);
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OPEN_ID);
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    const request: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };

    await expect(invokeRawHandler(handlers, {}, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'REQUEST_FAILED' },
    });
    await expect(invokeRawHandler(handlers, {}, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'REQUEST_FAILED' },
    });
    expect(bridgeGetterRead).toBe(false);
    expect(apiGetterRead).toBe(false);
  });

  it('rejects inherited and unknown own error codes from typed failures', async () => {
    const inheritedFailure = new EnterpriseBridgeError('TIMEOUT');
    Reflect.deleteProperty(inheritedFailure, 'code');
    const inheritedCodePrototype = Object.create(Object.getPrototypeOf(inheritedFailure)) as object;
    Object.defineProperty(inheritedCodePrototype, 'code', { value: 'TIMEOUT' });
    Object.setPrototypeOf(inheritedFailure, inheritedCodePrototype);
    const unknownFailure = new EnterpriseApiError('TIMEOUT', ERROR_MESSAGES.TIMEOUT);
    Object.defineProperty(unknownFailure, 'code', { value: 'FORGED_CODE' });
    const apiClient = makeApiClient();
    apiClient.getUserContext.mockResolvedValue(USER_CONTEXT);
    apiClient.request.mockRejectedValueOnce(inheritedFailure).mockRejectedValueOnce(unknownFailure);
    const sessionStore = makeSessionStore();
    sessionStore.loadOpenId.mockResolvedValue(OPEN_ID);
    const { handlers } = await initializeBridge(apiClient, sessionStore);
    const request: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };

    await expect(invokeRawHandler(handlers, {}, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'REQUEST_FAILED' },
    });
    await expect(invokeRawHandler(handlers, {}, ENTERPRISE_IPC_CHANNELS.REQUEST, request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'REQUEST_FAILED' },
    });
  });
});

describe('enterprise preload surface', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    electronMocks.isPackaged = false;
    electronMocks.exposed.clear();
    electronMocks.sendSync.mockReturnValue(null);
  });

  const loadEnterprisePreloadApi = async () => {
    await import('@/preload/main');
    const electronAPI = electronMocks.exposed.get('electronAPI') as {
      enterprise: Record<string, (...args: unknown[]) => Promise<unknown>>;
    };
    return electronAPI.enterprise;
  };

  it('exposes only the six typed enterprise methods on fixed channels', async () => {
    electronMocks.invoke.mockResolvedValue({ ok: true, data: null });
    const enterprise = await loadEnterprisePreloadApi();

    expect(Object.keys(enterprise)).toEqual([
      'createLoginSession',
      'pollLoginSession',
      'completeRegistration',
      'restoreSession',
      'clearSession',
      'request',
    ]);

    const request: EnterpriseRequest = { operation: 'project.dashboard', payload: {} };
    await expect(enterprise.createLoginSession()).resolves.toEqual({ ok: true, data: null });
    await expect(enterprise.pollLoginSession('login-key')).resolves.toEqual({ ok: true, data: null });
    await expect(enterprise.completeRegistration(OPEN_ID)).resolves.toEqual({ ok: true, data: null });
    await expect(enterprise.restoreSession()).resolves.toEqual({ ok: true, data: null });
    await expect(enterprise.clearSession()).resolves.toEqual({ ok: true, data: null });
    await expect(enterprise.request(request)).resolves.toEqual({ ok: true, data: null });

    expect(electronMocks.invoke.mock.calls).toEqual([
      [ENTERPRISE_IPC_CHANNELS.AUTH_CREATE],
      [ENTERPRISE_IPC_CHANNELS.AUTH_POLL, 'login-key'],
      [ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION, OPEN_ID],
      [ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE],
      [ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR],
      [ENTERPRISE_IPC_CHANNELS.REQUEST, request],
    ]);
  });

  it('round-trips a real handler failure as a structured-clone-safe plain envelope', async () => {
    const { EnterpriseApiError: CurrentEnterpriseApiError } =
      await import('@/process/services/enterprise/enterpriseApiClient');
    const apiClient = makeApiClient();
    apiClient.createLoginSession.mockRejectedValue(
      new CurrentEnterpriseApiError('TIMEOUT', 'raw timeout details that must not cross IPC')
    );
    const { handlers } = await initializeBridge(apiClient);
    electronMocks.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error('unexpected channel');
      return handler({}, ...args);
    });
    const enterprise = await loadEnterprisePreloadApi();

    const result = structuredClone(await enterprise.createLoginSession());

    expect(result).toEqual({
      ok: false,
      error: { code: 'TIMEOUT', message: ERROR_MESSAGES.TIMEOUT },
    });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf((result as { error: object }).error)).toBe(Object.prototype);
  });

  it.each([
    ['undefined', undefined],
    ['raw data', { loginKey: LOGIN_KEY }],
    ['extra envelope key', { ok: true, data: null, extra: true }],
    ['symbol envelope key', { ok: true, data: null, [Symbol('secret')]: true }],
    [
      'dangerous envelope key',
      (() => {
        const envelope = { ok: true, data: null } as Record<PropertyKey, unknown>;
        Object.defineProperty(envelope, '__proto__', { enumerable: true, value: { injected: true } });
        return envelope;
      })(),
    ],
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
    ['unknown code', { ok: false, error: { code: 'SECRET_BACKEND', message: 'secret' } }],
    [
      'wrong fixed message',
      { ok: false, error: { code: 'TIMEOUT', message: `${ERROR_MESSAGES.TIMEOUT} backend detail` } },
    ],
    [
      'prototype-bearing envelope',
      Object.assign(Object.create({ injected: true }) as Record<string, unknown>, { ok: true, data: null }),
    ],
  ])('maps a malformed %s to a fixed INVALID_IPC_RESPONSE envelope', async (_label, response) => {
    electronMocks.invoke.mockResolvedValue(response);
    const enterprise = await loadEnterprisePreloadApi();

    await expect(enterprise.restoreSession()).resolves.toEqual({
      ok: false,
      error: { code: 'INVALID_IPC_RESPONSE', message: ERROR_MESSAGES.INVALID_IPC_RESPONSE },
    });
  });

  it('rejects accessor envelopes without executing the getter or exposing its value', async () => {
    let getterRead = false;
    const response = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(response, 'ok', {
      enumerable: true,
      get: () => {
        getterRead = true;
        return true;
      },
    });
    Object.defineProperty(response, 'data', { enumerable: true, value: `${OPEN_ID} secret` });
    electronMocks.invoke.mockResolvedValue(response);
    const enterprise = await loadEnterprisePreloadApi();

    const result = await enterprise.restoreSession();
    expect(getterRead).toBe(false);
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_IPC_RESPONSE', message: ERROR_MESSAGES.INVALID_IPC_RESPONSE },
    });
  });

  it('rejects nested success-data accessors without executing the getter', async () => {
    let getterRead = false;
    const data: Record<string, unknown> = {};
    Object.defineProperty(data, 'openId', {
      enumerable: true,
      get: () => {
        getterRead = true;
        return OPEN_ID;
      },
    });
    electronMocks.invoke.mockResolvedValue({ ok: true, data });
    const enterprise = await loadEnterprisePreloadApi();

    const result = await enterprise.restoreSession();

    expect(getterRead).toBe(false);
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_IPC_RESPONSE', message: ERROR_MESSAGES.INVALID_IPC_RESPONSE },
    });
  });

  it('maps raw Electron invoke rejection to a fixed IPC_UNAVAILABLE envelope without echoing details', async () => {
    electronMocks.invoke.mockRejectedValue(new Error(`${OPEN_ID} at C:/private/path`));
    const enterprise = await loadEnterprisePreloadApi();

    await expect(enterprise.restoreSession()).resolves.toEqual({
      ok: false,
      error: { code: 'IPC_UNAVAILABLE', message: ERROR_MESSAGES.IPC_UNAVAILABLE },
    });
  });
});
