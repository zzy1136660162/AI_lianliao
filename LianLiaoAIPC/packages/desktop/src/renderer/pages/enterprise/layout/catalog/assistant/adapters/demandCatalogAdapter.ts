import type { EnterpriseDemandSummary, EnterpriseDemandTypeOption } from '@/common/enterprise/contracts';

import { formatRegion, matchesCommonCurrentResult, optionalText, trustedResultText } from './shared';
import type { CatalogAdapterRuntime, CatalogResourceAdapter } from './types';

const PAGE_SIZE = 20;
const DEMAND_STATUS = { OPEN: 0, CLOSED: 1, EXPIRED: 2 } as const;
const resolvedTypeIds = new WeakMap<object, number>();

const normalizeDemandType = (value: string): string => value.trim().toLocaleLowerCase().replaceAll(/\s+/gu, '');

const resolveDemandTypeId = (value: string | undefined, options: EnterpriseDemandTypeOption[]): number | undefined => {
  const requested = optionalText(value);
  if (!requested) return undefined;
  const target = normalizeDemandType(requested);
  const exact = options.filter((option) => normalizeDemandType(option.typeName) === target);
  if (exact.length === 1) return exact[0].typeId;
  const related = options.filter((option) => {
    const name = normalizeDemandType(option.typeName);
    return name.includes(target) || target.includes(name);
  });
  return related.length === 1 ? related[0].typeId : undefined;
};

const resolveDemandPlan = async (
  runtime: CatalogAdapterRuntime,
  plan: Parameters<CatalogResourceAdapter['buildSearchPlans']>[1]
): Promise<Parameters<CatalogResourceAdapter['buildSearchPlans']>[1]> => {
  if (!optionalText(plan.filters.demandType)) return plan;
  const resolvedPlan = { ...plan, filters: { ...plan.filters } };
  try {
    const response = await runtime.client.request({ operation: 'demand.types', payload: {} });
    runtime.assertActive();
    if (response.operation !== 'demand.types') throw new Error('unexpected demand types operation');
    const typeId = resolveDemandTypeId(plan.filters.demandType, response.data);
    if (typeId !== undefined) resolvedTypeIds.set(resolvedPlan, typeId);
  } catch {
    runtime.assertActive();
  }
  return resolvedPlan;
};

const demandStatusName = (status: number | undefined): keyof typeof DEMAND_STATUS | undefined => {
  if (status === DEMAND_STATUS.OPEN) return 'OPEN';
  if (status === DEMAND_STATUS.CLOSED) return 'CLOSED';
  if (status === DEMAND_STATUS.EXPIRED) return 'EXPIRED';
  return undefined;
};

export const demandCatalogAdapter: CatalogResourceAdapter = {
  entityType: 'DEMAND',
  progressMessageKey: 'enterprise.catalogAssistant.searchingDemandPage',
  buildSearchPlans: async (runtime, plan) => [await resolveDemandPlan(runtime, plan)],
  searchPage: async ({ client, assertActive }, plan, pageNum) => {
    const response = await client.request({
      operation: 'demand.list',
      payload: {
        keyword: plan.filters.keyword,
        typeId: resolvedTypeIds.get(plan),
        city: plan.filters.city,
        district: plan.filters.district,
        status: plan.filters.demandStatus ? DEMAND_STATUS[plan.filters.demandStatus] : undefined,
        pageNum,
        pageSize: PAGE_SIZE,
      },
    });
    assertActive();
    if (response.operation !== 'demand.list') throw new Error('unexpected demand operation');
    return response.data;
  },
  getId: (item) => (item as EnterpriseDemandSummary).demandId,
  toCandidate: (item) => {
    const demand = item as EnterpriseDemandSummary;
    return {
      id: demand.demandId,
      name: demand.title,
      industry: demand.typeName,
      region: formatRegion(demand.city, demand.district),
      nature: demandStatusName(demand.status),
      publishedAt: optionalText(demand.publishedAt),
      summary: optionalText(
        [demand.budget, demand.summary, ...demand.primaryTags].filter(Boolean).join(' ').slice(0, 500)
      ),
    };
  },
  matchesCurrent: (result, filters) => {
    if (result.entityType !== 'DEMAND' || !matchesCommonCurrentResult(result, filters)) return false;
    const haystack = trustedResultText(result).toLocaleLowerCase();
    if (filters.demandType && !haystack.includes(filters.demandType.toLocaleLowerCase())) return false;
    return !filters.demandStatus || demandStatusName(result.item.status) === filters.demandStatus;
  },
  toTrustedResult: (item, reason) => ({
    entityType: 'DEMAND',
    item: item as EnterpriseDemandSummary,
    reason,
  }),
  hydrateSelected: async (_runtime, results) => results,
  toScopeDigest: (result) => {
    if (result.entityType !== 'DEMAND') throw new Error('demand adapter received another entity');
    return {
      id: result.item.demandId,
      name: result.item.title,
      city: result.item.city,
      district: result.item.district,
      industry: result.item.typeName,
      nature: demandStatusName(result.item.status),
      publishedAt: result.item.publishedAt,
      summary: result.item.summary,
    };
  },
};
