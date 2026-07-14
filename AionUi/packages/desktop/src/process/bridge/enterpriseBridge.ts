import { app, ipcMain as electronIpcMain } from 'electron';
import { z } from 'zod';

import type {
  EnterpriseLoginPollResult,
  EnterpriseLoginSession,
  EnterpriseRequest,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '@/common/enterprise/contracts';
import { ENTERPRISE_IPC_CHANNELS } from '@/common/enterprise/constants';
import { enterpriseRequestSchema } from '@/common/enterprise/schemas';
import {
  EnterpriseApiClient,
  EnterpriseApiError,
  type EnterpriseApiErrorCode,
} from '@process/services/enterprise/enterpriseApiClient';
import { EnterpriseSessionStore } from '@process/services/enterprise/enterpriseSessionStore';

type EnterpriseIpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

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

export type EnterpriseBridgeDependencies = {
  apiClient?: EnterpriseApiClientDependency;
  ipcMain?: EnterpriseIpcMain;
  sessionStore?: EnterpriseSessionStoreDependency;
};

type EnterpriseBridgeErrorCode =
  | EnterpriseApiErrorCode
  | 'AUTH_CREATE_FAILED'
  | 'AUTH_POLL_FAILED'
  | 'INVALID_AUTH_RESULT'
  | 'REGISTRATION_INCOMPLETE'
  | 'REGISTRATION_FAILED'
  | 'SESSION_RESTORE_FAILED'
  | 'SESSION_CLEAR_FAILED'
  | 'REQUEST_FAILED';

const API_ERROR_MESSAGES: Record<EnterpriseApiErrorCode, string> = {
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

const BRIDGE_ERROR_MESSAGES: Record<Exclude<EnterpriseBridgeErrorCode, EnterpriseApiErrorCode>, string> = {
  AUTH_CREATE_FAILED: 'Enterprise login session creation failed.',
  AUTH_POLL_FAILED: 'Enterprise login polling failed.',
  INVALID_AUTH_RESULT: 'Enterprise login result is invalid.',
  REGISTRATION_INCOMPLETE: 'Enterprise registration is incomplete.',
  REGISTRATION_FAILED: 'Enterprise registration verification failed.',
  SESSION_RESTORE_FAILED: 'Enterprise session restoration failed.',
  SESSION_CLEAR_FAILED: 'Enterprise session clearing failed.',
  REQUEST_FAILED: 'Enterprise request failed.',
};

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

/** A stable, non-sensitive failure crossing the enterprise IPC boundary. */
export class EnterpriseBridgeError extends Error {
  readonly code: EnterpriseBridgeErrorCode;

  constructor(code: EnterpriseBridgeErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'EnterpriseBridgeError';
    this.code = code;
  }
}

const bridgeError = (code: EnterpriseBridgeErrorCode): EnterpriseBridgeError => {
  const message =
    code in API_ERROR_MESSAGES
      ? API_ERROR_MESSAGES[code as EnterpriseApiErrorCode]
      : BRIDGE_ERROR_MESSAGES[code as Exclude<EnterpriseBridgeErrorCode, EnterpriseApiErrorCode>];
  return new EnterpriseBridgeError(code, message);
};

const sanitizeFailure = (error: unknown, fallbackCode: EnterpriseBridgeErrorCode): EnterpriseBridgeError => {
  if (error instanceof EnterpriseBridgeError) return bridgeError(error.code);
  if (error instanceof EnterpriseApiError && error.code in API_ERROR_MESSAGES) return bridgeError(error.code);
  return bridgeError(fallbackCode);
};

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

/** Registers the allowlisted enterprise IPC surface and owns its trusted in-memory identity. */
export function initEnterpriseBridge(dependencies: EnterpriseBridgeDependencies = {}): void {
  const apiClient = dependencies.apiClient ?? new EnterpriseApiClient();
  const sessionStore = dependencies.sessionStore ?? new EnterpriseSessionStore(app.getPath('userData'));
  const ipcMain = dependencies.ipcMain ?? (electronIpcMain as EnterpriseIpcMain);

  let activeContext: EnterpriseUserContext | null = null;
  let hydrationPromise: Promise<EnterpriseUserContext | null> | null = null;
  let sessionGeneration = 0;

  const clearSessionState = async (): Promise<void> => {
    sessionGeneration += 1;
    activeContext = null;
    await sessionStore.clear();
  };

  const refreshPersistedContext = (): Promise<EnterpriseUserContext | null> => {
    if (activeContext) return Promise.resolve(activeContext);
    if (hydrationPromise) return hydrationPromise;

    const generationAtStart = sessionGeneration;
    const hydration = (async (): Promise<EnterpriseUserContext | null> => {
      const openId = await sessionStore.loadOpenId();
      if (openId === null) return null;

      const context = await apiClient.getUserContext(openId);
      if (sessionGeneration !== generationAtStart) throw bridgeError('MISSING_CONTEXT');
      if (context.registered === false) {
        await clearSessionState();
        return null;
      }
      if (!isRegisteredContext(context, openId)) throw bridgeError('INVALID_RESPONSE');

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
    if (!context) throw bridgeError('MISSING_CONTEXT');
    return context;
  };

  const commitAuthenticatedContext = async (
    openId: string,
    context: EnterpriseUserContext,
    generationAtStart: number
  ): Promise<void> => {
    if (sessionGeneration !== generationAtStart) throw bridgeError('MISSING_CONTEXT');
    sessionGeneration += 1;
    const commitGeneration = sessionGeneration;
    activeContext = null;

    await sessionStore.saveOpenId(openId);
    if (sessionGeneration !== commitGeneration) throw bridgeError('MISSING_CONTEXT');
    activeContext = context;
  };

  const handlers: ReadonlyArray<readonly [string, EnterpriseIpcHandler]> = [
    [
      ENTERPRISE_IPC_CHANNELS.AUTH_CREATE,
      async () => {
        try {
          return await apiClient.createLoginSession();
        } catch (error) {
          throw sanitizeFailure(error, 'AUTH_CREATE_FAILED');
        }
      },
    ],
    [
      ENTERPRISE_IPC_CHANNELS.AUTH_POLL,
      async (_event, loginKey) => {
        try {
          const parsedLoginKey = loginKeySchema.safeParse(loginKey);
          if (!parsedLoginKey.success) throw bridgeError('INVALID_REQUEST');
          const generationAtStart = sessionGeneration;
          const result = await apiClient.pollLoginSession(parsedLoginKey.data);
          if (result.status !== 'AUTHENTICATED') return result;
          if (!isRegisteredContext(result.userContext, result.openId)) throw bridgeError('INVALID_AUTH_RESULT');

          await commitAuthenticatedContext(result.openId, result.userContext, generationAtStart);
          return result;
        } catch (error) {
          throw sanitizeFailure(error, 'AUTH_POLL_FAILED');
        }
      },
    ],
    [
      ENTERPRISE_IPC_CHANNELS.AUTH_COMPLETE_REGISTRATION,
      async (_event, untrustedOpenId) => {
        try {
          const parsedOpenId = registrationOpenIdSchema.safeParse(untrustedOpenId);
          if (!parsedOpenId.success) throw bridgeError('INVALID_REQUEST');
          const openId = parsedOpenId.data;
          const generationAtStart = sessionGeneration;
          const context = await apiClient.getUserContext(openId);
          if (!isRegisteredContext(context, openId)) throw bridgeError('REGISTRATION_INCOMPLETE');

          await commitAuthenticatedContext(openId, context, generationAtStart);
          return context;
        } catch (error) {
          throw sanitizeFailure(error, 'REGISTRATION_FAILED');
        }
      },
    ],
    [
      ENTERPRISE_IPC_CHANNELS.AUTH_RESTORE,
      async () => {
        try {
          return await refreshPersistedContext();
        } catch (error) {
          throw sanitizeFailure(error, 'SESSION_RESTORE_FAILED');
        }
      },
    ],
    [
      ENTERPRISE_IPC_CHANNELS.AUTH_CLEAR,
      async () => {
        try {
          await clearSessionState();
        } catch (error) {
          throw sanitizeFailure(error, 'SESSION_CLEAR_FAILED');
        }
      },
    ],
    [
      ENTERPRISE_IPC_CHANNELS.REQUEST,
      async (_event, request) => {
        try {
          const parsedRequest = parseStrictEnterpriseRequest(request);
          if (!parsedRequest) throw bridgeError('INVALID_REQUEST');
          const context = await requireActiveContext();
          return await apiClient.request(parsedRequest, context);
        } catch (error) {
          throw sanitizeFailure(error, 'REQUEST_FAILED');
        }
      },
    ],
  ];

  for (const [channel] of handlers) ipcMain.removeHandler(channel);
  for (const [channel, handler] of handlers) ipcMain.handle(channel, handler);
}
