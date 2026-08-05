import { areaList } from '@vant/area-data';

import type { CatalogAssistantFilters } from '@/common/enterprise/catalog-assistant/contracts';

type AreaName = { code: string; name: string };

const LIAONING_PREFIX = '21';
const suffixPattern = /(特别行政区|自治县|新区|区|县|市)$/u;
const cityNames: AreaName[] = Object.entries(areaList.city_list)
  .filter(([code]) => code.startsWith(LIAONING_PREFIX))
  .map(([code, name]) => ({ code, name }));
const districtNames: AreaName[] = Object.entries(areaList.county_list)
  .filter(([code]) => code.startsWith(LIAONING_PREFIX))
  .map(([code, name]) => ({ code, name }));

const normalizeAlias = (value: string): string => value.trim().replace(suffixPattern, '');

const findCanonicalName = (value: string | undefined, options: AreaName[]): string | undefined => {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const exact = options.find(({ name }) => name === normalized);
  if (exact) return exact.name;
  const alias = normalizeAlias(normalized);
  const matches = options.filter(({ name }) => normalizeAlias(name) === alias);
  return matches.length === 1 ? matches[0]?.name : normalized;
};

/** Canonicalizes model-produced Liaoning aliases before they reach exact-match legacy SQL. */
export const normalizeCatalogRegionFilters = (filters: CatalogAssistantFilters): CatalogAssistantFilters => ({
  ...filters,
  city: findCanonicalName(filters.city, cityNames),
  district: findCanonicalName(filters.district, districtNames),
});

/** Compares a trusted API region with a canonical or abbreviated user filter. */
export const matchesCatalogRegion = (actual: string | undefined, expected: string | undefined): boolean => {
  if (!expected) return true;
  if (!actual) return false;
  return actual === expected || normalizeAlias(actual) === normalizeAlias(expected);
};
