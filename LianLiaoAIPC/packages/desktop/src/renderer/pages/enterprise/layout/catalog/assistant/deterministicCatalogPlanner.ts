import type { CatalogAssistantContext, CatalogAssistantPlan } from '@/common/enterprise/catalog-assistant/contracts';

const DEFAULT_RESULT_LIMIT = 6;
const MAX_RESULT_LIMIT = 50;
const RECENT_PROJECT_DAYS = 90;
const ONE_MONTH_DAYS = 30;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const LIAONING_CITIES = [
  ['沈阳', '沈阳市'],
  ['大连', '大连市'],
  ['鞍山', '鞍山市'],
  ['抚顺', '抚顺市'],
  ['本溪', '本溪市'],
  ['丹东', '丹东市'],
  ['锦州', '锦州市'],
  ['营口', '营口市'],
  ['阜新', '阜新市'],
  ['辽阳', '辽阳市'],
  ['盘锦', '盘锦市'],
  ['铁岭', '铁岭市'],
  ['朝阳', '朝阳市'],
  ['葫芦岛', '葫芦岛市'],
] as const;

const PROJECT_MARKER_PATTERN = /在建项目|建设项目|项目机会|项目采购|采购项目|工程项目/u;
const CONTEXT_REFERENCE_PATTERN = /这里面|其中|这些|上一批|刚才|换一批|再来/u;
const RECENT_PATTERN = /近期|最近(?:一个月|30天|三十天)?|近(?:一个月|30天|三十天)/u;
const ONE_MONTH_PATTERN = /最近(?:一个月|30天|三十天)|近(?:一个月|30天|三十天)/u;

const formatShanghaiDate = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const extractResultLimit = (message: string): number => {
  const match = message.match(/(\d{1,3})\s*(?:个|条|项)/u);
  if (!match) return DEFAULT_RESULT_LIMIT;
  return Math.min(MAX_RESULT_LIMIT, Math.max(1, Number(match[1])));
};

const extractProjectKeyword = (message: string, cityAlias?: string): string | undefined => {
  let keyword = message;
  if (cityAlias) keyword = keyword.replaceAll(cityAlias, '');
  keyword = keyword
    .replaceAll(/辽宁省?|在建项目|建设项目|项目机会|项目采购|采购项目|工程项目/gu, '')
    .replaceAll(/近期|最近(?:一个月|30天|三十天)?|近(?:一个月|30天|三十天)/gu, '')
    .replaceAll(/帮我|给我|请|找|查找|查询|检索|搜索|推荐|看看|采购|相关|有关/gu, '')
    .replaceAll(/[，。；、,.!?！？;：:\s]/gu, '')
    .replaceAll(/^的|的$/gu, '')
    .trim();
  return keyword || undefined;
};

/**
 * Builds a conservative fallback only for explicit, standalone project searches.
 *
 * The cloud model remains the primary planner. This path exists so a provider or
 * rolling-deployment failure cannot turn a clear request into a false
 * “cannot understand” error. Follow-up references remain model-owned because
 * resolving them requires the current result scope.
 */
export const buildDeterministicCatalogPlan = (
  message: string,
  context?: CatalogAssistantContext,
  now = new Date()
): CatalogAssistantPlan | undefined => {
  const normalized = message.trim();
  if (!normalized || CONTEXT_REFERENCE_PATTERN.test(normalized) || !PROJECT_MARKER_PATTERN.test(normalized)) {
    return undefined;
  }

  const cityEntry = LIAONING_CITIES.find(
    ([alias, canonical]) => normalized.includes(alias) || normalized.includes(canonical)
  );
  const cityAlias = cityEntry?.[0];
  const keyword = extractProjectKeyword(normalized, cityAlias);
  const filters: CatalogAssistantPlan['filters'] = {
    keyword,
    province: cityEntry ? '辽宁省' : undefined,
    city: cityEntry?.[1],
  };

  if (RECENT_PATTERN.test(normalized)) {
    const recentDays = ONE_MONTH_PATTERN.test(normalized) ? ONE_MONTH_DAYS : RECENT_PROJECT_DAYS;
    filters.publishedFrom = formatShanghaiDate(new Date(now.getTime() - recentDays * DAY_IN_MILLISECONDS));
    filters.publishedTo = formatShanghaiDate(now);
  }

  if (!Object.values(filters).some(Boolean)) return undefined;
  return {
    mode: context?.currentScope ? 'CHANGE_ENTITY' : 'NEW_SEARCH',
    entityType: 'PROJECT',
    filters,
    resultLimit: extractResultLimit(normalized),
    summary: 'enterprise.catalogAssistant.fallbackSummary',
  };
};
