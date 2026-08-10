import type { CatalogAssistantTrustedResult, CatalogMatchLevel } from '@/common/enterprise/catalog-assistant/contracts';

export type RankedCatalogResult = {
  result: CatalogAssistantTrustedResult;
  matchLevel: CatalogMatchLevel;
  businessSort: number;
  evidenceSort: number;
  completeness: number;
};

const MATCH_SCORES: Record<CatalogMatchLevel, number> = {
  EXACT: 4,
  STRONG: 3,
  RELATED: 2,
  WEAK: 1,
};

const resultId = (result: CatalogAssistantTrustedResult): string => {
  if (result.entityType === 'COMPANY') return result.item.companyId;
  if (result.entityType === 'PRODUCT') return result.item.productId;
  if (result.entityType === 'DEMAND') return result.item.demandId;
  return result.item.hpInfoId;
};

const compareSignedIds = (left: string, right: string): number => {
  try {
    const leftId = BigInt(left);
    const rightId = BigInt(right);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  } catch {
    return left.localeCompare(right, 'zh-CN', { numeric: true });
  }
};

/** Semantic tier wins; business sort is considered only inside that tier. */
export const sortCatalogWorkflowResults = (items: RankedCatalogResult[]): RankedCatalogResult[] =>
  items.toSorted(
    (left, right) =>
      MATCH_SCORES[right.matchLevel] - MATCH_SCORES[left.matchLevel] ||
      right.businessSort - left.businessSort ||
      right.evidenceSort - left.evidenceSort ||
      right.completeness - left.completeness ||
      compareSignedIds(resultId(left.result), resultId(right.result))
  );
