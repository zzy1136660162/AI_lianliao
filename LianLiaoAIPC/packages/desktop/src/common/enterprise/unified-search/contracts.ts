export const UNIFIED_RESOURCE_TYPES = ['COMPANY', 'PRODUCT', 'PROJECT'] as const;
export type UnifiedResourceType = (typeof UNIFIED_RESOURCE_TYPES)[number];

/** Safe, renderer-facing unified search item returned by cloud-api. */
export type UnifiedSearchItem = {
  resourceType: UnifiedResourceType;
  businessId: string;
  title: string;
  subtitle?: string;
  summary?: string;
  coverUrl?: string;
  city?: string;
  district?: string;
  industry?: string;
  tags: string[];
  publishedAt?: string;
};

export type UnifiedSearchQuery = {
  keyword: string;
  resourceTypes?: UnifiedResourceType[];
  pageNum: number;
  pageSize: number;
  enableGroupTop: boolean;
  groupTopN: number;
};

export type UnifiedSearchResult = {
  total: number;
  pageNum: number;
  pageSize: number;
  items: UnifiedSearchItem[];
};
