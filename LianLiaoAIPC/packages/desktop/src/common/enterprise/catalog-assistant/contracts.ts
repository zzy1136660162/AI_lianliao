import type { EnterpriseCompanyDetail, EnterpriseProductSummary, EnterpriseProjectSummary } from '../contracts';

export const CATALOG_ENTITY_TYPES = ['COMPANY', 'PRODUCT', 'PROJECT'] as const;
export type CatalogEntityType = (typeof CATALOG_ENTITY_TYPES)[number];

export const CATALOG_CONVERSATION_MODES = [
  'NEW_SEARCH',
  'REFINE_CURRENT',
  'NEXT_BATCH',
  'CHANGE_ENTITY',
  'CLARIFY',
] as const;
export type CatalogConversationMode = (typeof CATALOG_CONVERSATION_MODES)[number];

export type CatalogAssistantFilters = {
  keyword?: string;
  industry?: string;
  province?: string;
  city?: string;
  district?: string;
  categoryL1?: string;
  categoryL2?: string;
  materialShortName?: string;
  materialName?: string;
  budgetRange?: string;
  constructionNature?: string;
  investmentType?: string;
  publishedFrom?: string;
  publishedTo?: string;
  minInvestment?: string;
  maxInvestment?: string;
};

/** Public, contact-free facts retained for references such as “其中” or “这里面”. */
export type CatalogAssistantScopeDigestItem = {
  id: string;
  name: string;
  province?: string;
  city?: string;
  district?: string;
  industry?: string;
  investment?: number;
  nature?: string;
  publishedAt?: string;
  summary?: string;
};

export type CatalogAssistantResultScope = {
  scopeId: string;
  entityType: CatalogEntityType;
  filters: CatalogAssistantFilters;
  resultIds: string[];
  resultDigest: CatalogAssistantScopeDigestItem[];
  createdAt: number;
};

/** Limited runtime-only context used for follow-up catalog requests. */
export type CatalogAssistantContext = {
  lastEntityType?: CatalogEntityType;
  lastFilters?: CatalogAssistantFilters;
  lastResultCount?: number;
  lastUserMessage?: string;
  lastSummary?: string;
  currentScope?: CatalogAssistantResultScope;
  nextBatchExcludedIds?: string[];
  /** @deprecated Kept only so an older cloud-api can still accept an in-flight request. */
  excludedIds?: string[];
};

export type CatalogAssistantPlan = {
  mode: CatalogConversationMode;
  entityType?: CatalogEntityType;
  baseScopeId?: string;
  filters: CatalogAssistantFilters;
  resultLimit: number;
  clarification?: string;
  summary: string;
};

export const ENTERPRISE_ASSISTANT_INTENTS = ['CATALOG_SEARCH', 'DEMAND_PUBLISH', 'CLARIFY'] as const;
export type EnterpriseAssistantIntent = (typeof ENTERPRISE_ASSISTANT_INTENTS)[number];

export const ENTERPRISE_ASSISTANT_TARGET_MODULES = ['SUPPLY_DEMAND_PUBLISH'] as const;
export type EnterpriseAssistantTargetModule = (typeof ENTERPRISE_ASSISTANT_TARGET_MODULES)[number];

/** A route proposal is inert until the renderer maps its allowlisted module and the user confirms it. */
export type EnterpriseAssistantRoutePlan = {
  intent: EnterpriseAssistantIntent;
  confidence: number;
  requiresConfirmation: boolean;
  targetModule?: EnterpriseAssistantTargetModule;
  reason: string;
  clarification?: string;
  initialMessage: string;
};

/** Compact public fields sent to the ranking model; contact fields are intentionally absent. */
export type CatalogAssistantCandidate = {
  id: string;
  name: string;
  companyName?: string;
  industry?: string;
  region?: string;
  investment?: number;
  nature?: string;
  publishedAt?: string;
  summary?: string;
};

export type CatalogAssistantRankResult = {
  summary: string;
  items: Array<{ id: string; reason: string }>;
};

export type CatalogAssistantStage =
  | 'IDLE'
  | 'PLANNING'
  | 'CLARIFYING'
  | 'SEARCHING'
  | 'RANKING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type CatalogAssistantProgress = {
  stage: CatalogAssistantStage;
  page?: number;
  maxPages?: number;
  candidateCount?: number;
  messageKey: string;
};

export type CatalogAssistantTrustedResult =
  | {
      entityType: 'COMPANY';
      reason: string;
      item: EnterpriseCompanyDetail;
    }
  | {
      entityType: 'PRODUCT';
      reason: string;
      item: EnterpriseProductSummary;
    }
  | {
      entityType: 'PROJECT';
      reason: string;
      item: EnterpriseProjectSummary;
    };

export type CatalogAssistantRunResult = {
  plan?: CatalogAssistantPlan;
  summary: string;
  clarification?: string;
  results: CatalogAssistantTrustedResult[];
  navigationProposal?: EnterpriseAssistantRoutePlan;
  fallback: boolean;
};
