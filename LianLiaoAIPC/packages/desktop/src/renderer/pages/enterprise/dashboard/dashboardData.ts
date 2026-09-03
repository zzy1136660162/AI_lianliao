import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ENTERPRISE_IPC_ERROR_MESSAGES } from '@/common/enterprise/constants';
import type {
  EnterpriseDemandSummary,
  EnterpriseIpcErrorCode,
  EnterpriseProjectSummary,
} from '@/common/enterprise/contracts';
import type { UnifiedResourceType, UnifiedSearchItem } from '@/common/enterprise/unified-search/contracts';
import { loadProjectList } from '@/renderer/pages/enterprise/projects/projectData';
import { loadDemandList } from '@/renderer/pages/enterprise/supplyDemand/supplyDemandData';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

export type DashboardSearchGroup = {
  items: UnifiedSearchItem[];
  errorCode: EnterpriseIpcErrorCode | null;
};

export type DashboardSearchResult = {
  query: string;
  companies: DashboardSearchGroup;
  products: DashboardSearchGroup;
  projects: DashboardSearchGroup;
  errorCode: EnterpriseIpcErrorCode | null;
};

export type DashboardSearchState = {
  normalizedQuery: string;
  result: DashboardSearchResult | null;
  isLoading: boolean;
  retry: () => void;
};

const DASHBOARD_SEARCH_RESULT_LIMIT = 5;
const DASHBOARD_ACTIVITY_REQUEST_LIMIT = 6;
const DASHBOARD_ACTIVITY_VISIBLE_LIMIT = 3;

export type DashboardActivitySource<T> = {
  items: T[];
  isLoading: boolean;
  errorCode: EnterpriseIpcErrorCode | null;
  retry: () => void;
};

export type DashboardActivityState = {
  demands: DashboardActivitySource<EnterpriseDemandSummary>;
  projects: DashboardActivitySource<EnterpriseProjectSummary>;
};

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
    return Object.getOwnPropertyDescriptor(error, 'name')?.value === 'AbortError';
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

const publishedAtTimestamp = (value: string | undefined): number => {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const latestPublished = <T extends { publishedAt?: string }>(items: T[]): T[] =>
  items
    .toSorted((left, right) => publishedAtTimestamp(right.publishedAt) - publishedAtTimestamp(left.publishedAt))
    .slice(0, DASHBOARD_ACTIVITY_VISIBLE_LIMIT);

/** Fetches a slightly wider first page, then presents the three newest verified orders. */
export const loadDashboardDemandActivity = async (
  client: Pick<EnterpriseClient, 'request'>,
  signal: AbortSignal
): Promise<EnterpriseDemandSummary[]> => {
  const page = await loadDemandList(client, { pageNum: 1, pageSize: DASHBOARD_ACTIVITY_REQUEST_LIMIT }, signal);
  return latestPublished(page.list);
};

/** Keeps protected project summaries at the list boundary; names are still masked by the renderer. */
export const loadDashboardProjectActivity = async (
  client: Pick<EnterpriseClient, 'request'>,
  signal: AbortSignal
): Promise<EnterpriseProjectSummary[]> => {
  const page = await loadProjectList(client, { pageNum: 1, pageSize: DASHBOARD_ACTIVITY_REQUEST_LIMIT }, signal);
  return latestPublished(page.list);
};

/** Normalizes user input before it can become a cross-domain search request. */
export const normalizeDashboardSearchQuery = (query: string): string => query.trim().replace(/\s+/g, ' ');

/** A valid unified-search term contains at least two Unicode code points. */
export const isDashboardSearchQueryReady = (query: string): boolean =>
  Array.from(normalizeDashboardSearchQuery(query)).length >= 2;

const groupItems = (items: UnifiedSearchItem[], resourceType: UnifiedResourceType): DashboardSearchGroup => ({
  items: items.filter((item) => item.resourceType === resourceType).slice(0, DASHBOARD_SEARCH_RESULT_LIMIT),
  errorCode: null,
});

/** Uses the same unified Solr search as H5, through the cloud-api safe adapter. */
export const loadDashboardSearch = async (
  client: Pick<EnterpriseClient, 'request'>,
  rawQuery: string,
  signal: AbortSignal
): Promise<DashboardSearchResult> => {
  const query = normalizeDashboardSearchQuery(rawQuery);
  if (!isDashboardSearchQueryReady(query)) throw new DashboardDataError('INVALID_REQUEST');
  throwIfAborted(signal);

  const response = await client.request({
    operation: 'unified.search',
    payload: {
      keyword: query,
      pageNum: 1,
      pageSize: 15,
      enableGroupTop: true,
      groupTopN: DASHBOARD_SEARCH_RESULT_LIMIT,
    },
  });
  throwIfAborted(signal);
  if (response.operation !== 'unified.search') throw new DashboardDataError('INVALID_RESPONSE');

  return {
    query,
    companies: groupItems(response.data.items, 'COMPANY'),
    products: groupItems(response.data.items, 'PRODUCT'),
    projects: groupItems(response.data.items, 'PROJECT'),
    errorCode: null,
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
      return () => controller.abort();
    }

    setIsLoading(true);
    timer = setTimeout(
      () => {
        timer = null;
        void loadDashboardSearch(client, normalizedQuery, controller.signal)
          .then((nextResult) => {
            if (!controller.signal.aborted && generation === requestGenerationRef.current) setResult(nextResult);
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted || isAbortError(error) || generation !== requestGenerationRef.current) return;
            const errorCode = safeErrorCode(error);
            setResult({
              query: normalizedQuery,
              companies: { items: [], errorCode },
              products: { items: [], errorCode },
              projects: { items: [], errorCode },
              errorCode,
            });
          })
          .finally(() => {
            if (!controller.signal.aborted && generation === requestGenerationRef.current) setIsLoading(false);
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

const useDashboardActivitySource = <T>(
  client: Pick<EnterpriseClient, 'request'>,
  loader: (client: Pick<EnterpriseClient, 'request'>, signal: AbortSignal) => Promise<T[]>
): DashboardActivitySource<T> => {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<EnterpriseIpcErrorCode | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorCode(null);

    void loader(client, controller.signal)
      .then((nextItems) => {
        if (!controller.signal.aborted) setItems(nextItems);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setItems([]);
        setErrorCode(safeErrorCode(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [client, loader, retryGeneration]);

  const retry = useCallback(() => setRetryGeneration((value) => value + 1), []);
  return { items, isLoading, errorCode, retry };
};

/** Loads demand and project activity independently so a single service outage remains isolated. */
export const useDashboardActivity = (client: Pick<EnterpriseClient, 'request'>): DashboardActivityState => ({
  demands: useDashboardActivitySource(client, loadDashboardDemandActivity),
  projects: useDashboardActivitySource(client, loadDashboardProjectActivity),
});
