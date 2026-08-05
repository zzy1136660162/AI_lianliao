import type {
  CatalogAssistantCandidate,
  CatalogAssistantFilters,
  CatalogAssistantPlan,
  CatalogAssistantScopeDigestItem,
  CatalogAssistantTrustedResult,
  CatalogEntityType,
} from '@/common/enterprise/catalog-assistant/contracts';
import type {
  EnterpriseCompanySummary,
  EnterprisePage,
  EnterpriseProductSummary,
  EnterpriseProjectSummary,
} from '@/common/enterprise/contracts';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

export type CatalogBusinessItem = EnterpriseCompanySummary | EnterpriseProductSummary | EnterpriseProjectSummary;

export type CatalogAdapterRuntime = {
  client: EnterpriseClient;
  assertActive: () => void;
};

/**
 * Isolates every resource-specific operation from the orchestration state machine.
 * Model output is never rendered directly: adapters always return objects received
 * from an allowlisted business API.
 */
export type CatalogResourceAdapter = {
  entityType: CatalogEntityType;
  progressMessageKey: string;
  buildSearchPlans: (runtime: CatalogAdapterRuntime, plan: CatalogAssistantPlan) => Promise<CatalogAssistantPlan[]>;
  searchPage: (
    runtime: CatalogAdapterRuntime,
    plan: CatalogAssistantPlan,
    pageNum: number
  ) => Promise<EnterprisePage<CatalogBusinessItem>>;
  getId: (item: CatalogBusinessItem) => string;
  toCandidate: (item: CatalogBusinessItem) => CatalogAssistantCandidate;
  matchesCurrent: (result: CatalogAssistantTrustedResult, filters: CatalogAssistantFilters) => boolean;
  toTrustedResult: (item: CatalogBusinessItem, reason: string) => CatalogAssistantTrustedResult;
  hydrateSelected: (
    runtime: CatalogAdapterRuntime,
    results: CatalogAssistantTrustedResult[]
  ) => Promise<CatalogAssistantTrustedResult[]>;
  toScopeDigest: (result: CatalogAssistantTrustedResult) => CatalogAssistantScopeDigestItem;
};
