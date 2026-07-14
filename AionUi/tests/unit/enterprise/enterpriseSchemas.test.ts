import { describe, expect, it } from 'vitest';

import {
  commonResultSchema,
  enterpriseCompanyRawSchema,
  enterpriseLoginStatusSchema,
  enterpriseRequestSchema,
  enterpriseUserContextSchema,
  parseEnterpriseResponse,
} from '@/common/enterprise/schemas';

describe('enterprise schemas', () => {
  it('rejects unsuccessful CommonResult envelopes', () => {
    const result = commonResultSchema.safeParse({
      success: false,
      message: 'permission denied',
      data: null,
    });

    expect(result.success).toBe(false);
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

  it('rejects renderer request fields outside the operation whitelist', () => {
    const result = enterpriseRequestSchema.safeParse({
      operation: 'company.detail',
      payload: { companyId: '12' },
      method: 'DELETE',
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

  it('accepts a list envelope from the project drill endpoint', () => {
    const response = parseEnterpriseResponse('project.drill', {
      list: [{ name: 'Cement', level: 'materialName', projectCount: 8 }],
    });

    expect(response).toMatchObject({
      operation: 'project.drill',
      data: [{ label: 'Cement', dimension: 'materialName', projectCount: 8 }],
    });
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
});
