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

const QUERY_FILTER_KEYS = ['keyword', 'industry', 'province', 'city', 'district', 'companyLevel', 'vip'] as const;
const COMPANY_ID_PATTERN = /^[1-9]\d{0,30}$/;
const COMPANY_IMAGE_HOSTS = new Set(['cloud.lslnii.com', 'sjbang.lslnii.com', 'www.lslnii.com']);

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

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number => isNonNegativeInteger(value) && value > 0;

type DataFieldKind = 'string' | 'finiteNumber' | 'boolean';
type DataFieldRule = readonly [key: string, kind: DataFieldKind, required?: true, nonEmpty?: true];

const COMPANY_SUMMARY_FIELD_RULES = [
  ['companyId', 'string', true, true],
  ['name', 'string', true],
  ['shortName', 'string'],
  ['industry', 'string'],
  ['province', 'string'],
  ['city', 'string'],
  ['district', 'string'],
  ['address', 'string'],
  ['businessSummary', 'string'],
  ['updatedAt', 'string'],
  ['legalRepresentative', 'string'],
  ['companyType', 'string'],
  ['companyLevel', 'finiteNumber'],
  ['vip', 'boolean'],
  ['establishedAt', 'string'],
  ['collected', 'boolean'],
] as const satisfies readonly DataFieldRule[];

const COMPANY_DETAIL_FIELD_RULES = [
  ...COMPANY_SUMMARY_FIELD_RULES,
  ['logoUrl', 'string'],
  ['description', 'string'],
  ['unifiedSocialCreditCode', 'string'],
  ['contactName', 'string'],
  ['contactTitle', 'string'],
  ['phone', 'string'],
] as const satisfies readonly DataFieldRule[];

const PRODUCT_FIELD_RULES = [
  ['productId', 'string', true, true],
  ['name', 'string', true],
  ['companyId', 'string', true, true],
  ['imageUrl', 'string'],
  ['summary', 'string'],
  ['industry', 'string'],
  ['companyName', 'string'],
  ['companyIndustry', 'string'],
  ['city', 'string'],
  ['district', 'string'],
  ['address', 'string'],
  ['contactName', 'string'],
  ['phone', 'string'],
  ['collected', 'boolean'],
] as const satisfies readonly DataFieldRule[];

/** Reads plain own data descriptors only; accessors and custom prototypes fail closed without property access. */
const getPlainDataFields = (value: unknown): Map<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const fields = new Map<string, unknown>();
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return null;
      }
      fields.set(key, descriptor.value);
    }
    return fields;
  } catch {
    return null;
  }
};

const matchesFieldKind = (value: unknown, kind: DataFieldKind): boolean => {
  if (kind === 'finiteNumber') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === kind;
};

/** Creates a reusable pure semantic parser that returns a fresh clone-safe record. */
const createPlainRecordParser = <T extends object>(rules: readonly DataFieldRule[]) => {
  const rulesByKey = new Map(rules.map((rule) => [rule[0], rule] as const));
  return (value: unknown): T | null => {
    const fields = getPlainDataFields(value);
    if (!fields) return null;
    const result: Record<string, unknown> = {};

    for (const [key, fieldValue] of fields) {
      const rule = rulesByKey.get(key);
      if (!rule) return null;
      if (fieldValue !== undefined && !matchesFieldKind(fieldValue, rule[1])) return null;
      if (rule[3] === true && fieldValue === '') return null;
      result[key] = fieldValue;
    }
    for (const [key, , required] of rules) {
      if (required === true && (!fields.has(key) || fields.get(key) === undefined)) return null;
    }
    return result as T;
  };
};

const parseCompanySummary = createPlainRecordParser<EnterpriseCompanySummary>(COMPANY_SUMMARY_FIELD_RULES);
const parseCompanyDetail = createPlainRecordParser<EnterpriseCompanyDetail>(COMPANY_DETAIL_FIELD_RULES);
const parseProduct = createPlainRecordParser<EnterpriseProductSummary>(PRODUCT_FIELD_RULES);

const parsePlainDataArray = <T>(value: unknown, parseItem: (item: unknown) => T | null): T[] | null => {
  if (!Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    const length = lengthDescriptor?.value;
    if (!isNonNegativeInteger(length) || Reflect.ownKeys(value).length !== length + 1) return null;

    const result: T[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return null;
      }
      const item = parseItem(descriptor.value);
      if (!item) return null;
      result.push(item);
    }
    return result;
  } catch {
    return null;
  }
};

const parsePage = <T>(
  value: unknown,
  parseItem: (item: unknown) => T | null,
  expectedPageNum: number,
  expectedPageSize: number
): EnterprisePage<T> | null => {
  const fields = getPlainDataFields(value);
  if (
    !fields ||
    fields.size !== 5 ||
    !['list', 'pageNum', 'pageSize', 'pages', 'total'].every((key) => fields.has(key))
  ) {
    return null;
  }
  const list = parsePlainDataArray(fields.get('list'), parseItem);
  const pageNum = fields.get('pageNum');
  const pageSize = fields.get('pageSize');
  const pages = fields.get('pages');
  const total = fields.get('total');
  if (
    !list ||
    pageNum !== expectedPageNum ||
    pageSize !== expectedPageSize ||
    !isPositiveInteger(pageNum) ||
    !isPositiveInteger(pageSize) ||
    !isNonNegativeInteger(pages) ||
    !isNonNegativeInteger(total)
  ) {
    return null;
  }
  return { list, pageNum, pageSize, pages, total };
};

const parseOperationData = (value: unknown, expectedOperation: string): unknown => {
  const fields = getPlainDataFields(value);
  if (!fields || fields.size !== 2 || fields.get('operation') !== expectedOperation || !fields.has('data')) {
    return undefined;
  }
  return fields.get('data');
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
  const page = parsePage(
    parseOperationData(response, 'company.list'),
    parseCompanySummary,
    query.pageNum,
    query.pageSize
  );
  if (!page) throw new CompanyDataError('INVALID_RESPONSE');
  return page;
};

/** Parses the numeric Oracle company identity accepted by the current backend route. */
export const parseCompanyId = (value: string | undefined): string => {
  if (!value || !COMPANY_ID_PATTERN.test(value)) throw new CompanyDataError('INVALID_REQUEST');
  return value;
};

/**
 * Hands Chromium only HTTPS URLs on the exact trusted business-host allowlist.
 * Protocol-relative legacy links are upgraded to HTTPS. Redirect behavior and
 * response size remain responsibilities of those trusted remote hosts; this
 * intentionally does not trust arbitrary `*.lslnii.com` subdomains.
 */
export const parseSafeCompanyImageUrl = (value: string | undefined): string | null => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return null;

  try {
    const parsedUrl = new URL(trimmedValue.startsWith('//') ? `https:${trimmedValue}` : trimmedValue);
    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.port !== '' ||
      parsedUrl.username !== '' ||
      parsedUrl.password !== '' ||
      !COMPANY_IMAGE_HOSTS.has(parsedUrl.hostname)
    ) {
      return null;
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
};

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
  const company = parseCompanyDetail(parseOperationData(detailResponse, 'company.detail'));
  if (!company || company.companyId !== validCompanyId) throw new CompanyDataError('INVALID_RESPONSE');

  // Check again immediately before the dependent request so an aborted detail never starts product.list.
  throwIfAborted(signal);
  const productResponse = await client.request({
    operation: 'product.list',
    payload: { companyId: validCompanyId, pageNum: 1, pageSize: 12 },
  });
  throwIfAborted(signal);
  const products = parsePage(
    parseOperationData(productResponse, 'product.list'),
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
