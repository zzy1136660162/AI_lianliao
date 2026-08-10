import type {
  EnterpriseIpcErrorCode,
  EnterprisePage,
  EnterpriseProductDetail,
  EnterpriseProductSummary,
  ProductListQuery,
} from '@/common/enterprise/contracts';
import { ENTERPRISE_IPC_ERROR_MESSAGES } from '@/common/enterprise/constants';
import {
  createPlainEnterpriseRecordParser,
  isNumericEnterpriseId,
  parseEnterpriseOperationData,
  parseEnterprisePage,
  parseSafeEnterpriseImageUrl,
  type EnterpriseDataFieldRule,
} from '@/renderer/services/enterprise/enterpriseDataValidation';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ProductFilters = Pick<ProductListQuery, 'keyword' | 'industry' | 'province' | 'city' | 'district'>;
export type ProductPagination = Pick<ProductListQuery, 'pageNum' | 'pageSize'>;

export type ProductCatalogState = {
  query: ProductListQuery;
  data: EnterprisePage<EnterpriseProductSummary> | null;
  isLoading: boolean;
  isRetainingData: boolean;
  errorCode: EnterpriseIpcErrorCode | null;
  applyFilters: (filters: ProductFilters) => void;
  changePage: (pageNum: number, pageSize?: number) => void;
  retry: () => void;
};

export type ProductDetailState = {
  data: EnterpriseProductDetail | null;
  isLoading: boolean;
  isInvalidId: boolean;
  errorCode: EnterpriseIpcErrorCode | null;
  retry: () => void;
};

const PRODUCT_FILTER_KEYS = ['keyword', 'industry', 'province', 'city', 'district'] as const;

const PRODUCT_FIELD_RULES = [
  ['productId', 'string', true, true],
  ['name', 'string', true],
  ['companyId', 'string', true, true],
  ['imageUrl', 'string'],
  ['summary', 'string'],
  ['sort', 'finiteNumber'],
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

const parseProductRecord = createPlainEnterpriseRecordParser<EnterpriseProductDetail>(PRODUCT_FIELD_RULES);

const normalizeText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

/** Stable renderer failure that carries no backend text or identifiers. */
export class ProductDataError extends Error {
  declare readonly code: EnterpriseIpcErrorCode;

  constructor(code: EnterpriseIpcErrorCode) {
    super(code);
    this.name = 'ProductDataError';
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
    if (typeof DOMException !== 'undefined' && error instanceof DOMException) return error.name === 'AbortError';
    const descriptor = Object.getOwnPropertyDescriptor(error, 'name');
    return (
      descriptor !== undefined &&
      Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
      descriptor.value === 'AbortError'
    );
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

export const buildProductListQuery = (
  filters: Readonly<ProductFilters>,
  pagination: Readonly<ProductPagination>
): ProductListQuery => {
  const query: ProductListQuery = { pageNum: pagination.pageNum, pageSize: pagination.pageSize };
  for (const key of PRODUCT_FILTER_KEYS) {
    const value = normalizeText(filters[key]);
    if (value) query[key] = value;
  }
  return query;
};

export const createProductQueryKey = (query: Readonly<ProductListQuery>): string =>
  JSON.stringify([
    'product.list',
    query.keyword ?? null,
    query.industry ?? null,
    query.province ?? null,
    query.city ?? null,
    query.district ?? null,
    query.pageNum,
    query.pageSize,
  ]);

export const isPaginationOnlyProductQueryChange = (
  previous: Readonly<ProductListQuery>,
  next: Readonly<ProductListQuery>
): boolean =>
  PRODUCT_FILTER_KEYS.every((key) => previous[key] === next[key]) &&
  (previous.pageNum !== next.pageNum || previous.pageSize !== next.pageSize);

export const parseProductId = (value: string | undefined): string => {
  if (!isNumericEnterpriseId(value)) throw new ProductDataError('INVALID_REQUEST');
  return value;
};

export const parseSafeProductImageUrl = parseSafeEnterpriseImageUrl;

const parseVerifiedProduct = (value: unknown): EnterpriseProductDetail | null => {
  const product = parseProductRecord(value);
  if (!product || !isNumericEnterpriseId(product.productId) || !isNumericEnterpriseId(product.companyId)) return null;
  return product;
};

export const loadProductList = async (
  client: Pick<EnterpriseClient, 'request'>,
  query: ProductListQuery,
  signal: AbortSignal
): Promise<EnterprisePage<EnterpriseProductSummary>> => {
  throwIfAborted(signal);
  const response = await client.request({ operation: 'product.list', payload: query });
  throwIfAborted(signal);
  const page = parseEnterprisePage(
    parseEnterpriseOperationData(response, 'product.list'),
    parseVerifiedProduct,
    query.pageNum,
    query.pageSize
  );
  if (!page) throw new ProductDataError('INVALID_RESPONSE');
  return page;
};

export const loadProductDetail = async (
  client: Pick<EnterpriseClient, 'request'>,
  routeProductId: string | undefined,
  signal: AbortSignal
): Promise<EnterpriseProductDetail> => {
  const productId = parseProductId(routeProductId);
  throwIfAborted(signal);
  const response = await client.request({ operation: 'product.detail', payload: { productId } });
  throwIfAborted(signal);
  const product = parseVerifiedProduct(parseEnterpriseOperationData(response, 'product.detail'));
  if (!product || product.productId !== productId) throw new ProductDataError('INVALID_RESPONSE');
  return product;
};

export const useProductCatalog = (
  client: Pick<EnterpriseClient, 'request'>,
  initial: number | ProductListQuery = 20
): ProductCatalogState => {
  const initialQuery = typeof initial === 'number' ? undefined : initial;
  const [filters, setFilters] = useState<ProductFilters>(() => ({
    keyword: initialQuery?.keyword,
    industry: initialQuery?.industry,
    province: initialQuery?.province,
    city: initialQuery?.city,
    district: initialQuery?.district,
  }));
  const [pagination, setPagination] = useState<ProductPagination>({
    pageNum: initialQuery?.pageNum ?? 1,
    pageSize: initialQuery?.pageSize ?? (typeof initial === 'number' ? initial : 20),
  });
  const [data, setData] = useState<EnterprisePage<EnterpriseProductSummary> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetainingData, setIsRetainingData] = useState(false);
  const [errorCode, setErrorCode] = useState<EnterpriseIpcErrorCode | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestGenerationRef = useRef(0);
  const previousQueryRef = useRef<ProductListQuery | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const query = useMemo(
    () => buildProductListQuery(filters, pagination),
    [
      filters.keyword,
      filters.industry,
      filters.province,
      filters.city,
      filters.district,
      pagination.pageNum,
      pagination.pageSize,
    ]
  );
  const queryKey = createProductQueryKey(query);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    const previousQuery = previousQueryRef.current;
    const retainData =
      previousQuery !== null && dataRef.current !== null && isPaginationOnlyProductQueryChange(previousQuery, query);
    previousQueryRef.current = query;
    if (!retainData) {
      dataRef.current = null;
      setData(null);
    }
    setIsRetainingData(retainData);
    setIsLoading(true);
    setErrorCode(null);

    void loadProductList(client, query, controller.signal)
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

  const applyFilters = useCallback((nextFilters: ProductFilters) => {
    setFilters({ ...nextFilters });
    setPagination((current) => ({ ...current, pageNum: 1 }));
  }, []);
  const changePage = useCallback((pageNum: number, pageSize?: number) => {
    setPagination((current) => ({ pageNum, pageSize: pageSize ?? current.pageSize }));
  }, []);
  const retry = useCallback(() => setRetryGeneration((value) => value + 1), []);
  return { query, data, isLoading, isRetainingData, errorCode, applyFilters, changePage, retry };
};

export const useProductDetail = (
  client: Pick<EnterpriseClient, 'request'>,
  routeProductId: string | undefined
): ProductDetailState => {
  const productId = useMemo(() => {
    try {
      return parseProductId(routeProductId);
    } catch {
      return null;
    }
  }, [routeProductId]);
  const [data, setData] = useState<EnterpriseProductDetail | null>(null);
  const [isLoading, setIsLoading] = useState(productId !== null);
  const [errorCode, setErrorCode] = useState<EnterpriseIpcErrorCode | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    setData(null);
    setErrorCode(null);
    if (!productId) {
      setIsLoading(false);
      return () => controller.abort();
    }
    setIsLoading(true);
    void loadProductDetail(client, productId, controller.signal)
      .then((product) => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        setData(product);
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
  }, [client, productId, retryGeneration]);

  const retry = useCallback(() => setRetryGeneration((value) => value + 1), []);
  return { data, isLoading, isInvalidId: productId === null, errorCode, retry };
};
