import { describe, expect, it } from 'vitest';

import {
  commonResultSchema,
  enterpriseCompanyRawSchema,
  enterpriseLoginStatusSchema,
  enterpriseRequestSchema,
  enterpriseUserContextSchema,
  parseCommonResult,
  parseEnterpriseResponse,
} from '@/common/enterprise/schemas';

const validDashboardPayload = {
  kpi: {
    projectCount: 9,
    categoryL1Count: 2,
    categoryL2Count: 3,
    shortNameCount: 4,
    materialNameCount: 5,
    investmentTotalYi: 6,
  },
  regionDistribution: [],
  budgetDistribution: [],
  categoryDistribution: [],
  shortNameTop: [],
};

describe('enterprise schemas', () => {
  it('rejects unsuccessful CommonResult envelopes', () => {
    const result = commonResultSchema.safeParse({
      success: false,
      message: 'permission denied',
      data: null,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a successful CommonResult that omits data and names the operation', () => {
    expect(() => parseCommonResult({ success: true }, 'company.list')).toThrow(/company\.list.*data/i);
  });

  it('accepts a CommonResult whose data property is present with null', () => {
    expect(parseCommonResult({ success: true, data: null }, 'company.detail')).toBeNull();
  });

  it('rejects inherited CommonResult success and data properties', () => {
    const inheritedSuccess = Object.assign(Object.create({ success: true }), { data: null });
    const inheritedData = Object.assign(Object.create({ data: { secret: 1 } }), { success: true });

    expect(() => parseCommonResult(inheritedSuccess, 'probe.success')).toThrow(/probe\.success/i);
    expect(() => parseCommonResult(inheritedData, 'probe.data')).toThrow(/probe\.data/i);
  });

  it.each(['__proto__', 'constructor'])(
    'rejects the dangerous own CommonResult key %s without leaking its value',
    (key) => {
      const input = JSON.parse(`{"success":true,"data":null,"${key}":"sensitive-value"}`) as unknown;

      expect(() => parseCommonResult(input, 'probe.dangerous')).toThrow(/probe\.dangerous/i);
      try {
        parseCommonResult(input, 'probe.dangerous');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain('sensitive-value');
      }
    }
  );

  it('accepts a null-prototype CommonResult when required fields are own properties', () => {
    const input = Object.create(null) as { success: boolean; data: null };
    Object.defineProperties(input, {
      success: { enumerable: true, value: true },
      data: { enumerable: true, value: null },
    });

    expect(parseCommonResult(input, 'probe.nullPrototype')).toBeNull();
  });

  it.each(['WAITING', 'AUTHENTICATED', 'REGISTER_REQUIRED', 'EXPIRED'])(
    'accepts the supported login status %s',
    (status) => {
      expect(enterpriseLoginStatusSchema.parse(status)).toBe(status);
    }
  );

  it('rejects an unsupported login status', () => {
    expect(enterpriseLoginStatusSchema.safeParse('APPROVED').success).toBe(false);
  });

  it('normalizes numeric user and company identifiers to strings', () => {
    const context = enterpriseUserContextSchema.parse({
      registered: true,
      openid: 10001,
      ID: 20002,
      userName: 'Demo User',
      COMPANY_ID: 30003,
      companyName: 'Demo Company',
      comLevel: 3,
      roleId: 40004,
    });

    expect(context).toEqual({
      registered: true,
      openId: '10001',
      userId: '20002',
      userName: 'Demo User',
      companyId: '30003',
      companyName: 'Demo Company',
      companyLevel: 3,
      roleId: '40004',
    });
  });

  it('rejects an unsafe numeric value in an optional identifier field', () => {
    expect(() =>
      enterpriseUserContextSchema.parse({
        registered: true,
        openId: 'openid-1',
        userId: Number.MAX_SAFE_INTEGER + 1,
      })
    ).toThrow(/auth\.userContext.*userId/i);
  });

  it('preserves leading zeroes in opaque string identifiers', () => {
    expect(
      enterpriseUserContextSchema.parse({
        registered: true,
        openId: '0000123',
      })
    ).toMatchObject({ openId: '0000123' });
  });

  it('preserves extra backend fields only in passthrough raw schema results', () => {
    const raw = enterpriseCompanyRawSchema.parse({
      id: 12,
      name: 'Acme',
      legacyRank: 'A',
    });

    expect(raw.legacyRank).toBe('A');
  });

  it('accepts safe own passthrough fields from a null-prototype raw record', () => {
    const input = Object.create(null) as { id: number; name: string; legacyRank: string };
    Object.defineProperties(input, {
      id: { enumerable: true, value: 12 },
      name: { enumerable: true, value: 'Acme' },
      legacyRank: { enumerable: true, value: 'A' },
    });

    expect(enterpriseCompanyRawSchema.parse(input)).toMatchObject({
      id: 12,
      name: 'Acme',
      legacyRank: 'A',
    });
  });

  it('does not read a non-enumerable company identifier polluted onto Object.prototype', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'id');
    try {
      // eslint-disable-next-line no-extend-native -- exercise non-enumerable prototype pollution regression
      Object.defineProperty(Object.prototype, 'id', {
        value: 77,
        writable: true,
        configurable: true,
        enumerable: false,
      });

      expect(() => parseEnterpriseResponse('company.detail', { name: 'Acme' })).toThrow(/company\.detail.*companyId/i);
    } finally {
      // eslint-disable-next-line no-extend-native -- restore the pre-test native prototype descriptor
      if (originalDescriptor) Object.defineProperty(Object.prototype, 'id', originalDescriptor);
      else delete (Object.prototype as { id?: unknown }).id;
    }
  });

  it('does not copy a non-enumerable request keyword polluted onto Object.prototype', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'keyword');
    try {
      // eslint-disable-next-line no-extend-native -- exercise non-enumerable prototype pollution regression
      Object.defineProperty(Object.prototype, 'keyword', {
        value: 'polluted-keyword',
        writable: true,
        configurable: true,
        enumerable: false,
      });

      const result = enterpriseRequestSchema.safeParse({
        operation: 'company.list',
        payload: { pageNum: 1, pageSize: 20 },
      });

      expect(result.success).toBe(true);
      if (result.success) expect(Object.hasOwn(result.data.payload, 'keyword')).toBe(false);
    } finally {
      // eslint-disable-next-line no-extend-native -- restore the pre-test native prototype descriptor
      if (originalDescriptor) Object.defineProperty(Object.prototype, 'keyword', originalDescriptor);
      else delete (Object.prototype as { keyword?: unknown }).keyword;
    }
  });

  it('rejects an accessor without executing its getter', () => {
    let getterCalls = 0;
    const input = { name: 'Acme' } as { id?: number; name: string };
    Object.defineProperty(input, 'id', {
      enumerable: true,
      configurable: true,
      get: () => {
        getterCalls += 1;
        return 12;
      },
    });

    expect(() => parseEnterpriseResponse('company.detail', input)).toThrow(/company\.detail/i);
    expect(getterCalls).toBe(0);
  });

  it('rejects symbol keys on raw response objects', () => {
    const privateKey = Symbol('private');
    const input = { id: 12, name: 'Acme', [privateKey]: 'sensitive-symbol-value' };

    expect(() => parseEnterpriseResponse('company.detail', input)).toThrow(/company\.detail/i);
  });

  it('does not leak passthrough backend fields into the stable response model', () => {
    expect(
      parseEnterpriseResponse('company.detail', {
        id: 12,
        name: 'Acme',
        legacyRank: 'A',
      })
    ).toEqual({
      operation: 'company.detail',
      data: { companyId: '12', name: 'Acme' },
    });
  });

  it('rejects a company detail envelope with a custom polluted prototype', () => {
    const input = {
      company: { id: 12, name: 'Acme' },
    };
    Object.setPrototypeOf(input, { polluted: true });

    expect(() => parseEnterpriseResponse('company.detail', input)).toThrow(/company\.detail/i);
  });

  it('rejects an inherited project drill envelope list', () => {
    const input = Object.create({
      list: [{ name: 'Cement', level: 'materialName', projectCount: 1 }],
    });

    expect(() => parseEnterpriseResponse('project.drill', input)).toThrow(/project\.drill/i);
  });

  it('rejects dangerous own keys on response envelopes', () => {
    const input = JSON.parse('{"company":{"id":12,"name":"Acme"},"constructor":"sensitive-envelope-value"}') as unknown;

    try {
      parseEnterpriseResponse('company.detail', input);
      expect.unreachable('expected a dangerous envelope key error');
    } catch (error) {
      expect((error as Error).message).toMatch(/company\.detail/i);
      expect((error as Error).message).not.toContain('sensitive-envelope-value');
    }
  });

  it('rejects renderer request fields outside the operation whitelist', () => {
    const result = enterpriseRequestSchema.safeParse({
      operation: 'company.detail',
      payload: { companyId: '12' },
      method: 'DELETE',
    });

    expect(result.success).toBe(false);
  });

  it.each(['url', 'URL', 'header', 'headers', 'method', 'httpMethod'])(
    'rejects the top-level renderer request field %s',
    (field) => {
      expect(
        enterpriseRequestSchema.safeParse({
          operation: 'company.detail',
          payload: { companyId: '12' },
          [field]: 'forbidden',
        }).success
      ).toBe(false);
    }
  );

  it.each(['url', 'URL', 'header', 'headers', 'method', 'httpMethod'])(
    'rejects the renderer payload field %s',
    (field) => {
      expect(
        enterpriseRequestSchema.safeParse({
          operation: 'company.detail',
          payload: { companyId: '12', [field]: 'forbidden' },
        }).success
      ).toBe(false);
    }
  );

  it('rejects an unknown enterprise operation', () => {
    expect(
      enterpriseRequestSchema.safeParse({
        operation: 'company.delete',
        payload: { companyId: '12' },
      }).success
    ).toBe(false);
  });

  it('rejects inherited enterprise operation and payload properties', () => {
    const inheritedRequest = Object.create({
      operation: 'company.detail',
      payload: { companyId: '12' },
    });
    const inheritedPayload = {
      operation: 'company.detail',
      payload: Object.create({ companyId: '12' }),
    };

    expect(enterpriseRequestSchema.safeParse(inheritedRequest).success).toBe(false);
    expect(enterpriseRequestSchema.safeParse(inheritedPayload).success).toBe(false);
  });

  it('rejects a request with a custom polluted prototype', () => {
    const request = {
      operation: 'company.detail',
      payload: { companyId: '12' },
    };
    Object.setPrototypeOf(request, { polluted: true });

    expect(enterpriseRequestSchema.safeParse(request).success).toBe(false);
  });

  it.each(['__proto__', 'constructor'])('rejects dangerous own request and payload keys named %s', (key) => {
    const topLevel = JSON.parse(`{"operation":"company.detail","payload":{"companyId":"12"},"${key}":true}`) as unknown;
    const payload = JSON.parse(`{"operation":"company.detail","payload":{"companyId":"12","${key}":true}}`) as unknown;

    expect(enterpriseRequestSchema.safeParse(topLevel).success).toBe(false);
    expect(enterpriseRequestSchema.safeParse(payload).success).toBe(false);
  });

  it('accepts a null-prototype request with own operation and payload properties', () => {
    const payload = Object.create(null) as { companyId: string };
    Object.defineProperty(payload, 'companyId', { enumerable: true, value: '12' });
    const request = Object.create(null) as {
      operation: 'company.detail';
      payload: { companyId: string };
    };
    Object.defineProperties(request, {
      operation: { enumerable: true, value: 'company.detail' },
      payload: { enumerable: true, value: payload },
    });

    expect(enterpriseRequestSchema.safeParse(request).success).toBe(true);
  });

  it('accepts company level and VIP filters in company list requests', () => {
    const result = enterpriseRequestSchema.safeParse({
      operation: 'company.list',
      payload: {
        companyLevel: 1.2,
        vip: true,
        pageNum: 1,
        pageSize: 20,
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts the product region filters supported by the enterprise product catalog', () => {
    expect(
      enterpriseRequestSchema.safeParse({
        operation: 'product.list',
        payload: {
          province: '辽宁省',
          city: '沈阳市',
          district: '浑南区',
          pageNum: 1,
          pageSize: 20,
        },
      }).success
    ).toBe(true);
  });

  it.each(['project-7', '0', '-0', '+1', '1.2', '901?phone=13800000000', '1'.repeat(32)])(
    'rejects the noncanonical project detail request identity %s',
    (hpInfoId) => {
      expect(
        enterpriseRequestSchema.safeParse({
          operation: 'project.detail',
          payload: { hpInfoId },
        }).success
      ).toBe(false);
    }
  );

  it.each(['901', '-901'])('accepts a bounded non-zero signed project detail request identity: %s', (hpInfoId) => {
    expect(
      enterpriseRequestSchema.safeParse({
        operation: 'project.detail',
        payload: { hpInfoId },
      }).success
    ).toBe(true);
  });

  it.each([
    ['keyword', 'x'.repeat(101)],
    ['categoryL1', 'x'.repeat(201)],
    ['materialName', 'x'.repeat(201)],
    ['province', 'x'.repeat(101)],
    ['publishedFrom', 'x'.repeat(33)],
  ])('rejects an overlong project list %s before IPC', (field, value) => {
    expect(
      enterpriseRequestSchema.safeParse({
        operation: 'project.list',
        payload: { [field]: value, pageNum: 1, pageSize: 20 },
      }).success
    ).toBe(false);
  });

  it.each([
    { operation: 'project.list', payload: { pageNum: 1_000_001, pageSize: 20 } },
    { operation: 'project.list', payload: { pageNum: 1, pageSize: 101 } },
    { operation: 'project.dashboard', payload: { runId: 'x'.repeat(101) } },
    { operation: 'project.drill', payload: { level: 'l1', categoryL2: 'x'.repeat(201) } },
    {
      operation: 'project.list',
      payload: { minInvestment: 1_000_000_000_001, pageNum: 1, pageSize: 20 },
    },
  ] as const)('rejects an unreasonable project request boundary before IPC', (request) => {
    expect(enterpriseRequestSchema.safeParse(request).success).toBe(false);
  });

  it.each([
    {
      operation: 'company.list',
      payload: { pageNum: Number.MAX_SAFE_INTEGER + 1, pageSize: 20 },
    },
    {
      operation: 'product.list',
      payload: { pageNum: 1, pageSize: Number.MAX_SAFE_INTEGER + 1 },
    },
    {
      operation: 'project.drill',
      payload: { level: 'l1', minProjectCount: Number.MAX_SAFE_INTEGER + 1 },
    },
  ] as const)('rejects unsafe integer values in renderer request payloads', (request) => {
    expect(enterpriseRequestSchema.safeParse(request).success).toBe(false);
  });

  it('rejects the unconfirmed contact-state company filter', () => {
    const result = enterpriseRequestSchema.safeParse({
      operation: 'company.list',
      payload: {
        contactState: 'CONTACTED',
        pageNum: 1,
        pageSize: 20,
      },
    });

    expect(result.success).toBe(false);
  });

  it('normalizes company list aliases and pagination', () => {
    const response = parseEnterpriseResponse('company.list', {
      LIST: [
        {
          ID: 12,
          NAME: 'Acme',
          SHORT_NAME: 'AC',
          INDUSTRY: 'Manufacturing',
          PROVINCE: 'Liaoning',
          COM_ABS: 'Industrial controls and equipment',
          INPUT_TIME: '2026-07-14 10:30:00',
          IS_COLLECT: 1,
        },
      ],
      PAGE_NUM: 2,
      PAGE_SIZE: 20,
      TOTAL: 41,
    });

    expect(response).toEqual({
      operation: 'company.list',
      data: {
        list: [
          {
            companyId: '12',
            name: 'Acme',
            shortName: 'AC',
            industry: 'Manufacturing',
            province: 'Liaoning',
            businessSummary: 'Industrial controls and equipment',
            updatedAt: '2026-07-14 10:30:00',
            collected: true,
          },
        ],
        pageNum: 2,
        pageSize: 20,
        pages: 3,
        total: 41,
      },
    });
  });

  it('accepts zero for empty-page totals and page counts', () => {
    expect(
      parseEnterpriseResponse('company.list', {
        list: [],
        pageNum: 1,
        pageSize: 20,
        pages: 0,
        total: 0,
      })
    ).toMatchObject({ data: { pages: 0, total: 0 } });
  });

  it('accepts canonical decimal integer strings for pagination', () => {
    expect(
      parseEnterpriseResponse('company.list', {
        list: [],
        pageNum: '2',
        pageSize: '20',
        pages: '0',
        total: '0',
      })
    ).toMatchObject({ data: { pageNum: 2, pageSize: 20, pages: 0, total: 0 } });
  });

  it.each([
    ['pageNum', 0],
    ['pageSize', 0],
    ['pageNum', -1],
    ['pageSize', 1.5],
    ['pages', -1],
    ['pages', 1.5],
    ['total', -1],
    ['total', 1.5],
    ['pageSize', Number.POSITIVE_INFINITY],
    ['total', Number.NaN],
    ['pageNum', '9007199254740993'],
    ['pageNum', Number.MAX_SAFE_INTEGER + 1],
    ['pageNum', '0x10'],
    ['pageNum', '0b10'],
    ['pageNum', '1e3'],
  ])('rejects invalid pagination value %s=%s', (field, value) => {
    expect(() =>
      parseEnterpriseResponse('company.list', {
        list: [],
        pageNum: 1,
        pageSize: 20,
        pages: 1,
        total: 1,
        [field]: value,
      })
    ).toThrow(new RegExp(`company\\.list.*${field}`, 'i'));
  });

  it('requires a company identifier and names the failed operation', () => {
    expect(() => parseEnterpriseResponse('company.detail', { name: 'Acme' })).toThrow(/company\.detail.*companyId/i);
  });

  it('rejects a boolean value for a required display name', () => {
    expect(() => parseEnterpriseResponse('company.detail', { id: 12, name: true })).toThrow(/company\.detail.*name/i);
  });

  it.each([
    ['company.detail', { id: 12, name: 0 }, /company\.detail.*name/i],
    ['product.detail', { id: 51, name: 12345, companyId: 12 }, /product\.detail.*name/i],
    ['project.detail', { hpInfoId: 901, projectName: 2026 }, /project\.detail.*projectName/i],
  ] as const)('rejects a numeric value for required business text in %s', (operation, data, expectedError) => {
    expect(() => parseEnterpriseResponse(operation, data)).toThrow(expectedError);
  });

  it('rejects numeric values for optional business text instead of stringifying them', () => {
    expect(() => parseEnterpriseResponse('company.detail', { id: 12, name: 'Acme', address: 123 })).toThrow(
      /company\.detail/i
    );
  });

  it('rejects unsafe numeric identifiers without changing their value into a rounded string', () => {
    expect(() =>
      parseEnterpriseResponse('company.detail', {
        id: Number.MAX_SAFE_INTEGER + 1,
        name: 'Acme',
      })
    ).toThrow(/company\.detail.*companyId/i);
  });

  it('preserves opaque string identifiers exactly', () => {
    expect(
      parseEnterpriseResponse('company.detail', {
        id: '9007199254740993',
        name: 'Acme',
      })
    ).toMatchObject({ data: { companyId: '9007199254740993' } });
  });

  it.each([
    ['', ''],
    ['1234', '****'],
    ['13800000000', '138********'],
    ['138****0000', '138********'],
    ['***********', '***********'],
  ])('masks a company-detail phone at the shared response boundary: %s', (phone, expectedPhone) => {
    const response = parseEnterpriseResponse('company.detail', {
      ID: 12,
      NAME: 'Acme',
      PHONE: phone,
    });

    expect(response).toMatchObject({ data: { phone: expectedPhone } });
    expect(JSON.stringify(response)).not.toContain(phone === expectedPhone ? '138****0000' : phone || 'raw-phone');
  });

  it.each([
    ['extension text', '13800000000转8012', '138********转****', false],
    ['space grouping', '138 0000 0000转8012', '138 **** ****转****', false],
    ['dot grouping', '138.0000.0000转8012', '138.****.****转****', false],
    ['parentheses', '(138) 0000-0000', '(138) ****-****', false],
    ['existing stars', '13800000000****', '138************', undefined],
    ['slash-separated phones', '13800000000 / 02412345678', '138******** / ***********', false],
    ['partially masked digits', '1380000****', '138********', undefined],
    ['slash grouping', '138/0000/0000 WeChat', '138/****/**** WeChat', false],
    ['full-width digits', '１３８００００００００****', '１３８************', undefined],
    ['slash-connected phones', '13800000000/02412345678', '138********/***********', false],
  ] as const)('masks all but the first three decimal digits for %s', (_label, phone, expectedPhone, purchased) => {
    const response = parseEnterpriseResponse('project.detail', {
      HP_INFO_ID: 901,
      PROJECT_NAME: 'Factory Project',
      PHONE: phone,
      IS_PURCHASED: purchased,
    });

    expect(response).toMatchObject({ data: { phone: expectedPhone } });
    if (purchased === false) expect(response).toMatchObject({ data: { purchased: false } });
    expect(((response.data as { phone: string }).phone.match(/\p{Nd}/gu) ?? []).length).toBeLessThan(7);
  });

  it('uses COM_INTRO for the profile description while keeping COM_ABS as the business summary', () => {
    expect(
      parseEnterpriseResponse('company.detail', {
        ID: 12,
        NAME: 'Acme',
        COM_INTRO: 'Long-form enterprise introduction',
        COM_ABS: 'Industrial controls and equipment',
      })
    ).toMatchObject({
      data: {
        description: 'Long-form enterprise introduction',
        businessSummary: 'Industrial controls and equipment',
      },
    });
  });

  it('normalizes product detail aliases into the stable model', () => {
    const response = parseEnterpriseResponse('product.detail', {
      ID: 51,
      PRODUCTS_NAME: 'Industrial Pump',
      COMPANY_ID: 12,
      COMPANY_NAME: 'Acme',
      PRODUCT_ABS: 'High-efficiency pump',
      COMP_PHONE: '13800000000',
    });

    expect(response).toEqual({
      operation: 'product.detail',
      data: {
        productId: '51',
        name: 'Industrial Pump',
        companyId: '12',
        companyName: 'Acme',
        summary: 'High-efficiency pump',
        phone: '138********',
      },
    });
  });

  it('keeps product and company names and industries separate for product list and detail records', () => {
    const rawProduct = {
      id: 51,
      productsName: 'Product catalog name',
      name: 'Enterprise projection name',
      companyName: 'Dedicated enterprise name',
      companyId: 12,
      industry: 'Product industry',
      compIndustry: 'Enterprise industry',
      industry1: 'Legacy enterprise industry',
    };
    const list = parseEnterpriseResponse('product.list', {
      list: [rawProduct],
      pageNum: 1,
      pageSize: 20,
      pages: 1,
      total: 1,
    });
    const detail = parseEnterpriseResponse('product.detail', rawProduct);

    expect(list).toMatchObject({
      data: {
        list: [
          {
            name: 'Product catalog name',
            companyName: 'Dedicated enterprise name',
            industry: 'Product industry',
            companyIndustry: 'Enterprise industry',
          },
        ],
      },
    });
    expect(detail).toMatchObject({
      data: {
        name: 'Product catalog name',
        companyName: 'Dedicated enterprise name',
        industry: 'Product industry',
        companyIndustry: 'Enterprise industry',
      },
    });
  });

  it('normalizes product-list company aliases and masks product phones for list and detail', () => {
    const list = parseEnterpriseResponse('product.list', {
      list: [
        {
          id: 51,
          productsName: '工业泵',
          companyId: 12,
          name: '辽宁装备企业',
          industry: '产品自填行业',
          industry1: '装备制造',
          province: '产品自填省份',
          province1: '辽宁省',
          city: '产品自填城市',
          city1: '沈阳市',
          district: '产品自填区县',
          district1: '浑南区',
          address: '产品自填地址',
          compAddress: '沈阳市浑南区产业路 8 号',
          contactName: '产品自填联系人',
          compContactPerson: '企业联系人',
          phone: '13900000000',
          compPhone: '13800000000',
        },
      ],
      pageNum: 1,
      pageSize: 20,
      pages: 1,
      total: 1,
    });
    const detail = parseEnterpriseResponse('product.detail', {
      id: 51,
      productsName: '工业泵',
      companyId: 12,
      compPhone: '13900000000',
    });

    expect(list).toMatchObject({
      data: {
        list: [
          {
            companyName: '辽宁装备企业',
            industry: '产品自填行业',
            companyIndustry: '装备制造',
            province: '辽宁省',
            city: '沈阳市',
            district: '浑南区',
            address: '沈阳市浑南区产业路 8 号',
            contactName: '企业联系人',
            phone: '138********',
          },
        ],
      },
    });
    expect(detail).toMatchObject({ data: { phone: '139********' } });
    expect(JSON.stringify({ list, detail })).not.toMatch(/13800000000|13900000000/);
  });

  it('normalizes nested project dashboard metrics and distributions', () => {
    const response = parseEnterpriseResponse('project.dashboard', {
      runId: 'RUN-1',
      kpi: {
        projectCount: 9,
        categoryL1Count: 2,
        categoryL2Count: 3,
        shortNameCount: 4,
        materialNameCount: 5,
        investmentTotalYi: 6,
      },
      regionDistribution: [{ name: 'Shenyang', value: 7 }],
      budgetDistribution: [],
      categoryDistribution: [],
      shortNameTop: [],
    });

    expect(response).toEqual({
      operation: 'project.dashboard',
      data: {
        runId: 'RUN-1',
        projectCount: 9,
        categoryL1Count: 2,
        categoryL2Count: 3,
        materialShortNameCount: 4,
        materialNameCount: 5,
        investmentTotalYi: 6,
        regionDistribution: [{ label: 'Shenyang', value: 7 }],
        budgetDistribution: [],
        categoryDistribution: [],
        materialTop: [],
      },
    });
  });

  it('accepts zero counts and a decimal investment amount on the dashboard', () => {
    expect(
      parseEnterpriseResponse('project.dashboard', {
        ...validDashboardPayload,
        kpi: {
          projectCount: 0,
          categoryL1Count: 0,
          categoryL2Count: 0,
          shortNameCount: 0,
          materialNameCount: 0,
          investmentTotalYi: 12.5,
        },
      })
    ).toMatchObject({
      data: {
        projectCount: 0,
        materialNameCount: 0,
        investmentTotalYi: 12.5,
      },
    });
  });

  it.each([
    ['0', 0],
    ['0.1', 0.1],
    ['0.29', 0.29],
    ['1.005', 1.005],
    ['123.45', 123.45],
    ['12.50', 12.5],
    ['000123.4500', 123.45],
    ['0.1000', 0.1],
    [`0.${'0'.repeat(307)}1`, 1e-308],
  ])('accepts the decimal dashboard investment amount %s', (investmentTotalYi, expected) => {
    expect(
      parseEnterpriseResponse('project.dashboard', {
        ...validDashboardPayload,
        kpi: { ...validDashboardPayload.kpi, investmentTotalYi },
      })
    ).toMatchObject({ data: { investmentTotalYi: expected } });
  });

  it.each([
    ['projectCount', -1],
    ['categoryL1Count', 1.5],
    ['categoryL2Count', -1],
    ['shortNameCount', 1.5],
    ['materialNameCount', -1],
    ['projectCount', Number.POSITIVE_INFINITY],
    ['materialNameCount', Number.NaN],
    ['projectCount', '9007199254740993'],
    ['projectCount', Number.MAX_SAFE_INTEGER + 1],
    ['projectCount', '0x10'],
    ['projectCount', '0b10'],
    ['projectCount', '1e3'],
  ])('rejects invalid dashboard count %s=%s', (field, value) => {
    expect(() =>
      parseEnterpriseResponse('project.dashboard', {
        ...validDashboardPayload,
        kpi: { ...validDashboardPayload.kpi, [field]: value },
      })
    ).toThrow(new RegExp(`project\\.dashboard.*${field}`, 'i'));
  });

  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects invalid dashboard investment amount %s',
    (investmentTotalYi) => {
      expect(() =>
        parseEnterpriseResponse('project.dashboard', {
          ...validDashboardPayload,
          kpi: { ...validDashboardPayload.kpi, investmentTotalYi },
        })
      ).toThrow(/project\.dashboard.*investmentTotalYi/i);
    }
  );

  it.each(['0x10', '0b10', '1e3', '9007199254740993'])(
    'rejects the non-decimal or unsafe dashboard investment amount %s',
    (investmentTotalYi) => {
      expect(() =>
        parseEnterpriseResponse('project.dashboard', {
          ...validDashboardPayload,
          kpi: { ...validDashboardPayload.kpi, investmentTotalYi },
        })
      ).toThrow(/project\.dashboard.*investmentTotalYi/i);
    }
  );

  it.each(['9007199254740991.1', '9007199254740990.9', '79461974101831.18', `0.${'0'.repeat(400)}1`])(
    'rejects a decimal dashboard amount that cannot round-trip safely',
    (investmentTotalYi) => {
      try {
        parseEnterpriseResponse('project.dashboard', {
          ...validDashboardPayload,
          kpi: { ...validDashboardPayload.kpi, investmentTotalYi },
        });
        expect.unreachable('expected an unsafe decimal amount error');
      } catch (error) {
        expect((error as Error).message).toMatch(/project\.dashboard.*investmentTotalYi/i);
        expect((error as Error).message).not.toContain(investmentTotalYi);
      }
    }
  );

  it('rejects a dashboard that omits a required distribution', () => {
    expect(() =>
      parseEnterpriseResponse('project.dashboard', {
        kpi: {
          projectCount: 9,
          categoryL1Count: 2,
          categoryL2Count: 3,
          shortNameCount: 4,
          materialNameCount: 5,
          investmentTotalYi: 6,
        },
        budgetDistribution: [],
        categoryDistribution: [],
        shortNameTop: [],
      })
    ).toThrow(/project\.dashboard.*regionDistribution/i);
  });

  it('normalizes project drill aliases without inventing missing counts', () => {
    const response = parseEnterpriseResponse('project.drill', [
      {
        NAME: 'Building Materials',
        LEVEL: 'l1',
        CATEGORY_L1: 'Building Materials',
        MATERIAL_NAME_COUNT: 28,
        PROJECT_COUNT: 96,
      },
    ]);

    expect(response).toEqual({
      operation: 'project.drill',
      data: [
        {
          label: 'Building Materials',
          dimension: 'l1',
          categoryL1: 'Building Materials',
          materialNameCount: 28,
          projectCount: 96,
        },
      ],
    });
  });

  it.each(['l1', 'l2', 'shortName', 'materialName'] as const)(
    'accepts the explicit project drill dimension %s',
    (level) => {
      expect(parseEnterpriseResponse('project.drill', [{ name: 'Known', level, projectCount: 1 }])).toMatchObject({
        data: [{ dimension: level }],
      });
    }
  );

  it.each([
    [{ categoryL1: 'Building' }, 'l1'],
    [{ categoryL2: 'Cement' }, 'l2'],
    [{ materialShortName: 'Portland cement' }, 'shortName'],
    [{ materialName: 'P.O 42.5 cement' }, 'materialName'],
  ] as const)('infers project drill dimension %s as %s', (classification, dimension) => {
    expect(parseEnterpriseResponse('project.drill', [{ ...classification, projectCount: 1 }])).toMatchObject({
      data: [{ dimension }],
    });
  });

  it('rejects a project drill item whose dimension cannot be inferred', () => {
    expect(() => parseEnterpriseResponse('project.drill', [{ name: 'Unknown', projectCount: 1 }])).toThrow(
      /project\.drill.*dimension/i
    );
  });

  it('does not echo an invalid project drill dimension in the error message', () => {
    const sensitiveDimension = `sensitive-dimension-${'x'.repeat(200)}`;
    try {
      parseEnterpriseResponse('project.drill', [{ name: 'Unknown', level: sensitiveDimension, projectCount: 1 }]);
      expect.unreachable('expected an invalid drill dimension error');
    } catch (error) {
      expect((error as Error).message).toMatch(/project\.drill.*dimension/i);
      expect((error as Error).message).not.toContain(sensitiveDimension);
    }
  });

  it('accepts a list envelope from the project drill endpoint', () => {
    const response = parseEnterpriseResponse('project.drill', {
      list: [{ name: 'Cement', level: 'materialName', projectCount: 8 }],
    });

    expect(response).toMatchObject({
      operation: 'project.drill',
      data: [{ label: 'Cement', dimension: 'materialName', projectCount: 8 }],
    });
  });

  it('accepts zero project and material counts in drill items', () => {
    expect(
      parseEnterpriseResponse('project.drill', [
        {
          name: 'Cement',
          level: 'materialName',
          materialNameCount: 0,
          projectCount: 0,
        },
      ])
    ).toMatchObject({ data: [{ materialNameCount: 0, projectCount: 0 }] });
  });

  it.each([
    ['projectCount', -1],
    ['projectCount', 1.5],
    ['materialNameCount', -1],
    ['categoryL2Count', 1.5],
  ])('rejects invalid drill count %s=%s', (field, value) => {
    expect(() =>
      parseEnterpriseResponse('project.drill', [
        { name: 'Cement', level: 'materialName', projectCount: 1, [field]: value },
      ])
    ).toThrow(new RegExp(`project\\.drill.*${field}`, 'i'));
  });

  it('normalizes project list construction dates into a display period', () => {
    const response = parseEnterpriseResponse('project.list', {
      list: [
        {
          hpInfoId: 9001,
          projectName: 'Factory Project',
          startDate: '2026-08',
          endDate: '2027-06',
        },
      ],
      pageNum: 1,
      pageSize: 10,
      total: 1,
    });

    expect(response).toMatchObject({
      operation: 'project.list',
      data: {
        list: [{ hpInfoId: '9001', constructionPeriod: '2026-08 – 2027-06' }],
      },
    });
  });

  it.each(['project-7', '0', '-0', '+1', '1.2', '901?phone=13800000000', '1'.repeat(32)])(
    'rejects the noncanonical project response identity %s',
    (hpInfoId) => {
      expect(() =>
        parseEnterpriseResponse('project.list', {
          list: [{ hpInfoId, projectName: 'Protected project' }],
          pageNum: 1,
          pageSize: 10,
          total: 1,
        })
      ).toThrow(/project\.list.*hpInfoId/i);
      expect(() =>
        parseEnterpriseResponse('project.detail', {
          hpInfoId,
          projectName: 'Protected project',
        })
      ).toThrow(/project\.detail.*hpInfoId/i);
    }
  );

  it('normalizes a negative project response identity', () => {
    expect(
      parseEnterpriseResponse('project.detail', {
        hpInfoId: '-901',
        projectName: 'Legacy project',
      })
    ).toMatchObject({ operation: 'project.detail', data: { hpInfoId: '-901' } });
  });

  it('normalizes project detail identifiers and displayed legacy fields', () => {
    const response = parseEnterpriseResponse('project.detail', {
      HP_INFO_ID: 901,
      PROJECT_NAME: 'Factory Project',
      DANWEI: 'Acme Construction',
      LIANXIREN: 'Jane',
      ZONGTOUZI: '5000',
      JIANSHEZHOUQI: '11 months',
      YUANCAILIAO: 'Steel and cement',
      REQ_URL: 'https://example.test/project/901',
      IS_PURCHASED: '1',
    });

    expect(response).toEqual({
      operation: 'project.detail',
      data: {
        hpInfoId: '901',
        projectName: 'Factory Project',
        constructionUnit: 'Acme Construction',
        contactName: 'Jane',
        totalInvestment: 5000,
        constructionPeriod: '11 months',
        materials: 'Steel and cement',
        sourceUrl: 'https://example.test/project/901',
        purchased: true,
      },
    });
  });

  it.each([
    ['explicitly unpurchased', false],
    ['missing purchase state', undefined],
  ] as const)('masks a project phone before renderer IPC when access is %s', (_label, purchased) => {
    const response = parseEnterpriseResponse('project.detail', {
      HP_INFO_ID: 901,
      PROJECT_NAME: 'Factory Project',
      PHONE: '13800000000',
      IS_PURCHASED: purchased,
    });

    expect(response).toMatchObject({ data: { phone: '138********' } });
    if (purchased === false) expect(response).toMatchObject({ data: { purchased: false } });
    expect(JSON.stringify(response)).not.toContain('13800000000');
  });

  it('keeps a purchased project phone available after the service confirms access', () => {
    expect(
      parseEnterpriseResponse('project.detail', {
        HP_INFO_ID: 901,
        PROJECT_NAME: 'Factory Project',
        PHONE: '13800000000',
        IS_PURCHASED: true,
      })
    ).toMatchObject({ data: { phone: '13800000000', purchased: true } });
  });

  it('keeps Unicode and slash-formatted phones unchanged when purchase access is explicit', () => {
    expect(
      parseEnterpriseResponse('project.detail', {
        HP_INFO_ID: 901,
        PROJECT_NAME: 'Factory Project',
        PHONE: '１３８/0000/0000 WeChat',
        IS_PURCHASED: true,
      })
    ).toMatchObject({ data: { phone: '１３８/0000/0000 WeChat', purchased: true } });
  });

  it('accepts a precise ordinary decimal project investment string', () => {
    expect(
      parseEnterpriseResponse('project.detail', {
        hpInfoId: 901,
        projectName: 'Factory Project',
        totalInvestment: '123.45',
      })
    ).toMatchObject({ data: { totalInvestment: 123.45 } });
  });

  it('rejects a project investment string whose fractional tail would be lost', () => {
    const totalInvestment = '9007199254740991.1';
    try {
      parseEnterpriseResponse('project.detail', {
        hpInfoId: 901,
        projectName: 'Factory Project',
        totalInvestment,
      });
      expect.unreachable('expected an unsafe decimal amount error');
    } catch (error) {
      expect((error as Error).message).toMatch(/project\.detail.*totalInvestment/i);
      expect((error as Error).message).not.toContain(totalInvestment);
    }
  });

  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects invalid project investment amount %s',
    (totalInvestment) => {
      expect(() =>
        parseEnterpriseResponse('project.detail', {
          hpInfoId: 901,
          projectName: 'Factory Project',
          totalInvestment,
        })
      ).toThrow(/project\.detail.*totalInvestment/i);
    }
  );
});
