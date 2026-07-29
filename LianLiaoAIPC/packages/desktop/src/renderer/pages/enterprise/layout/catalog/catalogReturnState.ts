import type { CompanyListQuery, ProductListQuery } from '@/common/enterprise/contracts';

export type CompanyCatalogReturn = {
  kind: 'companies';
  path: '/enterprise/companies';
  query: CompanyListQuery;
  selectedId?: string;
  scrollTop: number;
};

export type ProductCatalogReturn = {
  kind: 'products';
  path: '/enterprise/products';
  query: ProductListQuery;
  selectedId?: string;
  scrollTop: number;
};

export type CatalogReturn = CompanyCatalogReturn | ProductCatalogReturn;
export type CatalogRouteState = { catalogReturn: CatalogReturn };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const isOptionalText = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const readCompanyQuery = (value: unknown): CompanyListQuery | null => {
  if (!isRecord(value) || !isPositiveInteger(value.pageNum) || !isPositiveInteger(value.pageSize)) return null;
  const textKeys = ['keyword', 'industry', 'province', 'city', 'district'] as const;
  if (!textKeys.every((key) => isOptionalText(value[key]))) return null;
  if (
    value.companyLevel !== undefined &&
    (typeof value.companyLevel !== 'number' || !Number.isFinite(value.companyLevel))
  ) {
    return null;
  }
  if (value.vip !== undefined && typeof value.vip !== 'boolean') return null;
  return {
    pageNum: value.pageNum,
    pageSize: value.pageSize,
    ...(typeof value.keyword === 'string' && value.keyword ? { keyword: value.keyword } : {}),
    ...(typeof value.industry === 'string' && value.industry ? { industry: value.industry } : {}),
    ...(typeof value.province === 'string' && value.province ? { province: value.province } : {}),
    ...(typeof value.city === 'string' && value.city ? { city: value.city } : {}),
    ...(typeof value.district === 'string' && value.district ? { district: value.district } : {}),
    ...(typeof value.companyLevel === 'number' ? { companyLevel: value.companyLevel } : {}),
    ...(typeof value.vip === 'boolean' ? { vip: value.vip } : {}),
  };
};

const readProductQuery = (value: unknown): ProductListQuery | null => {
  if (!isRecord(value) || !isPositiveInteger(value.pageNum) || !isPositiveInteger(value.pageSize)) return null;
  const textKeys = ['keyword', 'industry', 'province', 'city', 'district'] as const;
  if (!textKeys.every((key) => isOptionalText(value[key]))) return null;
  return {
    pageNum: value.pageNum,
    pageSize: value.pageSize,
    ...(typeof value.keyword === 'string' && value.keyword ? { keyword: value.keyword } : {}),
    ...(typeof value.industry === 'string' && value.industry ? { industry: value.industry } : {}),
    ...(typeof value.province === 'string' && value.province ? { province: value.province } : {}),
    ...(typeof value.city === 'string' && value.city ? { city: value.city } : {}),
    ...(typeof value.district === 'string' && value.district ? { district: value.district } : {}),
  };
};

export const createCatalogReturnState = (catalogReturn: CatalogReturn): CatalogRouteState => ({ catalogReturn });

export function readCatalogReturnState(value: unknown, expectedKind: 'companies'): CompanyCatalogReturn | null;
export function readCatalogReturnState(value: unknown, expectedKind: 'products'): ProductCatalogReturn | null;
export function readCatalogReturnState(value: unknown, expectedKind: CatalogReturn['kind']): CatalogReturn | null {
  if (!isRecord(value) || !isRecord(value.catalogReturn)) return null;
  const candidate = value.catalogReturn;
  if (
    candidate.kind !== expectedKind ||
    typeof candidate.scrollTop !== 'number' ||
    !Number.isFinite(candidate.scrollTop) ||
    candidate.scrollTop < 0 ||
    !isOptionalText(candidate.selectedId)
  ) {
    return null;
  }

  if (expectedKind === 'companies' && candidate.path === '/enterprise/companies') {
    const query = readCompanyQuery(candidate.query);
    if (!query) return null;
    return {
      kind: 'companies',
      path: '/enterprise/companies',
      query,
      scrollTop: candidate.scrollTop,
      ...(candidate.selectedId ? { selectedId: candidate.selectedId } : {}),
    };
  }

  if (expectedKind === 'products' && candidate.path === '/enterprise/products') {
    const query = readProductQuery(candidate.query);
    if (!query) return null;
    return {
      kind: 'products',
      path: '/enterprise/products',
      query,
      scrollTop: candidate.scrollTop,
      ...(candidate.selectedId ? { selectedId: candidate.selectedId } : {}),
    };
  }

  return null;
}

/** Reads the enterprise shell's own scroller instead of the browser document. */
export const getEnterpriseCatalogScrollTop = (): number => {
  if (typeof document === 'undefined') return 0;
  return document.querySelector<HTMLElement>('.enterprise-shell__main')?.scrollTop ?? 0;
};

/**
 * Restores the list viewport after data and row/card geometry have mounted.
 * The caller owns the one-shot guard so later refreshes never jump the user.
 */
export const restoreEnterpriseCatalogScroll = (scrollTop: number): void => {
  if (typeof document === 'undefined') return;
  const apply = () => {
    const scroller = document.querySelector<HTMLElement>('.enterprise-shell__main');
    if (scroller) scroller.scrollTop = scrollTop;
  };
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(apply);
    return;
  }
  apply();
};
