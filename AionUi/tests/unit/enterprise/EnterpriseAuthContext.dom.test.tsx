import React, { StrictMode, useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EnterpriseLoginPollResult,
  EnterpriseLoginSession,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '@/common/enterprise/contracts';
import {
  EnterpriseAuthProvider,
  useEnterpriseAuth,
  type EnterpriseAuthContextValue,
} from '@/renderer/hooks/context/EnterpriseAuthContext';
import { EnterpriseRendererError, type EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

const NOW = new Date('2026-07-15T01:00:00.000Z');
const SESSION: EnterpriseLoginSession = {
  loginKey: 'login-key-1',
  qrDataUrl: 'data:image/png;base64,AA==',
  expiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
  pollIntervalMs: 3000,
};
const USER: EnterpriseUserContext = {
  registered: true,
  openId: 'wx-secret-open-id',
  userId: '101',
  companyId: '202',
  companyName: '辽宁示例企业',
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const makeClient = (overrides: Partial<EnterpriseClient> = {}): EnterpriseClient => ({
  createLoginSession: vi.fn(async () => SESSION),
  pollLoginSession: vi.fn(async (): Promise<EnterpriseLoginPollResult> => ({ status: 'WAITING' })),
  completeRegistration: vi.fn(async () => USER),
  restoreSession: vi.fn(async () => null),
  clearSession: vi.fn(async () => undefined),
  request: vi.fn(async (): Promise<EnterpriseResponse> => {
    throw new Error('not used');
  }),
  ...overrides,
});

let latestContext: EnterpriseAuthContextValue | undefined;

const Probe = () => {
  const context = useEnterpriseAuth();
  useEffect(() => {
    latestContext = context;
  }, [context]);
  return (
    <div>
      <span data-testid='status'>{context.status}</span>
      <span data-testid='user'>{context.user?.companyName ?? ''}</span>
      <span data-testid='session'>{context.loginSession?.loginKey ?? ''}</span>
      <span data-testid='registration'>{context.registrationOpenId ? 'present' : ''}</span>
      <span data-testid='error'>{context.errorCode ?? ''}</span>
      <span data-testid='expired'>{String(context.isExpired)}</span>
      <span data-testid='remaining'>{context.remainingSeconds}</span>
      <button type='button' onClick={() => void context.startLogin()}>
        start
      </button>
      <button type='button' onClick={() => void context.retry()}>
        retry
      </button>
      <button type='button' onClick={() => void context.logout()}>
        logout
      </button>
      <button type='button' onClick={() => void context.checkRegistration()}>
        check
      </button>
    </div>
  );
};

const renderProvider = (client: EnterpriseClient, strict = false) => {
  const content = (
    <EnterpriseAuthProvider client={client}>
      <Probe />
    </EnterpriseAuthProvider>
  );
  return render(strict ? <StrictMode>{content}</StrictMode> : content);
};

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const advance = async (milliseconds: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
};

describe('EnterpriseAuthProvider', () => {
  beforeEach(() => {
    latestContext = undefined;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores one authenticated user exactly once under StrictMode', async () => {
    const restoreSession = vi.fn(async () => USER);
    renderProvider(makeClient({ restoreSession }), true);

    await flushPromises();

    expect(screen.getByTestId('status')).toHaveTextContent(/^authenticated$/);
    expect(screen.getByTestId('user')).toHaveTextContent('辽宁示例企业');
    expect(restoreSession).toHaveBeenCalledTimes(1);
  });

  it('restores from a replacement client identity without duplicating StrictMode restores', async () => {
    const firstRestore = vi.fn(async () => null);
    const replacementRestore = vi.fn(async () => USER);
    const firstClient = makeClient({ restoreSession: firstRestore });
    const replacementClient = makeClient({ restoreSession: replacementRestore });
    const view = render(
      <StrictMode>
        <EnterpriseAuthProvider client={firstClient}>
          <Probe />
        </EnterpriseAuthProvider>
      </StrictMode>
    );
    await flushPromises();
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');

    view.rerender(
      <StrictMode>
        <EnterpriseAuthProvider client={replacementClient}>
          <Probe />
        </EnterpriseAuthProvider>
      </StrictMode>
    );
    await flushPromises();

    expect(screen.getByTestId('status')).toHaveTextContent(/^authenticated$/);
    expect(firstRestore).toHaveBeenCalledTimes(1);
    expect(replacementRestore).toHaveBeenCalledTimes(1);
  });

  it('settles as unauthenticated when no session can be restored', async () => {
    renderProvider(makeClient());

    await flushPromises();

    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('user')).toBeEmptyDOMElement();
  });

  it('reports a stable restore error and retries the same action', async () => {
    const restoreSession = vi
      .fn<EnterpriseClient['restoreSession']>()
      .mockRejectedValueOnce(new EnterpriseRendererError('SESSION_RESTORE_FAILED'))
      .mockResolvedValueOnce(USER);
    renderProvider(makeClient({ restoreSession }));
    await flushPromises();

    expect(screen.getByTestId('error')).toHaveTextContent('SESSION_RESTORE_FAILED');
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await flushPromises();

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(restoreSession).toHaveBeenCalledTimes(2);
  });

  it('does not publish a stale restore result after unmount', async () => {
    const pending = deferred<EnterpriseUserContext | null>();
    const restoreSession = vi.fn(() => pending.promise);
    const view = renderProvider(makeClient({ restoreSession }));
    await flushPromises();

    view.unmount();
    pending.resolve(USER);
    await flushPromises();

    expect(restoreSession).toHaveBeenCalledTimes(1);
  });

  it('creates a session, counts down, and keeps recursive polling single-flight', async () => {
    const firstPoll = deferred<EnterpriseLoginPollResult>();
    const pollLoginSession = vi.fn(() => firstPoll.promise);
    renderProvider(makeClient({ pollLoginSession }));
    await flushPromises();

    await act(async () => latestContext?.startLogin());
    expect(screen.getByTestId('status')).toHaveTextContent('waiting');
    expect(screen.getByTestId('session')).toHaveTextContent(SESSION.loginKey);
    expect(screen.getByTestId('remaining')).toHaveTextContent('30');

    await advance(3000);
    expect(pollLoginSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('remaining')).toHaveTextContent('27');
    await advance(6000);
    expect(pollLoginSession).toHaveBeenCalledTimes(1);

    firstPoll.resolve({ status: 'WAITING' });
    await flushPromises();
    await advance(3000);
    expect(pollLoginSession).toHaveBeenCalledTimes(2);
  });

  it('authenticates after polling and clears every scheduled timeout', async () => {
    const pollLoginSession = vi.fn(
      async (): Promise<EnterpriseLoginPollResult> => ({
        status: 'AUTHENTICATED',
        openId: USER.openId,
        userContext: USER,
      })
    );
    renderProvider(makeClient({ pollLoginSession }));
    await flushPromises();
    await act(async () => latestContext?.startLogin());

    await advance(3000);

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent(USER.companyName!);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expires locally at the session deadline and never polls again', async () => {
    const pollLoginSession = vi.fn(async (): Promise<EnterpriseLoginPollResult> => ({ status: 'WAITING' }));
    renderProvider(makeClient({ pollLoginSession }));
    await flushPromises();
    await act(async () => latestContext?.startLogin());

    await advance(30_000);
    const pollCountAtExpiry = pollLoginSession.mock.calls.length;
    await advance(10_000);

    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('expired')).toHaveTextContent('true');
    expect(screen.getByTestId('session')).toHaveTextContent(SESSION.loginKey);
    expect(pollLoginSession).toHaveBeenCalledTimes(pollCountAtExpiry);
  });

  it('honors an explicit expired poll result immediately', async () => {
    const pollLoginSession = vi.fn(async (): Promise<EnterpriseLoginPollResult> => ({ status: 'EXPIRED' }));
    renderProvider(makeClient({ pollLoginSession }));
    await flushPromises();
    await act(async () => latestContext?.startLogin());

    await advance(3000);

    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('expired')).toHaveTextContent('true');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restores the local expiry guard when a failed poll is retried', async () => {
    const shortSession = { ...SESSION, expiresAt: new Date(NOW.getTime() + 5000).toISOString() };
    const pollLoginSession = vi
      .fn<EnterpriseClient['pollLoginSession']>()
      .mockRejectedValueOnce(new EnterpriseRendererError('NETWORK'))
      .mockResolvedValueOnce({ status: 'WAITING' });
    renderProvider(makeClient({ createLoginSession: vi.fn(async () => shortSession), pollLoginSession }));
    await flushPromises();
    await act(async () => latestContext?.startLogin());
    await advance(3000);
    expect(screen.getByTestId('status')).toHaveTextContent('error');

    await act(async () => latestContext?.retry());
    await advance(2000);

    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('expired')).toHaveTextContent('true');
  });

  it('keeps one countdown chain when a pending poll retry is requested repeatedly', async () => {
    const pendingPoll = deferred<EnterpriseLoginPollResult>();
    const pollLoginSession = vi
      .fn<EnterpriseClient['pollLoginSession']>()
      .mockRejectedValueOnce(new EnterpriseRendererError('NETWORK'))
      .mockReturnValueOnce(pendingPoll.promise);
    renderProvider(makeClient({ pollLoginSession }));
    await flushPromises();
    await act(async () => latestContext?.startLogin());
    await advance(3000);
    expect(screen.getByTestId('status')).toHaveTextContent('error');

    act(() => {
      void latestContext?.retry();
      void latestContext?.retry();
    });

    expect(pollLoginSession).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    pendingPoll.resolve({ status: 'WAITING' });
    await flushPromises();
  });

  it('clears active login timers when the provider unmounts', async () => {
    const view = renderProvider(makeClient());
    await flushPromises();
    await act(async () => latestContext?.startLogin());
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('enters registration without creating another session and ignores the former QR deadline', async () => {
    const shortSession = { ...SESSION, expiresAt: new Date(NOW.getTime() + 4000).toISOString() };
    const createLoginSession = vi.fn(async () => shortSession);
    const pollLoginSession = vi.fn(
      async (): Promise<EnterpriseLoginPollResult> => ({
        status: 'REGISTER_REQUIRED',
        openId: USER.openId,
        registrationUrl: 'https://ignored.example',
      })
    );
    const completeRegistration = vi
      .fn<EnterpriseClient['completeRegistration']>()
      .mockRejectedValueOnce(new EnterpriseRendererError('REGISTRATION_INCOMPLETE'))
      .mockResolvedValueOnce(USER);
    renderProvider(makeClient({ completeRegistration, createLoginSession, pollLoginSession }));
    await flushPromises();
    await act(async () => latestContext?.startLogin());
    await advance(3000);

    expect(screen.getByTestId('status')).toHaveTextContent('registerRequired');
    expect(screen.getByTestId('registration')).toHaveTextContent('present');
    expect(createLoginSession).toHaveBeenCalledTimes(1);

    await advance(3000);
    expect(screen.getByTestId('status')).toHaveTextContent('registerRequired');
    await advance(3000);
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(createLoginSession).toHaveBeenCalledTimes(1);
  });

  it('deduplicates manual registration checks against an automatic request', async () => {
    const completion = deferred<EnterpriseUserContext>();
    const completeRegistration = vi.fn(() => completion.promise);
    const pollLoginSession = vi.fn(
      async (): Promise<EnterpriseLoginPollResult> => ({
        status: 'REGISTER_REQUIRED',
        openId: USER.openId,
        registrationUrl: 'https://ignored.example',
      })
    );
    renderProvider(makeClient({ completeRegistration, pollLoginSession }));
    await flushPromises();
    await act(async () => latestContext?.startLogin());
    await advance(3000);
    await advance(3000);

    act(() => {
      void latestContext?.checkRegistration();
    });
    expect(completeRegistration).toHaveBeenCalledTimes(1);

    completion.resolve(USER);
    await flushPromises();
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
  });

  it('retries registration failures without exposing raw error details', async () => {
    const pollLoginSession = vi.fn(
      async (): Promise<EnterpriseLoginPollResult> => ({
        status: 'REGISTER_REQUIRED',
        openId: USER.openId,
        registrationUrl: 'https://ignored.example',
      })
    );
    const completeRegistration = vi
      .fn<EnterpriseClient['completeRegistration']>()
      .mockRejectedValueOnce(new EnterpriseRendererError('NETWORK'))
      .mockResolvedValueOnce(USER);
    renderProvider(makeClient({ completeRegistration, pollLoginSession }));
    await flushPromises();
    await act(async () => latestContext?.startLogin());
    await advance(3000);
    await advance(3000);

    expect(screen.getByTestId('status')).toHaveTextContent('error');
    expect(screen.getByTestId('error')).toHaveTextContent('NETWORK');
    await act(async () => latestContext?.retry());
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
  });

  it('lets the latest start replace a pending create and ignores the stale response', async () => {
    const first = deferred<EnterpriseLoginSession>();
    const latestSession = { ...SESSION, loginKey: 'login-key-2' };
    const createLoginSession = vi
      .fn<EnterpriseClient['createLoginSession']>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(latestSession);
    renderProvider(makeClient({ createLoginSession }));
    await flushPromises();

    let firstStart!: Promise<void>;
    let secondStart!: Promise<void>;
    act(() => {
      firstStart = latestContext!.startLogin();
      secondStart = latestContext!.startLogin();
    });
    await act(async () => secondStart);
    await act(async () => {
      first.resolve(SESSION);
      await firstStart;
    });

    expect(screen.getByTestId('session')).toHaveTextContent(latestSession.loginKey);
  });

  it('clears the persisted session on logout and retries a clear failure', async () => {
    const clearSession = vi
      .fn<EnterpriseClient['clearSession']>()
      .mockRejectedValueOnce(new EnterpriseRendererError('SESSION_CLEAR_FAILED'))
      .mockResolvedValueOnce(undefined);
    renderProvider(makeClient({ clearSession, restoreSession: vi.fn(async () => USER) }));
    await flushPromises();

    await act(async () => latestContext?.logout());
    expect(screen.getByTestId('status')).toHaveTextContent('error');
    expect(screen.getByTestId('error')).toHaveTextContent('SESSION_CLEAR_FAILED');
    await act(async () => latestContext?.retry());

    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('user')).toBeEmptyDOMElement();
    expect(clearSession).toHaveBeenCalledTimes(2);
  });
});
