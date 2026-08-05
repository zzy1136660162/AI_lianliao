import type { EnterpriseCompanyDetail, EnterpriseCompanySummary } from '@/common/enterprise/contracts';

import { buildLiaoningSearchPlans, formatRegion, matchesCommonCurrentResult, optionalText } from './shared';
import type { CatalogResourceAdapter } from './types';

const PAGE_SIZE = 20;
const DETAIL_BATCH_SIZE = 6;

export const companyCatalogAdapter: CatalogResourceAdapter = {
  entityType: 'COMPANY',
  progressMessageKey: 'enterprise.catalogAssistant.searchingCompanyPage',
  buildSearchPlans: async (_runtime, plan) => buildLiaoningSearchPlans(plan),
  searchPage: async ({ client, assertActive }, plan, pageNum) => {
    const response = await client.request({
      operation: 'company.list',
      payload: {
        keyword: plan.filters.keyword,
        industry: plan.filters.industry,
        province: '辽宁省',
        city: plan.filters.city,
        district: plan.filters.district,
        pageNum,
        pageSize: PAGE_SIZE,
      },
    });
    assertActive();
    if (response.operation !== 'company.list') throw new Error('unexpected company operation');
    return response.data;
  },
  getId: (item) => (item as EnterpriseCompanySummary).companyId,
  toCandidate: (item) => {
    const company = item as EnterpriseCompanySummary;
    return {
      id: company.companyId,
      name: company.name,
      industry: optionalText(company.industry),
      region: formatRegion(company.city, company.district),
      summary: optionalText(company.businessSummary?.slice(0, 500)),
    };
  },
  matchesCurrent: (result, filters) => result.entityType === 'COMPANY' && matchesCommonCurrentResult(result, filters),
  toTrustedResult: (item, reason) => ({
    entityType: 'COMPANY',
    item: item as EnterpriseCompanyDetail,
    reason,
  }),
  hydrateSelected: async ({ client, assertActive }, results) => {
    const hydrated = [];
    for (let offset = 0; offset < results.length; offset += DETAIL_BATCH_SIZE) {
      const batch = results.slice(offset, offset + DETAIL_BATCH_SIZE);
      // Small sequential batches protect the legacy detail service from a 50-call burst.
      // eslint-disable-next-line no-await-in-loop
      const enriched = await Promise.all(
        batch.map(async (result) => {
          if (result.entityType !== 'COMPANY') return result;
          try {
            const response = await client.request({
              operation: 'company.detail',
              payload: { companyId: result.item.companyId },
            });
            assertActive();
            return response.operation === 'company.detail'
              ? { entityType: 'COMPANY' as const, reason: result.reason, item: response.data }
              : result;
          } catch {
            assertActive();
            return result;
          }
        })
      );
      hydrated.push(...enriched);
    }
    return hydrated;
  },
  toScopeDigest: (result) => {
    if (result.entityType !== 'COMPANY') throw new Error('company adapter received another entity');
    return {
      id: result.item.companyId,
      name: result.item.name,
      province: result.item.province,
      city: result.item.city,
      district: result.item.district,
      industry: result.item.industry,
      summary: result.item.businessSummary,
    };
  },
};
