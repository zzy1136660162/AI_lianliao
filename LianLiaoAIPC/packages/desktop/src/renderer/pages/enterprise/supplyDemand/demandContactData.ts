import type { DemandContactAccess } from '@/common/enterprise/demand-contact/contracts';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import { parseDemandRouteParams, SupplyDemandDataError } from './supplyDemandData';

const loadContact = async (
  client: Pick<EnterpriseClient, 'request'>,
  operation: 'demand.contactStatus' | 'demand.contactAcquire',
  typeId: number,
  demandId: string
): Promise<DemandContactAccess> => {
  const payload = parseDemandRouteParams(String(typeId), demandId);
  const response = await client.request({ operation, payload });
  if (response.operation !== operation) throw new SupplyDemandDataError('INVALID_RESPONSE');
  return response.data;
};

/** Read-only check of the current account's access to one demand's contact details. */
export const loadDemandContactStatus = (
  client: Pick<EnterpriseClient, 'request'>,
  typeId: number,
  demandId: string
): Promise<DemandContactAccess> => loadContact(client, 'demand.contactStatus', typeId, demandId);

/**
 * Requests a contact unlock. The renderer submits only the demand identity;
 * openId and all membership data are injected/derived by trusted layers.
 */
export const acquireDemandContact = (
  client: Pick<EnterpriseClient, 'request'>,
  typeId: number,
  demandId: string
): Promise<DemandContactAccess> => loadContact(client, 'demand.contactAcquire', typeId, demandId);
