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

const expectInvalidResponse = async (promise: Promise<unknown>) => {
  const error = await promise.catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(CompanyDataError);
  expect(error).toMatchObject({ code: 'INVALID_RESPONSE' });
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

  it.each([
    ['shortName', 7],
    ['industry', false],
    ['province', 7],
    ['city', false],
    ['district', 7],
    ['address', false],
    ['businessSummary', 7],
    ['updatedAt', false],
    ['legalRepresentative', 7],
    ['companyType', false],
    ['companyLevel', '3'],
    ['vip', 'true'],
    ['establishedAt', 7],
    ['collected', 1],
  ])('rejects a company summary whose optional %s has the wrong type', async (field, invalidValue) => {
    const company: Record<string, unknown> = { companyId: '42', name: 'Liaoning Pumps' };
    company[field] = invalidValue;
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'company.list',
      data: { list: [company], pageNum: 1, pageSize: 20, pages: 1, total: 1 },
    } as never);

    await expectInvalidResponse(
      loadCompanyList(
        createClient(request),
        buildCompanyListQuery({}, { pageNum: 1, pageSize: 20 }),
        new AbortController().signal
      )
    );
  });

  it('rejects inherited company fields without invoking accessors', async () => {
    let getterCalls = 0;
    const inherited = Object.create({ name: 'Inherited Company' }) as Record<string, unknown>;
    inherited.companyId = '42';
    Object.defineProperty(inherited, 'industry', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'Equipment';
      },
    });
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'company.list',
      data: { list: [inherited], pageNum: 1, pageSize: 20, pages: 1, total: 1 },
    } as never);

    await expectInvalidResponse(
      loadCompanyList(
        createClient(request),
        buildCompanyListQuery({}, { pageNum: 1, pageSize: 20 }),
        new AbortController().signal
      )
    );
    expect(getterCalls).toBe(0);
  });

  it('rejects an own company accessor without invoking its getter', async () => {
    let getterCalls = 0;
    const company: Record<string, unknown> = { companyId: '42' };
    Object.defineProperty(company, 'name', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'Accessor Company';
      },
    });
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'company.list',
      data: { list: [company], pageNum: 1, pageSize: 20, pages: 1, total: 1 },
    } as never);

    await expectInvalidResponse(
      loadCompanyList(
        createClient(request),
        buildCompanyListQuery({}, { pageNum: 1, pageSize: 20 }),
        new AbortController().signal
      )
    );
    expect(getterCalls).toBe(0);
  });

  it.each([
    ['pageNum', 2],
    ['pageSize', 50],
  ])('rejects a company page whose %s does not match the request', async (field, invalidValue) => {
    const data: Record<string, unknown> = { list: [], pageNum: 1, pageSize: 20, pages: 0, total: 0 };
    data[field] = invalidValue;
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'company.list',
      data,
    } as never);

    await expectInvalidResponse(
      loadCompanyList(
        createClient(request),
        buildCompanyListQuery({}, { pageNum: 1, pageSize: 20 }),
        new AbortController().signal
      )
    );
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

  it('rejects a detail response for a different route company before loading products', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'company.detail',
      data: { companyId: '43', name: 'Wrong Company' },
    });

    await expectInvalidResponse(loadCompanyDetailBundle(createClient(request), '42', new AbortController().signal));
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    ['logoUrl', 7],
    ['description', false],
    ['unifiedSocialCreditCode', 7],
    ['contactName', false],
    ['contactTitle', 7],
    ['phone', false],
  ])('rejects a company detail whose optional %s has the wrong type', async (field, invalidValue) => {
    const detail: Record<string, unknown> = { companyId: '42', name: 'Liaoning Pumps' };
    detail[field] = invalidValue;
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'company.detail',
      data: detail,
    } as never);

    await expectInvalidResponse(loadCompanyDetailBundle(createClient(request), '42', new AbortController().signal));
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    ['pageNum', 2],
    ['pageSize', 20],
  ])('rejects a related-product page whose %s does not match the fixed request', async (field, invalidValue) => {
    const productPage: Record<string, unknown> = { list: [], pageNum: 1, pageSize: 12, pages: 0, total: 0 };
    productPage[field] = invalidValue;
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation === 'company.detail') {
        return { operation: 'company.detail', data: { companyId: '42', name: 'Liaoning Pumps' } };
      }
      return { operation: 'product.list', data: productPage } as never;
    });

    await expectInvalidResponse(loadCompanyDetailBundle(createClient(request), '42', new AbortController().signal));
  });

  it('rejects a related product that belongs to another company', async () => {
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation === 'company.detail') {
        return { operation: 'company.detail', data: { companyId: '42', name: 'Liaoning Pumps' } };
      }
      return {
        operation: 'product.list',
        data: {
          list: [{ productId: '9', companyId: '43', name: 'Wrong product' }],
          pageNum: 1,
          pageSize: 12,
          pages: 1,
          total: 1,
        },
      };
    });

    await expectInvalidResponse(loadCompanyDetailBundle(createClient(request), '42', new AbortController().signal));
  });

  it.each([
    ['imageUrl', 7],
    ['summary', false],
    ['industry', 7],
    ['companyName', false],
    ['companyIndustry', 7],
    ['city', false],
    ['district', 7],
    ['address', false],
    ['contactName', 7],
    ['phone', false],
    ['collected', 1],
  ])('rejects a related product whose optional %s has the wrong type', async (field, invalidValue) => {
    const product: Record<string, unknown> = { productId: '9', companyId: '42', name: 'Industrial pump' };
    product[field] = invalidValue;
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation === 'company.detail') {
        return { operation: 'company.detail', data: { companyId: '42', name: 'Liaoning Pumps' } };
      }
      return {
        operation: 'product.list',
        data: { list: [product], pageNum: 1, pageSize: 12, pages: 1, total: 1 },
      } as never;
    });

    await expectInvalidResponse(loadCompanyDetailBundle(createClient(request), '42', new AbortController().signal));
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
    ['https://cloud.lslnii.com/logo.png', 'https://cloud.lslnii.com/logo.png'],
    ['https://sjbang.lslnii.com/images/product.png', 'https://sjbang.lslnii.com/images/product.png'],
    ['https://www.lslnii.com/company/logo.png', 'https://www.lslnii.com/company/logo.png'],
    ['HTTPS://CLOUD.LSLNII.COM:443/logo.png', 'https://cloud.lslnii.com/logo.png'],
    ['//SJBANG.LSLNII.COM:443/images/product.png', 'https://sjbang.lslnii.com/images/product.png'],
  ])('normalizes an exact trusted business HTTPS image source: %s', (value, expected) => {
    expect(parseSafeCompanyImageUrl(value)).toBe(expected);
  });

  it.each([
    'http://cloud.lslnii.com/logo.png',
    '//cloud.lslnii.com:8443/logo.png',
    'https://user:password@cloud.lslnii.com/logo.png',
    'https://cloud.lslnii.com.evil.example/logo.png',
    'https://evilcloud.lslnii.com/logo.png',
    'https://cdn.lslnii.com/logo.png',
    'https://localhost/logo.png',
    'https://127.0.0.1/logo.png',
    'https://10.0.0.8/logo.png',
    'https://8.8.8.8/logo.png',
    'https://assets.example.com/logo.png',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'javascript:alert(1)',
    'file:///secret',
  ])('rejects an image source outside the exact HTTPS business allowlist: %s', (value) => {
    expect(parseSafeCompanyImageUrl(value)).toBeNull();
  });
});
