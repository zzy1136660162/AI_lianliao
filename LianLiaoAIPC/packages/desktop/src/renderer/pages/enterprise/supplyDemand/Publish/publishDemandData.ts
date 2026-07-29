import type {
  EnterpriseDemandAiParseResult,
  EnterpriseDemandPublishPayload,
  EnterpriseDemandPublishResult,
  EnterpriseDemandPublishSchema,
  EnterpriseDemandTypeOption,
} from '@/common/enterprise/contracts';
import { enterpriseRequestSchema } from '@/common/enterprise/schemas';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

const invalidResponse = (): Error => new Error('Invalid demand publishing response');

const checkSignal = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError');
};

export const loadPublishDemandTypes = async (
  client: EnterpriseClient,
  signal?: AbortSignal
): Promise<EnterpriseDemandTypeOption[]> => {
  checkSignal(signal);
  const request = { operation: 'demand.publishTypes', payload: {} } as const;
  if (!enterpriseRequestSchema.safeParse(request).success) throw invalidResponse();
  const response = await client.request(request);
  checkSignal(signal);
  if (response.operation !== 'demand.publishTypes') throw invalidResponse();
  return response.data;
};

export const loadPublishDemandSchema = async (
  client: EnterpriseClient,
  typeId: number,
  signal?: AbortSignal,
  variantCode?: string
): Promise<EnterpriseDemandPublishSchema> => {
  checkSignal(signal);
  const request = {
    operation: 'demand.publishSchema',
    payload: { typeId, ...(variantCode ? { variantCode } : {}) },
  } as const;
  if (!enterpriseRequestSchema.safeParse(request).success) throw invalidResponse();
  const response = await client.request(request);
  checkSignal(signal);
  if (response.operation !== 'demand.publishSchema') throw invalidResponse();
  return response.data;
};

export const parseDemandDescription = async (
  client: EnterpriseClient,
  typeId: number,
  description: string,
  variantCode?: string
): Promise<EnterpriseDemandAiParseResult> => {
  const request = {
    operation: 'demand.aiParse',
    payload: { typeId, description, ...(variantCode ? { variantCode } : {}) },
  } as const;
  if (!enterpriseRequestSchema.safeParse(request).success) throw invalidResponse();
  const response = await client.request(request);
  if (response.operation !== 'demand.aiParse') throw invalidResponse();
  return response.data;
};

export const publishDemand = async (
  client: EnterpriseClient,
  payload: EnterpriseDemandPublishPayload
): Promise<EnterpriseDemandPublishResult> => {
  const request = { operation: 'demand.publish', payload } as const;
  if (!enterpriseRequestSchema.safeParse(request).success) throw invalidResponse();
  const response = await client.request(request);
  if (response.operation !== 'demand.publish') throw invalidResponse();
  return response.data;
};
