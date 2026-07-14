import type {
  EnterpriseDashboardDistributionItem,
  EnterpriseIpcErrorCode,
  EnterprisePage,
  EnterpriseProjectDashboard,
  EnterpriseProjectDetail,
  EnterpriseProjectDrillItem,
  EnterpriseProjectSummary,
  ProjectListQuery,
} from '@/common/enterprise/contracts';
import { ENTERPRISE_IPC_ERROR_MESSAGES } from '@/common/enterprise/constants';
import {
  createPlainEnterpriseRecordParser,
  getPlainEnterpriseDataFields,
  isNumericEnterpriseId,
  parseEnterpriseOperationData,
  parseEnterprisePage,
  type EnterpriseDataFieldRule,
} from '@/renderer/pages/enterprise/data/enterpriseDataValidation';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MAX_TEXT_LENGTH = 20_000;
const PROJECT_FILTER_KEYS = [
  'keyword',
  'categoryL1',
  'categoryL2',
  'materialShortName',
  'materialName',
  'province',
  'city',
  'minInvestment',
  'maxInvestment',
] as const;

export type ProjectFilters = {
  keyword?: string;
  categoryL1?: string;
  categoryL2?: string;
  materialShortName?: string;
  materialName?: string;
  province?: string;
  city?: string;
  minInvestment?: number;
  maxInvestment?: number;
};

export type ProjectPagination = Pick<ProjectListQuery, 'pageNum' | 'pageSize'>;

export type ProjectDashboardBundle = {
  dashboard: EnterpriseProjectDashboard;
  drillItems: EnterpriseProjectDrillItem[];
};

export type ProjectCatalogState = {
  query: ProjectListQuery;
  data: EnterprisePage<EnterpriseProjectSummary> | null;
  isLoading: boolean;
  isRetainingData: boolean;
  errorCode: EnterpriseIpcErrorCode | null;
  applyFilters: (filters: ProjectFilters) => void;
  changePage: (pageNum: number, pageSize?: number) => void;
  retry: () => void;
};

export type ProjectDashboardState = {
  data: ProjectDashboardBundle | null;
  isLoading: boolean;
  errorCode: EnterpriseIpcErrorCode | null;
  retry: () => void;
};

export type ProjectDetailState = {
  data: EnterpriseProjectDetail | null;
  isLoading: boolean;
  isInvalidId: boolean;
  errorCode: EnterpriseIpcErrorCode | null;
  retry: () => void;
};

/** Stable renderer-side project failure that never includes backend payloads or identities. */
export class ProjectDataError extends Error {
  declare readonly code: EnterpriseIpcErrorCode;

  constructor(code: EnterpriseIpcErrorCode) {
    super(code);
    this.name = 'ProjectDataError';
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

const normalizeText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const normalizeInvestment = (value: number | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Builds the exact project-list request payload while removing empty or invalid filters. */
export const buildProjectListQuery = (
  filters: Readonly<ProjectFilters>,
  pagination: Readonly<ProjectPagination>
): ProjectListQuery => {
  const query: ProjectListQuery = { pageNum: pagination.pageNum, pageSize: pagination.pageSize };
  for (const key of [
    'keyword',
    'categoryL1',
    'categoryL2',
    'materialShortName',
    'materialName',
    'province',
    'city',
  ] as const) {
    const value = normalizeText(filters[key]);
    if (value) query[key] = value;
  }
  const minInvestment = normalizeInvestment(filters.minInvestment);
  const maxInvestment = normalizeInvestment(filters.maxInvestment);
  if (minInvestment !== undefined) query.minInvestment = minInvestment;
  if (maxInvestment !== undefined) query.maxInvestment = maxInvestment;
  return query;
};

export const createProjectQueryKey = (query: Readonly<ProjectListQuery>): string =>
  JSON.stringify([
    'project.list',
    ...PROJECT_FILTER_KEYS.map((key) => query[key] ?? null),
    query.pageNum,
    query.pageSize,
  ]);

export const isPaginationOnlyProjectQueryChange = (
  previous: Readonly<ProjectListQuery>,
  next: Readonly<ProjectListQuery>
): boolean => {
  const filtersMatch = PROJECT_FILTER_KEYS.every((key) => previous[key] === next[key]);
  return filtersMatch && (previous.pageNum !== next.pageNum || previous.pageSize !== next.pageSize);
};

const PROJECT_SUMMARY_RULES = [
  ['hpInfoId', 'string', true, true],
  ['projectName', 'string', true, true],
  ['constructionUnit', 'string'],
  ['province', 'string'],
  ['city', 'string'],
  ['totalInvestment', 'finiteNumber'],
  ['constructionNature', 'string'],
  ['investmentType', 'string'],
  ['projectNature', 'string'],
  ['publishedAt', 'string'],
  ['constructionPeriod', 'string'],
  ['materialMatch', 'string'],
  ['procurementSummary', 'string'],
] as const satisfies readonly EnterpriseDataFieldRule[];

const PROJECT_DETAIL_RULES = [
  ...PROJECT_SUMMARY_RULES,
  ['contactName', 'string'],
  ['phone', 'string'],
  ['email', 'string'],
  ['address', 'string'],
  ['industry', 'string'],
  ['landArea', 'string'],
  ['buildingArea', 'string'],
  ['greenArea', 'string'],
  ['constructionScale', 'string'],
  ['equipment', 'string'],
  ['materials', 'string'],
  ['projectComposition', 'string'],
  ['sourceUrl', 'string'],
  ['collected', 'boolean'],
  ['followStatus', 'string'],
  ['purchased', 'boolean'],
] as const satisfies readonly EnterpriseDataFieldRule[];

const DISTRIBUTION_RULES = [
  ['label', 'string', true, true],
  ['value', 'finiteNumber', true],
  ['dimension', 'string'],
  ['projectCount', 'finiteNumber'],
] as const satisfies readonly EnterpriseDataFieldRule[];

const DRILL_RULES = [
  ['label', 'string', true, true],
  ['dimension', 'string', true, true],
  ['categoryL1', 'string'],
  ['categoryL2', 'string'],
  ['materialShortName', 'string'],
  ['materialName', 'string'],
  ['categoryL2Count', 'finiteNumber'],
  ['materialShortNameCount', 'finiteNumber'],
  ['materialNameCount', 'finiteNumber'],
  ['projectCount', 'finiteNumber', true],
] as const satisfies readonly EnterpriseDataFieldRule[];

const parseSummaryRecord = createPlainEnterpriseRecordParser<EnterpriseProjectSummary>(PROJECT_SUMMARY_RULES);
const parseDetailRecord = createPlainEnterpriseRecordParser<EnterpriseProjectDetail>(PROJECT_DETAIL_RULES);
const parseDistributionRecord =
  createPlainEnterpriseRecordParser<EnterpriseDashboardDistributionItem>(DISTRIBUTION_RULES);
const parseDrillRecord = createPlainEnterpriseRecordParser<EnterpriseProjectDrillItem>(DRILL_RULES);

const hasOnlyBoundedText = (value: object): boolean => {
  const fields = getPlainEnterpriseDataFields(value);
  if (!fields) return false;
  return [...fields.values()].every((field) => typeof field !== 'string' || field.length <= MAX_TEXT_LENGTH);
};

const isNonNegativeInteger = (value: number | undefined): boolean =>
  value === undefined || (Number.isSafeInteger(value) && value >= 0);

const parseProjectSummary = (value: unknown): EnterpriseProjectSummary | null => {
  const project = parseSummaryRecord(value);
  if (
    !project ||
    !isNumericEnterpriseId(project.hpInfoId) ||
    !hasOnlyBoundedText(project) ||
    (project.totalInvestment !== undefined && project.totalInvestment < 0)
  ) {
    return null;
  }
  return project;
};

const isMaskedPhone = (value: string): boolean => /^\*{1,}$/.test(value) || value.endsWith('****');

const parseProjectDetailRecord = (value: unknown): EnterpriseProjectDetail | null => {
  const project = parseDetailRecord(value);
  if (
    !project ||
    !isNumericEnterpriseId(project.hpInfoId) ||
    !hasOnlyBoundedText(project) ||
    (project.totalInvestment !== undefined && project.totalInvestment < 0) ||
    (project.phone !== undefined && project.purchased !== true && !isMaskedPhone(project.phone))
  ) {
    return null;
  }
  return project;
};

const parseOwnArray = <T>(value: unknown, parseItem: (item: unknown) => T | null): T[] | null => {
  if (!Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (!Number.isSafeInteger(length) || length < 0 || Reflect.ownKeys(value).length !== length + 1) return null;
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

const parseDistribution = (value: unknown): EnterpriseDashboardDistributionItem | null => {
  const item = parseDistributionRecord(value);
  if (
    !item ||
    !hasOnlyBoundedText(item) ||
    !isNonNegativeInteger(item.value) ||
    !isNonNegativeInteger(item.projectCount)
  ) {
    return null;
  }
  return item;
};

const parseDashboard = (value: unknown): EnterpriseProjectDashboard | null => {
  const fields = getPlainEnterpriseDataFields(value);
  const requiredKeys = [
    'projectCount',
    'categoryL1Count',
    'categoryL2Count',
    'materialShortNameCount',
    'materialNameCount',
    'investmentTotalYi',
    'regionDistribution',
    'budgetDistribution',
    'categoryDistribution',
    'materialTop',
  ];
  const allowedKeys = new Set([...requiredKeys, 'runId', 'updatedAt']);
  if (
    !fields ||
    !requiredKeys.every((key) => fields.has(key)) ||
    [...fields.keys()].some((key) => !allowedKeys.has(key))
  ) {
    return null;
  }
  const runId = fields.get('runId');
  const updatedAt = fields.get('updatedAt');
  const projectCount = fields.get('projectCount');
  const categoryL1Count = fields.get('categoryL1Count');
  const categoryL2Count = fields.get('categoryL2Count');
  const materialShortNameCount = fields.get('materialShortNameCount');
  const materialNameCount = fields.get('materialNameCount');
  const investmentTotalYi = fields.get('investmentTotalYi');
  const regionDistribution = parseOwnArray(fields.get('regionDistribution'), parseDistribution);
  const budgetDistribution = parseOwnArray(fields.get('budgetDistribution'), parseDistribution);
  const categoryDistribution = parseOwnArray(fields.get('categoryDistribution'), parseDistribution);
  const materialTop = parseOwnArray(fields.get('materialTop'), parseDistribution);
  if (
    (runId !== undefined && (typeof runId !== 'string' || runId.length > MAX_TEXT_LENGTH)) ||
    (updatedAt !== undefined && (typeof updatedAt !== 'string' || updatedAt.length > MAX_TEXT_LENGTH)) ||
    typeof projectCount !== 'number' ||
    typeof categoryL1Count !== 'number' ||
    typeof categoryL2Count !== 'number' ||
    typeof materialShortNameCount !== 'number' ||
    typeof materialNameCount !== 'number' ||
    typeof investmentTotalYi !== 'number' ||
    !isNonNegativeInteger(projectCount) ||
    !isNonNegativeInteger(categoryL1Count) ||
    !isNonNegativeInteger(categoryL2Count) ||
    !isNonNegativeInteger(materialShortNameCount) ||
    !isNonNegativeInteger(materialNameCount) ||
    !Number.isFinite(investmentTotalYi) ||
    investmentTotalYi < 0 ||
    !regionDistribution ||
    !budgetDistribution ||
    !categoryDistribution ||
    !materialTop
  ) {
    return null;
  }
  const normalizedRunId = typeof runId === 'string' ? runId : undefined;
  const normalizedUpdatedAt = typeof updatedAt === 'string' ? updatedAt : undefined;
  return {
    ...(normalizedRunId === undefined ? {} : { runId: normalizedRunId }),
    ...(normalizedUpdatedAt === undefined ? {} : { updatedAt: normalizedUpdatedAt }),
    projectCount,
    categoryL1Count,
    categoryL2Count,
    materialShortNameCount,
    materialNameCount,
    investmentTotalYi,
    regionDistribution,
    budgetDistribution,
    categoryDistribution,
    materialTop,
  };
};

const parseDrillItem = (value: unknown): EnterpriseProjectDrillItem | null => {
  const item = parseDrillRecord(value);
  if (
    !item ||
    !hasOnlyBoundedText(item) ||
    !['l1', 'l2', 'shortName', 'materialName'].includes(item.dimension) ||
    !isNonNegativeInteger(item.projectCount) ||
    !isNonNegativeInteger(item.categoryL2Count) ||
    !isNonNegativeInteger(item.materialShortNameCount) ||
    !isNonNegativeInteger(item.materialNameCount)
  ) {
    return null;
  }
  return item;
};

/** Loads and validates the live dashboard followed by its top-level procurement drill. */
export const loadProjectDashboard = async (
  client: Pick<EnterpriseClient, 'request'>,
  signal: AbortSignal
): Promise<ProjectDashboardBundle> => {
  throwIfAborted(signal);
  const dashboardResponse = await client.request({ operation: 'project.dashboard', payload: {} });
  throwIfAborted(signal);
  const dashboard = parseDashboard(parseEnterpriseOperationData(dashboardResponse, 'project.dashboard'));
  if (!dashboard) throw new ProjectDataError('INVALID_RESPONSE');

  const drillResponse = await client.request({
    operation: 'project.drill',
    payload: { level: 'l1', ...(dashboard.runId ? { runId: dashboard.runId } : {}), minProjectCount: 1 },
  });
  throwIfAborted(signal);
  const drillItems = parseOwnArray(parseEnterpriseOperationData(drillResponse, 'project.drill'), parseDrillItem);
  if (!drillItems) throw new ProjectDataError('INVALID_RESPONSE');
  return { dashboard, drillItems };
};

/** Loads a validated real project page; malformed data fails closed without fallback records. */
export const loadProjectList = async (
  client: Pick<EnterpriseClient, 'request'>,
  query: ProjectListQuery,
  signal: AbortSignal
): Promise<EnterprisePage<EnterpriseProjectSummary>> => {
  throwIfAborted(signal);
  const response = await client.request({ operation: 'project.list', payload: query });
  throwIfAborted(signal);
  const page = parseEnterprisePage(
    parseEnterpriseOperationData(response, 'project.list'),
    parseProjectSummary,
    query.pageNum,
    query.pageSize
  );
  if (!page) throw new ProjectDataError('INVALID_RESPONSE');
  return page;
};

/** Parses the numeric Oracle project identity accepted by the current detail route. */
export const parseProjectId = (value: string | undefined): string => {
  if (!isNumericEnterpriseId(value)) throw new ProjectDataError('INVALID_REQUEST');
  return value;
};

/** Loads an exact project detail and enforces the final renderer permission boundary. */
export const loadProjectDetail = async (
  client: Pick<EnterpriseClient, 'request'>,
  hpInfoId: string,
  signal: AbortSignal
): Promise<EnterpriseProjectDetail> => {
  const validId = parseProjectId(hpInfoId);
  throwIfAborted(signal);
  const response = await client.request({ operation: 'project.detail', payload: { hpInfoId: validId } });
  throwIfAborted(signal);
  const detail = parseProjectDetailRecord(parseEnterpriseOperationData(response, 'project.detail'));
  if (!detail || detail.hpInfoId !== validId) throw new ProjectDataError('INVALID_RESPONSE');
  return detail;
};

export const useProjectDashboard = (client: Pick<EnterpriseClient, 'request'>): ProjectDashboardState => {
  const [data, setData] = useState<ProjectDashboardBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<EnterpriseIpcErrorCode | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    setData(null);
    setErrorCode(null);
    setIsLoading(true);
    void loadProjectDashboard(client, controller.signal)
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
  }, [client, retryGeneration]);

  const retry = useCallback(() => setRetryGeneration((value) => value + 1), []);
  return { data, isLoading, errorCode, retry };
};

export const useProjectCatalog = (
  client: Pick<EnterpriseClient, 'request'>,
  initialPageSize = 20
): ProjectCatalogState => {
  const [filters, setFilters] = useState<ProjectFilters>({});
  const [pagination, setPagination] = useState<ProjectPagination>({ pageNum: 1, pageSize: initialPageSize });
  const [data, setData] = useState<EnterprisePage<EnterpriseProjectSummary> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetainingData, setIsRetainingData] = useState(false);
  const [errorCode, setErrorCode] = useState<EnterpriseIpcErrorCode | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestGenerationRef = useRef(0);
  const previousQueryRef = useRef<ProjectListQuery | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const query = useMemo(
    () => buildProjectListQuery(filters, pagination),
    [
      filters.keyword,
      filters.categoryL1,
      filters.categoryL2,
      filters.materialShortName,
      filters.materialName,
      filters.province,
      filters.city,
      filters.minInvestment,
      filters.maxInvestment,
      pagination.pageNum,
      pagination.pageSize,
    ]
  );
  const queryKey = createProjectQueryKey(query);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    const previousQuery = previousQueryRef.current;
    const retainData =
      previousQuery !== null && dataRef.current !== null && isPaginationOnlyProjectQueryChange(previousQuery, query);
    previousQueryRef.current = query;
    if (!retainData) {
      dataRef.current = null;
      setData(null);
    }
    setIsRetainingData(retainData);
    setIsLoading(true);
    setErrorCode(null);

    void loadProjectList(client, query, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        dataRef.current = page;
        setData(page);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error) || generation !== requestGenerationRef.current) return;
        dataRef.current = null;
        setData(null);
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

  const applyFilters = useCallback((nextFilters: ProjectFilters) => {
    setFilters({ ...nextFilters });
    setPagination((current) => ({ ...current, pageNum: 1 }));
  }, []);
  const changePage = useCallback((pageNum: number, pageSize?: number) => {
    setPagination((current) => ({ pageNum, pageSize: pageSize ?? current.pageSize }));
  }, []);
  const retry = useCallback(() => setRetryGeneration((value) => value + 1), []);
  return { query, data, isLoading, isRetainingData, errorCode, applyFilters, changePage, retry };
};

export const useProjectDetail = (
  client: Pick<EnterpriseClient, 'request'>,
  routeProjectId: string | undefined
): ProjectDetailState => {
  const hpInfoId = useMemo(() => {
    try {
      return parseProjectId(routeProjectId);
    } catch {
      return null;
    }
  }, [routeProjectId]);
  const [data, setData] = useState<EnterpriseProjectDetail | null>(null);
  const [isLoading, setIsLoading] = useState(hpInfoId !== null);
  const [errorCode, setErrorCode] = useState<EnterpriseIpcErrorCode | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    setData(null);
    setErrorCode(null);
    if (!hpInfoId) {
      setIsLoading(false);
      return () => controller.abort();
    }
    setIsLoading(true);
    void loadProjectDetail(client, hpInfoId, controller.signal)
      .then((project) => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        setData(project);
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
  }, [client, hpInfoId, retryGeneration]);

  const retry = useCallback(() => setRetryGeneration((value) => value + 1), []);
  return { data, isLoading, isInvalidId: hpInfoId === null, errorCode, retry };
};
