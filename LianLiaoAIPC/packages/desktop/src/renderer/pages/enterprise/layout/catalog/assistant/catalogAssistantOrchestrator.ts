import type {
  CatalogAssistantContext,
  CatalogAssistantPlan,
  CatalogAssistantProgress,
  CatalogAssistantRunResult,
  CatalogAssistantTrustedResult,
  EnterpriseAssistantRoutePlan,
} from '@/common/enterprise/catalog-assistant/contracts';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import { getCatalogResourceAdapter } from './adapters/catalogAdapterRegistry';
import type { CatalogAdapterRuntime, CatalogBusinessItem } from './adapters/types';
import { buildDeterministicCatalogPlan } from './deterministicCatalogPlanner';
import { executeCatalogWorkflow } from './workflow/catalogWorkflowExecutor';

const MAX_PAGES = 5;
const MAX_CANDIDATES = 100;
const FALLBACK_RESULTS = 6;

export type CatalogAssistantResumeState = {
  message: string;
  plan: CatalogAssistantPlan;
  nextPage: number;
  candidates: CatalogBusinessItem[];
};

export class CatalogAssistantCancelledError extends Error {
  constructor() {
    super('catalog assistant request cancelled');
    this.name = 'CatalogAssistantCancelledError';
  }
}

export class CatalogAssistantExecutionError extends Error {
  readonly stage: 'PLANNING' | 'SEARCHING';
  readonly resume?: CatalogAssistantResumeState;

  constructor(stage: 'PLANNING' | 'SEARCHING', resume?: CatalogAssistantResumeState) {
    super(stage === 'PLANNING' ? 'catalog assistant planning failed' : 'catalog assistant search failed');
    this.name = 'CatalogAssistantExecutionError';
    this.stage = stage;
    this.resume = resume;
  }
}

export type CatalogAssistantRunInput = {
  requestId: string;
  message: string;
  context?: CatalogAssistantContext;
  signal: AbortSignal;
  isCurrent: (requestId: string) => boolean;
  onProgress: (progress: CatalogAssistantProgress) => void;
  resume?: CatalogAssistantResumeState;
  currentModule?: string;
  currentResults?: CatalogAssistantTrustedResult[];
};

const assertActive = (requestId: string, signal: AbortSignal, isCurrent: (requestId: string) => boolean): void => {
  if (signal.aborted || !isCurrent(requestId)) throw new CatalogAssistantCancelledError();
};

const emit = (input: CatalogAssistantRunInput, progress: CatalogAssistantProgress): void => {
  assertActive(input.requestId, input.signal, input.isCurrent);
  input.onProgress(progress);
};

const optionalText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const changedScopeFilters = (
  current: CatalogAssistantPlan['filters'],
  next: CatalogAssistantPlan['filters']
): CatalogAssistantPlan['filters'] =>
  Object.fromEntries(
    Object.entries(next).filter(([key, value]) => {
      const currentValue = current[key as keyof CatalogAssistantPlan['filters']];
      return optionalText(value) !== optionalText(currentValue);
    })
  ) as CatalogAssistantPlan['filters'];

const planEnterpriseRoute = async (
  client: EnterpriseClient,
  input: CatalogAssistantRunInput
): Promise<EnterpriseAssistantRoutePlan | undefined> => {
  try {
    const response = await client.request({
      operation: 'enterpriseAssistant.plan',
      payload: {
        message: input.message,
        currentModule: input.currentModule ?? 'CATALOG',
        hasCatalogScope: Boolean(input.context?.currentScope),
        recentSummary: input.context?.lastSummary,
      },
    });
    assertActive(input.requestId, input.signal, input.isCurrent);
    return response.operation === 'enterpriseAssistant.plan' ? response.data : undefined;
  } catch {
    // Older cloud-api instances may not expose the router during a rolling deployment.
    assertActive(input.requestId, input.signal, input.isCurrent);
    return undefined;
  }
};

const needsEnterpriseRoutePlanning = (message: string): boolean => {
  if (/这里面|其中|这些|上一批|刚才|换一批|再来/u.test(message)) return false;
  const catalogLookup =
    /找|查|哪些|哪家|哪个|推荐/u.test(message) && /企业|公司|产品|厂家|项目|工程|建设/u.test(message);
  return !catalogLookup;
};

const needsCrossResourceWorkflow = (message: string): boolean =>
  /企业|公司|厂家/u.test(message) && /做|生产|制造|加工|供应|提供|销售/u.test(message);

const needsDemandWorkflow = (message: string): boolean =>
  /找|查|检索|看看|哪些|有没有|推荐/u.test(message) && /需求|供需|订单|外包|闲置资源|岗位/u.test(message);

const appendUnique = (
  target: Map<string, CatalogBusinessItem>,
  items: CatalogBusinessItem[],
  excludedIds: ReadonlySet<string>,
  getId: (item: CatalogBusinessItem) => string
): void => {
  for (const item of items) {
    const id = getId(item);
    if (!id || excludedIds.has(id) || target.has(id)) continue;
    target.set(id, item);
    if (target.size >= MAX_CANDIDATES) break;
  }
};

/**
 * Runs plan → registered resource adapter → rank. The model can select only
 * IDs already returned by an allowlisted business API and can never replace
 * the trusted company, product, project or public demand fields rendered by the desktop app.
 */
export const runCatalogAssistant = async (
  client: EnterpriseClient,
  input: CatalogAssistantRunInput
): Promise<CatalogAssistantRunResult> => {
  if (!input.resume && needsEnterpriseRoutePlanning(input.message)) {
    const routePlan = await planEnterpriseRoute(client, input);
    if (routePlan?.intent === 'DEMAND_PUBLISH') {
      return {
        summary: routePlan.reason,
        navigationProposal: routePlan,
        results: [],
        fallback: false,
      };
    }
    if (routePlan?.intent === 'CLARIFY') {
      return {
        summary: routePlan.reason,
        clarification: routePlan.clarification,
        results: [],
        fallback: false,
      };
    }
  }

  if (!input.resume && (needsCrossResourceWorkflow(input.message) || needsDemandWorkflow(input.message))) {
    emit(input, {
      stage: 'PLANNING',
      messageKey: 'enterprise.catalogAssistant.planning',
    });
    try {
      const workflowResponse = await client.request({
        operation: 'catalogAssistant.workflowPlan',
        payload: { message: input.message, context: input.context },
      });
      assertActive(input.requestId, input.signal, input.isCurrent);
      if (workflowResponse.operation !== 'catalogAssistant.workflowPlan') {
        throw new Error('unexpected workflow planning operation');
      }
      // Follow-up scope semantics remain on the mature single-resource path in v1.
      // New searches use the graph executor, including product -> company linking.
      if (!['REFINE_CURRENT', 'NEXT_BATCH'].includes(workflowResponse.data.mode)) {
        return await executeCatalogWorkflow({
          client,
          message: input.message,
          plan: workflowResponse.data,
          assertActive: () => assertActive(input.requestId, input.signal, input.isCurrent),
          onProgress: (progress) => emit(input, progress),
        });
      }
    } catch (error) {
      if (error instanceof CatalogAssistantCancelledError || error instanceof CatalogAssistantExecutionError)
        throw error;
      // A rolling deployment may still expose only plan/rank. The established
      // planner below remains the compatibility path and keeps single-resource
      // searches available until cloud-api is upgraded.
    }
  }

  let plan: CatalogAssistantPlan;
  if (input.resume) {
    plan = input.resume.plan;
  } else {
    const deterministicPlan = buildDeterministicCatalogPlan(input.message, input.context);
    emit(input, {
      stage: 'PLANNING',
      messageKey: 'enterprise.catalogAssistant.planning',
    });
    try {
      const response = await client.request({
        operation: 'catalogAssistant.plan',
        payload: { message: input.message, context: input.context },
      });
      assertActive(input.requestId, input.signal, input.isCurrent);
      if (response.operation !== 'catalogAssistant.plan') throw new Error('unexpected planning operation');
      plan =
        (!response.data.entityType || response.data.clarification) && deterministicPlan
          ? deterministicPlan
          : response.data;
    } catch (error) {
      if (error instanceof CatalogAssistantCancelledError) throw error;
      if (!deterministicPlan) throw new CatalogAssistantExecutionError('PLANNING');
      plan = deterministicPlan;
    }
  }

  if (!plan.entityType || plan.clarification) {
    emit(input, {
      stage: 'CLARIFYING',
      messageKey: 'enterprise.catalogAssistant.clarifying',
    });
    return {
      plan,
      summary: plan.summary,
      clarification: plan.clarification,
      results: [],
      fallback: false,
    };
  }

  const adapter = getCatalogResourceAdapter(plan.entityType);
  const runtime: CatalogAdapterRuntime = {
    client,
    assertActive: () => assertActive(input.requestId, input.signal, input.isCurrent),
  };
  const byId = new Map<string, CatalogBusinessItem>();
  const excludedIds = new Set(
    plan.mode === 'NEXT_BATCH' ? (input.context?.nextBatchExcludedIds ?? input.context?.excludedIds ?? []) : []
  );

  if (plan.mode === 'REFINE_CURRENT') {
    const scopeMatches =
      Boolean(input.context?.currentScope) &&
      (!plan.baseScopeId || plan.baseScopeId === input.context?.currentScope?.scopeId);
    if (scopeMatches) {
      const filters = changedScopeFilters(input.context?.currentScope?.filters ?? {}, plan.filters);
      for (const result of input.currentResults ?? []) {
        if (result.entityType !== adapter.entityType || !adapter.matchesCurrent(result, filters)) continue;
        byId.set(adapter.getId(result.item), result.item);
      }
    }
  }

  if (input.resume) {
    appendUnique(byId, input.resume.candidates, excludedIds, adapter.getId);
  }
  const firstPage = input.resume?.nextPage ?? 1;
  let searchPlans: CatalogAssistantPlan[];
  try {
    searchPlans = await adapter.buildSearchPlans(runtime, plan);
  } catch (error) {
    if (error instanceof CatalogAssistantCancelledError) throw error;
    throw new CatalogAssistantExecutionError('SEARCHING', {
      message: input.message,
      plan,
      nextPage: firstPage,
      candidates: [...byId.values()],
    });
  }

  search: for (const [searchIndex, searchPlan] of searchPlans.entries()) {
    if (plan.mode === 'REFINE_CURRENT') break;
    const strategyFirstPage = searchIndex === 0 ? firstPage : 1;
    for (let pageNum = strategyFirstPage; pageNum <= MAX_PAGES; pageNum += 1) {
      emit(input, {
        stage: 'SEARCHING',
        page: pageNum,
        maxPages: MAX_PAGES,
        candidateCount: byId.size,
        messageKey: adapter.progressMessageKey,
      });
      try {
        // Sequential paging guarantees that candidate and page limits are checked
        // before the next allowlisted request is issued.
        // eslint-disable-next-line no-await-in-loop
        const page = await adapter.searchPage(runtime, searchPlan, pageNum);
        appendUnique(byId, page.list, excludedIds, adapter.getId);
        if (page.list.length === 0 || pageNum >= page.pages || byId.size >= MAX_CANDIDATES) break;
      } catch (error) {
        if (error instanceof CatalogAssistantCancelledError) throw error;
        if (byId.size > 0) break search;
        throw new CatalogAssistantExecutionError('SEARCHING', {
          message: input.message,
          plan,
          nextPage: pageNum,
          candidates: [...byId.values()],
        });
      }
    }
    if (byId.size > 0) break;
  }

  runtime.assertActive();
  if (byId.size === 0) {
    return {
      plan,
      summary: 'enterprise.catalogAssistant.noResults',
      results: [],
      fallback: false,
    };
  }

  emit(input, {
    stage: 'RANKING',
    candidateCount: byId.size,
    messageKey: 'enterprise.catalogAssistant.ranking',
  });

  try {
    const response = await client.request({
      operation: 'catalogAssistant.rank',
      payload: {
        message: input.message,
        plan,
        candidates: [...byId.values()].map(adapter.toCandidate),
      },
    });
    runtime.assertActive();
    if (response.operation !== 'catalogAssistant.rank') throw new Error('unexpected rank operation');

    const seen = new Set<string>();
    const results = response.data.items.flatMap((ranked): CatalogAssistantTrustedResult[] => {
      if (seen.has(ranked.id)) return [];
      const item = byId.get(ranked.id);
      if (!item) return [];
      seen.add(ranked.id);
      return [adapter.toTrustedResult(item, ranked.reason)];
    });
    if (results.length > 0) {
      const selected = results.slice(0, plan.resultLimit);
      return {
        plan,
        summary: response.data.summary,
        results: await adapter.hydrateSelected(runtime, selected),
        fallback: false,
      };
    }
  } catch (error) {
    if (error instanceof CatalogAssistantCancelledError) throw error;
  }

  runtime.assertActive();
  const fallbackCount = Math.min(FALLBACK_RESULTS, plan.resultLimit);
  const fallbackResults = [...byId.values()]
    .slice(0, fallbackCount)
    .map((item) => adapter.toTrustedResult(item, 'enterprise.catalogAssistant.fallbackReason'));
  return {
    plan,
    summary: 'enterprise.catalogAssistant.fallbackSummary',
    results: await adapter.hydrateSelected(runtime, fallbackResults),
    fallback: true,
  };
};
