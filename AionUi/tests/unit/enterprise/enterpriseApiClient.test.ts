import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EnterpriseOperation, EnterpriseRequest, EnterpriseUserContext } from '@/common/enterprise/contracts';
import {
  EnterpriseApiClient,
  EnterpriseApiError,
  type EnterpriseApiErrorCode,
  type EnterpriseApiTransport,
} from '@process/services/enterprise/enterpriseApiClient';
import { ENTERPRISE_API_ROUTES } from '@process/services/enterprise/enterpriseApiRoutes';

const REGISTERED_CONTEXT: Readonly<EnterpriseUserContext> = Object.freeze({
  registered: true,
  openId: 'openid-sensitive-001',
  userId: 'user-10',
  companyId: 'company-current-20',
});

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const responseWithJsonValue = (value: unknown): Response => {
  const response = jsonResponse(null);
  Object.defineProperty(response, 'json', { value: async () => value });
  return response;
};

const responseWithFinalUrl = (body: BodyInit, finalUrl: string, init: ResponseInit = {}): Response => {
  const response = new Response(body, init);
  Object.defineProperty(response, 'url', {
    value: finalUrl,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  return response;
};

const successfulData: Record<EnterpriseOperation, unknown> = {
  'company.list': {
    list: [{ id: 'company-target-1', name: 'Acme' }],
    pageNum: 1,
    pageSize: 20,
    pages: 1,
    total: 1,
  },
  'company.detail': { id: 'company-target-1', name: 'Acme' },
  'product.list': {
    list: [{ id: 'product-1', name: 'Pump', companyId: 'company-target-1' }],
    pageNum: 1,
    pageSize: 20,
    pages: 1,
    total: 1,
  },
  'product.detail': { id: 'product-1', name: 'Pump', companyId: 'company-target-1' },
  'project.dashboard': {
    kpi: {
      projectCount: 1,
      categoryL1Count: 1,
      categoryL2Count: 1,
      shortNameCount: 1,
      materialNameCount: 1,
      investmentTotalYi: 1,
    },
    regionDistribution: [],
    budgetDistribution: [],
    categoryDistribution: [],
    shortNameTop: [],
  },
  'project.drill': [{ name: 'Cement', level: 'materialName', projectCount: 1 }],
  'project.list': {
    list: [{ hpInfoId: '901', projectName: 'Factory' }],
    pageNum: 1,
    pageSize: 20,
    pages: 1,
    total: 1,
  },
  'project.detail': { hpInfoId: '901', projectName: 'Factory' },
};

const successResponse = (operation: EnterpriseOperation): Response =>
  jsonResponse({ success: true, data: successfulData[operation] });

const captureTransport = (operation: EnterpriseOperation) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const transport: EnterpriseApiTransport = async (url, init) => {
    calls.push({ url, init });
    return successResponse(operation);
  };
  return { calls, transport };
};

const expectApiError = async (promise: Promise<unknown>, code: EnterpriseApiErrorCode): Promise<EnterpriseApiError> => {
  try {
    await promise;
    expect.unreachable(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(EnterpriseApiError);
    expect((error as EnterpriseApiError).code).toBe(code);
    return error as EnterpriseApiError;
  }
};

describe('enterprise API routes', () => {
  it('exposes only the fixed relative cloud routes', () => {
    expect(ENTERPRISE_API_ROUTES).toEqual({
      'company.list': 'cloud-api/CompanyController/getQiYeMaCompanyList',
      'company.detail': 'cloud-api/CompanyController/getDetailcompany',
      'product.list': 'cloud-api/CompanyController/getFindProducts',
      'product.detail': 'cloud-api/CompanyController/FindProduct',
      'project.dashboard': 'cloud-api/OpportunityController/getAiMaterialDashboard',
      'project.drill': 'cloud-api/OpportunityController/getAiMaterialDrillList',
      'project.list': 'cloud-api/OpportunityController/getAiMaterialProjectList',
      'project.detail': 'cloud-api/OpportunityController/getAiMaterialProjectDetail',
      'auth.create': 'cloud-api/CommonWxGZHQrCodeLogIn/desktop/create',
      'auth.poll': 'cloud-api/CommonWxGZHQrCodeLogIn/desktop/poll',
      'auth.userContext': 'cloud-api/DesktopEnterpriseController/userContext',
    });
    expect(
      Object.values(ENTERPRISE_API_ROUTES).every((route) => !route.startsWith('/') && !route.includes('://'))
    ).toBe(true);
  });

  it('freezes the route map against runtime absolute-URL replacement', () => {
    expect(Object.isFrozen(ENTERPRISE_API_ROUTES)).toBe(true);
    const mutableView = ENTERPRISE_API_ROUTES as unknown as Record<string, string>;
    const originalRoute = ENTERPRISE_API_ROUTES['company.list'];

    expect(Reflect.set(mutableView, 'company.list', 'https://evil.test/collect')).toBe(false);
    expect(ENTERPRISE_API_ROUTES['company.list']).toBe(originalRoute);
  });
});

describe('EnterpriseApiClient base URL policy', () => {
  it.each([
    'http://cloud.lslnii.com/',
    'https://example.com/',
    'https://cloud.lslnii.com.evil.test/',
    'https://user:password@cloud.lslnii.com/',
    'https://cloud.lslnii.com:444/',
    'https://cloud.lslnii.com/cloud-api/',
    'https://cloud.lslnii.com/?next=evil',
    'https://cloud.lslnii.com/#fragment',
  ])('rejects the unsafe production base URL %s', (baseUrl) => {
    expect(() => new EnterpriseApiClient({ baseUrl, environment: 'production' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_BASE_URL' })
    );
  });

  it('accepts and normalizes the production cloud base URL', async () => {
    const { calls, transport } = captureTransport('product.list');
    const client = new EnterpriseApiClient({
      baseUrl: 'https://cloud.lslnii.com',
      environment: 'production',
      transport,
    });

    await client.request({ operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } }, REGISTERED_CONTEXT);

    expect(calls[0]?.url).toBe('https://cloud.lslnii.com/cloud-api/CompanyController/getFindProducts');
  });

  it('serializes product region filters for the existing product-list endpoint', async () => {
    const { calls, transport } = captureTransport('product.list');
    const client = new EnterpriseApiClient({ transport });

    await client.request(
      {
        operation: 'product.list',
        payload: {
          province: '辽宁省',
          city: '沈阳市',
          district: '浑南区',
          pageNum: 1,
          pageSize: 20,
        },
      },
      REGISTERED_CONTEXT
    );

    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      province: '辽宁省',
      city: '沈阳市',
      district: '浑南区',
    });
  });

  it.each([
    'https://cloud.lslnii.com',
    'http://localhost:4173',
    'https://localhost:4173/',
    'http://127.0.0.1:8080',
    'https://127.0.0.1/',
  ])('allows the development base URL %s', (baseUrl) => {
    expect(() => new EnterpriseApiClient({ baseUrl, environment: 'development' })).not.toThrow();
  });

  it.each([
    'http://cloud.lslnii.com/',
    'https://example.com/',
    'http://localhost.evil.test/',
    'ftp://localhost/',
    'http://user@localhost/',
  ])('rejects the non-allowlisted development base URL %s', (baseUrl) => {
    expect(() => new EnterpriseApiClient({ baseUrl, environment: 'development' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_BASE_URL' })
    );
  });

  it('rejects an unknown runtime environment instead of enabling development hosts', () => {
    expect(
      () =>
        new EnterpriseApiClient({
          baseUrl: 'http://localhost:4173',
          environment: 'staging' as 'development',
        })
    ).toThrowError(expect.objectContaining({ code: 'INVALID_BASE_URL' }));
  });
});

describe('EnterpriseApiClient timeout policy', () => {
  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'rejects invalid timeoutMs=%s before transport',
    (timeoutMs) => {
      let calls = 0;
      const transport: EnterpriseApiTransport = async () => {
        calls += 1;
        return successResponse('product.list');
      };

      expect(() => new EnterpriseApiClient({ timeoutMs, transport })).toThrowError(
        expect.objectContaining({ code: 'INVALID_REQUEST' })
      );
      expect(calls).toBe(0);
    }
  );

  it.each([1, 2_147_483_647])('accepts bounded integer timeoutMs=%s', (timeoutMs) => {
    expect(() => new EnterpriseApiClient({ timeoutMs })).not.toThrow();
  });
});

describe('EnterpriseApiClient request boundary', () => {
  it.each([
    { operation: 'unknown.operation', payload: {} },
    { operation: 'company.detail', payload: { companyId: 'target', url: 'https://evil.test' } },
    { operation: 'company.detail', payload: { companyId: 'target', method: 'GET' } },
    {
      operation: 'company.detail',
      payload: { companyId: 'target', headers: { Authorization: 'secret' } },
    },
    { operation: 'company.detail', payload: { companyId: 'target', redirect: 'follow' } },
    { operation: 'company.detail', payload: { companyId: 'target' }, url: 'https://evil.test' },
    { operation: 'company.detail', payload: { companyId: 'target' }, method: 'GET' },
    {
      operation: 'company.detail',
      payload: { companyId: 'target' },
      headers: { Authorization: 'secret' },
    },
    { operation: 'company.detail', payload: { companyId: 'target' }, redirect: 'follow' },
  ])('rejects an unknown operation or caller-controlled transport field before IO', async (unsafeRequest) => {
    let calls = 0;
    const transport: EnterpriseApiTransport = async () => {
      calls += 1;
      return successResponse('company.detail');
    };
    const client = new EnterpriseApiClient({ transport });

    await expectApiError(
      client.request(unsafeRequest as unknown as EnterpriseRequest, REGISTERED_CONTEXT),
      'INVALID_REQUEST'
    );

    expect(calls).toBe(0);
  });

  it('uses the fixed route, POST method, and JSON-only headers', async () => {
    const { calls, transport } = captureTransport('company.detail');
    const client = new EnterpriseApiClient({ transport });

    await client.request(
      { operation: 'company.detail', payload: { companyId: 'company-target-1' } },
      REGISTERED_CONTEXT
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://cloud.lslnii.com/cloud-api/CompanyController/getDetailcompany');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.redirect).toBe('error');
    expect(calls[0]?.init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
  });

  it.each(['project-7', '0', '-1', '1.2', '901?phone=13800000000', '1'.repeat(32)])(
    'rejects the noncanonical project detail identity %s before transport',
    async (hpInfoId) => {
      let calls = 0;
      const client = new EnterpriseApiClient({
        transport: async () => {
          calls += 1;
          return successResponse('project.detail');
        },
      });

      await expectApiError(
        client.request({ operation: 'project.detail', payload: { hpInfoId } }, REGISTERED_CONTEXT),
        'INVALID_REQUEST'
      );
      expect(calls).toBe(0);
    }
  );

  it('does not echo rejected request data, openId, or phone numbers', async () => {
    const phone = '13800000000';
    const unsafeRequest = {
      operation: 'company.detail',
      payload: { companyId: 'company-target-1', phone },
    } as unknown as EnterpriseRequest;
    const client = new EnterpriseApiClient({
      transport: async () => successResponse('company.detail'),
    });

    const error = await expectApiError(client.request(unsafeRequest, REGISTERED_CONTEXT), 'INVALID_REQUEST');

    expect(error.message).not.toContain(phone);
    expect(error.message).not.toContain(REGISTERED_CONTEXT.openId);
    expect(error.message).not.toContain('company-target-1');
  });
});

describe('EnterpriseApiClient serialization and context injection', () => {
  const cases: Array<{
    operation: EnterpriseOperation;
    request: EnterpriseRequest;
    expectedBody: Record<string, unknown>;
  }> = [
    {
      operation: 'company.list',
      request: {
        operation: 'company.list',
        payload: {
          keyword: 'steel',
          industry: 'Manufacturing',
          province: 'Liaoning',
          city: 'Shenyang',
          district: 'Hunnan',
          companyLevel: 3.1,
          pageNum: 2,
          pageSize: 30,
        },
      },
      expectedBody: {
        name: 'steel',
        industry: 'Manufacturing',
        province: 'Liaoning',
        city: 'Shenyang',
        district: 'Hunnan',
        comLevel: 3.1,
        pageNum: 2,
        pageSize: 30,
        openId: REGISTERED_CONTEXT.openId,
        fromCompanyId: REGISTERED_CONTEXT.companyId,
        fromUserId: REGISTERED_CONTEXT.userId,
      },
    },
    {
      operation: 'company.detail',
      request: { operation: 'company.detail', payload: { companyId: 'company-target-9' } },
      expectedBody: {
        id: 'company-target-9',
        openId: REGISTERED_CONTEXT.openId,
        userId: REGISTERED_CONTEXT.userId,
        fromCompanyId: REGISTERED_CONTEXT.companyId,
        pageNum: 1,
        pageSize: 10,
      },
    },
    {
      operation: 'product.list',
      request: {
        operation: 'product.list',
        payload: {
          keyword: 'pump',
          industry: 'Equipment',
          companyId: 'company-target-3',
          parkId: 'park-4',
          sort: 'NEW_SORT',
          pageNum: 3,
          pageSize: 12,
        },
      },
      expectedBody: {
        name: 'pump',
        industry: 'Equipment',
        companyId: 'company-target-3',
        parkId: 'park-4',
        sorted: 'NEW_SORT',
        pageNum: 3,
        pageSize: 12,
        openId: REGISTERED_CONTEXT.openId,
        fromCompanyId: REGISTERED_CONTEXT.companyId,
        fromUserId: REGISTERED_CONTEXT.userId,
      },
    },
    {
      operation: 'product.detail',
      request: { operation: 'product.detail', payload: { productId: 'product-5' } },
      expectedBody: { id: 'product-5', userId: REGISTERED_CONTEXT.userId },
    },
    {
      operation: 'project.dashboard',
      request: { operation: 'project.dashboard', payload: { runId: 'run-6' } },
      expectedBody: {
        runId: 'run-6',
        openId: REGISTERED_CONTEXT.openId,
        companyId: REGISTERED_CONTEXT.companyId,
      },
    },
    {
      operation: 'project.drill',
      request: {
        operation: 'project.drill',
        payload: {
          level: 'materialName',
          runId: 'run-6',
          province: 'Liaoning',
          city: 'Shenyang',
          budgetRange: '100-500',
          categoryL1: 'Building',
          categoryL2: 'Materials',
          materialShortName: 'Cement',
          materialName: 'P.O 42.5',
          minProjectCount: 80,
        },
      },
      expectedBody: {
        level: 'materialName',
        runId: 'run-6',
        province: 'Liaoning',
        city: 'Shenyang',
        budgetRange: '100-500',
        categoryL1: 'Building',
        categoryL2: 'Materials',
        materialShortName: 'Cement',
        materialName: 'P.O 42.5',
        minProjectCount: 80,
        openId: REGISTERED_CONTEXT.openId,
        companyId: REGISTERED_CONTEXT.companyId,
      },
    },
    {
      operation: 'project.list',
      request: {
        operation: 'project.list',
        payload: {
          keyword: 'factory',
          runId: 'run-6',
          categoryL1: 'Building',
          categoryL2: 'Materials',
          materialShortName: 'Cement',
          materialName: 'P.O 42.5',
          province: 'Liaoning',
          city: 'Shenyang',
          budgetRange: '100-500',
          constructionNature: 'New',
          investmentType: 'Private',
          publishedFrom: '2026-01-01',
          publishedTo: '2026-07-01',
          minInvestment: 1000,
          maxInvestment: 8000,
          pageNum: 4,
          pageSize: 20,
        },
      },
      expectedBody: {
        keyword: 'factory',
        runId: 'run-6',
        categoryL1: 'Building',
        categoryL2: 'Materials',
        materialShortName: 'Cement',
        materialName: 'P.O 42.5',
        province: 'Liaoning',
        city: 'Shenyang',
        budgetRange: '100-500',
        constructionNature: 'New',
        investmentType: 'Private',
        publishedFrom: '2026-01-01',
        publishedTo: '2026-07-01',
        minInvestment: 1000,
        maxInvestment: 8000,
        pageNum: 4,
        pageSize: 20,
        openId: REGISTERED_CONTEXT.openId,
        companyId: REGISTERED_CONTEXT.companyId,
      },
    },
    {
      operation: 'project.detail',
      request: { operation: 'project.detail', payload: { hpInfoId: '907' } },
      expectedBody: {
        hpInfoId: '907',
        openId: REGISTERED_CONTEXT.openId,
        companyId: REGISTERED_CONTEXT.companyId,
      },
    },
  ];

  it.each(cases)(
    'serializes $operation using only backend field names',
    async ({ operation, request, expectedBody }) => {
      const { calls, transport } = captureTransport(operation);
      const client = new EnterpriseApiClient({ transport });

      await client.request(request, REGISTERED_CONTEXT);

      expect(JSON.parse(String(calls[0]?.init.body))).toEqual(expectedBody);
    }
  );

  it('maps vip=true to the legacy VIP level when no explicit level exists', async () => {
    const { calls, transport } = captureTransport('company.list');
    const client = new EnterpriseApiClient({ transport });

    await client.request(
      { operation: 'company.list', payload: { vip: true, pageNum: 1, pageSize: 20 } },
      REGISTERED_CONTEXT
    );

    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ comLevel: -2, vip: true });
  });

  it('never serializes the VIP flag alongside an explicit member level', async () => {
    const { calls, transport } = captureTransport('company.list');
    const client = new EnterpriseApiClient({ transport });

    await client.request(
      { operation: 'company.list', payload: { companyLevel: 3.1, vip: true, pageNum: 1, pageSize: 20 } },
      REGISTERED_CONTEXT
    );

    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body.comLevel).toBe(3.1);
    expect(body).not.toHaveProperty('vip');
  });

  it('masks the raw company phone before the main-process response can cross IPC', async () => {
    const rawPhone = '13800000000';
    const client = new EnterpriseApiClient({
      transport: async () =>
        jsonResponse({
          success: true,
          data: {
            ID: 'company-target-1',
            NAME: 'Acme',
            PHONE: rawPhone,
            COM_INTRO: 'Detailed introduction',
            COM_ABS: 'Business summary',
          },
        }),
    });

    const response = await client.request(
      { operation: 'company.detail', payload: { companyId: 'company-target-1' } },
      REGISTERED_CONTEXT
    );

    expect(response).toMatchObject({
      operation: 'company.detail',
      data: {
        phone: '138********',
        description: 'Detailed introduction',
        businessSummary: 'Business summary',
      },
    });
    expect(JSON.stringify(response)).not.toContain(rawPhone);
  });

  it('preserves vip=false without converting it to the VIP level', async () => {
    const { calls, transport } = captureTransport('company.list');
    const client = new EnterpriseApiClient({ transport });

    await client.request(
      { operation: 'company.list', payload: { vip: false, pageNum: 1, pageSize: 20 } },
      REGISTERED_CONTEXT
    );

    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body.vip).toBe(false);
    expect(body).not.toHaveProperty('comLevel');
  });

  it('omits undefined fields and does not mutate the caller request or context', async () => {
    const request = Object.freeze({
      operation: 'product.list' as const,
      payload: Object.freeze({ keyword: undefined, pageNum: 1, pageSize: 20 }),
    });
    const context = Object.freeze({ ...REGISTERED_CONTEXT });
    const requestSnapshot = structuredClone(request);
    const contextSnapshot = structuredClone(context);
    const { calls, transport } = captureTransport('product.list');
    const client = new EnterpriseApiClient({ transport });

    await client.request(request, context);

    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      pageNum: 1,
      pageSize: 20,
      openId: REGISTERED_CONTEXT.openId,
      fromCompanyId: REGISTERED_CONTEXT.companyId,
      fromUserId: REGISTERED_CONTEXT.userId,
    });
    expect(request).toEqual(requestSnapshot);
    expect(context).toEqual(contextSnapshot);
  });

  it('keeps the company-detail target separate from the immutable identity context', async () => {
    const request = Object.freeze({
      operation: 'company.detail' as const,
      payload: Object.freeze({ companyId: 'company-target-99' }),
    });
    const context = Object.freeze({ ...REGISTERED_CONTEXT, companyId: 'company-current-88' });
    const requestSnapshot = structuredClone(request);
    const contextSnapshot = structuredClone(context);
    const { calls, transport } = captureTransport('company.detail');
    const client = new EnterpriseApiClient({ transport });

    await client.request(request, context);

    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      id: 'company-target-99',
      openId: REGISTERED_CONTEXT.openId,
      userId: REGISTERED_CONTEXT.userId,
      fromCompanyId: 'company-current-88',
      pageNum: 1,
      pageSize: 10,
    });
    expect(request).toEqual(requestSnapshot);
    expect(context).toEqual(contextSnapshot);
  });

  it.each([
    {
      label: 'unregistered company user',
      request: { operation: 'company.detail', payload: { companyId: 'target' } },
      context: { ...REGISTERED_CONTEXT, registered: false },
    },
    {
      label: 'blank company openId',
      request: { operation: 'company.list', payload: { pageNum: 1, pageSize: 20 } },
      context: { ...REGISTERED_CONTEXT, openId: ' ' },
    },
    {
      label: 'missing company userId',
      request: { operation: 'company.detail', payload: { companyId: 'target' } },
      context: { registered: true, openId: 'open', companyId: 'current' },
    },
    {
      label: 'missing company companyId',
      request: { operation: 'company.list', payload: { pageNum: 1, pageSize: 20 } },
      context: { registered: true, openId: 'open', userId: 'user' },
    },
    {
      label: 'unregistered product-list user',
      request: { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
      context: { ...REGISTERED_CONTEXT, registered: false },
    },
    {
      label: 'blank product-list openId',
      request: { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
      context: { ...REGISTERED_CONTEXT, openId: ' ' },
    },
    {
      label: 'missing product-list userId',
      request: { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
      context: { registered: true, openId: 'open', companyId: 'current' },
    },
    {
      label: 'missing product-list companyId',
      request: { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
      context: { registered: true, openId: 'open', userId: 'user' },
    },
    {
      label: 'missing product-detail userId',
      request: { operation: 'product.detail', payload: { productId: 'product' } },
      context: { registered: true, openId: 'open', companyId: 'current' },
    },
    {
      label: 'missing project companyId',
      request: { operation: 'project.dashboard', payload: {} },
      context: { registered: true, openId: 'open', userId: 'user' },
    },
  ])('rejects $label before transport', async ({ request, context }) => {
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return successResponse(request.operation as EnterpriseOperation);
      },
    });

    await expectApiError(
      client.request(request as EnterpriseRequest, context as EnterpriseUserContext),
      'MISSING_CONTEXT'
    );

    expect(calls).toBe(0);
  });

  it.each([
    { operation: 'company.list', payload: { pageNum: 1, pageSize: 20 } },
    { operation: 'company.detail', payload: { companyId: 'company-target' } },
    { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
    { operation: 'product.detail', payload: { productId: 'product-target' } },
    { operation: 'project.dashboard', payload: {} },
    { operation: 'project.drill', payload: { level: 'l1' } },
    { operation: 'project.list', payload: { pageNum: 1, pageSize: 20 } },
    { operation: 'project.detail', payload: { hpInfoId: '901' } },
  ] satisfies EnterpriseRequest[])('rejects missing identity for $operation before transport', async (request) => {
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return successResponse(request.operation);
      },
    });

    await expectApiError(client.request(request, { registered: false, openId: ' ' }), 'MISSING_CONTEXT');

    expect(calls).toBe(0);
  });
});

describe('EnterpriseApiClient transport and response errors', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('aborts the transport and settles as TIMEOUT even when transport ignores abort', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null = null;
    const transport: EnterpriseApiTransport = async (_url, init) => {
      signal = init.signal ?? null;
      return new Promise<Response>(() => undefined);
    };
    const client = new EnterpriseApiClient({ timeoutMs: 25, transport });

    const pending = client.request(
      { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
      REGISTERED_CONTEXT
    );
    const timeoutError = expectApiError(pending, 'TIMEOUT');
    await vi.advanceTimersByTimeAsync(25);
    const error = await timeoutError;

    expect(signal?.aborted).toBe(true);
    expect(error.message).not.toContain(REGISTERED_CONTEXT.openId);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles as TIMEOUT when response body parsing ignores abort', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null = null;
    const response = successResponse('product.list');
    Object.defineProperty(response, 'json', {
      value: () => new Promise<unknown>(() => undefined),
    });
    const client = new EnterpriseApiClient({
      timeoutMs: 25,
      transport: async (_url, init) => {
        signal = init.signal ?? null;
        return response;
      },
    });
    const unsettled = Symbol('unsettled');
    let outcome: unknown = unsettled;

    const pending = client.request(
      { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
      REGISTERED_CONTEXT
    );
    void pending.then(
      (value) => {
        outcome = value;
      },
      (error: unknown) => {
        outcome = error;
      }
    );
    await vi.advanceTimersByTimeAsync(25);

    expect(outcome).toBeInstanceOf(EnterpriseApiError);
    expect((outcome as EnterpriseApiError).code).toBe('TIMEOUT');
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('maps an abort-rejected response body to TIMEOUT without exposing its error', async () => {
    vi.useFakeTimers();
    const phone = '13800000000';
    let signal: AbortSignal | null = null;
    const response = successResponse('product.list');
    Object.defineProperty(response, 'json', {
      value: () =>
        new Promise<unknown>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error(`body failed for ${phone}`)), {
            once: true,
          });
        }),
    });
    const client = new EnterpriseApiClient({
      timeoutMs: 25,
      transport: async (_url, init) => {
        signal = init.signal ?? null;
        return response;
      },
    });

    const pending = client.request(
      { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
      REGISTERED_CONTEXT
    );
    const unsettled = Symbol('unsettled');
    let outcome: unknown = unsettled;
    void pending.then(
      (value) => {
        outcome = value;
      },
      (error: unknown) => {
        outcome = error;
      }
    );
    await vi.advanceTimersByTimeAsync(25);

    expect(outcome).toBeInstanceOf(EnterpriseApiError);
    expect((outcome as EnterpriseApiError).code).toBe('TIMEOUT');
    expect((outcome as EnterpriseApiError).message).not.toContain(phone);
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timeout after a completed request', async () => {
    vi.useFakeTimers();
    const client = new EnterpriseApiClient({
      timeoutMs: 25,
      transport: async () => successResponse('product.list'),
    });

    await client.request({ operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } }, REGISTERED_CONTEXT);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('maps a blocked redirect transport rejection to NETWORK without exposing dependency errors', async () => {
    const phone = '13800000000';
    let redirect: RequestRedirect | undefined;
    const client = new EnterpriseApiClient({
      transport: async (_url, init) => {
        redirect = init.redirect;
        throw new Error(`failed for ${REGISTERED_CONTEXT.openId} at ${phone}`);
      },
    });

    const error = await expectApiError(
      client.request({ operation: 'company.detail', payload: { companyId: 'target' } }, REGISTERED_CONTEXT),
      'NETWORK'
    );

    expect(redirect).toBe('error');
    expect(error.message).not.toContain(REGISTERED_CONTEXT.openId);
    expect(error.message).not.toContain(phone);
  });

  it('maps non-2xx status to HTTP without reading response content', async () => {
    const client = new EnterpriseApiClient({
      transport: async () => new Response('sensitive response body 13800000000', { status: 503 }),
    });

    const error = await expectApiError(
      client.request({ operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } }, REGISTERED_CONTEXT),
      'HTTP'
    );

    expect(error.message).not.toContain('13800000000');
  });

  it('maps malformed JSON to INVALID_JSON', async () => {
    const client = new EnterpriseApiClient({ transport: async () => new Response('{broken') });

    await expectApiError(
      client.request({ operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } }, REGISTERED_CONTEXT),
      'INVALID_JSON'
    );
  });

  it('maps a failed CommonResult to API_FAILURE without exposing its message', async () => {
    const phone = '13800000000';
    const client = new EnterpriseApiClient({
      transport: async () => jsonResponse({ success: false, message: `denied for ${phone}`, data: null }),
    });

    const error = await expectApiError(
      client.request({ operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } }, REGISTERED_CONTEXT),
      'API_FAILURE'
    );

    expect(error.message).not.toContain(phone);
  });

  it.each([
    ['missing success', { data: null, message: 'denied' }],
    ['missing data', { success: false, message: 'denied' }],
    ['missing message', { success: false, data: null }],
    ['non-boolean success', { success: 'false', data: null, message: 'denied' }],
    ['non-string message', { success: false, data: null, message: 42 }],
    ['invalid code', { success: false, data: null, message: 'denied', code: { nested: true } }],
  ])('maps a malformed failed CommonResult with %s to INVALID_RESPONSE', async (_label, envelope) => {
    const client = new EnterpriseApiClient({
      transport: async () => responseWithJsonValue(envelope),
    });

    await expectApiError(
      client.request({ operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } }, REGISTERED_CONTEXT),
      'INVALID_RESPONSE'
    );
  });

  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects the dangerous failed-envelope key %s without exposing its value',
    async (key) => {
      const sensitiveValue = `sensitive-${key}-13800000000`;
      const envelope = JSON.parse(
        `{"success":false,"data":null,"message":"denied","${key}":"${sensitiveValue}"}`
      ) as unknown;
      const client = new EnterpriseApiClient({
        transport: async () => responseWithJsonValue(envelope),
      });

      const error = await expectApiError(
        client.request({ operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } }, REGISTERED_CONTEXT),
        'INVALID_RESPONSE'
      );

      expect(error.message).not.toContain(sensitiveValue);
    }
  );

  it('rejects a failed CommonResult with a custom prototype', async () => {
    const envelope = Object.assign(Object.create({ inherited: 'sensitive-value' }), {
      success: false,
      data: null,
      message: 'denied',
    }) as unknown;
    const client = new EnterpriseApiClient({
      transport: async () => responseWithJsonValue(envelope),
    });

    await expectApiError(
      client.request({ operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } }, REGISTERED_CONTEXT),
      'INVALID_RESPONSE'
    );
  });

  it('rejects a failed CommonResult accessor without evaluating it', async () => {
    let accessorReads = 0;
    const envelope = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(envelope, {
      success: {
        enumerable: true,
        get: () => {
          accessorReads += 1;
          return false;
        },
      },
      data: { enumerable: true, value: null },
      message: { enumerable: true, value: 'denied' },
    });
    const client = new EnterpriseApiClient({
      transport: async () => responseWithJsonValue(envelope),
    });

    const outcome = await client
      .request({ operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } }, REGISTERED_CONTEXT)
      .catch((error: unknown) => error);

    expect(accessorReads).toBe(0);
    expect(outcome).toBeInstanceOf(EnterpriseApiError);
    expect((outcome as EnterpriseApiError).code).toBe('INVALID_RESPONSE');
  });

  it('maps an invalid CommonResult envelope to INVALID_RESPONSE', async () => {
    const client = new EnterpriseApiClient({
      transport: async () => jsonResponse({ success: true }),
    });

    await expectApiError(
      client.request({ operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } }, REGISTERED_CONTEXT),
      'INVALID_RESPONSE'
    );
  });

  it('maps operation-data schema failures to INVALID_RESPONSE', async () => {
    const client = new EnterpriseApiClient({
      transport: async () => jsonResponse({ success: true, data: { list: [] } }),
    });

    await expectApiError(
      client.request({ operation: 'company.list', payload: { pageNum: 1, pageSize: 20 } }, REGISTERED_CONTEXT),
      'INVALID_RESPONSE'
    );
  });
});

describe('EnterpriseApiClient.getUserContext', () => {
  it('rejects a blank openId before transport', async () => {
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return jsonResponse({ success: true, data: {} });
      },
    });

    await expectApiError(client.getUserContext('   '), 'INVALID_REQUEST');

    expect(calls).toBe(0);
  });

  it('posts only the openId and normalizes the returned context', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new EnterpriseApiClient({
      transport: async (url, init) => {
        calls.push({ url, init });
        return jsonResponse({
          success: true,
          data: {
            REGISTERED: 1,
            OPENID: 'openid-42',
            ID: 7,
            COMPANY_ID: 9,
            COMPANY_NAME: 'Acme',
          },
        });
      },
    });

    const context = await client.getUserContext('openid-42');

    expect(context).toEqual({
      registered: true,
      openId: 'openid-42',
      userId: '7',
      companyId: '9',
      companyName: 'Acme',
    });
    expect(calls[0]?.url).toBe('https://cloud.lslnii.com/cloud-api/DesktopEnterpriseController/userContext');
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ openId: 'openid-42' });
  });

  it('maps invalid user-context data to INVALID_RESPONSE without exposing the openId', async () => {
    const openId = 'openid-sensitive-999';
    const client = new EnterpriseApiClient({
      transport: async () => jsonResponse({ success: true, data: { registered: true } }),
    });

    const error = await expectApiError(client.getUserContext(openId), 'INVALID_RESPONSE');

    expect(error.message).not.toContain(openId);
  });
});

describe('EnterpriseApiClient QR authentication', () => {
  const qrByteLimit = 2 * 1024 * 1024;
  const loginKey = 'enterprise_desktop_Ab3Def456Gh7Jk8Lm9';
  const qrPath = `/cloud-api/CommonWxGZHQrCodeLogIn/ln1433/getNewJJGCLoginQRCode_ln1433?ratio=8&front_sign=${loginKey}`;
  const qrUrl = `https://cloud.lslnii.com${qrPath}`;
  const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

  const createResponseData = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    loginKey,
    qrPath,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    pollIntervalMs: 3000,
    ...overrides,
  });

  const createResponse = (overrides: Record<string, unknown> = {}): Response =>
    jsonResponse({ success: true, data: createResponseData(overrides) });

  const controlledQrResponse = (chunks: Uint8Array[], contentLength?: string) => {
    let index = 0;
    const read = vi.fn(async () => {
      const value = chunks[index];
      index += 1;
      return value === undefined ? { done: true, value: undefined } : { done: false, value };
    });
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const getReader = vi.fn(() => ({ read, cancel, releaseLock }));
    const combined = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const arrayBuffer = vi.fn(async () =>
      combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength)
    );
    const response = responseWithFinalUrl(pngBytes, qrUrl, {
      headers: contentLength === undefined ? undefined : { 'Content-Length': contentLength },
    });
    Object.defineProperty(response, 'body', {
      value: { getReader },
      writable: false,
      enumerable: false,
      configurable: true,
    });
    Object.defineProperty(response, 'arrayBuffer', {
      value: arrayBuffer,
      writable: false,
      enumerable: false,
      configurable: true,
    });
    return { response, read, cancel, releaseLock, getReader, arrayBuffer };
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates a session through the fixed POST route and downloads its QR PNG with a locked GET', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const expiresAt = new Date(Date.now() + 300_000).toISOString();
    const client = new EnterpriseApiClient({
      transport: async (url, init) => {
        calls.push({ url, init });
        if (calls.length === 1) {
          return jsonResponse({
            success: true,
            data: { loginKey, qrPath, expiresAt, pollIntervalMs: 3000 },
          });
        }
        return responseWithFinalUrl(pngBytes, qrUrl, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      },
    });

    const session = await client.createLoginSession();

    expect(session).toEqual({
      loginKey,
      qrDataUrl: `data:image/png;base64,${Buffer.from(pngBytes).toString('base64')}`,
      expiresAt,
      pollIntervalMs: 3000,
    });
    expect(calls.map(({ url }) => url)).toEqual([
      'https://cloud.lslnii.com/cloud-api/CommonWxGZHQrCodeLogIn/desktop/create',
      `https://cloud.lslnii.com${qrPath}`,
    ]);
    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(calls[1]?.init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: { Accept: 'image/png' },
    });
    expect(calls[1]?.init.body).toBeUndefined();
  });

  it('rejects an oversized declared QR body before reading it', async () => {
    const controlled = controlledQrResponse([pngBytes], String(qrByteLimit + 1));
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return calls === 1 ? createResponse() : controlled.response;
      },
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');

    expect(controlled.getReader).not.toHaveBeenCalled();
    expect(controlled.arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects a QR response without a readable body', async () => {
    const qrResponse = responseWithFinalUrl(pngBytes, qrUrl);
    Object.defineProperty(qrResponse, 'body', {
      value: null,
      writable: false,
      enumerable: false,
      configurable: true,
    });
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return calls === 1 ? createResponse() : qrResponse;
      },
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');
  });

  it.each(['', ' ', '+1', '-1', '1.5', '1e3', '1,2', '01', '9007199254740992'])(
    'rejects malformed Content-Length %j before accessing the QR body',
    async (contentLength) => {
      const controlled = controlledQrResponse([pngBytes]);
      Object.defineProperty(controlled.response, 'headers', {
        value: { get: () => contentLength },
        writable: false,
        enumerable: false,
        configurable: true,
      });
      let calls = 0;
      const client = new EnterpriseApiClient({
        transport: async () => {
          calls += 1;
          return calls === 1 ? createResponse() : controlled.response;
        },
      });

      await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');

      expect(controlled.getReader).not.toHaveBeenCalled();
      expect(controlled.arrayBuffer).not.toHaveBeenCalled();
    }
  );

  it('accepts a multi-chunk PNG whose total size is exactly 2MiB', async () => {
    const chunks = Array.from({ length: 4 }, () => new Uint8Array(qrByteLimit / 4));
    chunks[0]?.set(pngBytes.subarray(0, 8));
    const controlled = controlledQrResponse(chunks, String(qrByteLimit));
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return calls === 1 ? createResponse() : controlled.response;
      },
    });

    const result = await client.createLoginSession();

    expect(result.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(controlled.cancel).not.toHaveBeenCalled();
    expect(controlled.releaseLock).toHaveBeenCalledOnce();
  });

  it.each([
    ['without Content-Length', undefined],
    ['with a forged smaller Content-Length', '1'],
  ])('cancels a multi-chunk QR stream that exceeds 2MiB %s', async (_label, contentLength) => {
    const chunks = Array.from({ length: 4 }, () => new Uint8Array(qrByteLimit / 4));
    chunks[0]?.set(pngBytes.subarray(0, 8));
    chunks.push(Uint8Array.of(1));
    const controlled = controlledQrResponse(chunks, contentLength);
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return calls === 1 ? createResponse() : controlled.response;
      },
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');

    expect(controlled.cancel).toHaveBeenCalledOnce();
    expect(controlled.releaseLock).toHaveBeenCalledOnce();
  });

  it('does not wait for a hanging reader cancellation after the QR limit is exceeded', async () => {
    const chunks = [new Uint8Array(qrByteLimit), Uint8Array.of(1)];
    chunks[0]?.set(pngBytes.subarray(0, 8));
    const controlled = controlledQrResponse(chunks);
    controlled.cancel.mockImplementation(() => new Promise<void>(() => undefined));
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return calls === 1 ? createResponse() : controlled.response;
      },
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');

    expect(controlled.cancel).toHaveBeenCalledOnce();
    expect(controlled.releaseLock).toHaveBeenCalledOnce();
  });

  it('rejects a QR response whose final URL indicates an ignored redirect', async () => {
    const qrResponse = responseWithFinalUrl(pngBytes, 'https://evil.test/redirected.png', {
      status: 200,
    });
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return calls === 1 ? createResponse() : qrResponse;
      },
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');
  });

  it('rejects a QR response with an empty final URL', async () => {
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return calls === 1 ? createResponse() : new Response(pngBytes, { status: 200 });
      },
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');
  });

  it.each([
    ['invalid login key', { loginKey: 'enterprise_desktop_short' }],
    ['blank QR path', { qrPath: ' ' }],
    ['invalid expiry', { expiresAt: '2026-07-14' }],
    ['past expiry', { expiresAt: new Date(Date.now() - 60_000).toISOString() }],
    ['excessive expiry', { expiresAt: new Date(Date.now() + 360_000).toISOString() }],
    ['short polling interval', { pollIntervalMs: 999 }],
    ['long polling interval', { pollIntervalMs: 10_001 }],
    ['fractional polling interval', { pollIntervalMs: 3000.5 }],
  ])('rejects malformed create data with %s before downloading the QR image', async (_label, override) => {
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return createResponse(override);
      },
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');

    expect(calls).toBe(1);
  });

  it('rejects accessor-backed create data without evaluating it', async () => {
    let accessorReads = 0;
    const data = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(data, {
      loginKey: {
        enumerable: true,
        get: () => {
          accessorReads += 1;
          return loginKey;
        },
      },
      qrPath: { enumerable: true, value: qrPath },
      expiresAt: { enumerable: true, value: new Date(Date.now() + 300_000).toISOString() },
      pollIntervalMs: { enumerable: true, value: 3000 },
    });
    const client = new EnterpriseApiClient({
      transport: async () => responseWithJsonValue({ success: true, data }),
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');

    expect(accessorReads).toBe(0);
  });

  it.each([
    [
      'a custom prototype',
      () => Object.assign(Object.create({ inherited: 'sensitive' }), createResponseData()) as unknown,
    ],
    [
      'a symbol key',
      () => {
        const data = createResponseData() as Record<PropertyKey, unknown>;
        data[Symbol('secret')] = 'sensitive';
        return data;
      },
    ],
    ['a dangerous prototype key', () => ({ ...createResponseData(), prototype: 'sensitive' }) as unknown],
  ])('rejects create data with %s', async (_label, makeData) => {
    const client = new EnterpriseApiClient({
      transport: async () => responseWithJsonValue({ success: true, data: makeData() }),
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');
  });

  it('rejects an auth object wider than the shared own-key budget before QR download', async () => {
    const data = createResponseData();
    for (let index = 0; index < 2049; index += 1) data[`extra${index}`] = index;
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return calls === 1 ? responseWithJsonValue({ success: true, data }) : responseWithFinalUrl(pngBytes, qrUrl);
      },
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');

    expect(calls).toBe(1);
  });

  it('shares the auth node budget across sibling objects before QR download', async () => {
    const siblings: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (let index = 0; index < 256; index += 1) siblings[`node${index}`] = { value: index };
    const data = { ...createResponseData(), extra: siblings };
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return calls === 1 ? responseWithJsonValue({ success: true, data }) : responseWithFinalUrl(pngBytes, qrUrl);
      },
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');

    expect(calls).toBe(1);
  });

  it.each([
    [
      'cycle',
      () => {
        const data = createResponseData();
        data.extra = data;
        return data;
      },
    ],
    [
      'excessive depth',
      () => {
        const data = createResponseData();
        const level5 = { value: true };
        data.extra = { next: { next: { next: { next: level5 } } } };
        return data;
      },
    ],
  ])('keeps rejecting auth objects with a %s', async (_label, makeData) => {
    const client = new EnterpriseApiClient({
      transport: async () => responseWithJsonValue({ success: true, data: makeData() }),
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');
  });

  it.each([
    ['cross-origin URL', `https://evil.test${qrPath}`],
    [
      'wrong absolute path',
      `https://cloud.lslnii.com/cloud-api/CommonWxGZHQrCodeLogIn/desktop/create?ratio=8&front_sign=${loginKey}`,
    ],
    ['userinfo', `https://user@cloud.lslnii.com${qrPath}`],
    ['hash', `${qrPath}#fragment`],
    ['duplicate ratio', `${qrPath}&ratio=8`],
    ['duplicate front_sign', `${qrPath}&front_sign=${loginKey}`],
    ['extra query', `${qrPath}&next=https://evil.test`],
    [
      'encoded path',
      `/cloud-api/CommonWxGZHQrCodeLogIn/ln1433/%67etNewJJGCLoginQRCode_ln1433?ratio=8&front_sign=${loginKey}`,
    ],
    [
      'encoded query',
      `/cloud-api/CommonWxGZHQrCodeLogIn/ln1433/getNewJJGCLoginQRCode_ln1433?ratio=%38&front_sign=${loginKey}`,
    ],
    [
      'normalized traversal path',
      `/ignored/../cloud-api/CommonWxGZHQrCodeLogIn/ln1433/getNewJJGCLoginQRCode_ln1433?ratio=8&front_sign=${loginKey}`,
    ],
    ['trailing empty query segment', `${qrPath}&`],
    ['trailing empty hash', `${qrPath}#`],
    ['trailing question mark', `${qrPath}?`],
    [
      'reordered query',
      `/cloud-api/CommonWxGZHQrCodeLogIn/ln1433/getNewJJGCLoginQRCode_ln1433?front_sign=${loginKey}&ratio=8`,
    ],
    ['uppercase absolute host', `https://CLOUD.LSLNII.COM${qrPath}`],
    ['uppercase absolute scheme', `HTTPS://cloud.lslnii.com${qrPath}`],
    ['explicit default port', `https://cloud.lslnii.com:443${qrPath}`],
    ['empty userinfo', `https://@cloud.lslnii.com${qrPath}`],
    ['embedded tab', `https://cloud.lslnii.com\t${qrPath}`],
    ['embedded carriage return', `https://cloud.lslnii.com\r${qrPath}`],
    ['embedded line feed', `https://cloud.lslnii.com\n${qrPath}`],
    ['embedded space', `https://cloud.lslnii.com ${qrPath}`],
    [
      'mismatched front_sign',
      '/cloud-api/CommonWxGZHQrCodeLogIn/ln1433/getNewJJGCLoginQRCode_ln1433?ratio=8&front_sign=enterprise_desktop_Zz9Yy8Xx7Ww6Vv5Uu4',
    ],
  ])('rejects a QR path with %s before GET', async (_label, unsafeQrPath) => {
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return createResponse({ qrPath: unsafeQrPath });
      },
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');

    expect(calls).toBe(1);
  });

  it('accepts an exact same-origin absolute QR URL without relying on content-type', async () => {
    const absoluteQrUrl = qrUrl;
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return calls === 1 ? createResponse({ qrPath: absoluteQrUrl }) : responseWithFinalUrl(pngBytes, qrUrl);
      },
    });

    const session = await client.createLoginSession();

    expect(session.qrDataUrl).toBe(`data:image/png;base64,${Buffer.from(pngBytes).toString('base64')}`);
  });

  it.each([
    ['an empty body', new Uint8Array()],
    ['a non-PNG body', Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])],
    ['an oversized body', new Uint8Array(2 * 1024 * 1024 + 1)],
  ])('rejects %s after the QR GET', async (_label, body) => {
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return calls === 1 ? createResponse() : responseWithFinalUrl(body, qrUrl);
      },
    });

    await expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');
  });

  it('maps a QR HTTP failure without reading or exposing its body', async () => {
    const phone = '13800000000';
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return calls === 1 ? createResponse() : responseWithFinalUrl(`failure for ${phone}`, qrUrl, { status: 502 });
      },
    });

    const error = await expectApiError(client.createLoginSession(), 'HTTP');

    expect(error.message).not.toContain(phone);
  });

  it('maps a blocked QR redirect to NETWORK without exposing the URL or login key', async () => {
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async (_url, init) => {
        calls += 1;
        if (calls === 1) return createResponse();
        expect(init.redirect).toBe('error');
        throw new Error(`redirected ${loginKey} ${qrPath}`);
      },
    });

    const error = await expectApiError(client.createLoginSession(), 'NETWORK');

    expect(error.message).not.toContain(loginKey);
    expect(error.message).not.toContain(qrPath);
  });

  it('times out a hanging QR body read and clears its deadline timer', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null = null;
    const qrResponse = responseWithFinalUrl(pngBytes, qrUrl);
    const read = vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined));
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const releaseLock = vi.fn();
    const getReader = vi.fn(() => ({ read, cancel, releaseLock }));
    Object.defineProperty(qrResponse, 'body', {
      value: { getReader },
      writable: false,
      enumerable: false,
      configurable: true,
    });
    Object.defineProperty(qrResponse, 'arrayBuffer', {
      value: () => new Promise<ArrayBuffer>(() => undefined),
    });
    let calls = 0;
    const client = new EnterpriseApiClient({
      timeoutMs: 25,
      transport: async (_url, init) => {
        calls += 1;
        signal = init.signal ?? null;
        return calls === 1 ? createResponse() : qrResponse;
      },
    });

    const outcome = expectApiError(client.createLoginSession(), 'TIMEOUT');
    await vi.advanceTimersByTimeAsync(25);
    await outcome;

    expect(signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a login session that expires while its QR stream is being read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:00:00.000Z'));
    let markDownloadStarted: (() => void) | undefined;
    const downloadStarted = new Promise<void>((resolve) => {
      markDownloadStarted = resolve;
    });
    let completeDownload: (() => void) | undefined;
    let readCalls = 0;
    const read = vi.fn((): Promise<ReadableStreamReadResult<Uint8Array>> => {
      readCalls += 1;
      if (readCalls > 1) return Promise.resolve({ done: true, value: undefined });
      markDownloadStarted?.();
      return new Promise((resolve) => {
        completeDownload = () => resolve({ done: false, value: pngBytes });
      });
    });
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const qrResponse = responseWithFinalUrl(pngBytes, qrUrl);
    Object.defineProperty(qrResponse, 'body', {
      value: { getReader: () => ({ read, cancel, releaseLock }) },
      writable: false,
      enumerable: false,
      configurable: true,
    });
    Object.defineProperty(qrResponse, 'arrayBuffer', {
      value: () => {
        markDownloadStarted?.();
        return new Promise<ArrayBuffer>((resolve) => {
          completeDownload = () => resolve(pngBytes.buffer);
        });
      },
    });
    const expiresAt = new Date(Date.now() + 100).toISOString();
    let calls = 0;
    const client = new EnterpriseApiClient({
      timeoutMs: 1000,
      transport: async () => {
        calls += 1;
        return calls === 1 ? createResponse({ expiresAt }) : qrResponse;
      },
    });

    const outcome = expectApiError(client.createLoginSession(), 'INVALID_RESPONSE');
    await downloadStarted;
    await vi.advanceTimersByTimeAsync(200);
    completeDownload?.();
    await outcome;

    expect(releaseLock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('polls a validated login key through the fixed POST route and returns WAITING only', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new EnterpriseApiClient({
      transport: async (url, init) => {
        calls.push({ url, init });
        return jsonResponse({ success: true, data: { status: 'WAITING', phone: '13800000000' } });
      },
    });

    const result = await client.pollLoginSession(loginKey);

    expect(result).toEqual({ status: 'WAITING' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://cloud.lslnii.com/cloud-api/CommonWxGZHQrCodeLogIn/desktop/poll');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ loginKey });
  });

  it('rejects a non-string login key without coercing it or performing IO', async () => {
    let primitiveReads = 0;
    const unsafeKey = Object.create(null) as Record<PropertyKey, unknown>;
    Object.defineProperty(unsafeKey, Symbol.toPrimitive, {
      get: () => {
        primitiveReads += 1;
        return () => loginKey;
      },
    });
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return jsonResponse({ success: true, data: { status: 'WAITING' } });
      },
    });

    await expectApiError(client.pollLoginSession(unsafeKey as unknown as string), 'INVALID_REQUEST');

    expect(primitiveReads).toBe(0);
    expect(calls).toBe(0);
  });

  it('rejects an unsafe nested poll object without evaluating its accessor', async () => {
    let accessorReads = 0;
    const unsafeContext = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(unsafeContext, 'openId', {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return 'openid-sensitive';
      },
    });
    const client = new EnterpriseApiClient({
      transport: async () =>
        responseWithJsonValue({
          success: true,
          data: { status: 'WAITING', userContext: unsafeContext },
        }),
    });

    await expectApiError(client.pollLoginSession(loginKey), 'INVALID_RESPONSE');

    expect(accessorReads).toBe(0);
  });

  it('rejects an unsafe object nested in a field that would otherwise be stripped', async () => {
    const unsafeExtra = Object.assign(Object.create({ inherited: 'sensitive' }), {
      value: 'ignored',
    }) as unknown;
    const client = new EnterpriseApiClient({
      transport: async () => responseWithJsonValue({ success: true, data: { status: 'WAITING', extra: unsafeExtra } }),
    });

    await expectApiError(client.pollLoginSession(loginKey), 'INVALID_RESPONSE');
  });

  it.each(['', ' ', 'enterprise_desktop_short', `${loginKey}x`, ` ${loginKey}`, `${loginKey} `])(
    'rejects the invalid login key %j before polling',
    async (invalidKey) => {
      let calls = 0;
      const client = new EnterpriseApiClient({
        transport: async () => {
          calls += 1;
          return jsonResponse({ success: true, data: { status: 'WAITING' } });
        },
      });

      const error = await expectApiError(client.pollLoginSession(invalidKey), 'INVALID_REQUEST');

      if (invalidKey.trim() !== '') expect(error.message).not.toContain(invalidKey);
      expect(calls).toBe(0);
    }
  );

  it('returns EXPIRED without copying unexpected response fields', async () => {
    const client = new EnterpriseApiClient({
      transport: async () =>
        jsonResponse({
          success: true,
          data: { status: 'EXPIRED', openId: 'must-not-leak', phone: '13800000000' },
        }),
    });

    await expect(client.pollLoginSession(loginKey)).resolves.toEqual({ status: 'EXPIRED' });
  });

  it('returns the fixed registration URL for an unregistered scanned identity', async () => {
    const openId = 'openid-unregistered-42';
    const client = new EnterpriseApiClient({
      transport: async () =>
        jsonResponse({
          success: true,
          data: {
            status: 'REGISTER_REQUIRED',
            openId,
            phone: '13800000000',
            unionId: 'must-not-leak',
          },
        }),
    });

    await expect(client.pollLoginSession(loginKey)).resolves.toEqual({
      status: 'REGISTER_REQUIRED',
      openId,
      registrationUrl: 'https://sjbang.lslnii.com/jjgc/foreground/vip_store/index.html#/qiyema/register',
    });
  });

  it('returns a normalized authenticated context with backend-only identity fields removed', async () => {
    const openId = 'openid-authenticated-42';
    const client = new EnterpriseApiClient({
      transport: async () =>
        jsonResponse({
          success: true,
          data: {
            status: 'AUTHENTICATED',
            openId,
            phone: '13800000000',
            userContext: {
              registered: true,
              openId,
              userId: '1001',
              userName: 'User',
              companyId: '2001',
              companyName: 'Acme',
              companyLevel: 3,
              roleId: '7',
              phone: '13900000000',
              unionId: 'must-not-leak',
            },
          },
        }),
    });

    await expect(client.pollLoginSession(loginKey)).resolves.toEqual({
      status: 'AUTHENTICATED',
      openId,
      userContext: {
        registered: true,
        openId,
        userId: '1001',
        userName: 'User',
        companyId: '2001',
        companyName: 'Acme',
        companyLevel: 3,
        roleId: '7',
      },
    });
  });

  it.each([
    ['missing status', {}],
    ['unknown status', { status: 'DONE' }],
    ['lowercase status', { status: 'waiting' }],
    ['registration without openId', { status: 'REGISTER_REQUIRED' }],
    ['registration with blank openId', { status: 'REGISTER_REQUIRED', openId: '   ' }],
    ['authentication without openId', { status: 'AUTHENTICATED', userContext: {} }],
    ['authentication without context', { status: 'AUTHENTICATED', openId: 'openid-42' }],
    [
      'mismatched openId',
      {
        status: 'AUTHENTICATED',
        openId: 'openid-top',
        userContext: {
          registered: true,
          openId: 'openid-nested',
          userId: '1001',
          companyId: '2001',
        },
      },
    ],
    [
      'unregistered context',
      {
        status: 'AUTHENTICATED',
        openId: 'openid-42',
        userContext: {
          registered: false,
          openId: 'openid-42',
          userId: '1001',
          companyId: '2001',
        },
      },
    ],
    [
      'zero user ID',
      {
        status: 'AUTHENTICATED',
        openId: 'openid-42',
        userContext: {
          registered: true,
          openId: 'openid-42',
          userId: '0',
          companyId: '2001',
        },
      },
    ],
    [
      'non-decimal company ID',
      {
        status: 'AUTHENTICATED',
        openId: 'openid-42',
        userContext: {
          registered: true,
          openId: 'openid-42',
          userId: '1001',
          companyId: 'company-2001',
        },
      },
    ],
  ])('rejects malformed poll data with %s', async (_label, data) => {
    const client = new EnterpriseApiClient({
      transport: async () => jsonResponse({ success: true, data }),
    });

    const error = await expectApiError(client.pollLoginSession(loginKey), 'INVALID_RESPONSE');

    expect(error.message).not.toContain('openid-top');
    expect(error.message).not.toContain('openid-nested');
  });

  it.each([
    [
      'a custom prototype',
      () =>
        Object.assign(Object.create({ inherited: 'sensitive' }), {
          registered: true,
          openId: 'openid-42',
          userId: '1001',
          companyId: '2001',
        }) as unknown,
    ],
    [
      'a symbol key',
      () => {
        const context = {
          registered: true,
          openId: 'openid-42',
          userId: '1001',
          companyId: '2001',
        } as Record<PropertyKey, unknown>;
        context[Symbol('secret')] = 'sensitive';
        return context;
      },
    ],
    [
      'a dangerous constructor key',
      () =>
        JSON.parse(
          '{"registered":true,"openId":"openid-42","userId":"1001","companyId":"2001","constructor":"sensitive"}'
        ) as unknown,
    ],
  ])('rejects an authenticated context with %s', async (_label, makeContext) => {
    const client = new EnterpriseApiClient({
      transport: async () =>
        responseWithJsonValue({
          success: true,
          data: { status: 'AUTHENTICATED', openId: 'openid-42', userContext: makeContext() },
        }),
    });

    await expectApiError(client.pollLoginSession(loginKey), 'INVALID_RESPONSE');
  });

  it('rejects an accessor-backed poll status without evaluating it', async () => {
    let accessorReads = 0;
    const data = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(data, 'status', {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return 'WAITING';
      },
    });
    const client = new EnterpriseApiClient({
      transport: async () => responseWithJsonValue({ success: true, data }),
    });

    await expectApiError(client.pollLoginSession(loginKey), 'INVALID_RESPONSE');

    expect(accessorReads).toBe(0);
  });

  it.each([
    ['create', 'API_FAILURE', { success: false, data: null, message: 'denied for 13800000000' }],
    ['poll', 'API_FAILURE', { success: false, data: null, message: 'denied for 13800000000' }],
    ['create', 'INVALID_RESPONSE', { success: false, message: 'denied' }],
    ['poll', 'INVALID_RESPONSE', { success: false, message: 'denied' }],
  ] as const)('maps a %s CommonResult failure to %s', async (method, code, envelope) => {
    const client = new EnterpriseApiClient({
      transport: async () => responseWithJsonValue(envelope),
    });

    const promise = method === 'create' ? client.createLoginSession() : client.pollLoginSession(loginKey);
    const error = await expectApiError(promise, code);

    expect(error.message).not.toContain(loginKey);
    expect(error.message).not.toContain('13800000000');
  });
});
