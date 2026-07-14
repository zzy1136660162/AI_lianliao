import type {
  CompanyListQuery,
  EnterpriseCompanyDetail,
  EnterpriseCompanySummary,
  EnterpriseIpcErrorCode,
  EnterprisePage,
  EnterpriseProductSummary,
} from '@/common/enterprise/contracts';
import { ENTERPRISE_IPC_ERROR_MESSAGES } from '@/common/enterprise/constants';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type CompanyFilters = {
  keyword?: string;
  industry?: string;
  province?: string;
  city?: string;
  district?: string;
  companyLevel?: number;
};

export type CompanyPagination = Pick<CompanyListQuery, 'pageNum' | 'pageSize'>;

export type CompanyDetailBundle = {
  company: EnterpriseCompanyDetail;
  products: EnterprisePage<EnterpriseProductSummary>;
};

export type CompanyCatalogState = {
  query: CompanyListQuery;
  data: EnterprisePage<EnterpriseCompanySummary> | null;
  isLoading: boolean;
  isRetainingData: boolean;
  errorCode: EnterpriseIpcErrorCode | null;
  applyFilters: (filters: CompanyFilters) => void;
  changePage: (pageNum: number, pageSize?: number) => void;
  retry: () => void;
};

export type CompanyDetailState = {
  data: CompanyDetailBundle | null;
  isLoading: boolean;
  isInvalidId: boolean;
  errorCode: EnterpriseIpcErrorCode | null;
  retry: () => void;
};

const QUERY_FILTER_KEYS = ['keyword', 'industry', 'province', 'city', 'district', 'companyLevel', 'vip'] as const;
const COMPANY_ID_PATTERN = /^[1-9]\d{0,30}$/;

const normalizeText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

/** Stable renderer-side error that never includes backend payloads or identifiers. */
export class CompanyDataError extends Error {
  declare readonly code: EnterpriseIpcErrorCode;

  constructor(code: EnterpriseIpcErrorCode) {
    super(code);
    this.name = 'CompanyDataError';
    Object.defineProperty(this, 'code', {
      value: code,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
}

const isEnterpriseErrorCode = (value: unknown): value is EnterpriseIpcErrorCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ENTERPRISE_IPC_ERROR_MESSAGES, value);

const safeErrorCode = (error: unknown): EnterpriseIpcErrorCode => {
  if (typeof error !== 'object' || error === null) return 'REQUEST_FAILED';
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor &&
      Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
      isEnterpriseErrorCode(descriptor.value)
      ? descriptor.value
      : 'REQUEST_FAILED';
  } catch {
    return 'REQUEST_FAILED';
  }
};

/** Builds the exact company-list request payload while removing empty filters. */
export const buildCompanyListQuery = (
  filters: Readonly<CompanyFilters>,
  pagination: Readonly<CompanyPagination>
): CompanyListQuery => {
  const query: CompanyListQuery = {
    pageNum: pagination.pageNum,
    pageSize: pagination.pageSize,
  };
  const keyword = normalizeText(filters.keyword);
  const industry = normalizeText(filters.industry);
  const province = normalizeText(filters.province);
  const city = normalizeText(filters.city);
  const district = normalizeText(filters.district);
  if (keyword) query.keyword = keyword;
  if (industry) query.industry = industry;
  if (province) query.province = province;
  if (city) query.city = city;
  if (district) query.district = district;
  if (filters.companyLevel !== undefined) query.companyLevel = filters.companyLevel;
  return query;
};

/** Creates a deterministic request key that includes every supported query condition. */
export const createCompanyQueryKey = (query: Readonly<CompanyListQuery>): string =>
  JSON.stringify([
    'company.list',
    query.keyword ?? null,
    query.industry ?? null,
    query.province ?? null,
    query.city ?? null,
    query.district ?? null,
    query.companyLevel ?? null,
    query.vip ?? null,
    query.pageNum,
    query.pageSize,
  ]);

/** Returns true only when filters are unchanged and a page setting changed. */
export const isPaginationOnlyCompanyQueryChange = (
  previous: Readonly<CompanyListQuery>,
  next: Readonly<CompanyListQuery>
): boolean => {
  const filtersMatch = QUERY_FILTER_KEYS.every((key) => previous[key] === next[key]);
  return filtersMatch && (previous.pageNum !== next.pageNum || previous.pageSize !== next.pageSize);
};

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number => isNonNegativeInteger(value) && value > 0;

const validateCompany = (value: unknown): value is EnterpriseCompanySummary => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<EnterpriseCompanySummary>;
  return typeof candidate.companyId === 'string' && candidate.companyId !== '' && typeof candidate.name === 'string';
};

const validateProduct = (value: unknown): value is EnterpriseProductSummary => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<EnterpriseProductSummary>;
  return (
    typeof candidate.productId === 'string' &&
    candidate.productId !== '' &&
    typeof candidate.companyId === 'string' &&
    typeof candidate.name === 'string'
  );
};

const validatePage = <T>(value: unknown, validateItem: (item: unknown) => item is T): value is EnterprisePage<T> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<EnterprisePage<unknown>>;
  return (
    Array.isArray(candidate.list) &&
    candidate.list.every(validateItem) &&
    isPositiveInteger(candidate.pageNum) &&
    isPositiveInteger(candidate.pageSize) &&
    isNonNegativeInteger(candidate.pages) &&
    isNonNegativeInteger(candidate.total)
  );
};

/** Fetches and validates a real company page; malformed pages fail closed. */
export const loadCompanyList = async (
  client: Pick<EnterpriseClient, 'request'>,
  query: CompanyListQuery
): Promise<EnterprisePage<EnterpriseCompanySummary>> => {
  const response = await client.request({ operation: 'company.list', payload: query });
  if (response.operation !== 'company.list' || !validatePage(response.data, validateCompany)) {
    throw new CompanyDataError('INVALID_RESPONSE');
  }
  return response.data;
};

/** Parses the numeric Oracle company identity accepted by the current backend route. */
export const parseCompanyId = (value: string | undefined): string => {
  if (!value || !COMPANY_ID_PATTERN.test(value)) throw new CompanyDataError('INVALID_REQUEST');
  return value;
};

/**
 * Accepts only remote HTTP(S) image sources before handing them to Chromium.
 * Protocol-relative links from the legacy API are upgraded to HTTPS; embedded,
 * local-file and credential-bearing URLs fail closed.
 */
export const parseSafeCompanyImageUrl = (value: string | undefined): string | null => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return null;

  try {
    const parsedUrl = new URL(trimmedValue.startsWith('//') ? `https:${trimmedValue}` : trimmedValue);
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) return null;
    return parsedUrl.toString();
  } catch {
    return null;
  }
};

/** Loads the verified company profile and its associated real product page. */
export const loadCompanyDetailBundle = async (
  client: Pick<EnterpriseClient, 'request'>,
  companyId: string
): Promise<CompanyDetailBundle> => {
  const validCompanyId = parseCompanyId(companyId);
  const detailResponse = await client.request({
    operation: 'company.detail',
    payload: { companyId: validCompanyId },
  });
  const productResponse = await client.request({
    operation: 'product.list',
    payload: { companyId: validCompanyId, pageNum: 1, pageSize: 12 },
  });
  if (detailResponse.operation !== 'company.detail' || !validateCompany(detailResponse.data)) {
    throw new CompanyDataError('INVALID_RESPONSE');
  }
  if (productResponse.operation !== 'product.list' || !validatePage(productResponse.data, validateProduct)) {
    throw new CompanyDataError('INVALID_RESPONSE');
  }
  return { company: detailResponse.data, products: productResponse.data };
};

/** Controlled company-list loader with stale-response protection and pagination-only data retention. */
export const useCompanyCatalog = (
  client: Pick<EnterpriseClient, 'request'>,
  initialPageSize = 20
): CompanyCatalogState => {
  const [filters, setFilters] = useState<CompanyFilters>({});
  const [pagination, setPagination] = useState<CompanyPagination>({
    pageNum: 1,
    pageSize: initialPageSize,
  });
  const [data, setData] = useState<EnterprisePage<EnterpriseCompanySummary> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetainingData, setIsRetainingData] = useState(false);
  const [errorCode, setErrorCode] = useState<EnterpriseIpcErrorCode | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestGenerationRef = useRef(0);
  const previousQueryRef = useRef<CompanyListQuery | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const query = useMemo(
    () => buildCompanyListQuery(filters, pagination),
    [
      filters.keyword,
      filters.industry,
      filters.province,
      filters.city,
      filters.district,
      filters.companyLevel,
      pagination.pageNum,
      pagination.pageSize,
    ]
  );
  const queryKey = createCompanyQueryKey(query);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    const previousQuery = previousQueryRef.current;
    const retainData =
      previousQuery !== null && dataRef.current !== null && isPaginationOnlyCompanyQueryChange(previousQuery, query);
    previousQueryRef.current = query;
    if (!retainData) {
      dataRef.current = null;
      setData(null);
    }
    setIsRetainingData(retainData);
    setIsLoading(true);
    setErrorCode(null);

    void loadCompanyList(client, query)
      .then((page) => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        dataRef.current = page;
        setData(page);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        setErrorCode(safeErrorCode(error));
      })
      .finally(() => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        setIsLoading(false);
        setIsRetainingData(false);
      });

    return () => {
      controller.abort();
      if (generation === requestGenerationRef.current) requestGenerationRef.current += 1;
    };
  }, [client, queryKey, retryGeneration]);

  const applyFilters = useCallback((nextFilters: CompanyFilters) => {
    setFilters({ ...nextFilters });
    setPagination((current) => ({ ...current, pageNum: 1 }));
  }, []);

  const changePage = useCallback((pageNum: number, pageSize?: number) => {
    setPagination((current) => ({ pageNum, pageSize: pageSize ?? current.pageSize }));
  }, []);

  const retry = useCallback(() => setRetryGeneration((value) => value + 1), []);

  return { query, data, isLoading, isRetainingData, errorCode, applyFilters, changePage, retry };
};

/** Loads one strict route identity and prevents unmounted or replaced requests from updating the page. */
export const useCompanyDetail = (
  client: Pick<EnterpriseClient, 'request'>,
  routeCompanyId: string | undefined
): CompanyDetailState => {
  const companyId = useMemo(() => {
    try {
      return parseCompanyId(routeCompanyId);
    } catch {
      return null;
    }
  }, [routeCompanyId]);
  const [data, setData] = useState<CompanyDetailBundle | null>(null);
  const [isLoading, setIsLoading] = useState(companyId !== null);
  const [errorCode, setErrorCode] = useState<EnterpriseIpcErrorCode | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    setData(null);
    setErrorCode(null);
    if (!companyId) {
      setIsLoading(false);
      return () => controller.abort();
    }
    setIsLoading(true);
    void loadCompanyDetailBundle(client, companyId)
      .then((bundle) => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        setData(bundle);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        setErrorCode(safeErrorCode(error));
      })
      .finally(() => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        setIsLoading(false);
      });

    return () => {
      controller.abort();
      if (generation === requestGenerationRef.current) requestGenerationRef.current += 1;
    };
  }, [client, companyId, retryGeneration]);

  const retry = useCallback(() => setRetryGeneration((value) => value + 1), []);
  return { data, isLoading, isInvalidId: companyId === null, errorCode, retry };
};
