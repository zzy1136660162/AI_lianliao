import type {
  CatalogAssistantFilters,
  CatalogAssistantPlan,
  CatalogAssistantTrustedResult,
} from '@/common/enterprise/catalog-assistant/contracts';

import { matchesCatalogRegion, normalizeCatalogRegionFilters } from '../catalogRegion';

const LIAONING_CITY_NAMES = new Map<string, string>([
  ['沈阳', '沈阳市'],
  ['大连', '大连市'],
  ['鞍山', '鞍山市'],
  ['抚顺', '抚顺市'],
  ['本溪', '本溪市'],
  ['丹东', '丹东市'],
  ['锦州', '锦州市'],
  ['营口', '营口市'],
  ['阜新', '阜新市'],
  ['辽阳', '辽阳市'],
  ['盘锦', '盘锦市'],
  ['铁岭', '铁岭市'],
  ['朝阳', '朝阳市'],
  ['葫芦岛', '葫芦岛市'],
]);

export const optionalText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

export const formatRegion = (...parts: Array<string | undefined>): string | undefined =>
  optionalText(parts.filter(Boolean).join(' / '));

export const trustedResultText = (result: CatalogAssistantTrustedResult): string => {
  if (result.entityType === 'COMPANY') {
    return [result.item.name, result.item.industry, result.item.businessSummary].filter(Boolean).join(' ');
  }
  if (result.entityType === 'PRODUCT') {
    return [
      result.item.name,
      result.item.companyName,
      result.item.industry,
      result.item.companyIndustry,
      result.item.summary,
    ]
      .filter(Boolean)
      .join(' ');
  }
  return [
    result.item.projectName,
    result.item.constructionUnit,
    result.item.province,
    result.item.city,
    result.item.constructionNature,
    result.item.investmentType,
    result.item.projectNature,
    result.item.materialMatch,
    result.item.procurementSummary,
  ]
    .filter(Boolean)
    .join(' ');
};

export const matchesCommonCurrentResult = (
  result: CatalogAssistantTrustedResult,
  filters: CatalogAssistantFilters
): boolean => {
  const normalized = normalizeCatalogRegionFilters(filters);
  const item = result.item;
  if (result.entityType !== 'PROJECT' && normalized.province && normalized.province !== '辽宁省') return false;
  if (normalized.province && result.entityType === 'PROJECT' && item.province !== normalized.province) return false;
  if (!matchesCatalogRegion(item.city, normalized.city)) return false;
  if ('district' in item && !matchesCatalogRegion(item.district, normalized.district)) return false;
  const haystack = trustedResultText(result).toLocaleLowerCase();
  if (normalized.keyword && !haystack.includes(normalized.keyword.toLocaleLowerCase())) return false;
  if (normalized.industry && !haystack.includes(normalized.industry.toLocaleLowerCase())) return false;
  return true;
};

/**
 * Preserves the legacy辽宁 catalog behavior while allowing each resource to
 * contribute bounded keyword fallbacks. The first non-empty strategy wins.
 */
export const buildLiaoningSearchPlans = (
  plan: CatalogAssistantPlan,
  keywordFallbacks: (keyword: string | undefined) => string[] = () => []
): CatalogAssistantPlan[] => {
  const regionNormalized = normalizeCatalogRegionFilters(plan.filters);
  const city = optionalText(regionNormalized.city);
  const normalized: CatalogAssistantPlan = {
    ...plan,
    filters: {
      ...regionNormalized,
      province: '辽宁省',
      city: city ? (LIAONING_CITY_NAMES.get(city) ?? city) : undefined,
    },
  };
  const plans: CatalogAssistantPlan[] = [];
  const keys = new Set<string>();
  const append = (candidate: CatalogAssistantPlan): void => {
    const key = JSON.stringify(candidate.filters);
    if (keys.has(key)) return;
    keys.add(key);
    plans.push(candidate);
  };
  const appendKeywordFallbacks = (candidate: CatalogAssistantPlan): void => {
    for (const keyword of keywordFallbacks(candidate.filters.keyword)) {
      append({ ...candidate, filters: { ...candidate.filters, keyword } });
    }
  };

  append(normalized);
  if (optionalText(normalized.filters.keyword) && optionalText(normalized.filters.industry)) {
    const keywordOnly: CatalogAssistantPlan = {
      ...normalized,
      filters: { ...normalized.filters, industry: undefined },
    };
    append(keywordOnly);
    appendKeywordFallbacks(normalized);
    appendKeywordFallbacks(keywordOnly);
    append({ ...normalized, filters: { ...normalized.filters, keyword: undefined } });
  } else if (!optionalText(normalized.filters.keyword) && optionalText(normalized.filters.industry)) {
    append({
      ...normalized,
      filters: {
        ...normalized.filters,
        keyword: normalized.filters.industry,
        industry: undefined,
      },
    });
  } else {
    appendKeywordFallbacks(normalized);
  }
  return plans;
};
