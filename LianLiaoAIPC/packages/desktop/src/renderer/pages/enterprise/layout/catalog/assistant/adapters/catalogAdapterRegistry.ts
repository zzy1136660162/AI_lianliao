import type {
  CatalogAssistantScopeDigestItem,
  CatalogAssistantTrustedResult,
  CatalogEntityType,
} from '@/common/enterprise/catalog-assistant/contracts';

import { companyCatalogAdapter } from './companyCatalogAdapter';
import { demandCatalogAdapter } from './demandCatalogAdapter';
import { productCatalogAdapter } from './productCatalogAdapter';
import { projectCatalogAdapter } from './projectCatalogAdapter';
import type { CatalogResourceAdapter } from './types';

const ADAPTERS = new Map<CatalogEntityType, CatalogResourceAdapter>([
  ['COMPANY', companyCatalogAdapter],
  ['PRODUCT', productCatalogAdapter],
  ['PROJECT', projectCatalogAdapter],
  ['DEMAND', demandCatalogAdapter],
]);

export const getCatalogResourceAdapter = (entityType: CatalogEntityType): CatalogResourceAdapter => {
  const adapter = ADAPTERS.get(entityType);
  if (!adapter) throw new Error(`catalog resource adapter is not registered: ${entityType}`);
  return adapter;
};

export const getCatalogTrustedResultId = (result: CatalogAssistantTrustedResult): string =>
  getCatalogResourceAdapter(result.entityType).getId(result.item);

export const getCatalogScopeDigest = (result: CatalogAssistantTrustedResult): CatalogAssistantScopeDigestItem =>
  getCatalogResourceAdapter(result.entityType).toScopeDigest(result);
