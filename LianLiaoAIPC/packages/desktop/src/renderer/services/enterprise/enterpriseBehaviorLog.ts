import type {
  EnterpriseBehaviorLogPayload,
  EnterpriseBehaviorLogResult,
  EnterpriseResponse,
} from '@/common/enterprise/contracts';

import { enterpriseClient, type EnterpriseClient } from './enterpriseClient';

type BehaviorClient = Pick<EnterpriseClient, 'request'>;

const PAGE_VIEW_DEDUPLICATION_MS = 1_500;
const recentPageViews = new Map<string, number>();

type PageDescription = Pick<EnterpriseBehaviorLogPayload, 'moduleName' | 'title' | 'targetId'>;

const safeDecodePathPart = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Returns the current HashRouter path without exposing a browser URL to business callers. */
export const getCurrentEnterprisePagePath = (): string => {
  if (typeof window === 'undefined') return '/enterprise/dashboard';
  const route = window.location.hash.replace(/^#/, '');
  if (route.startsWith('/enterprise/')) return route.slice(0, 500);
  return '/enterprise/dashboard';
};

/** Maps enterprise routes to the same report-friendly module semantics used by H5 logs. */
export const describeEnterprisePage = (pathname: string): PageDescription => {
  const parts = pathname.split('/').filter(Boolean);
  const section = parts[1] ?? 'dashboard';
  const targetId = safeDecodePathPart(parts.at(-1));

  switch (section) {
    case 'companies':
      return parts.length > 2
        ? { moduleName: '链辽AI桌面端-企业码', title: '查看企业码详情', targetId }
        : { moduleName: '链辽AI桌面端-企业码', title: '访问企业码' };
    case 'products':
      return parts.length > 2
        ? { moduleName: '链辽AI桌面端-重点产品', title: '查看重点产品详情', targetId }
        : { moduleName: '链辽AI桌面端-重点产品', title: '访问重点产品' };
    case 'projects':
      return parts.length > 2
        ? { moduleName: '链辽AI桌面端-在建项目', title: '查看在建项目详情', targetId }
        : { moduleName: '链辽AI桌面端-在建项目', title: '访问在建项目' };
    case 'supply-demand':
      if (parts[2] === 'publish') {
        return { moduleName: '链辽AI桌面端-供需对接', title: '访问供需发布' };
      }
      return parts.length > 3
        ? {
            moduleName: '链辽AI桌面端-供需对接',
            title: '查看供需详情',
            targetId: safeDecodePathPart(parts[3]),
          }
        : { moduleName: '链辽AI桌面端-供需对接', title: '访问供需对接' };
    case 'search':
      return { moduleName: '链辽AI桌面端-统一检索', title: '访问统一检索' };
    case 'notifications':
      return { moduleName: '链辽AI桌面端-通知中心', title: '访问通知中心' };
    case 'version-update':
      return { moduleName: '链辽AI桌面端-版本更新', title: '访问版本更新' };
    case 'consultation':
      return { moduleName: '链辽AI桌面端-在线咨询', title: '访问在线咨询' };
    case 'customer-service':
      return { moduleName: '链辽AI桌面端-客服接待', title: '访问客服接待' };
    default:
      return { moduleName: '链辽AI桌面端-工作台', title: '访问企业工作台' };
  }
};

/**
 * Persists a user behavior without coupling business success to the log service.
 * Callers may await the boolean for diagnostics, but normal UI flows should fire and forget.
 */
export const recordEnterpriseBehavior = async (
  payload: EnterpriseBehaviorLogPayload,
  client: BehaviorClient = enterpriseClient
): Promise<boolean> => {
  try {
    const response: EnterpriseResponse = await client.request({ operation: 'behavior.log', payload });
    return response.operation === 'behavior.log' && (response.data as EnterpriseBehaviorLogResult).recorded === true;
  } catch {
    return false;
  }
};

/** Records one route entry and suppresses React development remount duplicates. */
export const recordEnterprisePageView = (
  pathname: string,
  search = '',
  client: BehaviorClient = enterpriseClient
): void => {
  const pagePath = `${pathname}${search}`.slice(0, 500);
  const now = Date.now();
  const previous = recentPageViews.get(pagePath);
  if (previous !== undefined && now - previous < PAGE_VIEW_DEDUPLICATION_MS) return;
  recentPageViews.set(pagePath, now);

  for (const [key, timestamp] of recentPageViews) {
    if (now - timestamp > PAGE_VIEW_DEDUPLICATION_MS) recentPageViews.delete(key);
  }

  const description = describeEnterprisePage(pathname);
  void recordEnterpriseBehavior(
    {
      eventType: 'PAGE_VIEW',
      moduleName: description.moduleName,
      title: description.title,
      pagePath,
      ...(description.targetId ? { targetId: description.targetId } : {}),
    },
    client
  );
};
