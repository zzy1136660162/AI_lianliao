import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ENTERPRISE_IPC_ERROR_MESSAGES } from '@/common/enterprise/constants';
import type {
  EnterpriseIpcErrorCode,
  EnterpriseLoginSession,
  EnterpriseUserContext,
} from '@/common/enterprise/contracts';
import {
  enterpriseClient,
  EnterpriseRendererError,
  type EnterpriseClient,
} from '@/renderer/services/enterprise/enterpriseClient';

export type EnterpriseAuthStatus =
  | 'checking'
  | 'unauthenticated'
  | 'waiting'
  | 'registerRequired'
  | 'authenticated'
  | 'error';

type FailedAction = 'restore' | 'create' | 'poll' | 'registration' | 'clear';
type Timer = ReturnType<typeof setTimeout>;

export type EnterpriseAuthContextValue = {
  status: EnterpriseAuthStatus;
  user: EnterpriseUserContext | null;
  loginSession: EnterpriseLoginSession | null;
  registrationOpenId: string | null;
  errorCode: EnterpriseIpcErrorCode | null;
  startLogin: () => Promise<void>;
  retry: () => Promise<void>;
  /** Returns true only after the persisted enterprise session has been cleared. */
  logout: () => Promise<boolean>;
  checkRegistration: () => Promise<void>;
  /** Re-queries the current enterprise membership without changing the login flow. */
  refreshUserContext: () => Promise<EnterpriseUserContext>;
  isExpired: boolean;
  remainingSeconds: number;
};

type EnterpriseAuthProviderProps = React.PropsWithChildren<{
  client?: EnterpriseClient;
}>;

const EnterpriseAuthContext = createContext<EnterpriseAuthContextValue | undefined>(undefined);

const isEnterpriseErrorCode = (value: unknown): value is EnterpriseIpcErrorCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ENTERPRISE_IPC_ERROR_MESSAGES, value);

const errorCodeOf = (error: unknown, fallback: EnterpriseIpcErrorCode): EnterpriseIpcErrorCode => {
  if (error instanceof EnterpriseRendererError) return error.code;
  if (typeof error === 'object' && error !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    if (
      descriptor &&
      Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
      isEnterpriseErrorCode(descriptor.value)
    ) {
      return descriptor.value;
    }
  }
  return fallback;
};

const secondsUntil = (expiresAt: string): number => {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return 0;
  return Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
};

/** Owns the enterprise authentication lifecycle without changing the application's original AuthContext. */
export const EnterpriseAuthProvider: React.FC<EnterpriseAuthProviderProps> = ({ children, client }) => {
  const activeClient = client ?? enterpriseClient;
  const [status, setStatus] = useState<EnterpriseAuthStatus>('checking');
  const [user, setUser] = useState<EnterpriseUserContext | null>(null);
  const [loginSession, setLoginSession] = useState<EnterpriseLoginSession | null>(null);
  const [registrationOpenId, setRegistrationOpenId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<EnterpriseIpcErrorCode | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const restoredClientRef = useRef<EnterpriseClient | null>(null);
  const sessionRef = useRef<EnterpriseLoginSession | null>(null);
  const registrationOpenIdRef = useRef<string | null>(null);
  const failedActionRef = useRef<FailedAction | null>(null);
  const pollTimerRef = useRef<Timer | null>(null);
  const countdownTimerRef = useRef<Timer | null>(null);
  const registrationTimerRef = useRef<Timer | null>(null);
  const pollingGenerationRef = useRef<number | null>(null);
  const registrationPromiseRef = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const pollActionRef = useRef<(generation: number) => Promise<void>>(async () => undefined);
  const registrationActionRef = useRef<(generation: number) => Promise<void>>(async () => undefined);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current !== null) clearTimeout(pollTimerRef.current);
    if (countdownTimerRef.current !== null) clearTimeout(countdownTimerRef.current);
    if (registrationTimerRef.current !== null) clearTimeout(registrationTimerRef.current);
    pollTimerRef.current = null;
    countdownTimerRef.current = null;
    registrationTimerRef.current = null;
  }, []);

  const replaceFlow = useCallback((): number => {
    clearTimers();
    generationRef.current += 1;
    pollingGenerationRef.current = null;
    registrationPromiseRef.current = null;
    return generationRef.current;
  }, [clearTimers]);

  const isCurrent = useCallback(
    (generation: number): boolean => mountedRef.current && generationRef.current === generation,
    []
  );

  const publishError = useCallback(
    (generation: number, action: FailedAction, error: unknown, fallback: EnterpriseIpcErrorCode) => {
      if (!isCurrent(generation)) return;
      clearTimers();
      failedActionRef.current = action;
      setErrorCode(errorCodeOf(error, fallback));
      setStatus('error');
    },
    [clearTimers, isCurrent]
  );

  const publishAuthenticated = useCallback(
    (generation: number, authenticatedUser: EnterpriseUserContext) => {
      if (!isCurrent(generation)) return;
      clearTimers();
      generationRef.current += 1;
      pollingGenerationRef.current = null;
      registrationPromiseRef.current = null;
      sessionRef.current = null;
      registrationOpenIdRef.current = null;
      failedActionRef.current = null;
      setUser(authenticatedUser);
      setLoginSession(null);
      setRegistrationOpenId(null);
      setErrorCode(null);
      setIsExpired(false);
      setRemainingSeconds(0);
      setStatus('authenticated');
    },
    [clearTimers, isCurrent]
  );

  const publishExpired = useCallback(
    (generation: number) => {
      if (!isCurrent(generation)) return;
      clearTimers();
      generationRef.current += 1;
      pollingGenerationRef.current = null;
      registrationPromiseRef.current = null;
      failedActionRef.current = null;
      setUser(null);
      setErrorCode(null);
      setIsExpired(true);
      setRemainingSeconds(0);
      setStatus('unauthenticated');
    },
    [clearTimers, isCurrent]
  );

  const schedulePoll = useCallback(
    (generation: number, delayMs: number) => {
      if (!isCurrent(generation)) return;
      if (pollTimerRef.current !== null) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(() => {
        pollTimerRef.current = null;
        void pollActionRef.current(generation);
      }, delayMs);
    },
    [isCurrent]
  );

  const scheduleRegistrationCheck = useCallback(
    (generation: number, delayMs: number) => {
      if (!isCurrent(generation)) return;
      if (registrationTimerRef.current !== null) clearTimeout(registrationTimerRef.current);
      registrationTimerRef.current = setTimeout(() => {
        registrationTimerRef.current = null;
        void registrationActionRef.current(generation);
      }, delayMs);
    },
    [isCurrent]
  );

  const scheduleCountdown = useCallback(
    (generation: number) => {
      if (countdownTimerRef.current !== null) clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
      const tick = () => {
        if (!isCurrent(generation)) return;
        const currentSession = sessionRef.current;
        const seconds = currentSession ? secondsUntil(currentSession.expiresAt) : 0;
        setRemainingSeconds(seconds);
        if (seconds === 0) {
          publishExpired(generation);
          return;
        }
        countdownTimerRef.current = setTimeout(tick, 1000);
      };
      countdownTimerRef.current = setTimeout(tick, 1000);
    },
    [isCurrent, publishExpired]
  );

  const completeRegistration = useCallback(
    (generation: number): Promise<void> => {
      const inFlight = registrationPromiseRef.current;
      if (inFlight?.generation === generation) return inFlight.promise;

      const operation = (async () => {
        const openId = registrationOpenIdRef.current;
        const currentSession = sessionRef.current;
        if (!openId || !currentSession || !isCurrent(generation)) return;
        try {
          const authenticatedUser = await activeClient.completeRegistration(openId);
          if (!isCurrent(generation)) return;
          publishAuthenticated(generation, authenticatedUser);
        } catch (error) {
          if (!isCurrent(generation)) return;
          if (errorCodeOf(error, 'REGISTRATION_FAILED') === 'REGISTRATION_INCOMPLETE') {
            setStatus('registerRequired');
            setErrorCode(null);
            scheduleRegistrationCheck(generation, currentSession.pollIntervalMs);
            return;
          }
          publishError(generation, 'registration', error, 'REGISTRATION_FAILED');
        }
      })();
      registrationPromiseRef.current = { generation, promise: operation };
      void operation.finally(() => {
        if (registrationPromiseRef.current?.promise === operation) registrationPromiseRef.current = null;
      });
      return operation;
    },
    [activeClient, isCurrent, publishAuthenticated, publishError, scheduleRegistrationCheck]
  );
  registrationActionRef.current = completeRegistration;

  const pollLogin = useCallback(
    async (generation: number): Promise<void> => {
      if (!isCurrent(generation) || pollingGenerationRef.current === generation) return;
      const currentSession = sessionRef.current;
      if (!currentSession) return;
      pollingGenerationRef.current = generation;
      try {
        const result = await activeClient.pollLoginSession(currentSession.loginKey);
        if (!isCurrent(generation)) return;
        switch (result.status) {
          case 'WAITING':
            schedulePoll(generation, currentSession.pollIntervalMs);
            break;
          case 'EXPIRED':
            publishExpired(generation);
            break;
          case 'AUTHENTICATED':
            publishAuthenticated(generation, result.userContext);
            break;
          case 'REGISTER_REQUIRED':
            if (pollTimerRef.current !== null) clearTimeout(pollTimerRef.current);
            if (countdownTimerRef.current !== null) clearTimeout(countdownTimerRef.current);
            pollTimerRef.current = null;
            countdownTimerRef.current = null;
            registrationOpenIdRef.current = result.openId;
            setRegistrationOpenId(result.openId);
            setErrorCode(null);
            setIsExpired(false);
            setRemainingSeconds(0);
            setStatus('registerRequired');
            scheduleRegistrationCheck(generation, currentSession.pollIntervalMs);
            break;
        }
      } catch (error) {
        publishError(generation, 'poll', error, 'AUTH_POLL_FAILED');
      } finally {
        if (pollingGenerationRef.current === generation) pollingGenerationRef.current = null;
      }
    },
    [
      activeClient,
      isCurrent,
      publishAuthenticated,
      publishError,
      publishExpired,
      schedulePoll,
      scheduleRegistrationCheck,
    ]
  );
  pollActionRef.current = pollLogin;

  const startLogin = useCallback(async (): Promise<void> => {
    const generation = replaceFlow();
    sessionRef.current = null;
    registrationOpenIdRef.current = null;
    failedActionRef.current = null;
    setUser(null);
    setLoginSession(null);
    setRegistrationOpenId(null);
    setErrorCode(null);
    setIsExpired(false);
    setRemainingSeconds(0);
    setStatus('checking');
    try {
      const session = await activeClient.createLoginSession();
      if (!isCurrent(generation)) return;
      sessionRef.current = session;
      setLoginSession(session);
      const seconds = secondsUntil(session.expiresAt);
      setRemainingSeconds(seconds);
      if (seconds === 0) {
        publishExpired(generation);
        return;
      }
      setStatus('waiting');
      scheduleCountdown(generation);
      schedulePoll(generation, session.pollIntervalMs);
    } catch (error) {
      publishError(generation, 'create', error, 'AUTH_CREATE_FAILED');
    }
  }, [activeClient, isCurrent, publishError, publishExpired, replaceFlow, scheduleCountdown, schedulePoll]);

  const restore = useCallback(async (): Promise<void> => {
    const generation = replaceFlow();
    failedActionRef.current = null;
    setErrorCode(null);
    setStatus('checking');
    try {
      const restoredUser = await activeClient.restoreSession();
      if (!isCurrent(generation)) return;
      if (restoredUser) {
        publishAuthenticated(generation, restoredUser);
        return;
      }
      setUser(null);
      setStatus('unauthenticated');
    } catch (error) {
      publishError(generation, 'restore', error, 'SESSION_RESTORE_FAILED');
    }
  }, [activeClient, isCurrent, publishAuthenticated, publishError, replaceFlow]);

  const logout = useCallback(async (): Promise<boolean> => {
    const generation = replaceFlow();
    failedActionRef.current = null;
    setErrorCode(null);
    try {
      await activeClient.clearSession();
      if (!isCurrent(generation)) return false;
      sessionRef.current = null;
      registrationOpenIdRef.current = null;
      failedActionRef.current = null;
      setUser(null);
      setLoginSession(null);
      setRegistrationOpenId(null);
      setErrorCode(null);
      setIsExpired(false);
      setRemainingSeconds(0);
      setStatus('unauthenticated');
      return true;
    } catch (error) {
      if (!isCurrent(generation)) return false;
      // A failed local clear is recoverable. Keep the authenticated workspace mounted
      // and expose only the stable IPC code so implementation details never reach the UI.
      failedActionRef.current = 'clear';
      setErrorCode(errorCodeOf(error, 'SESSION_CLEAR_FAILED'));
      return false;
    }
  }, [activeClient, isCurrent, replaceFlow]);

  const checkRegistration = useCallback(async (): Promise<void> => {
    const generation = generationRef.current;
    if (!registrationOpenIdRef.current || !isCurrent(generation)) return;
    if (registrationTimerRef.current !== null) {
      clearTimeout(registrationTimerRef.current);
      registrationTimerRef.current = null;
    }
    await completeRegistration(generation);
  }, [completeRegistration, isCurrent]);

  const refreshUserContext = useCallback(async (): Promise<EnterpriseUserContext> => {
    const refreshed = await activeClient.restoreSession();
    if (!refreshed?.registered) throw new EnterpriseRendererError('REGISTRATION_INCOMPLETE');
    if (!mountedRef.current) throw new EnterpriseRendererError('SESSION_RESTORE_FAILED');
    setUser(refreshed);
    return refreshed;
  }, [activeClient]);

  const retry = useCallback(async (): Promise<void> => {
    switch (failedActionRef.current) {
      case 'restore':
        await restore();
        break;
      case 'create':
        await startLogin();
        break;
      case 'poll': {
        const generation = generationRef.current;
        const currentSession = sessionRef.current;
        const seconds = currentSession ? secondsUntil(currentSession.expiresAt) : 0;
        if (!currentSession || seconds === 0) {
          publishExpired(generation);
          break;
        }
        setErrorCode(null);
        setRemainingSeconds(seconds);
        setStatus('waiting');
        scheduleCountdown(generation);
        await pollLogin(generation);
        break;
      }
      case 'registration':
        setErrorCode(null);
        setStatus('registerRequired');
        await checkRegistration();
        break;
      case 'clear':
        await logout();
        break;
      default:
        await startLogin();
    }
  }, [checkRegistration, logout, pollLogin, publishExpired, restore, scheduleCountdown, startLogin]);

  useEffect(() => {
    mountedRef.current = true;
    const scheduledGeneration = generationRef.current;
    const scheduledClient = activeClient;
    void Promise.resolve().then(() => {
      if (
        !mountedRef.current ||
        generationRef.current !== scheduledGeneration ||
        restoredClientRef.current === scheduledClient
      ) {
        return;
      }
      restoredClientRef.current = scheduledClient;
      void restore();
    });
    return () => {
      mountedRef.current = false;
      clearTimers();
      generationRef.current += 1;
      pollingGenerationRef.current = null;
      registrationPromiseRef.current = null;
    };
  }, [activeClient, clearTimers, restore]);

  const value = useMemo<EnterpriseAuthContextValue>(
    () => ({
      status,
      user,
      loginSession,
      registrationOpenId,
      errorCode,
      startLogin,
      retry,
      logout,
      checkRegistration,
      refreshUserContext,
      isExpired,
      remainingSeconds,
    }),
    [
      checkRegistration,
      errorCode,
      isExpired,
      loginSession,
      logout,
      registrationOpenId,
      refreshUserContext,
      remainingSeconds,
      retry,
      startLogin,
      status,
      user,
    ]
  );

  return <EnterpriseAuthContext.Provider value={value}>{children}</EnterpriseAuthContext.Provider>;
};

/** Returns the enterprise authentication state for desktop-only business pages. */
export const useEnterpriseAuth = (): EnterpriseAuthContextValue => {
  const context = useContext(EnterpriseAuthContext);
  if (!context) throw new Error('useEnterpriseAuth must be used within EnterpriseAuthProvider');
  return context;
};

/**
 * Optional variant for reusable leaf components and isolated DOM tests.
 * Authenticated production routes still always provide the enterprise context.
 */
export const useOptionalEnterpriseAuth = (): EnterpriseAuthContextValue | undefined =>
  useContext(EnterpriseAuthContext);
