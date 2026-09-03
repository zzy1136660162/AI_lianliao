import type { CompanyListQuery, ProductListQuery } from '@/common/enterprise/contracts';
import { isEnterpriseEntityId } from '@/common/enterprise/entityId';

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

export type AiConversationReturn = {
  kind: 'ai-conversation';
  path: `/conversation/${string}`;
  conversationId: string;
  targetMessageId: string;
  scrollTop: number;
};

export type ProductDetailCompanyReturn = {
  kind: 'company-detail';
  companyId: string;
  catalogReturn?: CompanyCatalogReturn;
  aiConversationReturn?: AiConversationReturn;
};

export type ProductDetailRouteState = {
  productDetailReturn: ProductDetailCompanyReturn;
};

export type ProductDetailOrigin =
  | { kind: 'catalog'; catalogReturn: CatalogReturn }
  | { kind: 'company-detail'; companyReturn: ProductDetailCompanyReturn }
  | { kind: 'ai-conversation'; aiConversationReturn: AiConversationReturn };

export type CompanyDetailProductReturn = {
  kind: 'product-detail';
  productId: string;
  origin?: ProductDetailOrigin;
};

export type CompanyDetailRouteState = {
  companyDetailReturn: CompanyDetailProductReturn;
};

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

/** Preserves the originating enterprise detail and its optional list state across a product drill-down. */
export const createProductDetailCompanyReturnState = (
  companyId: string,
  catalogReturn?: CompanyCatalogReturn | null,
  aiConversationReturn?: AiConversationReturn | null
): ProductDetailRouteState => ({
  productDetailReturn: {
    kind: 'company-detail',
    companyId,
    ...(catalogReturn ? { catalogReturn } : {}),
    ...(aiConversationReturn ? { aiConversationReturn } : {}),
  },
});

/** Preserves a product detail and its validated origin while visiting the owning company. */
export const createCompanyDetailProductReturnState = (
  productId: string,
  origin?: ProductDetailOrigin
): CompanyDetailRouteState => ({
  companyDetailReturn: {
    kind: 'product-detail',
    productId,
    ...(origin ? { origin } : {}),
  },
});

/** Accepts only a signed entity id and a previously validated company-list return state. */
export const readProductDetailCompanyReturnState = (value: unknown): ProductDetailCompanyReturn | null => {
  if (!isRecord(value) || !isRecord(value.productDetailReturn)) return null;
  const candidate = value.productDetailReturn;
  if (candidate.kind !== 'company-detail' || !isEnterpriseEntityId(candidate.companyId, 31)) return null;

  if (candidate.catalogReturn === undefined) {
    const aiConversationReturn = readAiConversationReturnState(candidate.aiConversationReturn);
    return {
      kind: 'company-detail',
      companyId: candidate.companyId,
      ...(aiConversationReturn ? { aiConversationReturn } : {}),
    };
  }
  const catalogReturn = readCatalogReturnState({ catalogReturn: candidate.catalogReturn }, 'companies');
  if (!catalogReturn) return null;
  const aiConversationReturn = readAiConversationReturnState(candidate.aiConversationReturn);
  return {
    kind: 'company-detail',
    companyId: candidate.companyId,
    catalogReturn,
    ...(aiConversationReturn ? { aiConversationReturn } : {}),
  };
};

const readProductDetailOrigin = (value: unknown): ProductDetailOrigin | null => {
  if (!isRecord(value)) return null;
  if (value.kind === 'catalog') {
    const catalogReturn =
      readCatalogReturnState({ catalogReturn: value.catalogReturn }, 'companies') ??
      readCatalogReturnState({ catalogReturn: value.catalogReturn }, 'products');
    return catalogReturn ? { kind: 'catalog', catalogReturn } : null;
  }
  if (value.kind === 'company-detail') {
    const companyReturn = readProductDetailCompanyReturnState({ productDetailReturn: value.companyReturn });
    return companyReturn ? { kind: 'company-detail', companyReturn } : null;
  }
  if (value.kind === 'ai-conversation') {
    const aiConversationReturn = readAiConversationReturnState(value.aiConversationReturn);
    return aiConversationReturn ? { kind: 'ai-conversation', aiConversationReturn } : null;
  }
  return null;
};

/** Accepts only a local product id and a fully validated product-detail origin. */
export const readCompanyDetailProductReturnState = (value: unknown): CompanyDetailProductReturn | null => {
  if (!isRecord(value) || !isRecord(value.companyDetailReturn)) return null;
  const candidate = value.companyDetailReturn;
  if (candidate.kind !== 'product-detail' || !isEnterpriseEntityId(candidate.productId, 31)) return null;
  if (candidate.origin === undefined) return { kind: 'product-detail', productId: candidate.productId };
  const origin = readProductDetailOrigin(candidate.origin);
  return origin ? { kind: 'product-detail', productId: candidate.productId, origin } : null;
};

/** Rebuilds only the allowlisted route state needed by the returning product detail. */
export const restoreProductDetailOriginState = (
  value: CompanyDetailProductReturn
): CatalogRouteState | ProductDetailRouteState | AiConversationReturn | undefined => {
  switch (value.origin?.kind) {
    case 'catalog':
      return createCatalogReturnState(value.origin.catalogReturn);
    case 'company-detail':
      return { productDetailReturn: value.origin.companyReturn };
    case 'ai-conversation':
      return value.origin.aiConversationReturn;
    default:
      return undefined;
  }
};

const SAFE_ROUTE_ID = /^[A-Za-z0-9_-]{1,100}$/u;

/** Accepts only a local conversation path bound to the same validated ID. */
export const readAiConversationReturnState = (value: unknown): AiConversationReturn | null => {
  if (!isRecord(value)) return null;
  const candidate = value.kind === 'ai-conversation' ? value : value.aiConversationReturn;
  if (!isRecord(candidate)) return null;
  const expectedPath =
    typeof candidate.conversationId === 'string'
      ? (`/conversation/${candidate.conversationId}` as `/conversation/${string}`)
      : null;
  if (
    candidate.kind !== 'ai-conversation' ||
    typeof candidate.conversationId !== 'string' ||
    !SAFE_ROUTE_ID.test(candidate.conversationId) ||
    typeof candidate.targetMessageId !== 'string' ||
    !SAFE_ROUTE_ID.test(candidate.targetMessageId) ||
    candidate.path !== expectedPath ||
    typeof candidate.scrollTop !== 'number' ||
    !Number.isFinite(candidate.scrollTop) ||
    candidate.scrollTop < 0
  ) {
    return null;
  }
  return {
    kind: 'ai-conversation',
    path: expectedPath,
    conversationId: candidate.conversationId,
    targetMessageId: candidate.targetMessageId,
    scrollTop: candidate.scrollTop,
  };
};

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
