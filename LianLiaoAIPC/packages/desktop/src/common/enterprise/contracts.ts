export type EnterpriseLoginStatus = 'WAITING' | 'AUTHENTICATED' | 'REGISTER_REQUIRED' | 'EXPIRED';

/** Stable error codes allowed to cross the enterprise Electron IPC boundary. */
export type EnterpriseIpcErrorCode =
  | 'INVALID_BASE_URL'
  | 'INVALID_REQUEST'
  | 'MISSING_CONTEXT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'HTTP'
  | 'INVALID_JSON'
  | 'API_FAILURE'
  | 'INVALID_RESPONSE'
  | 'AUTH_CREATE_FAILED'
  | 'AUTH_POLL_FAILED'
  | 'INVALID_AUTH_RESULT'
  | 'REGISTRATION_INCOMPLETE'
  | 'REGISTRATION_FAILED'
  | 'SESSION_RESTORE_FAILED'
  | 'SESSION_CLEAR_FAILED'
  | 'REQUEST_FAILED'
  | 'UNTRUSTED_SENDER'
  | 'IPC_UNAVAILABLE'
  | 'INVALID_IPC_RESPONSE';

/** Plain structured-clone-safe result returned by every enterprise IPC handler. */
export type EnterpriseIpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: EnterpriseIpcErrorCode; message: string } };

export type EnterpriseUserContext = {
  registered: boolean;
  openId: string;
  userId?: string;
  userName?: string;
  companyId?: string;
  companyName?: string;
  companyLevel?: number;
  remainingDemandQuota?: number;
  roleId?: string;
};

/** User actions persisted through the existing H5 `addgzhLogs`/J_CONTENT_LOGS pipeline. */
export type EnterpriseBehaviorEventType = 'PAGE_VIEW' | 'CONTACT_ACQUIRE' | 'PHONE_DIAL' | 'DEMAND_PUBLISH';

/**
 * Renderer-owned business metadata for one behavior event.
 *
 * Login identity, client platform and operating-system fields are deliberately
 * omitted here: the trusted main process adds them from the active session.
 */
export type EnterpriseBehaviorLogPayload = {
  eventType: EnterpriseBehaviorEventType;
  moduleName: string;
  title: string;
  pagePath: string;
  targetId?: string;
  toCompanyId?: string;
  toCompanyName?: string;
  params?: Record<string, string | number | boolean | null>;
};

export type EnterpriseBehaviorLogResult = {
  recorded: true;
};

export type EnterpriseLoginSession = {
  loginKey: string;
  qrDataUrl: string;
  expiresAt: string;
  pollIntervalMs: number;
};

export type EnterpriseLoginPollResult =
  | { status: 'WAITING' }
  | { status: 'EXPIRED' }
  | { status: 'REGISTER_REQUIRED'; openId: string; registrationUrl: string }
  | { status: 'AUTHENTICATED'; openId: string; userContext: EnterpriseUserContext };

export type EnterprisePage<T> = {
  list: T[];
  pageNum: number;
  pageSize: number;
  pages: number;
  total: number;
};

export type EnterpriseCompanySummary = {
  companyId: string;
  name: string;
  shortName?: string;
  logoUrl?: string;
  industry?: string;
  province?: string;
  city?: string;
  district?: string;
  address?: string;
  businessSummary?: string;
  updatedAt?: string;
  legalRepresentative?: string;
  /** H5 returns the complete display value, for example "5000万元人民币". */
  registeredCapital?: string;
  companyType?: string;
  companyLevel?: number;
  vip?: boolean;
  establishedAt?: string;
  collected?: boolean;
  featuredProducts?: EnterpriseProductSummary[];
  featuredProductCount?: number;
};

export type EnterpriseCompanyDetail = EnterpriseCompanySummary & {
  logoUrl?: string;
  description?: string;
  unifiedSocialCreditCode?: string;
  contactName?: string;
  contactTitle?: string;
  phone?: string;
};

export type EnterpriseProductSummary = {
  productId: string;
  name: string;
  companyId: string;
  imageUrl?: string;
  summary?: string;
  industry?: string;
  companyName?: string;
  companyIndustry?: string;
  province?: string;
  city?: string;
  district?: string;
  address?: string;
  contactName?: string;
  phone?: string;
  companyLevel?: number;
  vip?: boolean;
  collected?: boolean;
};

export type EnterpriseProductDetail = EnterpriseProductSummary;

export type EnterpriseIndustryOption = {
  industry: string;
  companyCount: number;
};

export type EnterpriseDashboardDistributionItem = {
  label: string;
  value: number;
  dimension?: string;
  projectCount?: number;
};

export type EnterpriseProjectDashboard = {
  runId?: string;
  updatedAt?: string;
  projectCount: number;
  categoryL1Count: number;
  categoryL2Count: number;
  materialShortNameCount: number;
  materialNameCount: number;
  investmentTotalYi: number;
  regionDistribution: EnterpriseDashboardDistributionItem[];
  budgetDistribution: EnterpriseDashboardDistributionItem[];
  categoryDistribution: EnterpriseDashboardDistributionItem[];
  materialTop: EnterpriseDashboardDistributionItem[];
};

export type EnterpriseProjectDrillLevel = 'l1' | 'l2' | 'shortName' | 'materialName';

export type EnterpriseProjectDrillItem = {
  label: string;
  dimension: EnterpriseProjectDrillLevel;
  categoryL1?: string;
  categoryL2?: string;
  materialShortName?: string;
  materialName?: string;
  categoryL2Count?: number;
  materialShortNameCount?: number;
  materialNameCount?: number;
  projectCount: number;
};

export type EnterpriseProjectFilterDimension =
  | 'province'
  | 'city'
  | 'categoryL1'
  | 'categoryL2'
  | 'materialShortName'
  | 'materialName';

export type EnterpriseProjectFilterOption = {
  value: string;
  label: string;
  projectCount: number;
};

export type EnterpriseProjectSummary = {
  hpInfoId: string;
  projectName: string;
  constructionUnit?: string;
  province?: string;
  city?: string;
  totalInvestment?: number;
  constructionNature?: string;
  investmentType?: string;
  projectNature?: string;
  publishedAt?: string;
  constructionPeriod?: string;
  materialMatch?: string;
  procurementSummary?: string;
};

export type EnterpriseProjectDetail = EnterpriseProjectSummary & {
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  industry?: string;
  landArea?: string;
  buildingArea?: string;
  greenArea?: string;
  constructionScale?: string;
  equipment?: string;
  materials?: string;
  projectComposition?: string;
  sourceUrl?: string;
  collected?: boolean;
  followStatus?: string;
  purchased?: boolean;
};

export type EnterpriseDemandSummary = {
  demandId: string;
  typeId: number;
  typeName: string;
  title: string;
  city?: string;
  district?: string;
  budget?: string;
  summary?: string;
  publishedAt?: string;
  endTime?: string;
  status?: number;
  grabCount?: number;
  remainingGrabCount?: number;
  remainingDays?: number;
  capacityLabel?: string;
  statMode?: 'GRAB' | 'APPLICATION';
  primaryTags: string[];
};

export type EnterpriseDemandDetailField = {
  key: string;
  label: string;
  value: string;
  valueType: string;
  unit?: string;
};

export type EnterpriseDemandDetail = EnterpriseDemandSummary & {
  fields: EnterpriseDemandDetailField[];
};

/** Database-backed public option used by the supply-demand type filter. */
export type EnterpriseDemandTypeOption = {
  typeId: number;
  typeName: string;
  groupCode?: string;
  groupName?: string;
  displayOrder?: number;
  variantEnabled?: boolean;
  statMode?: 'GRAB' | 'APPLICATION';
};

export type EnterpriseDemandPublishInputType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'DATE'
  | 'SELECT'
  | 'MULTISELECT'
  | 'IMAGE';

export type EnterpriseDemandPublishField = {
  sourceColumn?: string;
  fieldKey: string;
  fieldLabel: string;
  targetKind?: 'BASE' | 'DYNAMIC';
  groupCode?: string;
  groupName?: string;
  groupOrder?: number;
  displayOrder?: number;
  inputType: EnterpriseDemandPublishInputType;
  required: boolean;
  placeholder?: string;
  maxLength: number;
  options: string[];
  visibleWhenJson?: string;
  validationJson?: string;
  defaultValue?: string;
  controlPropsJson?: string;
  valueSeparator?: string;
  aiHint?: string;
};

export type EnterpriseDemandPublishVariant = {
  variantCode: string;
  variantName: string;
};

export type EnterpriseDemandPublishSchema = {
  typeId: number;
  typeName: string;
  variantCode: string;
  variants: EnterpriseDemandPublishVariant[];
  fields: EnterpriseDemandPublishField[];
};

export type EnterpriseDemandPublishPayload = {
  typeId: number;
  variantCode?: string;
  title: string;
  summary?: string;
  province?: string;
  city?: string;
  district?: string;
  address?: string;
  budget?: string;
  endTime?: string;
  fields: Record<string, string>;
};

export type EnterpriseDemandAiParseResult = {
  suggestedFields: Record<string, string>;
  warnings: string[];
};

export type DemandAiSessionState =
  | 'DISCOVERING_LINE'
  | 'CONFIRMING_LINE'
  | 'COLLECTING_FIELDS'
  | 'CONFIRMING_SWITCH'
  | 'REVIEW_READY'
  | 'SUBMITTED'
  | 'CANCELLED';

export type DemandAiConversationAction =
  | 'ASK'
  | 'CONFIRM_LINE'
  | 'APPLY_PATCH'
  | 'CONFIRM_SWITCH'
  | 'REVIEW_READY'
  | 'RETRY_AVAILABLE';

export type DemandAiFieldSnapshot = {
  value: string;
  source: 'AI' | 'MANUAL' | 'SYSTEM';
  confidence?: number;
  updatedTurn: number;
  locked: boolean;
};

export type DemandAiLineCandidate = {
  typeId: number;
  typeName: string;
  variantCode?: string;
  variantName?: string;
  confidence: number;
  reason?: string;
};

export type DemandAiConversationSnapshot = {
  sessionId: string;
  version: number;
  state: DemandAiSessionState;
  action: DemandAiConversationAction;
  message: string;
  lineDecision: {
    typeId?: number;
    typeName?: string;
    variantCode?: string;
    confidence?: number;
    candidates: DemandAiLineCandidate[];
  };
  fieldPatch: Record<string, string>;
  formValues: Record<string, DemandAiFieldSnapshot>;
  missingRequiredFields: string[];
  warnings: string[];
  completion: number;
  submittedDemandId?: string;
};

export type EnterpriseDemandPublishResult = {
  demandId: string;
  typeId: number;
  reviewStatus: 'PENDING';
};

export type EnterpriseDemandImage = {
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
};

export type CompanyListQuery = {
  keyword?: string;
  industry?: string;
  province?: string;
  city?: string;
  district?: string;
  companyLevel?: number;
  vip?: boolean;
  pageNum: number;
  pageSize: number;
};

export type ProductListQuery = {
  keyword?: string;
  industry?: string;
  province?: string;
  city?: string;
  district?: string;
  companyId?: string;
  parkId?: string;
  sort?: string;
  pageNum: number;
  pageSize: number;
};

export type ProjectDrillQuery = {
  level: EnterpriseProjectDrillLevel;
  runId?: string;
  province?: string;
  city?: string;
  budgetRange?: string;
  categoryL1?: string;
  categoryL2?: string;
  materialShortName?: string;
  materialName?: string;
  minProjectCount?: number;
};

export type ProjectFilterOptionsQuery = {
  dimension: EnterpriseProjectFilterDimension;
  runId?: string;
  province?: string;
  city?: string;
  categoryL1?: string;
  categoryL2?: string;
  materialShortName?: string;
  limit?: number;
};

export type ProjectListQuery = {
  keyword?: string;
  runId?: string;
  categoryL1?: string;
  categoryL2?: string;
  materialShortName?: string;
  materialName?: string;
  province?: string;
  city?: string;
  budgetRange?: string;
  constructionNature?: string;
  investmentType?: string;
  publishedFrom?: string;
  publishedTo?: string;
  minInvestment?: number;
  maxInvestment?: number;
  pageNum: number;
  pageSize: number;
};

export type DemandListQuery = {
  keyword?: string;
  typeId?: number;
  city?: string;
  district?: string;
  status?: number;
  pageNum: number;
  pageSize: number;
};

export type EnterpriseRequest =
  | { operation: 'company.list'; payload: CompanyListQuery }
  | { operation: 'company.detail'; payload: { companyId: string } }
  | { operation: 'company.industries'; payload: Record<string, never> }
  | { operation: 'product.list'; payload: ProductListQuery }
  | { operation: 'product.detail'; payload: { productId: string } }
  | {
      operation: 'catalogAssistant.plan';
      payload: { message: string; context?: CatalogAssistantContext };
    }
  | {
      operation: 'catalogAssistant.rank';
      payload: {
        message: string;
        plan: CatalogAssistantPlan;
        candidates: CatalogAssistantCandidate[];
      };
    }
  | {
      operation: 'enterpriseAssistant.plan';
      payload: {
        message: string;
        currentModule: string;
        hasCatalogScope: boolean;
        recentSummary?: string;
      };
    }
  | { operation: 'project.dashboard'; payload: { runId?: string } }
  | { operation: 'project.drill'; payload: ProjectDrillQuery }
  | { operation: 'project.filterOptions'; payload: ProjectFilterOptionsQuery }
  | { operation: 'project.list'; payload: ProjectListQuery }
  | { operation: 'project.detail'; payload: { hpInfoId: string } }
  | {
      operation: 'contact.acquire';
      payload: {
        resourceType: EnterpriseContactResourceType;
        resourceId: string;
        /** False performs the project entitlement preflight without consuming phone quota or returning a phone. */
        consumeQuota?: boolean;
      };
    }
  | { operation: 'project.contactUnlock'; payload: { hpInfoId: string } }
  | { operation: 'demand.types'; payload: Record<string, never> }
  | { operation: 'demand.list'; payload: DemandListQuery }
  | { operation: 'demand.detail'; payload: { demandId: string; typeId: number } }
  | { operation: 'demand.contactStatus'; payload: { demandId: string; typeId: number } }
  | { operation: 'demand.contactAcquire'; payload: { demandId: string; typeId: number } }
  | { operation: 'demand.publishTypes'; payload: Record<string, never> }
  | { operation: 'demand.publishSchema'; payload: { typeId: number; variantCode?: string } }
  | { operation: 'demand.aiParse'; payload: { typeId: number; variantCode?: string; description: string } }
  | {
      operation: 'demand.aiConversation.start';
      payload: { requestId: string; initialMessage: string };
    }
  | {
      operation: 'demand.aiConversation.turn';
      payload: { sessionId: string; requestId: string; version: number; message: string };
    }
  | {
      operation: 'demand.aiConversation.confirmLine';
      payload: {
        sessionId: string;
        requestId: string;
        version: number;
        typeId: number;
        variantCode?: string;
        confirmSwitch?: boolean;
      };
    }
  | {
      operation: 'demand.aiConversation.patch';
      payload: {
        sessionId: string;
        requestId: string;
        version: number;
        fields: Record<string, string>;
      };
    }
  | {
      operation: 'demand.aiConversation.resume';
      payload: { sessionId?: string };
    }
  | {
      operation: 'demand.aiConversation.cancel';
      payload: { sessionId: string; requestId: string; version: number };
    }
  | {
      operation: 'demand.aiConversation.complete';
      payload: {
        sessionId: string;
        requestId: string;
        version: number;
        demandId: string;
      };
    }
  | { operation: 'demand.publish'; payload: EnterpriseDemandPublishPayload }
  | {
      operation: 'demand.uploadImage';
      payload: {
        fileName: string;
        mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
        bytes: number[];
      };
    }
  | { operation: 'behavior.log'; payload: EnterpriseBehaviorLogPayload }
  | { operation: 'unified.suggest'; payload: { keyword: string } }
  | { operation: 'unified.search'; payload: UnifiedSearchQuery };

export type EnterpriseResponse =
  | { operation: 'company.list'; data: EnterprisePage<EnterpriseCompanySummary> }
  | { operation: 'company.detail'; data: EnterpriseCompanyDetail }
  | { operation: 'company.industries'; data: EnterpriseIndustryOption[] }
  | { operation: 'product.list'; data: EnterprisePage<EnterpriseProductSummary> }
  | { operation: 'product.detail'; data: EnterpriseProductDetail }
  | { operation: 'catalogAssistant.plan'; data: CatalogAssistantPlan }
  | { operation: 'catalogAssistant.rank'; data: CatalogAssistantRankResult }
  | { operation: 'enterpriseAssistant.plan'; data: EnterpriseAssistantRoutePlan }
  | { operation: 'project.dashboard'; data: EnterpriseProjectDashboard }
  | { operation: 'project.drill'; data: EnterpriseProjectDrillItem[] }
  | { operation: 'project.filterOptions'; data: EnterpriseProjectFilterOption[] }
  | { operation: 'project.list'; data: EnterprisePage<EnterpriseProjectSummary> }
  | { operation: 'project.detail'; data: EnterpriseProjectDetail }
  | { operation: 'contact.acquire'; data: EnterpriseContactAccess }
  | { operation: 'project.contactUnlock'; data: EnterpriseProjectContactUnlock }
  | { operation: 'demand.types'; data: EnterpriseDemandTypeOption[] }
  | { operation: 'demand.list'; data: EnterprisePage<EnterpriseDemandSummary> }
  | { operation: 'demand.detail'; data: EnterpriseDemandDetail }
  | { operation: 'demand.contactStatus'; data: DemandContactAccess }
  | { operation: 'demand.contactAcquire'; data: DemandContactAccess }
  | { operation: 'demand.publishTypes'; data: EnterpriseDemandTypeOption[] }
  | { operation: 'demand.publishSchema'; data: EnterpriseDemandPublishSchema }
  | { operation: 'demand.aiParse'; data: EnterpriseDemandAiParseResult }
  | { operation: 'demand.aiConversation.start'; data: DemandAiConversationSnapshot }
  | { operation: 'demand.aiConversation.turn'; data: DemandAiConversationSnapshot }
  | { operation: 'demand.aiConversation.confirmLine'; data: DemandAiConversationSnapshot }
  | { operation: 'demand.aiConversation.patch'; data: DemandAiConversationSnapshot }
  | { operation: 'demand.aiConversation.resume'; data: DemandAiConversationSnapshot }
  | { operation: 'demand.aiConversation.cancel'; data: DemandAiConversationSnapshot }
  | { operation: 'demand.aiConversation.complete'; data: DemandAiConversationSnapshot }
  | { operation: 'demand.publish'; data: EnterpriseDemandPublishResult }
  | { operation: 'demand.uploadImage'; data: EnterpriseDemandImage }
  | { operation: 'behavior.log'; data: EnterpriseBehaviorLogResult }
  | { operation: 'unified.suggest'; data: string[] }
  | { operation: 'unified.search'; data: UnifiedSearchResult };

export type EnterpriseOperation = EnterpriseRequest['operation'];
import type { DemandContactAccess } from './demand-contact/contracts';
import type {
  EnterpriseContactAccess,
  EnterpriseContactResourceType,
  EnterpriseProjectContactUnlock,
} from './contact-access/contracts';
import type { UnifiedSearchQuery, UnifiedSearchResult } from './unified-search/contracts';
import type {
  CatalogAssistantCandidate,
  CatalogAssistantContext,
  CatalogAssistantPlan,
  CatalogAssistantRankResult,
  EnterpriseAssistantRoutePlan,
} from './catalog-assistant/contracts';
