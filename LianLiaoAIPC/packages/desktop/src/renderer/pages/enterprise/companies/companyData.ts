import type {
  CompanyListQuery,
  EnterpriseCompanyDetail,
  EnterpriseCompanySummary,
  EnterpriseIndustryOption,
  EnterpriseIpcErrorCode,
  EnterprisePage,
  EnterpriseProductSummary,
} from '@/common/enterprise/contracts';
import { ENTERPRISE_IPC_ERROR_MESSAGES } from '@/common/enterprise/constants';
import {
  createPlainEnterpriseRecordParser,
  getPlainEnterpriseDataFields,
  isNumericEnterpriseId,
  parsePlainEnterpriseDataArray,
  parseEnterpriseOperationData,
  parseEnterprisePage,
  parseSafeEnterpriseImageUrl,
  type EnterpriseDataFieldRule,
} from '@/renderer/services/enterprise/enterpriseDataValidation';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type CompanyFilters = {
  keyword?: string;
  industry?: string;
  province?: string;
  city?: string;
  district?: string;
  companyLevel?: number;
  vip?: boolean;
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

export type CompanyIndustryOptionsState = {
  data: EnterpriseIndustryOption[];
  isLoading: boolean;
  errorCode: EnterpriseIpcErrorCode | null;
  retry: () => void;
};

const QUERY_FILTER_KEYS = ['keyword', 'industry', 'province', 'city', 'district', 'companyLevel', 'vip'] as const;

/** H5-backed membership choices, including decimal and upper-tier values observed in production. */
export const COMPANY_LEVEL_FILTERS = [1, 1.1, 1.2, 2, 3, 3.1, 4, 5, 6, 7, 8, 9, 10] as const;
export const COMPANY_VIP_FILTER_VALUE = 'vip' as const;

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

const isAbortError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  try {
    return Reflect.get(error, 'name') === 'AbortError';
  } catch {
    return false;
  }
};

const throwIfAborted = (signal: AbortSignal): void => {
  if (!signal.aborted) return;
  const error = new Error('Aborted');
  error.name = 'AbortError';
  throw error;
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
  if (filters.vip === true) query.vip = true;
  else if (filters.companyLevel !== undefined) query.companyLevel = filters.companyLevel;
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

const COMPANY_SUMMARY_FIELD_RULES = [
  ['companyId', 'string', true, true],
  ['name', 'string', true],
  ['shortName', 'string'],
  ['logoUrl', 'string'],
  ['industry', 'string'],
  ['province', 'string'],
  ['city', 'string'],
  ['district', 'string'],
  ['address', 'string'],
  ['businessSummary', 'string'],
  ['updatedAt', 'string'],
  ['legalRepresentative', 'string'],
  ['registeredCapital', 'string'],
  ['companyType', 'string'],
  ['companyLevel', 'finiteNumber'],
  ['vip', 'boolean'],
  ['establishedAt', 'string'],
  ['collected', 'boolean'],
  ['featuredProductCount', 'finiteNumber'],
] as const satisfies readonly EnterpriseDataFieldRule[];

const COMPANY_DETAIL_FIELD_RULES = [
  ...COMPANY_SUMMARY_FIELD_RULES,
  ['logoUrl', 'string'],
  ['description', 'string'],
  ['unifiedSocialCreditCode', 'string'],
  ['contactName', 'string'],
  ['contactTitle', 'string'],
  ['phone', 'string'],
] as const satisfies readonly EnterpriseDataFieldRule[];

const PRODUCT_FIELD_RULES = [
  ['productId', 'string', true, true],
  ['name', 'string', true],
  ['companyId', 'string', true, true],
  ['imageUrl', 'string'],
  ['summary', 'string'],
  ['industry', 'string'],
  ['companyName', 'string'],
  ['companyIndustry', 'string'],
  ['province', 'string'],
  ['city', 'string'],
  ['district', 'string'],
  ['address', 'string'],
  ['contactName', 'string'],
  ['phone', 'string'],
  ['companyLevel', 'finiteNumber'],
  ['vip', 'boolean'],
  ['collected', 'boolean'],
] as const satisfies readonly EnterpriseDataFieldRule[];

const INDUSTRY_OPTION_FIELD_RULES = [
  ['industry', 'string', true, true],
  ['companyCount', 'finiteNumber', true],
] as const satisfies readonly EnterpriseDataFieldRule[];

const parseCompanyDetail = createPlainEnterpriseRecordParser<EnterpriseCompanyDetail>(COMPANY_DETAIL_FIELD_RULES);
const parseProduct = createPlainEnterpriseRecordParser<EnterpriseProductSummary>(PRODUCT_FIELD_RULES);
const parseIndustryOptionFields =
  createPlainEnterpriseRecordParser<EnterpriseIndustryOption>(INDUSTRY_OPTION_FIELD_RULES);
const parseCompanySummaryFields =
  createPlainEnterpriseRecordParser<EnterpriseCompanySummary>(COMPANY_SUMMARY_FIELD_RULES);

const parseCompanySummary = (value: unknown): EnterpriseCompanySummary | null => {
  const fields = getPlainEnterpriseDataFields(value);
  if (!fields) return null;
  const featuredProductsValue = fields.get('featuredProducts');
  const scalarFields = Object.fromEntries([...fields].filter(([key]) => key !== 'featuredProducts')) as Record<
    string,
    unknown
  >;
  const company = parseCompanySummaryFields(scalarFields);
  if (!company) return null;
  if (featuredProductsValue === undefined) return company;
  const featuredProducts = parsePlainEnterpriseDataArray(featuredProductsValue, parseProduct);
  if (!featuredProducts || featuredProducts.length > 3) return null;
  if (
    company.featuredProductCount !== undefined &&
    (!Number.isSafeInteger(company.featuredProductCount) || company.featuredProductCount < featuredProducts.length)
  ) {
    return null;
  }
  return { ...company, featuredProducts };
};

/** Fetches and validates a real company page; malformed pages fail closed. */
export const loadCompanyList = async (
  client: Pick<EnterpriseClient, 'request'>,
  query: CompanyListQuery,
  signal: AbortSignal
): Promise<EnterprisePage<EnterpriseCompanySummary>> => {
  // Enterprise IPC has no physical cancellation contract; boundary checks discard stale results instead.
  throwIfAborted(signal);
  const response = await client.request({ operation: 'company.list', payload: query });
  throwIfAborted(signal);
  const page = parseEnterprisePage(
    parseEnterpriseOperationData(response, 'company.list'),
    parseCompanySummary,
    query.pageNum,
    query.pageSize
  );
  if (!page) throw new CompanyDataError('INVALID_RESPONSE');
  return page;
};

const parseIndustryOption = (value: unknown): EnterpriseIndustryOption | null => {
  const option = parseIndustryOptionFields(value);
  if (!option || !Number.isSafeInteger(option.companyCount) || option.companyCount < 10) {
    return null;
  }
  return option;
};

export const loadCompanyIndustryOptions = async (
  client: Pick<EnterpriseClient, 'request'>,
  signal: AbortSignal
): Promise<EnterpriseIndustryOption[]> => {
  throwIfAborted(signal);
  const response = await client.request({ operation: 'company.industries', payload: {} });
  throwIfAborted(signal);
  const options = parsePlainEnterpriseDataArray(
    parseEnterpriseOperationData(response, 'company.industries'),
    parseIndustryOption
  );
  if (!options || new Set(options.map((option) => option.industry)).size !== options.length) {
    throw new CompanyDataError('INVALID_RESPONSE');
  }
  return options;
};

/** Parses the numeric Oracle company identity accepted by the current backend route. */
export const parseCompanyId = (value: string | undefined): string => {
  if (!isNumericEnterpriseId(value)) throw new CompanyDataError('INVALID_REQUEST');
  return value;
};

/**
 * Hands Chromium only HTTPS URLs on the exact trusted business-host allowlist.
 * Protocol-relative legacy links are upgraded to HTTPS. Redirect behavior and
 * response size remain responsibilities of those trusted remote hosts; this
 * intentionally does not trust arbitrary `*.lslnii.com` subdomains.
 */
export const parseSafeCompanyImageUrl = parseSafeEnterpriseImageUrl;

/** Loads the verified company profile and its associated real product page. */
export const loadCompanyDetailBundle = async (
  client: Pick<EnterpriseClient, 'request'>,
  companyId: string,
  signal: AbortSignal
): Promise<CompanyDetailBundle> => {
  const validCompanyId = parseCompanyId(companyId);
  throwIfAborted(signal);
  const detailResponse = await client.request({
    operation: 'company.detail',
    payload: { companyId: validCompanyId },
  });
  throwIfAborted(signal);
  const company = parseCompanyDetail(parseEnterpriseOperationData(detailResponse, 'company.detail'));
  if (!company || company.companyId !== validCompanyId) throw new CompanyDataError('INVALID_RESPONSE');

  // Check again immediately before the dependent request so an aborted detail never starts product.list.
  throwIfAborted(signal);
  const productResponse = await client.request({
    operation: 'product.list',
    payload: { companyId: validCompanyId, pageNum: 1, pageSize: 12 },
  });
  throwIfAborted(signal);
  const products = parseEnterprisePage(
    parseEnterpriseOperationData(productResponse, 'product.list'),
    (value) => {
      const product = parseProduct(value);
      return product?.companyId === validCompanyId ? product : null;
    },
    1,
    12
  );
  if (!products) throw new CompanyDataError('INVALID_RESPONSE');
  return { company, products };
};

/** Controlled company-list loader with stale-response protection and pagination-only data retention. */
export const useCompanyCatalog = (
  client: Pick<EnterpriseClient, 'request'>,
  initial: number | CompanyListQuery = 20
): CompanyCatalogState => {
  const initialQuery = typeof initial === 'number' ? undefined : initial;
  const [filters, setFilters] = useState<CompanyFilters>(() => ({
    keyword: initialQuery?.keyword,
    industry: initialQuery?.industry,
    province: initialQuery?.province,
    city: initialQuery?.city,
    district: initialQuery?.district,
    companyLevel: initialQuery?.companyLevel,
    vip: initialQuery?.vip,
  }));
  const [pagination, setPagination] = useState<CompanyPagination>({
    pageNum: initialQuery?.pageNum ?? 1,
    pageSize: initialQuery?.pageSize ?? (typeof initial === 'number' ? initial : 20),
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
      filters.vip,
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

    void loadCompanyList(client, query, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        dataRef.current = page;
        setData(page);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error) || generation !== requestGenerationRef.current) return;
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

export const useCompanyIndustryOptions = (client: Pick<EnterpriseClient, 'request'>): CompanyIndustryOptionsState => {
  const [data, setData] = useState<EnterpriseIndustryOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<EnterpriseIpcErrorCode | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorCode(null);
    void loadCompanyIndustryOptions(client, controller.signal)
      .then((options) => {
        if (!controller.signal.aborted) setData(options);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setErrorCode(safeErrorCode(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [client, retryGeneration]);

  const retry = useCallback(() => setRetryGeneration((value) => value + 1), []);
  return { data, isLoading, errorCode, retry };
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
    void loadCompanyDetailBundle(client, companyId, controller.signal)
      .then((bundle) => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        setData(bundle);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error) || generation !== requestGenerationRef.current) return;
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
