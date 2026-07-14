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
    list: [{ hpInfoId: 'project-1', projectName: 'Factory' }],
    pageNum: 1,
    pageSize: 20,
    pages: 1,
    total: 1,
  },
  'project.detail': { hpInfoId: 'project-1', projectName: 'Factory' },
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

    await client.request(
      { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
      { registered: false, openId: '' }
    );

    expect(calls[0]?.url).toBe('https://cloud.lslnii.com/cloud-api/CompanyController/getFindProducts');
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

describe('EnterpriseApiClient request boundary', () => {
  it.each([
    { operation: 'unknown.operation', payload: {} },
    { operation: 'company.detail', payload: { companyId: 'target', url: 'https://evil.test' } },
    { operation: 'company.detail', payload: { companyId: 'target', method: 'GET' } },
    { operation: 'company.detail', payload: { companyId: 'target', headers: { Authorization: 'secret' } } },
    { operation: 'company.detail', payload: { companyId: 'target' }, url: 'https://evil.test' },
    { operation: 'company.detail', payload: { companyId: 'target' }, method: 'GET' },
    { operation: 'company.detail', payload: { companyId: 'target' }, headers: { Authorization: 'secret' } },
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
    expect(calls[0]?.init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
  });

  it('does not echo rejected request data, openId, or phone numbers', async () => {
    const phone = '13800000000';
    const unsafeRequest = {
      operation: 'company.detail',
      payload: { companyId: 'company-target-1', phone },
    } as unknown as EnterpriseRequest;
    const client = new EnterpriseApiClient({ transport: async () => successResponse('company.detail') });

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
          city: 'Shenyang',
          district: 'Hunnan',
          companyLevel: 2,
          vip: true,
          pageNum: 2,
          pageSize: 30,
        },
      },
      expectedBody: {
        name: 'steel',
        industry: 'Manufacturing',
        city: 'Shenyang',
        district: 'Hunnan',
        comLevel: 2,
        vip: true,
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
        companyId: 'company-target-9',
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
        pageNum: 4,
        pageSize: 20,
        openId: REGISTERED_CONTEXT.openId,
        companyId: REGISTERED_CONTEXT.companyId,
      },
    },
    {
      operation: 'project.detail',
      request: { operation: 'project.detail', payload: { hpInfoId: 'project-7' } },
      expectedBody: {
        hpInfoId: 'project-7',
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

    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ pageNum: 1, pageSize: 20 });
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
      { registered: false, openId: '' }
    );
    const timeoutError = expectApiError(pending, 'TIMEOUT');
    await vi.advanceTimersByTimeAsync(25);
    const error = await timeoutError;

    expect(signal?.aborted).toBe(true);
    expect(error.message).not.toContain(REGISTERED_CONTEXT.openId);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timeout after a completed request', async () => {
    vi.useFakeTimers();
    const client = new EnterpriseApiClient({
      timeoutMs: 25,
      transport: async () => successResponse('product.list'),
    });

    await client.request(
      { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
      { registered: false, openId: '' }
    );

    expect(vi.getTimerCount()).toBe(0);
  });

  it('maps transport rejection to NETWORK without exposing dependency errors', async () => {
    const phone = '13800000000';
    const client = new EnterpriseApiClient({
      transport: async () => {
        throw new Error(`failed for ${REGISTERED_CONTEXT.openId} at ${phone}`);
      },
    });

    const error = await expectApiError(
      client.request({ operation: 'company.detail', payload: { companyId: 'target' } }, REGISTERED_CONTEXT),
      'NETWORK'
    );

    expect(error.message).not.toContain(REGISTERED_CONTEXT.openId);
    expect(error.message).not.toContain(phone);
  });

  it('maps non-2xx status to HTTP without reading response content', async () => {
    const client = new EnterpriseApiClient({
      transport: async () => new Response('sensitive response body 13800000000', { status: 503 }),
    });

    const error = await expectApiError(
      client.request(
        { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
        { registered: false, openId: '' }
      ),
      'HTTP'
    );

    expect(error.message).not.toContain('13800000000');
  });

  it('maps malformed JSON to INVALID_JSON', async () => {
    const client = new EnterpriseApiClient({ transport: async () => new Response('{broken') });

    await expectApiError(
      client.request(
        { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
        { registered: false, openId: '' }
      ),
      'INVALID_JSON'
    );
  });

  it('maps a failed CommonResult to API_FAILURE without exposing its message', async () => {
    const phone = '13800000000';
    const client = new EnterpriseApiClient({
      transport: async () => jsonResponse({ success: false, message: `denied for ${phone}`, data: null }),
    });

    const error = await expectApiError(
      client.request(
        { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
        { registered: false, openId: '' }
      ),
      'API_FAILURE'
    );

    expect(error.message).not.toContain(phone);
  });

  it('maps an invalid CommonResult envelope to INVALID_RESPONSE', async () => {
    const client = new EnterpriseApiClient({ transport: async () => jsonResponse({ success: true }) });

    await expectApiError(
      client.request(
        { operation: 'product.list', payload: { pageNum: 1, pageSize: 20 } },
        { registered: false, openId: '' }
      ),
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
