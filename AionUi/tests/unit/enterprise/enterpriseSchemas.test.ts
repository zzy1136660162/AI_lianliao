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

  it('preserves extra backend fields only in passthrough raw schema results', () => {
    const raw = enterpriseCompanyRawSchema.parse({
      id: 12,
      name: 'Acme',
      legacyRank: 'A',
    });

    expect(raw.legacyRank).toBe('A');
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
        phone: '13800000000',
      },
    });
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
    ['projectCount', -1],
    ['categoryL1Count', 1.5],
    ['categoryL2Count', -1],
    ['shortNameCount', 1.5],
    ['materialNameCount', -1],
    ['projectCount', Number.POSITIVE_INFINITY],
    ['materialNameCount', Number.NaN],
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
