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
  roleId?: string;
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
  industry?: string;
  province?: string;
  city?: string;
  district?: string;
  address?: string;
  businessSummary?: string;
  updatedAt?: string;
  legalRepresentative?: string;
  companyType?: string;
  companyLevel?: number;
  vip?: boolean;
  establishedAt?: string;
  collected?: boolean;
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
  collected?: boolean;
};

export type EnterpriseProductDetail = EnterpriseProductSummary;

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
  pageNum: number;
  pageSize: number;
};

export type EnterpriseRequest =
  | { operation: 'company.list'; payload: CompanyListQuery }
  | { operation: 'company.detail'; payload: { companyId: string } }
  | { operation: 'product.list'; payload: ProductListQuery }
  | { operation: 'product.detail'; payload: { productId: string } }
  | { operation: 'project.dashboard'; payload: { runId?: string } }
  | { operation: 'project.drill'; payload: ProjectDrillQuery }
  | { operation: 'project.list'; payload: ProjectListQuery }
  | { operation: 'project.detail'; payload: { hpInfoId: string } };

export type EnterpriseResponse =
  | { operation: 'company.list'; data: EnterprisePage<EnterpriseCompanySummary> }
  | { operation: 'company.detail'; data: EnterpriseCompanyDetail }
  | { operation: 'product.list'; data: EnterprisePage<EnterpriseProductSummary> }
  | { operation: 'product.detail'; data: EnterpriseProductDetail }
  | { operation: 'project.dashboard'; data: EnterpriseProjectDashboard }
  | { operation: 'project.drill'; data: EnterpriseProjectDrillItem[] }
  | { operation: 'project.list'; data: EnterprisePage<EnterpriseProjectSummary> }
  | { operation: 'project.detail'; data: EnterpriseProjectDetail };

export type EnterpriseOperation = EnterpriseRequest['operation'];
