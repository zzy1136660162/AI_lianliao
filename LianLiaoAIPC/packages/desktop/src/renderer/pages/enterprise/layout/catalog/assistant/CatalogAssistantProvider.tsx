import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import type {
  CatalogAssistantContext,
  CatalogAssistantPlan,
  CatalogAssistantProgress,
  CatalogAssistantResultScope,
  CatalogAssistantTrustedResult,
  EnterpriseAssistantRoutePlan,
} from '@/common/enterprise/catalog-assistant/contracts';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { useLocation } from 'react-router-dom';

import {
  CatalogAssistantCancelledError,
  CatalogAssistantExecutionError,
  type CatalogAssistantResumeState,
  runCatalogAssistant,
} from './catalogAssistantOrchestrator';
import { getCatalogScopeDigest, getCatalogTrustedResultId } from './adapters/catalogAdapterRegistry';

type CatalogAssistantSessionState = {
  message: string;
  context?: CatalogAssistantContext;
  history: CatalogAssistantConversationTurn[];
  progress: CatalogAssistantProgress;
  summary?: string;
  clarification?: string;
  results: CatalogAssistantTrustedResult[];
  lastSuccessfulPlan?: CatalogAssistantPlan;
  navigationProposal?: EnterpriseAssistantRoutePlan;
  handoffLoading: boolean;
  handoffError?: string;
};

export type CatalogAssistantConversationTurn = {
  id: string;
  userMessage: string;
  assistantMessage: string;
  resultCount: number;
};

type CatalogAssistantContextValue = CatalogAssistantSessionState & {
  submit: (message: string) => Promise<void>;
  stop: () => void;
  retry: () => Promise<void>;
  clear: () => void;
  startDemandHandoff: () => Promise<string | undefined>;
  dismissNavigation: () => void;
};

const initialState = (): CatalogAssistantSessionState => ({
  message: '',
  history: [],
  progress: {
    stage: 'IDLE',
    messageKey: 'enterprise.catalogAssistant.capability',
  },
  results: [],
  handoffLoading: false,
});

const CatalogAssistantReactContext = createContext<CatalogAssistantContextValue | undefined>(undefined);

const createRequestId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `catalog-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const appendConversationTurn = (
  history: CatalogAssistantConversationTurn[],
  turn: CatalogAssistantConversationTurn
): CatalogAssistantConversationTurn[] => [...history, turn].slice(-10);

/**
 * The backend context contract is deliberately capped at 300 characters.
 * Keep the most recent three exchanges so follow-up phrases such as “换一批”
 * retain intent without sending an unbounded transcript to the planning model.
 */
const compactConversationMemory = (history: CatalogAssistantConversationTurn[]): string | undefined => {
  const memory = history
    .slice(-3)
    .map(
      (turn) =>
        `用户:${turn.userMessage.slice(0, 70)} 助手:${turn.assistantMessage.slice(0, 90)} 结果:${turn.resultCount}`
    )
    .join('；');
  if (!memory) return undefined;
  return memory.length <= 300 ? memory : `…${memory.slice(-299)}`;
};

export type CatalogAssistantProviderProps = React.PropsWithChildren<{
  client?: EnterpriseClient;
}>;

/**
 * Keeps assistant state above company/product routes for the current application runtime only.
 * No conversation data is written to browser storage, SQLite or a cloud conversation table.
 */
export const CatalogAssistantProvider: React.FC<CatalogAssistantProviderProps> = ({
  children,
  client = enterpriseClient,
}) => {
  const location = useLocation();
  const [state, setState] = useState<CatalogAssistantSessionState>(initialState);
  const stateRef = useRef(state);
  const requestIdRef = useRef('');
  const abortRef = useRef<AbortController | undefined>(undefined);
  const resumeRef = useRef<CatalogAssistantResumeState | undefined>(undefined);

  const updateState = useCallback(
    (updater: (current: CatalogAssistantSessionState) => CatalogAssistantSessionState): void => {
      setState((current) => {
        const next = updater(current);
        stateRef.current = next;
        return next;
      });
    },
    []
  );

  const execute = useCallback(
    async (message: string, resume?: CatalogAssistantResumeState): Promise<void> => {
      const normalized = message.trim();
      if (normalized.length < 2) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      const requestId = createRequestId();
      requestIdRef.current = requestId;
      abortRef.current = controller;
      resumeRef.current = resume;
      const priorResults = stateRef.current.results;

      updateState((current) => ({
        ...current,
        message: normalized,
        summary: undefined,
        clarification: undefined,
        navigationProposal: undefined,
        handoffError: undefined,
        results: resume ? current.results : [],
        progress: {
          stage: 'PLANNING',
          messageKey: 'enterprise.catalogAssistant.planning',
        },
      }));

      try {
        const result = await runCatalogAssistant(client, {
          requestId,
          message: normalized,
          context: stateRef.current.context,
          signal: controller.signal,
          isCurrent: (candidate) => requestIdRef.current === candidate,
          onProgress: (progress) => updateState((current) => ({ ...current, progress })),
          resume,
          currentModule: location.pathname,
          currentResults: priorResults,
        });
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;

        resumeRef.current = undefined;
        updateState((current) => {
          const assistantMessage = result.clarification ?? result.summary;
          const history = appendConversationTurn(current.history, {
            id: requestId,
            userMessage: normalized,
            assistantMessage,
            resultCount: result.results.length,
          });
          const resultIds = result.results.map(getCatalogTrustedResultId);
          const currentScope: CatalogAssistantResultScope | undefined =
            result.plan?.entityType && result.results.length
              ? {
                  scopeId: createRequestId(),
                  entityType: result.plan.entityType,
                  filters: result.plan.filters,
                  resultIds,
                  resultDigest: result.results.map(getCatalogScopeDigest),
                  createdAt: Date.now(),
                }
              : undefined;
          const priorExcluded = current.context?.nextBatchExcludedIds ?? [];
          const priorScopeIds = current.context?.currentScope?.resultIds ?? [];
          const nextBatchExcludedIds = [...new Set([...priorExcluded, ...priorScopeIds, ...resultIds])].slice(-50);
          const context: CatalogAssistantContext = result.plan?.entityType
            ? {
                lastEntityType: result.plan.entityType,
                lastFilters: result.plan.filters,
                lastResultCount: result.results.length,
                lastUserMessage: normalized,
                lastSummary: compactConversationMemory(history),
                currentScope,
                nextBatchExcludedIds,
              }
            : {
                ...current.context,
                lastUserMessage: normalized,
                lastSummary: compactConversationMemory(history),
              };
          return {
            ...current,
            context,
            history,
            summary: result.summary,
            clarification: result.clarification,
            navigationProposal: result.navigationProposal,
            results: result.results,
            lastSuccessfulPlan: result.plan?.entityType ? result.plan : current.lastSuccessfulPlan,
            progress: {
              stage: result.clarification ? 'CLARIFYING' : 'COMPLETED',
              candidateCount: result.results.length,
              messageKey: result.clarification
                ? 'enterprise.catalogAssistant.clarifying'
                : 'enterprise.catalogAssistant.completed',
            },
          };
        });
      } catch (error) {
        if (requestIdRef.current !== requestId) return;
        if (error instanceof CatalogAssistantCancelledError || controller.signal.aborted) {
          updateState((current) => ({
            ...current,
            progress: {
              stage: 'CANCELLED',
              messageKey: 'enterprise.catalogAssistant.cancelled',
            },
          }));
          return;
        }
        resumeRef.current = error instanceof CatalogAssistantExecutionError ? error.resume : undefined;
        updateState((current) => ({
          ...current,
          progress: {
            stage: 'FAILED',
            messageKey:
              error instanceof CatalogAssistantExecutionError && error.stage === 'SEARCHING'
                ? 'enterprise.catalogAssistant.searchFailed'
                : 'enterprise.catalogAssistant.planFailed',
          },
        }));
      }
    },
    [client, location.pathname, updateState]
  );

  const submit = useCallback(async (message: string): Promise<void> => execute(message), [execute]);

  const stop = useCallback((): void => {
    abortRef.current?.abort();
    requestIdRef.current = '';
    updateState((current) => ({
      ...current,
      progress: {
        stage: 'CANCELLED',
        messageKey: 'enterprise.catalogAssistant.cancelled',
      },
    }));
  }, [updateState]);

  const retry = useCallback(async (): Promise<void> => {
    const message = stateRef.current.message;
    if (message) await execute(message, resumeRef.current);
  }, [execute]);

  const clear = useCallback((): void => {
    abortRef.current?.abort();
    requestIdRef.current = '';
    abortRef.current = undefined;
    resumeRef.current = undefined;
    const next = initialState();
    stateRef.current = next;
    setState(next);
  }, []);

  const startDemandHandoff = useCallback(async (): Promise<string | undefined> => {
    const proposal = stateRef.current.navigationProposal;
    if (proposal?.intent !== 'DEMAND_PUBLISH') return undefined;
    updateState((current) => ({ ...current, handoffLoading: true, handoffError: undefined }));
    try {
      const response = await client.request({
        operation: 'demand.aiConversation.start',
        payload: {
          requestId: createRequestId(),
          initialMessage: proposal.initialMessage,
        },
      });
      if (response.operation !== 'demand.aiConversation.start') throw new Error('invalid demand handoff response');
      updateState((current) => ({ ...current, handoffLoading: false }));
      return response.data.sessionId;
    } catch {
      updateState((current) => ({
        ...current,
        handoffLoading: false,
        handoffError: 'enterprise.catalogAssistant.navigation.handoffError',
      }));
      return undefined;
    }
  }, [client, updateState]);

  const dismissNavigation = useCallback((): void => {
    updateState((current) => ({
      ...current,
      navigationProposal: undefined,
      handoffError: undefined,
    }));
  }, [updateState]);

  const value = useMemo<CatalogAssistantContextValue>(
    () => ({ ...state, submit, stop, retry, clear, startDemandHandoff, dismissNavigation }),
    [clear, dismissNavigation, retry, startDemandHandoff, state, stop, submit]
  );

  return <CatalogAssistantReactContext.Provider value={value}>{children}</CatalogAssistantReactContext.Provider>;
};

export const useCatalogAssistant = (): CatalogAssistantContextValue => {
  const value = useContext(CatalogAssistantReactContext);
  if (!value) throw new Error('useCatalogAssistant must be used inside CatalogAssistantProvider');
  return value;
};
