import { useCallback, useEffect, useRef, useState } from 'react';

import type { DemandAiConversationSnapshot, DemandAiLineCandidate } from '@/common/enterprise/contracts';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import {
  cancelDemandAiConversation,
  completeDemandAiConversation,
  confirmDemandAiLine,
  patchDemandAiFields,
  rejectDemandAiSwitch,
  resumeDemandAiConversation,
  sendDemandAiTurn,
  startDemandAiConversation,
} from './demandAiConversationData';

export type DemandAiConversationMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
};

type RetryOperation = () => Promise<void>;

const newRequestId = (): string => crypto.randomUUID();

export const useDemandAiConversation = (client: EnterpriseClient) => {
  const [snapshot, setSnapshot] = useState<DemandAiConversationSnapshot>();
  const [messages, setMessages] = useState<DemandAiConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const snapshotRef = useRef<DemandAiConversationSnapshot | undefined>(undefined);
  const requestGeneration = useRef(0);
  const retryRef = useRef<RetryOperation | undefined>(undefined);
  const confirmLineInFlightRef = useRef(false);
  const patchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingPatch = useRef<Record<string, string>>({});

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(
    () => () => {
      if (patchTimer.current) clearTimeout(patchTimer.current);
      requestGeneration.current += 1;
    },
    []
  );

  const acceptSnapshot = useCallback((next: DemandAiConversationSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    setMessages((current) => [
      ...current,
      {
        id: `assistant-${next.sessionId}-${next.version}-${current.length}`,
        role: 'ASSISTANT',
        content: next.message,
      },
    ]);
  }, []);

  const run = useCallback(
    async (
      operation: () => Promise<DemandAiConversationSnapshot>,
      retryOperation?: RetryOperation
    ): Promise<DemandAiConversationSnapshot | undefined> => {
      const generation = ++requestGeneration.current;
      setLoading(true);
      setError(undefined);
      try {
        const next = await operation();
        if (generation !== requestGeneration.current) return undefined;
        acceptSnapshot(next);
        retryRef.current =
          next.action === 'RETRY_AVAILABLE' && snapshotRef.current
            ? async () => {
                const current = snapshotRef.current;
                if (!current) return;
                await run(
                  () =>
                    sendDemandAiTurn(client, current.sessionId, newRequestId(), current.version, '请重试上一轮解析'),
                  retryOperation
                );
              }
            : undefined;
        return next;
      } catch (cause) {
        if (generation !== requestGeneration.current) return undefined;
        const normalized = cause instanceof Error ? cause : new Error('Demand AI request failed');
        setError(normalized);
        retryRef.current = retryOperation;
        return undefined;
      } finally {
        if (generation === requestGeneration.current) setLoading(false);
      }
    },
    [acceptSnapshot, client]
  );

  const start = useCallback(
    async (message: string) => {
      const requestId = newRequestId();
      const normalized = message.trim();
      setMessages((current) => [...current, { id: `user-${requestId}`, role: 'USER', content: normalized }]);
      const operation = () => startDemandAiConversation(client, requestId, normalized);
      await run(operation, async () => {
        await run(operation);
      });
    },
    [client, run]
  );

  const send = useCallback(
    async (message: string) => {
      const current = snapshotRef.current;
      if (!current) return;
      const requestId = newRequestId();
      const normalized = message.trim();
      setMessages((items) => [...items, { id: `user-${requestId}`, role: 'USER', content: normalized }]);
      const operation = () => sendDemandAiTurn(client, current.sessionId, requestId, current.version, normalized);
      await run(operation, async () => {
        await run(operation);
      });
    },
    [client, run]
  );

  const recoverAfterAmbiguousMutation = useCallback(
    async (previous: DemandAiConversationSnapshot): Promise<boolean> => {
      const generation = ++requestGeneration.current;
      setLoading(true);
      try {
        const recovered = await resumeDemandAiConversation(client, previous.sessionId);
        if (generation !== requestGeneration.current || recovered.version <= previous.version) return false;
        acceptSnapshot(recovered);
        setError(undefined);
        retryRef.current = undefined;
        return true;
      } catch {
        return false;
      } finally {
        if (generation === requestGeneration.current) setLoading(false);
      }
    },
    [acceptSnapshot, client]
  );

  const confirmLine = useCallback(
    async (candidate: DemandAiLineCandidate, confirmSwitch = false) => {
      // All conversation mutations use an optimistic version. Serializing line
      // confirmation prevents a slow model response from being overtaken by a
      // duplicate click that still carries the previous version.
      if (confirmLineInFlightRef.current) return;
      const current = snapshotRef.current;
      if (!current) return;
      confirmLineInFlightRef.current = true;
      try {
        const requestId = newRequestId();
        const operation = () => confirmDemandAiLine(client, current, requestId, candidate, confirmSwitch);
        const next = await run(operation, async () => {
          await run(operation);
        });
        // A request may commit on the server while its response is lost or a
        // duplicate stale-version request fails. Resume reconciles that state
        // without replaying the mutation or creating another conversation turn.
        if (!next) await recoverAfterAmbiguousMutation(current);
      } finally {
        confirmLineInFlightRef.current = false;
      }
    },
    [client, recoverAfterAmbiguousMutation, run]
  );

  const rejectSwitch = useCallback(async () => {
    const current = snapshotRef.current;
    if (!current) return;
    const requestId = newRequestId();
    const operation = () => rejectDemandAiSwitch(client, current, requestId);
    await run(operation, async () => {
      await run(operation);
    });
  }, [client, run]);

  const flushPatch = useCallback(async () => {
    const current = snapshotRef.current;
    const fields = pendingPatch.current;
    pendingPatch.current = {};
    if (!current || Object.keys(fields).length === 0) return;
    const requestId = newRequestId();
    const operation = () => patchDemandAiFields(client, current, requestId, fields);
    await run(operation, async () => {
      await run(operation);
    });
  }, [client, run]);

  const patchManualFields = useCallback(
    (fields: Record<string, string>) => {
      pendingPatch.current = { ...pendingPatch.current, ...fields };
      if (patchTimer.current) clearTimeout(patchTimer.current);
      patchTimer.current = setTimeout(() => {
        patchTimer.current = undefined;
        void flushPatch();
      }, 400);
    },
    [flushPatch]
  );

  const resume = useCallback(
    async (sessionId?: string) => {
      const generation = ++requestGeneration.current;
      try {
        const next = await resumeDemandAiConversation(client, sessionId);
        if (generation !== requestGeneration.current) return;
        acceptSnapshot(next);
      } catch {
        // A missing resumable session is the normal first-visit state.
      }
    },
    [acceptSnapshot, client]
  );

  const retry = useCallback(async () => {
    await retryRef.current?.();
  }, []);

  const cancel = useCallback(async () => {
    const current = snapshotRef.current;
    if (!current) return;
    await run(() => cancelDemandAiConversation(client, current, newRequestId()));
  }, [client, run]);

  const markSubmitted = useCallback(
    async (demandId: string) => {
      const current = snapshotRef.current;
      if (!current) return;
      await run(() => completeDemandAiConversation(client, current, newRequestId(), demandId));
    },
    [client, run]
  );

  return {
    snapshot,
    messages,
    loading,
    error,
    start,
    send,
    confirmLine,
    rejectSwitch,
    patchManualFields,
    resume,
    retry,
    cancel,
    markSubmitted,
  };
};
