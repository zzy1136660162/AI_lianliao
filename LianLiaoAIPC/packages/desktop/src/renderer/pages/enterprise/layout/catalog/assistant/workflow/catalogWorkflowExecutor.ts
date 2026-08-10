import type {
  CatalogAssistantPlan,
  CatalogAssistantProgress,
  CatalogAssistantRunResult,
  CatalogAssistantTrustedResult,
  CatalogEntityType,
  CatalogMatchLevel,
  CatalogProductEvidence,
  CatalogWorkflowCandidate,
  CatalogWorkflowPlan,
  CatalogWorkflowStep,
} from '@/common/enterprise/catalog-assistant/contracts';
import type {
  EnterpriseCompanyDetail,
  EnterpriseCompanySummary,
  EnterpriseDemandSummary,
  EnterpriseProductSummary,
  EnterpriseProjectSummary,
} from '@/common/enterprise/contracts';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import { getCatalogResourceAdapter } from '../adapters/catalogAdapterRegistry';
import type { CatalogAdapterRuntime, CatalogBusinessItem } from '../adapters/types';
import { sortCatalogWorkflowResults, type RankedCatalogResult } from './catalogWorkflowRanking';
import { validateCatalogWorkflowPlan } from './catalogWorkflowValidator';

const MAX_PAGES = 5;
const MAX_CANDIDATES = 100;

type WorkflowExecutionInput = {
  client: EnterpriseClient;
  message: string;
  plan: CatalogWorkflowPlan;
  assertActive: () => void;
  onProgress: (progress: CatalogAssistantProgress) => void;
};

const toolEntityType = (tool: CatalogWorkflowStep['tool']): CatalogEntityType => {
  if (tool === 'PRODUCT_SEARCH') return 'PRODUCT';
  if (tool === 'PROJECT_SEARCH') return 'PROJECT';
  if (tool === 'DEMAND_SEARCH') return 'DEMAND';
  return 'COMPANY';
};

const asLegacyPlan = (workflow: CatalogWorkflowPlan, step: CatalogWorkflowStep): CatalogAssistantPlan => ({
  mode: workflow.mode,
  entityType: toolEntityType(step.tool),
  baseScopeId: workflow.baseScopeId,
  filters: step.filters ?? {},
  resultLimit: workflow.resultLimit,
  clarification: workflow.clarification,
  summary: workflow.summary,
});

const itemId = (entityType: CatalogEntityType, item: CatalogBusinessItem): string => {
  if (entityType === 'COMPANY') return (item as EnterpriseCompanySummary).companyId;
  if (entityType === 'PRODUCT') return (item as EnterpriseProductSummary).productId;
  if (entityType === 'DEMAND') return (item as EnterpriseDemandSummary).demandId;
  return (item as EnterpriseProjectSummary).hpInfoId;
};

const scanSearchStep = async (
  runtime: CatalogAdapterRuntime,
  workflow: CatalogWorkflowPlan,
  step: CatalogWorkflowStep,
  onProgress: WorkflowExecutionInput['onProgress']
): Promise<CatalogBusinessItem[]> => {
  const entityType = toolEntityType(step.tool);
  const adapter = getCatalogResourceAdapter(entityType);
  const plan = asLegacyPlan(workflow, step);
  const searchPlans = await adapter.buildSearchPlans(runtime, plan);
  const byId = new Map<string, CatalogBusinessItem>();
  for (const searchPlan of searchPlans) {
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum += 1) {
      onProgress({
        stage: 'SEARCHING',
        page: pageNum,
        maxPages: MAX_PAGES,
        candidateCount: byId.size,
        messageKey: adapter.progressMessageKey,
      });
      // Sequential paging enforces page and candidate limits before issuing another request.
      // eslint-disable-next-line no-await-in-loop
      const page = await adapter.searchPage(runtime, searchPlan, pageNum);
      for (const item of page.list) {
        const id = itemId(entityType, item);
        if (id && !byId.has(id)) byId.set(id, item);
        if (byId.size >= MAX_CANDIDATES) break;
      }
      if (page.list.length === 0 || pageNum >= page.pages || byId.size >= MAX_CANDIDATES) break;
    }
    if (byId.size > 0) break;
  }
  return [...byId.values()];
};

const completeness = (
  item: EnterpriseCompanySummary | EnterpriseProductSummary | EnterpriseProjectSummary | EnterpriseDemandSummary
): number =>
  (Object.values(item) as unknown[]).reduce<number>(
    (count, value) => (value === undefined || value === null || value === '' ? count : count + 1),
    0
  );

const toWorkflowCandidate = (
  entityType: CatalogEntityType,
  item: CatalogBusinessItem,
  evidenceProductIds?: string[]
): CatalogWorkflowCandidate => {
  const adapter = getCatalogResourceAdapter(entityType);
  const candidate = adapter.toCandidate(item);
  if (entityType === 'COMPANY') {
    const company = item as EnterpriseCompanySummary;
    return { ...candidate, entityType, sort: company.sort ?? 0, evidenceProductIds };
  }
  if (entityType === 'PRODUCT') {
    const product = item as EnterpriseProductSummary;
    return { ...candidate, entityType, companyId: product.companyId, sort: product.sort ?? 0 };
  }
  if (entityType === 'DEMAND') {
    const demand = item as EnterpriseDemandSummary;
    const publishedAt = demand.publishedAt ? Date.parse(demand.publishedAt) : Number.NaN;
    return { ...candidate, entityType, sort: Number.isFinite(publishedAt) ? publishedAt : 0 };
  }
  return { ...candidate, entityType, sort: 0 };
};

const evidenceForCompany = (
  companyId: string,
  productsByCompany: ReadonlyMap<string, EnterpriseProductSummary[]>
): CatalogProductEvidence[] =>
  (productsByCompany.get(companyId) ?? [])
    .toSorted((left, right) => (right.sort ?? 0) - (left.sort ?? 0))
    .slice(0, 3)
    .map((product) => ({
      id: product.productId,
      name: product.name,
      imageUrl: product.imageUrl,
      industry: product.industry ?? product.companyIndustry,
      sort: product.sort ?? 0,
      reason: 'enterprise.catalogAssistant.productEvidence',
    }));

/** Executes a validated v1 workflow without exposing arbitrary network access to model output. */
export const executeCatalogWorkflow = async (input: WorkflowExecutionInput): Promise<CatalogAssistantRunResult> => {
  const plan = validateCatalogWorkflowPlan(input.plan);
  if (!plan.targetEntityType || plan.clarification) {
    return {
      summary: plan.summary,
      clarification: plan.clarification,
      results: [],
      fallback: false,
    };
  }

  const runtime: CatalogAdapterRuntime = { client: input.client, assertActive: input.assertActive };
  const outputs = new Map<string, CatalogBusinessItem[]>();
  const productsByCompany = new Map<string, EnterpriseProductSummary[]>();

  for (const step of plan.steps) {
    input.assertActive();
    if (step.tool !== 'COMPANY_BATCH_GET') {
      // eslint-disable-next-line no-await-in-loop
      const output = await scanSearchStep(runtime, plan, step, input.onProgress);
      outputs.set(step.stepId, output);
      if (step.tool === 'PRODUCT_SEARCH') {
        for (const item of output as EnterpriseProductSummary[]) {
          const companyProducts = productsByCompany.get(item.companyId) ?? [];
          companyProducts.push(item);
          productsByCompany.set(item.companyId, companyProducts);
        }
      }
      continue;
    }

    input.onProgress({
      stage: 'LINKING',
      candidateCount: productsByCompany.size,
      messageKey: 'enterprise.catalogAssistant.linkingCompanies',
    });
    const source = outputs.get(step.binding?.fromStepId ?? '') ?? [];
    const companyIds = [
      ...new Set(
        (source as EnterpriseProductSummary[])
          .map((product) => product.companyId)
          .filter((companyId): companyId is string => Boolean(companyId))
      ),
    ].slice(0, MAX_CANDIDATES);
    if (companyIds.length === 0) {
      outputs.set(step.stepId, []);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const response = await input.client.request({ operation: 'company.batchGet', payload: { companyIds } });
    input.assertActive();
    if (response.operation !== 'company.batchGet') throw new Error('unexpected company batch operation');
    outputs.set(step.stepId, response.data);
  }

  const finalStep = plan.steps.at(-1);
  const finalItems = finalStep ? (outputs.get(finalStep.stepId) ?? []) : [];
  if (!finalStep || finalItems.length === 0) {
    return {
      plan: asLegacyPlan(plan, plan.steps[0] ?? { stepId: 'empty', tool: 'COMPANY_SEARCH', dependsOn: [] }),
      summary: 'enterprise.catalogAssistant.noResults',
      results: [],
      fallback: false,
    };
  }

  const entityType = plan.targetEntityType;
  const candidates = finalItems.map((item) => {
    const evidenceIds =
      entityType === 'COMPANY'
        ? evidenceForCompany((item as EnterpriseCompanySummary).companyId, productsByCompany).map(
            (product) => product.id
          )
        : undefined;
    return toWorkflowCandidate(entityType, item, evidenceIds);
  });
  input.onProgress({
    stage: 'RANKING',
    candidateCount: candidates.length,
    messageKey: 'enterprise.catalogAssistant.ranking',
  });

  let summary = plan.summary;
  let fallback = false;
  let ranks = new Map<string, { matchLevel: CatalogMatchLevel; reason: string }>();
  try {
    const response = await input.client.request({
      operation: 'catalogAssistant.workflowRank',
      payload: { message: input.message, plan, candidates },
    });
    input.assertActive();
    if (response.operation !== 'catalogAssistant.workflowRank') throw new Error('unexpected workflow rank operation');
    summary = response.data.summary;
    ranks = new Map(response.data.items.map((item) => [item.id, item]));
  } catch {
    input.assertActive();
    fallback = true;
    ranks = new Map(
      candidates.map((candidate) => [
        candidate.id,
        { matchLevel: 'RELATED' as const, reason: 'enterprise.catalogAssistant.fallbackReason' },
      ])
    );
    summary = 'enterprise.catalogAssistant.fallbackSummary';
  }

  const ranked: RankedCatalogResult[] = [];
  for (const item of finalItems) {
    const id = itemId(entityType, item);
    const rank = ranks.get(id);
    if (!rank) continue;
    let result: CatalogAssistantTrustedResult;
    let evidenceSort = 0;
    let businessSort = 0;
    if (entityType === 'COMPANY') {
      const company = item as EnterpriseCompanyDetail;
      const evidenceProducts = evidenceForCompany(company.companyId, productsByCompany);
      evidenceSort = evidenceProducts[0]?.sort ?? 0;
      businessSort = company.sort ?? 0;
      result = { entityType, item: company, reason: rank.reason, evidenceProducts };
    } else if (entityType === 'PRODUCT') {
      const product = item as EnterpriseProductSummary;
      businessSort = product.sort ?? 0;
      result = { entityType, item: product, reason: rank.reason };
    } else if (entityType === 'DEMAND') {
      const demand = item as EnterpriseDemandSummary;
      const publishedAt = demand.publishedAt ? Date.parse(demand.publishedAt) : Number.NaN;
      businessSort = Number.isFinite(publishedAt) ? publishedAt : 0;
      result = { entityType, item: demand, reason: rank.reason };
    } else {
      const project = item as EnterpriseProjectSummary;
      const publishedAt = project.publishedAt ? Date.parse(project.publishedAt) : Number.NaN;
      businessSort = Number.isFinite(publishedAt) ? publishedAt : 0;
      result = { entityType, item: project, reason: rank.reason };
    }
    ranked.push({
      result,
      matchLevel: rank.matchLevel,
      businessSort,
      evidenceSort,
      completeness: completeness(item),
    });
  }

  const sourceStep = plan.steps.find((step) => step.tool !== 'COMPANY_BATCH_GET') ?? finalStep;
  return {
    plan: { ...asLegacyPlan(plan, sourceStep), entityType },
    summary,
    results: sortCatalogWorkflowResults(ranked)
      .slice(0, plan.resultLimit)
      .map((item) => item.result),
    fallback,
  };
};
