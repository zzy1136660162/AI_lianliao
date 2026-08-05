import type {
  EnterpriseProjectFilterDimension,
  EnterpriseProjectFilterOption,
  EnterpriseProjectSummary,
  ProjectFilterOptionsQuery,
} from '@/common/enterprise/contracts';

import { formatRegion, matchesCommonCurrentResult, optionalText, trustedResultText } from './shared';
import type { CatalogAdapterRuntime, CatalogResourceAdapter } from './types';

const PAGE_SIZE = 20;
const OPTION_LIMIT = 500;
const PROJECT_OPTION_FIELDS = [
  ['province', 'province'],
  ['city', 'city'],
  ['categoryL1', 'categoryL1'],
  ['categoryL2', 'categoryL2'],
  ['materialShortName', 'materialShortName'],
  ['materialName', 'materialName'],
] as const satisfies ReadonlyArray<
  readonly [
    (
      | keyof Pick<ProjectFilterOptionsQuery, 'province' | 'city' | 'categoryL1' | 'categoryL2' | 'materialShortName'>
      | 'materialName'
    ),
    EnterpriseProjectFilterDimension,
  ]
>;

const normalizedOptionText = (value: string): string => value.replaceAll(/\s+/gu, '').toLocaleLowerCase();

const databaseOptionLookupText = (field: (typeof PROJECT_OPTION_FIELDS)[number][0], requested: string): string => {
  if (field === 'province') return requested.replace(/(?:省|市)$/u, '');
  if (field === 'city') return requested.replace(/市$/u, '');
  return requested;
};

const resolveOption = (requested: string, options: EnterpriseProjectFilterOption[]): string | undefined => {
  const normalized = normalizedOptionText(requested);
  const exact = options.find(
    (option) => normalizedOptionText(option.value) === normalized || normalizedOptionText(option.label) === normalized
  );
  if (exact) return exact.value;
  const partial = options.filter((option) => {
    const value = normalizedOptionText(option.value);
    const label = normalizedOptionText(option.label);
    return (
      value.includes(normalized) ||
      label.includes(normalized) ||
      normalized.includes(value) ||
      normalized.includes(label)
    );
  });
  return partial.length === 1 ? partial[0].value : undefined;
};

const appendKeyword = (keyword: string | undefined, value: string): string =>
  [...new Set([optionalText(keyword), optionalText(value)].filter((item): item is string => Boolean(item)))].join(' ');

const resolveProjectPlan = async (
  runtime: CatalogAdapterRuntime,
  plan: Parameters<CatalogResourceAdapter['buildSearchPlans']>[1]
): Promise<Parameters<CatalogResourceAdapter['buildSearchPlans']>[1]> => {
  const filters = { ...plan.filters };
  const parents: Omit<ProjectFilterOptionsQuery, 'dimension'> = {};
  if (filters.industry) {
    filters.keyword = appendKeyword(filters.keyword, filters.industry);
    delete filters.industry;
  }

  for (const [field, dimension] of PROJECT_OPTION_FIELDS) {
    const requested = optionalText(filters[field]);
    if (!requested) continue;
    try {
      // Option dimensions are resolved sequentially because city/category/material
      // children depend on the exact parent value selected from the database.
      // eslint-disable-next-line no-await-in-loop
      const response = await runtime.client.request({
        operation: 'project.filterOptions',
        payload: { dimension, ...parents, limit: OPTION_LIMIT },
      });
      runtime.assertActive();
      if (response.operation !== 'project.filterOptions') throw new Error('unexpected project option operation');
      // Project source data keeps its dominant administrative groups as
      // “辽宁/沈阳”, while a smaller legacy subset uses “辽宁省/沈阳市”.
      // Resolve against the source-system form so a canonical AI value does not
      // accidentally select the tiny legacy partition.
      const resolved = resolveOption(databaseOptionLookupText(field, requested), response.data);
      if (resolved) {
        filters[field] = resolved;
        if (field !== 'materialName') parents[field] = resolved;
      } else {
        filters.keyword = appendKeyword(filters.keyword, requested);
        delete filters[field];
      }
    } catch {
      runtime.assertActive();
      // A rolling deployment can temporarily miss the options endpoint. Keep the
      // normalized model value so project.list remains available instead of failing
      // the complete assistant request.
      if (field !== 'materialName') parents[field] = requested;
    }
  }
  return { ...plan, filters };
};

const expandProjectKeywords = (plan: Parameters<CatalogResourceAdapter['buildSearchPlans']>[1]) => {
  const keyword = optionalText(plan.filters.keyword);
  if (!keyword || !keyword.includes('机电设备')) return [plan];
  const broaderKeyword = optionalText(keyword.replaceAll('机电设备', '设备'));
  if (!broaderKeyword || broaderKeyword === keyword) return [plan];
  return [plan, { ...plan, filters: { ...plan.filters, keyword: broaderKeyword } }];
};

const finiteInvestment = (value: string | undefined): number | undefined => {
  const normalized = optionalText(value);
  if (!normalized) return undefined;
  const parsed = Number(normalized.replaceAll(',', ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const isoDate = (value: string | undefined): string | undefined => {
  const normalized = optionalText(value);
  return normalized && /^\d{4}-\d{2}-\d{2}$/u.test(normalized) ? normalized : undefined;
};

export const projectCatalogAdapter: CatalogResourceAdapter = {
  entityType: 'PROJECT',
  progressMessageKey: 'enterprise.catalogAssistant.searchingProjectPage',
  buildSearchPlans: async (runtime, plan) => expandProjectKeywords(await resolveProjectPlan(runtime, plan)),
  searchPage: async ({ client, assertActive }, plan, pageNum) => {
    const response = await client.request({
      operation: 'project.list',
      payload: {
        keyword: plan.filters.keyword,
        province: plan.filters.province,
        city: plan.filters.city,
        categoryL1: plan.filters.categoryL1,
        categoryL2: plan.filters.categoryL2,
        materialShortName: plan.filters.materialShortName,
        materialName: plan.filters.materialName,
        budgetRange: plan.filters.budgetRange,
        constructionNature: plan.filters.constructionNature,
        investmentType: plan.filters.investmentType,
        publishedFrom: isoDate(plan.filters.publishedFrom),
        publishedTo: isoDate(plan.filters.publishedTo),
        minInvestment: finiteInvestment(plan.filters.minInvestment),
        maxInvestment: finiteInvestment(plan.filters.maxInvestment),
        pageNum,
        pageSize: PAGE_SIZE,
      },
    });
    assertActive();
    if (response.operation !== 'project.list') throw new Error('unexpected project operation');
    return response.data;
  },
  getId: (item) => (item as EnterpriseProjectSummary).hpInfoId,
  toCandidate: (item) => {
    const project = item as EnterpriseProjectSummary;
    return {
      id: project.hpInfoId,
      name: project.projectName,
      companyName: optionalText(project.constructionUnit),
      region: formatRegion(project.province, project.city),
      investment: project.totalInvestment,
      nature: optionalText(project.projectNature ?? project.constructionNature),
      publishedAt: optionalText(project.publishedAt),
      summary: optionalText((project.procurementSummary ?? project.materialMatch)?.slice(0, 500)),
    };
  },
  matchesCurrent: (result, filters) => {
    if (result.entityType !== 'PROJECT' || !matchesCommonCurrentResult(result, filters)) return false;
    const minimum = finiteInvestment(filters.minInvestment);
    const maximum = finiteInvestment(filters.maxInvestment);
    if (minimum !== undefined && (result.item.totalInvestment ?? -1) < minimum) return false;
    if (maximum !== undefined && (result.item.totalInvestment ?? Number.POSITIVE_INFINITY) > maximum) return false;
    const haystack = trustedResultText(result).toLocaleLowerCase();
    return [
      filters.categoryL1,
      filters.categoryL2,
      filters.materialShortName,
      filters.materialName,
      filters.constructionNature,
      filters.investmentType,
    ].every((value) => !value || haystack.includes(value.toLocaleLowerCase()));
  },
  toTrustedResult: (item, reason) => ({
    entityType: 'PROJECT',
    item: item as EnterpriseProjectSummary,
    reason,
  }),
  hydrateSelected: async (_runtime, results) => results,
  toScopeDigest: (result) => {
    if (result.entityType !== 'PROJECT') throw new Error('project adapter received another entity');
    return {
      id: result.item.hpInfoId,
      name: result.item.projectName,
      province: result.item.province,
      city: result.item.city,
      investment: result.item.totalInvestment,
      nature: result.item.projectNature ?? result.item.constructionNature,
      publishedAt: result.item.publishedAt,
      summary: result.item.procurementSummary ?? result.item.materialMatch,
    };
  },
};
