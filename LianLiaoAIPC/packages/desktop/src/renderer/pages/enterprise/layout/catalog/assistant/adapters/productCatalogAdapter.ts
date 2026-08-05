import type { EnterpriseProductSummary } from '@/common/enterprise/contracts';

import { buildLiaoningSearchPlans, formatRegion, matchesCommonCurrentResult, optionalText } from './shared';
import type { CatalogResourceAdapter } from './types';

const PAGE_SIZE = 20;
const PRODUCT_KEYWORD_SUFFIXES = ['加工产品', '加工服务', '加工件', '加工', '产品', '服务'] as const;

const productKeywordFallbacks = (keyword: string | undefined): string[] => {
  const normalized = optionalText(keyword);
  if (!normalized) return [];
  return [
    ...new Set(
      PRODUCT_KEYWORD_SUFFIXES.flatMap((suffix) => {
        if (!normalized.endsWith(suffix)) return [];
        const core = optionalText(normalized.slice(0, -suffix.length));
        return core && core.length >= 2 && core !== normalized ? [core] : [];
      })
    ),
  ];
};

export const productCatalogAdapter: CatalogResourceAdapter = {
  entityType: 'PRODUCT',
  progressMessageKey: 'enterprise.catalogAssistant.searchingProductPage',
  buildSearchPlans: async (_runtime, plan) => buildLiaoningSearchPlans(plan, productKeywordFallbacks),
  searchPage: async ({ client, assertActive }, plan, pageNum) => {
    const response = await client.request({
      operation: 'product.list',
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
    if (response.operation !== 'product.list') throw new Error('unexpected product operation');
    return response.data;
  },
  getId: (item) => (item as EnterpriseProductSummary).productId,
  toCandidate: (item) => {
    const product = item as EnterpriseProductSummary;
    return {
      id: product.productId,
      name: product.name,
      companyName: optionalText(product.companyName),
      industry: optionalText(product.industry ?? product.companyIndustry),
      region: formatRegion(product.city, product.district),
      summary: optionalText(product.summary?.slice(0, 500)),
    };
  },
  matchesCurrent: (result, filters) => result.entityType === 'PRODUCT' && matchesCommonCurrentResult(result, filters),
  toTrustedResult: (item, reason) => ({
    entityType: 'PRODUCT',
    item: item as EnterpriseProductSummary,
    reason,
  }),
  hydrateSelected: async (_runtime, results) => results,
  toScopeDigest: (result) => {
    if (result.entityType !== 'PRODUCT') throw new Error('product adapter received another entity');
    return {
      id: result.item.productId,
      name: result.item.name,
      province: result.item.province,
      city: result.item.city,
      district: result.item.district,
      industry: result.item.industry ?? result.item.companyIndustry,
      summary: result.item.summary,
    };
  },
};
