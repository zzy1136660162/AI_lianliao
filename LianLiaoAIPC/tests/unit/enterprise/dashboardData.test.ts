import { describe, expect, it, vi } from 'vitest';

import type { EnterpriseResponse } from '@/common/enterprise/contracts';
import {
  loadDashboardSearch,
  normalizeDashboardSearchQuery,
} from '@/renderer/pages/enterprise/dashboard/dashboardData';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const unifiedResponse = (): EnterpriseResponse => ({
  operation: 'unified.search',
  data: {
    total: 3,
    pageNum: 1,
    pageSize: 15,
    items: [
      { resourceType: 'COMPANY', businessId: '11', title: '辽宁装备企业', tags: [] },
      { resourceType: 'PRODUCT', businessId: '22', title: '工业泵', tags: [] },
      { resourceType: 'PROJECT', businessId: '-33', title: '在建项目', tags: [] },
    ],
  },
});

const createClient = (request: EnterpriseClient['request']): Pick<EnterpriseClient, 'request'> => ({ request });

describe('dashboard unified search loader', () => {
  it('normalizes whitespace and rejects fewer than two characters before IPC', async () => {
    const request = vi.fn<EnterpriseClient['request']>();
    expect(normalizeDashboardSearchQuery('  steel   pump  ')).toBe('steel pump');
    await expect(loadDashboardSearch(createClient(request), ' a ', new AbortController().signal)).rejects.toMatchObject(
      { code: 'INVALID_REQUEST' }
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('uses one grouped unified-search request and splits the safe items by type', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(unifiedResponse());

    const result = await loadDashboardSearch(createClient(request), ' pump ', new AbortController().signal);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      operation: 'unified.search',
      payload: {
        keyword: 'pump',
        pageNum: 1,
        pageSize: 15,
        enableGroupTop: true,
        groupTopN: 5,
      },
    });
    expect(result.companies.items.map((item) => item.businessId)).toEqual(['11']);
    expect(result.products.items.map((item) => item.businessId)).toEqual(['22']);
    expect(result.projects.items.map((item) => item.businessId)).toEqual(['-33']);
    expect(result.errorCode).toBeNull();
  });

  it('caps every group at five records', async () => {
    const items = (['COMPANY', 'PRODUCT', 'PROJECT'] as const).flatMap((resourceType) =>
      Array.from({ length: 6 }, (_, index) => ({
        resourceType,
        businessId: String(index + 1),
        title: `${resourceType}-${index + 1}`,
        tags: [],
      }))
    );
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'unified.search',
      data: { total: items.length, pageNum: 1, pageSize: 15, items },
    });

    const result = await loadDashboardSearch(createClient(request), 'pump', new AbortController().signal);

    expect(result.companies.items).toHaveLength(5);
    expect(result.products.items).toHaveLength(5);
    expect(result.projects.items).toHaveLength(5);
  });

  it('does not publish results after the request is aborted', async () => {
    const pending = deferred<EnterpriseResponse>();
    const request = vi.fn<EnterpriseClient['request']>().mockImplementation(() => pending.promise);
    const controller = new AbortController();
    const loading = loadDashboardSearch(createClient(request), 'pump', controller.signal);

    controller.abort();
    pending.resolve(unifiedResponse());

    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
  });
});
