import type {
  DemandListQuery,
  EnterpriseDemandDetail,
  EnterpriseDemandSummary,
  EnterpriseDemandTypeOption,
  EnterprisePage,
} from '@/common/enterprise/contracts';
import { isEnterpriseEntityId } from '@/common/enterprise/entityId';
import { enterpriseRequestSchema, parseEnterpriseResponse } from '@/common/enterprise/schemas';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { parseSafeEnterpriseImageUrl } from '@/renderer/services/enterprise/enterpriseDataValidation';

export type DemandListFilters = Partial<Omit<DemandListQuery, 'pageNum' | 'pageSize'>>;

/** Stable data-boundary failures that supply-demand pages may handle explicitly. */
export type SupplyDemandDataErrorCode = 'INVALID_FILTER' | 'INVALID_ROUTE' | 'INVALID_RESPONSE' | 'ABORTED';

export class SupplyDemandDataError extends Error {
  constructor(readonly code: SupplyDemandDataErrorCode) {
    super(code);
    this.name = 'SupplyDemandDataError';
  }
}

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new SupplyDemandDataError('ABORTED');
};

/**
 * Trims optional text and validates the complete renderer filter through the
 * same strict request schema used at the Electron IPC boundary.
 */
export const buildDemandListQuery = (
  filters: DemandListFilters,
  page: Pick<DemandListQuery, 'pageNum' | 'pageSize'>
): DemandListQuery => {
  const query: DemandListQuery = { pageNum: page.pageNum, pageSize: page.pageSize };
  const setText = (key: 'keyword' | 'city' | 'district', value: string | undefined): void => {
    const trimmed = value?.trim();
    if (trimmed) query[key] = trimmed;
  };

  setText('keyword', filters.keyword);
  setText('city', filters.city);
  setText('district', filters.district);
  if (filters.typeId !== undefined) query.typeId = filters.typeId;
  if (filters.status !== undefined) query.status = filters.status;

  const parsed = enterpriseRequestSchema.safeParse({ operation: 'demand.list', payload: query });
  if (!parsed.success) throw new SupplyDemandDataError('INVALID_FILTER');
  return query;
};

const invalidResponse = (): SupplyDemandDataError => new SupplyDemandDataError('INVALID_RESPONSE');

export const isDemandImageField = (field: EnterpriseDemandDetail['fields'][number]): boolean =>
  field.valueType.trim().toUpperCase() === 'IMAGE';

/** Extracts unique demand images while enforcing the shared enterprise image allowlist. */
export const parseSafeDemandImageUrls = (fields: EnterpriseDemandDetail['fields']): string[] => {
  const urls = new Set<string>();
  for (const field of fields) {
    if (!isDemandImageField(field)) continue;
    for (const candidate of field.value.split(/[\r\n,，]+/)) {
      const safeUrl = parseSafeEnterpriseImageUrl(candidate);
      if (safeUrl) urls.add(safeUrl);
    }
  }
  return [...urls];
};

/** Loads database-backed public type labels through the exact allowlisted operation. */
export const loadDemandTypes = async (
  client: Pick<EnterpriseClient, 'request'>,
  signal?: AbortSignal
): Promise<EnterpriseDemandTypeOption[]> => {
  throwIfAborted(signal);
  const response = await client.request({ operation: 'demand.types', payload: {} });
  throwIfAborted(signal);
  if (response.operation !== 'demand.types') throw invalidResponse();

  try {
    const parsed = parseEnterpriseResponse('demand.types', response.data);
    if (parsed.operation !== 'demand.types') throw invalidResponse();
    return parsed.data;
  } catch (error) {
    if (error instanceof SupplyDemandDataError) throw error;
    throw invalidResponse();
  }
};

/** Loads and revalidates one public demand page from an injected renderer client. */
export const loadDemandList = async (
  client: Pick<EnterpriseClient, 'request'>,
  query: DemandListQuery,
  signal?: AbortSignal
): Promise<EnterprisePage<EnterpriseDemandSummary>> => {
  if (!enterpriseRequestSchema.safeParse({ operation: 'demand.list', payload: query }).success) {
    throw new SupplyDemandDataError('INVALID_FILTER');
  }

  throwIfAborted(signal);
  const response = await client.request({ operation: 'demand.list', payload: query });
  throwIfAborted(signal);
  if (response.operation !== 'demand.list') throw invalidResponse();

  try {
    const parsed = parseEnterpriseResponse('demand.list', response.data);
    if (
      parsed.operation !== 'demand.list' ||
      parsed.data.pageNum !== query.pageNum ||
      parsed.data.pageSize !== query.pageSize
    ) {
      throw invalidResponse();
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof SupplyDemandDataError) throw error;
    throw invalidResponse();
  }
};

/**
 * Parses the typed detail route without converting the demand ID to Number.
 * Demand IDs may be negative and may exceed JavaScript's safe integer range.
 */
export const parseDemandRouteParams = (
  rawTypeId: string | undefined,
  rawDemandId: string | undefined
): { typeId: number; demandId: string } => {
  if (!rawTypeId || !/^(0|[1-9][0-9]*)$/.test(rawTypeId)) {
    throw new SupplyDemandDataError('INVALID_ROUTE');
  }

  const typeId = Number(rawTypeId);
  if (!Number.isSafeInteger(typeId) || typeId < 0 || !isEnterpriseEntityId(rawDemandId, 31)) {
    throw new SupplyDemandDataError('INVALID_ROUTE');
  }
  return { typeId, demandId: rawDemandId };
};

/** Loads a type-aware detail record and rejects mismatched IDs or type IDs. */
export const loadDemandDetail = async (
  client: Pick<EnterpriseClient, 'request'>,
  typeId: number,
  demandId: string,
  signal?: AbortSignal
): Promise<EnterpriseDemandDetail> => {
  const params = parseDemandRouteParams(String(typeId), demandId);
  throwIfAborted(signal);
  const response = await client.request({ operation: 'demand.detail', payload: params });
  throwIfAborted(signal);
  if (response.operation !== 'demand.detail') throw invalidResponse();

  try {
    const parsed = parseEnterpriseResponse('demand.detail', response.data);
    if (parsed.operation !== 'demand.detail' || parsed.data.demandId !== demandId || parsed.data.typeId !== typeId) {
      throw invalidResponse();
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof SupplyDemandDataError) throw error;
    throw invalidResponse();
  }
};
