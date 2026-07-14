import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { app, BrowserWindow, ipcMain as electronIpcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

import { ENTERPRISE_IPC_CHANNELS, ENTERPRISE_IPC_ERROR_MESSAGES } from '@/common/enterprise/constants';
import type {
  EnterpriseIpcErrorCode,
  EnterpriseIpcResult,
  EnterpriseLoginPollResult,
  EnterpriseLoginSession,
  EnterpriseRequest,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '@/common/enterprise/contracts';
import { enterpriseRequestSchema } from '@/common/enterprise/schemas';
import { EnterpriseApiClient, EnterpriseApiError } from '@process/services/enterprise/enterpriseApiClient';
import { EnterpriseSessionStore } from '@process/services/enterprise/enterpriseSessionStore';

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

const isRealIdentifier = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);

const isRegisteredContext = (
  context: EnterpriseUserContext,
  expectedOpenId?: string
): context is EnterpriseUserContext & { companyId: string; userId: string } => {
  const openId = normalizeUntrustedText(context?.openId);
  return (
    context?.registered === true &&
    openId !== undefined &&
    (expectedOpenId === undefined || openId === expectedOpenId) &&
    isRealIdentifier(context.userId) &&
    isRealIdentifier(context.companyId)
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
  const apiClient = dependencies.apiClient ?? new EnterpriseApiClient();
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
        return response;
      }),
    ],
  ];

  for (const [channel] of handlers) ipcMain.removeHandler(channel);
  for (const [channel, handler] of handlers) ipcMain.handle(channel, handler);
}
