import { describe, expect, it, vi } from 'vitest';

import type { EnterpriseRequest, EnterpriseResponse } from '@/common/enterprise/contracts';
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

const companyResponse = (name = 'Liaoning Precision'): EnterpriseResponse => ({
  operation: 'company.list',
  data: {
    list: [{ companyId: '11', name, industry: 'Equipment' }],
    pageNum: 1,
    pageSize: 5,
    pages: 1,
    total: 1,
  },
});

const productResponse = (name = 'Industrial pump'): EnterpriseResponse => ({
  operation: 'product.list',
  data: {
    list: [{ productId: '22', companyId: '11', name, companyName: 'Liaoning Precision' }],
    pageNum: 1,
    pageSize: 5,
    pages: 1,
    total: 1,
  },
});

const projectResponse = (projectName = 'RAW confidential project'): EnterpriseResponse => ({
  operation: 'project.list',
  data: {
    list: [
      {
        hpInfoId: '33',
        projectName,
        constructionUnit: 'Confidential Group',
        province: 'Liaoning',
        constructionNature: 'New build',
      },
    ],
    pageNum: 1,
    pageSize: 5,
    pages: 1,
    total: 1,
  },
});

const createClient = (request: EnterpriseClient['request']): Pick<EnterpriseClient, 'request'> => ({ request });

describe('dashboard unified search loader', () => {
  it('trims queries and rejects fewer than two characters before IPC', async () => {
    const request = vi.fn<EnterpriseClient['request']>();

    expect(normalizeDashboardSearchQuery('  steel  ')).toBe('steel');
    await expect(loadDashboardSearch(createClient(request), ' a ', new AbortController().signal)).rejects.toMatchObject(
      { code: 'INVALID_REQUEST' }
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('starts all three five-result searches in parallel', async () => {
    const pending = {
      company: deferred<EnterpriseResponse>(),
      product: deferred<EnterpriseResponse>(),
      project: deferred<EnterpriseResponse>(),
    };
    const request = vi.fn<EnterpriseClient['request']>((operation: EnterpriseRequest) => {
      if (operation.operation === 'company.list') return pending.company.promise;
      if (operation.operation === 'product.list') return pending.product.promise;
      if (operation.operation === 'project.list') return pending.project.promise;
      return Promise.reject(new Error('unexpected operation'));
    });

    const loading = loadDashboardSearch(createClient(request), '  pump  ', new AbortController().signal);

    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenCalledWith({
      operation: 'company.list',
      payload: { keyword: 'pump', pageNum: 1, pageSize: 5 },
    });
    expect(request).toHaveBeenCalledWith({
      operation: 'product.list',
      payload: { keyword: 'pump', pageNum: 1, pageSize: 5 },
    });
    expect(request).toHaveBeenCalledWith({
      operation: 'project.list',
      payload: { keyword: 'pump', pageNum: 1, pageSize: 5 },
    });

    pending.company.resolve(companyResponse());
    pending.product.resolve(productResponse());
    pending.project.resolve(projectResponse());
    const result = await loading;

    expect(result.companies.items).toHaveLength(1);
    expect(result.products.items).toHaveLength(1);
    expect(result.projects.items).toHaveLength(1);
    expect(result.errorCode).toBeNull();
  });

  it('keeps successful groups when one category fails', async () => {
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'company.list') return Promise.resolve(companyResponse());
      if (operation.operation === 'product.list') return Promise.reject(new Error('raw backend failure'));
      if (operation.operation === 'project.list') return Promise.resolve(projectResponse());
      return Promise.reject(new Error('unexpected operation'));
    });

    const result = await loadDashboardSearch(createClient(request), 'pump', new AbortController().signal);

    expect(result.companies.items[0]?.name).toBe('Liaoning Precision');
    expect(result.products.errorCode).toBe('REQUEST_FAILED');
    expect(result.projects.items[0]?.hpInfoId).toBe('33');
    expect(result.errorCode).toBeNull();
  });

  it.each([
    [{ code: 'NETWORK' }, 'NETWORK'],
    [{ code: 'NOT_A_STABLE_CODE' }, 'REQUEST_FAILED'],
    [
      new Proxy(
        {},
        {
          getOwnPropertyDescriptor: () => {
            throw new Error('unsafe descriptor');
          },
        }
      ),
      'REQUEST_FAILED',
    ],
  ] as const)('normalizes an untrusted group rejection to %s', async (reason, expectedCode) => {
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'company.list') return Promise.reject(reason);
      if (operation.operation === 'product.list') return Promise.resolve(productResponse());
      if (operation.operation === 'project.list') return Promise.resolve(projectResponse());
      return Promise.reject(new Error('unexpected operation'));
    });

    const result = await loadDashboardSearch(createClient(request), 'pump', new AbortController().signal);

    expect(result.companies.errorCode).toBe(expectedCode);
  });

  it('returns a safe total error when every category fails', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockRejectedValue(new Error('raw-openid-secret'));

    const result = await loadDashboardSearch(createClient(request), 'pump', new AbortController().signal);

    expect(result.companies.errorCode).toBe('REQUEST_FAILED');
    expect(result.products.errorCode).toBe('REQUEST_FAILED');
    expect(result.projects.errorCode).toBe('REQUEST_FAILED');
    expect(result.errorCode).toBe('REQUEST_FAILED');
  });

  it('fails closed for a malformed group while preserving valid groups', async () => {
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'company.list') {
        return Promise.resolve({
          operation: 'company.list',
          data: { list: [], pageNum: 1, pageSize: 99, pages: 0, total: 0 },
        });
      }
      if (operation.operation === 'product.list') return Promise.resolve(productResponse());
      if (operation.operation === 'project.list') return Promise.resolve(projectResponse());
      return Promise.reject(new Error('unexpected operation'));
    });

    const result = await loadDashboardSearch(createClient(request), 'pump', new AbortController().signal);

    expect(result.companies.errorCode).toBe('INVALID_RESPONSE');
    expect(result.products.items).toHaveLength(1);
    expect(result.projects.items).toHaveLength(1);
  });

  it('does not publish results after the request is aborted', async () => {
    const pending = deferred<EnterpriseResponse>();
    const request = vi.fn<EnterpriseClient['request']>().mockImplementation(() => pending.promise);
    const controller = new AbortController();
    const loading = loadDashboardSearch(createClient(request), 'pump', controller.signal);

    controller.abort();
    pending.resolve(companyResponse());

    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
  });
});
