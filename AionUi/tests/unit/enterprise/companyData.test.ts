import { describe, expect, it, vi } from 'vitest';

import type { EnterpriseResponse } from '@/common/enterprise/contracts';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import {
  CompanyDataError,
  buildCompanyListQuery,
  createCompanyQueryKey,
  isPaginationOnlyCompanyQueryChange,
  loadCompanyDetailBundle,
  loadCompanyList,
  parseCompanyId,
  parseSafeCompanyImageUrl,
} from '@/renderer/pages/enterprise/companies/companyData';

const createClient = (request: EnterpriseClient['request']): EnterpriseClient => ({
  createLoginSession: vi.fn(),
  pollLoginSession: vi.fn(),
  completeRegistration: vi.fn(),
  restoreSession: vi.fn(),
  clearSession: vi.fn(),
  request,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('company catalog query mapping', () => {
  it('maps trimmed name, industry, province, city, district, member level and pagination', () => {
    expect(
      buildCompanyListQuery(
        {
          keyword: '  steel  ',
          industry: ' Equipment ',
          province: ' Liaoning ',
          city: ' Shenyang ',
          district: ' Hunnan ',
          companyLevel: 3,
        },
        { pageNum: 4, pageSize: 30 }
      )
    ).toEqual({
      keyword: 'steel',
      industry: 'Equipment',
      province: 'Liaoning',
      city: 'Shenyang',
      district: 'Hunnan',
      companyLevel: 3,
      pageNum: 4,
      pageSize: 30,
    });
  });

  it('omits empty optional filters without losing a zero member level', () => {
    expect(
      buildCompanyListQuery(
        {
          keyword: ' ',
          industry: '',
          province: undefined,
          city: '  ',
          district: '',
          companyLevel: 0,
        },
        { pageNum: 1, pageSize: 20 }
      )
    ).toEqual({ companyLevel: 0, pageNum: 1, pageSize: 20 });
  });

  it('maps the VIP aggregate without leaking a concrete member level into the renderer request', () => {
    expect(buildCompanyListQuery({ vip: true, companyLevel: 3.1 }, { pageNum: 2, pageSize: 20 })).toEqual({
      vip: true,
      pageNum: 2,
      pageSize: 20,
    });
  });

  it('maps a real decimal member level without adding the VIP aggregate flag', () => {
    expect(buildCompanyListQuery({ companyLevel: 3.1 }, { pageNum: 1, pageSize: 20 })).toEqual({
      companyLevel: 3.1,
      pageNum: 1,
      pageSize: 20,
    });
  });

  it('includes every query condition in a deterministic cache key', () => {
    const base = buildCompanyListQuery({ keyword: 'steel' }, { pageNum: 1, pageSize: 20 });
    const otherProvince = buildCompanyListQuery(
      { keyword: 'steel', province: 'Liaoning' },
      { pageNum: 1, pageSize: 20 }
    );

    expect(createCompanyQueryKey(base)).not.toBe(createCompanyQueryKey(otherProvince));
    expect(createCompanyQueryKey({ ...base })).toBe(createCompanyQueryKey(base));
  });

  it('treats VIP, concrete levels and cleared membership as distinct query keys', () => {
    const pagination = { pageNum: 1, pageSize: 20 };
    const vip = buildCompanyListQuery({ vip: true }, pagination);
    const level = buildCompanyListQuery({ companyLevel: 3.1 }, pagination);
    const cleared = buildCompanyListQuery({}, pagination);

    expect(
      new Set([createCompanyQueryKey(vip), createCompanyQueryKey(level), createCompanyQueryKey(cleared)]).size
    ).toBe(3);
    expect(isPaginationOnlyCompanyQueryChange(vip, level)).toBe(false);
    expect(isPaginationOnlyCompanyQueryChange(level, cleared)).toBe(false);
  });

  it('preserves prior data only when pagination changes', () => {
    const pageOne = buildCompanyListQuery({ industry: 'Steel' }, { pageNum: 1, pageSize: 20 });
    const pageTwo = buildCompanyListQuery({ industry: 'Steel' }, { pageNum: 2, pageSize: 20 });
    const filtered = buildCompanyListQuery({ industry: 'Chemicals' }, { pageNum: 1, pageSize: 20 });

    expect(isPaginationOnlyCompanyQueryChange(pageOne, pageTwo)).toBe(true);
    expect(isPaginationOnlyCompanyQueryChange(pageTwo, filtered)).toBe(false);
  });
});

describe('company catalog response boundaries', () => {
  it('uses the real company.list operation and accepts a complete page', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'company.list',
      data: { list: [], pageNum: 1, pageSize: 20, pages: 0, total: 0 },
    });
    const query = buildCompanyListQuery({ keyword: 'steel' }, { pageNum: 1, pageSize: 20 });

    await expect(loadCompanyList(createClient(request), query, new AbortController().signal)).resolves.toEqual({
      list: [],
      pageNum: 1,
      pageSize: 20,
      pages: 0,
      total: 0,
    });
    expect(request).toHaveBeenCalledWith({ operation: 'company.list', payload: query });
  });

  it('fails closed when the company list response omits list', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'company.list',
      data: { pageNum: 1, pageSize: 20, pages: 0, total: 0 },
    } as never);

    const error = await loadCompanyList(
      createClient(request),
      buildCompanyListQuery({}, { pageNum: 1, pageSize: 20 }),
      new AbortController().signal
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CompanyDataError);
    expect(error).toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('loads company details and its real product page without synthesizing records', async () => {
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation === 'company.detail') {
        return {
          operation: 'company.detail',
          data: { companyId: '42', name: 'Liaoning Pumps', phone: '***********' },
        };
      }
      if (input.operation === 'product.list') {
        return {
          operation: 'product.list',
          data: {
            list: [{ productId: '9', companyId: '42', name: 'Industrial pump' }],
            pageNum: 1,
            pageSize: 12,
            pages: 1,
            total: 1,
          },
        };
      }
      throw new Error('unexpected operation');
    });

    await expect(
      loadCompanyDetailBundle(createClient(request), '42', new AbortController().signal)
    ).resolves.toMatchObject({
      company: { companyId: '42', phone: '***********' },
      products: { total: 1 },
    });
    expect(request).toHaveBeenNthCalledWith(1, {
      operation: 'company.detail',
      payload: { companyId: '42' },
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      operation: 'product.list',
      payload: { companyId: '42', pageNum: 1, pageSize: 12 },
    });
  });

  it('does not start a company-list IPC request when its signal is already aborted', async () => {
    const request = vi.fn<EnterpriseClient['request']>();
    const controller = new AbortController();
    controller.abort();

    await expect(
      loadCompanyList(createClient(request), buildCompanyListQuery({}, { pageNum: 1, pageSize: 20 }), controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
  });

  it('discards a company-list response that settles after cancellation', async () => {
    const pending = deferred<Extract<EnterpriseResponse, { operation: 'company.list' }>>();
    const request = vi.fn<EnterpriseClient['request']>().mockReturnValue(pending.promise);
    const controller = new AbortController();
    const loading = loadCompanyList(
      createClient(request),
      buildCompanyListQuery({}, { pageNum: 1, pageSize: 20 }),
      controller.signal
    );
    controller.abort();
    pending.resolve({
      operation: 'company.list',
      data: { list: [], pageNum: 1, pageSize: 20, pages: 0, total: 0 },
    });

    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).toHaveBeenCalledOnce();
  });

  it('never starts product.list when cancellation wins after company.detail', async () => {
    const pendingDetail = deferred<Extract<EnterpriseResponse, { operation: 'company.detail' }>>();
    const request = vi.fn<EnterpriseClient['request']>().mockImplementation((input) => {
      if (input.operation === 'company.detail') return pendingDetail.promise;
      return Promise.reject(new Error('product.list must not start'));
    });
    const controller = new AbortController();
    const loading = loadCompanyDetailBundle(createClient(request), '42', controller.signal);
    pendingDetail.resolve({
      operation: 'company.detail',
      data: { companyId: '42', name: 'Liaoning Pumps' },
    });
    controller.abort();

    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toMatchObject({ operation: 'company.detail' });
  });

  it('discards product.list when cancellation wins while that IPC request is in flight', async () => {
    const pendingProducts = deferred<Extract<EnterpriseResponse, { operation: 'product.list' }>>();
    const request = vi.fn<EnterpriseClient['request']>((input) => {
      if (input.operation === 'company.detail') {
        return Promise.resolve({
          operation: 'company.detail',
          data: { companyId: '42', name: 'Liaoning Pumps' },
        });
      }
      return pendingProducts.promise;
    });
    const controller = new AbortController();
    const loading = loadCompanyDetailBundle(createClient(request), '42', controller.signal);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    controller.abort();
    pendingProducts.resolve({
      operation: 'product.list',
      data: { list: [], pageNum: 1, pageSize: 12, pages: 0, total: 0 },
    });

    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('company route identifiers', () => {
  it.each(['42', '900719925474099312345'])('accepts a non-zero decimal identifier: %s', (value) => {
    expect(parseCompanyId(value)).toBe(value);
  });

  it.each([undefined, '', '0', '-1', '1/2', '42?phone=13800000000', '12345678901234567890123456789012'])(
    'rejects an unsafe company identifier without echoing it: %s',
    (value) => {
      expect(() => parseCompanyId(value)).toThrowError(CompanyDataError);
      try {
        parseCompanyId(value);
      } catch (error) {
        if (value) expect(String(error)).not.toContain(value);
      }
    }
  );
});

describe('company image URLs', () => {
  it.each([
    ['https://assets.example.com/logo.png', 'https://assets.example.com/logo.png'],
    ['//assets.example.com/logo.png', 'https://assets.example.com/logo.png'],
  ])('accepts a remote HTTP image without adding local assets: %s', (value, expected) => {
    expect(parseSafeCompanyImageUrl(value)).toBe(expected);
  });

  it.each(['data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', 'file:///secret', 'https://u:p@host/logo'])(
    'rejects an unsafe image source: %s',
    (value) => {
      expect(parseSafeCompanyImageUrl(value)).toBeNull();
    }
  );
});
