import { describe, expect, it, vi } from 'vitest';

import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import {
  ProductDataError,
  buildProductListQuery,
  loadProductDetail,
  loadProductList,
  parseProductId,
  parseSafeProductImageUrl,
} from '@/renderer/pages/enterprise/products/productData';

const createClient = (request: EnterpriseClient['request']): Pick<EnterpriseClient, 'request'> => ({ request });

const query = buildProductListQuery(
  {
    keyword: ' pump ',
    industry: ' Equipment ',
    province: ' Liaoning ',
    city: ' Shenyang ',
    district: ' Hunnan ',
  },
  { pageNum: 2, pageSize: 20 }
);

const product = {
  productId: '9',
  companyId: '42',
  name: 'Industrial pump',
  companyName: 'Alpha Hydraulics',
  industry: 'Equipment',
  province: 'Liaoning',
  city: 'Shenyang',
  district: 'Hunnan',
  address: 'No. 8 Industry Road',
  summary: '<strong>High pressure</strong>',
  imageUrl: 'https://cloud.lslnii.com/product/pump.png',
  phone: '1380000****',
};

const productPage = (overrides: Record<string, unknown> = {}) => ({
  operation: 'product.list' as const,
  data: {
    list: [product],
    pageNum: 2,
    pageSize: 20,
    pages: 3,
    total: 41,
    ...overrides,
  },
});

const expectCode = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ProductDataError);
  expect(error).toMatchObject({ code });
};

describe('product list boundary', () => {
  it('trims supported filters and preserves explicit paging', () => {
    expect(query).toEqual({
      keyword: 'pump',
      industry: 'Equipment',
      province: 'Liaoning',
      city: 'Shenyang',
      district: 'Hunnan',
      pageNum: 2,
      pageSize: 20,
    });
  });

  it('loads only the matching product operation and exact page', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(productPage());
    await expect(loadProductList(createClient(request), query, new AbortController().signal)).resolves.toEqual(
      productPage().data
    );
    expect(request).toHaveBeenCalledWith({ operation: 'product.list', payload: query });
  });

  it.each([
    ['missing list', { pages: 3, total: 41, pageNum: 2, pageSize: 20 }],
    ['wrong page', { list: [product], pages: 3, total: 41, pageNum: 1, pageSize: 20 }],
    ['wrong page size', { list: [product], pages: 3, total: 41, pageNum: 2, pageSize: 10 }],
    ['invalid product identity', { list: [{ ...product, productId: 'product-9' }] }],
    ['invalid company identity', { list: [{ ...product, companyId: '../42' }] }],
    ['wrong optional field type', { list: [{ ...product, companyName: 42 }] }],
  ])('rejects %s', async (_name, data) => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({ operation: 'product.list', data });
    await expectCode(loadProductList(createClient(request), query, new AbortController().signal), 'INVALID_RESPONSE');
  });

  it('rejects the wrong operation without touching its data getter', async () => {
    let reads = 0;
    const response = Object.create(null);
    Object.defineProperties(response, {
      operation: { enumerable: true, value: 'company.list' },
      data: {
        enumerable: true,
        get: () => {
          reads += 1;
          return productPage().data;
        },
      },
    });
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(response);
    await expectCode(loadProductList(createClient(request), query, new AbortController().signal), 'INVALID_RESPONSE');
    expect(reads).toBe(0);
  });

  it('never invokes getters in a product record', async () => {
    let reads = 0;
    const hostile = { ...product } as Record<string, unknown>;
    Object.defineProperty(hostile, 'companyName', {
      enumerable: true,
      get: () => {
        reads += 1;
        return 'secret';
      },
    });
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(productPage({ list: [hostile] }));
    await expectCode(loadProductList(createClient(request), query, new AbortController().signal), 'INVALID_RESPONSE');
    expect(reads).toBe(0);
  });

  it('discards a response after cancellation wins', async () => {
    const controller = new AbortController();
    const request = vi.fn<EnterpriseClient['request']>(async () => {
      controller.abort();
      return productPage();
    });
    await expect(loadProductList(createClient(request), query, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('product detail boundary', () => {
  it('loads the exact numeric product identity and keeps masked contacts', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'product.detail',
      data: product,
    });
    await expect(loadProductDetail(createClient(request), '9', new AbortController().signal)).resolves.toEqual(product);
    expect(request).toHaveBeenCalledWith({ operation: 'product.detail', payload: { productId: '9' } });
  });

  it('loads signed product and company identities', async () => {
    const signedProduct = { ...product, productId: '-9', companyId: '-42' };
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'product.detail',
      data: signedProduct,
    });

    await expect(loadProductDetail(createClient(request), '-9', new AbortController().signal)).resolves.toEqual(
      signedProduct
    );
    expect(request).toHaveBeenCalledWith({ operation: 'product.detail', payload: { productId: '-9' } });
  });

  it.each(['', '0', '-0', '+1', '1.2', 'product-9', '9?phone=13800000000', '90071992547409931234567890123456'])(
    'rejects invalid route identity %s before request',
    async (productId) => {
      const request = vi.fn<EnterpriseClient['request']>();
      expect(() => parseProductId(productId)).toThrowError(ProductDataError);
      await expectCode(
        loadProductDetail(createClient(request), productId, new AbortController().signal),
        'INVALID_REQUEST'
      );
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['wrong operation', { operation: 'company.detail', data: product }],
    ['wrong returned product', { operation: 'product.detail', data: { ...product, productId: '10' } }],
    ['invalid related company', { operation: 'product.detail', data: { ...product, companyId: 'company-42' } }],
    ['wrong optional field', { operation: 'product.detail', data: { ...product, phone: 13800000000 } }],
  ])('rejects %s', async (_name, response) => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(response);
    await expectCode(loadProductDetail(createClient(request), '9', new AbortController().signal), 'INVALID_RESPONSE');
  });
});

describe('product image policy', () => {
  it.each([
    ['https://cloud.lslnii.com/a.png', 'https://cloud.lslnii.com/a.png'],
    ['http://cloud.lslnii.com/a.png', 'https://cloud.lslnii.com/a.png'],
    ['//sjbang.lslnii.com/a.png', 'https://sjbang.lslnii.com/a.png'],
    [' https://www.lslnii.com/a.png ', 'https://www.lslnii.com/a.png'],
  ])('accepts the exact trusted HTTPS hosts: %s', (value, expected) => {
    expect(parseSafeProductImageUrl(value)).toBe(expected);
  });

  it.each([
    'https://evil.lslnii.com/a.png',
    'https://cloud.lslnii.com:444/a.png',
    'https://user@cloud.lslnii.com/a.png',
    'data:image/png;base64,AAAA',
  ])('rejects unsafe image URL %s', (value) => {
    expect(parseSafeProductImageUrl(value)).toBeNull();
  });
});
