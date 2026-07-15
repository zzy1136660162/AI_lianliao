import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ENTERPRISE_IPC_ERROR_MESSAGES } from '@/common/enterprise/constants';
import type {
  EnterpriseCompanySummary,
  EnterpriseIpcErrorCode,
  EnterpriseProductSummary,
  EnterpriseProjectSummary,
} from '@/common/enterprise/contracts';
import { loadCompanyList } from '@/renderer/pages/enterprise/companies/companyData';
import { loadProductList } from '@/renderer/pages/enterprise/products/productData';
import { loadProjectList } from '@/renderer/pages/enterprise/projects/projectData';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

export type DashboardSearchGroup<T> = {
  items: T[];
  errorCode: EnterpriseIpcErrorCode | null;
};

export type DashboardSearchResult = {
  query: string;
  companies: DashboardSearchGroup<EnterpriseCompanySummary>;
  products: DashboardSearchGroup<EnterpriseProductSummary>;
  projects: DashboardSearchGroup<EnterpriseProjectSummary>;
  errorCode: EnterpriseIpcErrorCode | null;
};

export type DashboardSearchState = {
  normalizedQuery: string;
  result: DashboardSearchResult | null;
  isLoading: boolean;
  retry: () => void;
};

const DASHBOARD_SEARCH_RESULT_LIMIT = 5;

/** Stable renderer search error that never carries remote response text. */
export class DashboardDataError extends Error {
  declare readonly code: EnterpriseIpcErrorCode;

  constructor(code: EnterpriseIpcErrorCode) {
    super(code);
    this.name = 'DashboardDataError';
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
    const descriptor = Object.getOwnPropertyDescriptor(error, 'name');
    return descriptor?.value === 'AbortError';
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

/** Normalizes user input before it can become a cross-domain search request. */
export const normalizeDashboardSearchQuery = (query: string): string => query.trim();

/** A valid unified-search term contains at least two Unicode code points. */
export const isDashboardSearchQueryReady = (query: string): boolean =>
  Array.from(normalizeDashboardSearchQuery(query)).length >= 2;

const settledGroup = <T>(
  result: PromiseSettledResult<{ list: T[] }>,
  getBusinessId: (item: T) => string
): DashboardSearchGroup<T> => {
  if (result.status === 'rejected') return { items: [], errorCode: safeErrorCode(result.reason) };

  const businessIds = new Set<string>();
  const items: T[] = [];
  for (const item of result.value.list) {
    const businessId = getBusinessId(item);
    if (businessIds.has(businessId)) continue;
    businessIds.add(businessId);
    items.push(item);
    if (items.length === DASHBOARD_SEARCH_RESULT_LIMIT) break;
  }
  return { items, errorCode: null };
};

/** Runs the three strict catalog loaders concurrently and preserves independently successful groups. */
export const loadDashboardSearch = async (
  client: Pick<EnterpriseClient, 'request'>,
  rawQuery: string,
  signal: AbortSignal
): Promise<DashboardSearchResult> => {
  const query = normalizeDashboardSearchQuery(rawQuery);
  if (!isDashboardSearchQueryReady(query)) throw new DashboardDataError('INVALID_REQUEST');
  throwIfAborted(signal);

  const [companyResult, productResult, projectResult] = await Promise.allSettled([
    loadCompanyList(client, { keyword: query, pageNum: 1, pageSize: 5 }, signal),
    loadProductList(client, { keyword: query, pageNum: 1, pageSize: 5 }, signal),
    loadProjectList(client, { keyword: query, pageNum: 1, pageSize: 5 }, signal),
  ]);
  throwIfAborted(signal);

  const companies = settledGroup(companyResult, (company) => company.companyId);
  const products = settledGroup(productResult, (product) => product.productId);
  const projects = settledGroup(projectResult, (project) => project.hpInfoId);
  const allFailed = [companies, products, projects].every((group) => group.errorCode !== null);
  return {
    query,
    companies,
    products,
    projects,
    errorCode: allFailed ? 'REQUEST_FAILED' : null,
  };
};

/** Debounces unified search and prevents replaced or unmounted requests from publishing state. */
export const useDashboardSearch = (
  client: Pick<EnterpriseClient, 'request'>,
  rawQuery: string,
  debounceMs = 300
): DashboardSearchState => {
  const normalizedQuery = useMemo(() => normalizeDashboardSearchQuery(rawQuery), [rawQuery]);
  const [result, setResult] = useState<DashboardSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    setResult(null);

    if (!isDashboardSearchQueryReady(normalizedQuery)) {
      setIsLoading(false);
      return () => {
        controller.abort();
        if (generation === requestGenerationRef.current) requestGenerationRef.current += 1;
      };
    }

    setIsLoading(true);
    timer = setTimeout(
      () => {
        timer = null;
        void loadDashboardSearch(client, normalizedQuery, controller.signal)
          .then((nextResult) => {
            if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
            setResult(nextResult);
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted || isAbortError(error) || generation !== requestGenerationRef.current) return;
            setResult({
              query: normalizedQuery,
              companies: { items: [], errorCode: 'REQUEST_FAILED' },
              products: { items: [], errorCode: 'REQUEST_FAILED' },
              projects: { items: [], errorCode: 'REQUEST_FAILED' },
              errorCode: 'REQUEST_FAILED',
            });
          })
          .finally(() => {
            if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
            setIsLoading(false);
          });
      },
      Math.max(0, debounceMs)
    );

    return () => {
      if (timer !== null) clearTimeout(timer);
      controller.abort();
      if (generation === requestGenerationRef.current) requestGenerationRef.current += 1;
    };
  }, [client, debounceMs, normalizedQuery, retryGeneration]);

  const retry = useCallback(() => setRetryGeneration((value) => value + 1), []);
  return { normalizedQuery, result, isLoading, retry };
};
