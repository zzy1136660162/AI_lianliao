import { describe, expect, it } from 'vitest';

import type { EnterpriseRequest, EnterpriseUserContext } from '@/common/enterprise/contracts';
import { EnterpriseApiClient, type EnterpriseApiTransport } from '@process/services/enterprise/enterpriseApiClient';
import { ENTERPRISE_API_ROUTES } from '@process/services/enterprise/enterpriseApiRoutes';

const context: EnterpriseUserContext = {
  registered: true,
  openId: 'sensitive-open-id',
  userId: 'user-1',
  companyId: 'company-1',
};

const success = (data: unknown): Response =>
  new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('supply-demand API client', () => {
  it('uses fixed allowlisted routes', () => {
    expect(ENTERPRISE_API_ROUTES['demand.types']).toBe('cloud-api/DemandQueryController/types');
    expect(ENTERPRISE_API_ROUTES['demand.list']).toBe('cloud-api/DemandQueryController/list');
    expect(ENTERPRISE_API_ROUTES['demand.detail']).toBe('cloud-api/DemandQueryController/detail');
  });

  it('loads database-backed demand type labels through a fixed route', async () => {
    const calls: string[] = [];
    const client = new EnterpriseApiClient({
      transport: async (url) => {
        calls.push(url);
        return success([{ typeId: 0, typeName: '机加外包' }]);
      },
    });

    await expect(client.request({ operation: 'demand.types', payload: {} }, context)).resolves.toEqual({
      operation: 'demand.types',
      data: [{ typeId: 0, typeName: '机加外包' }],
    });
    expect(calls).toEqual(['https://cloud.lslnii.com/cloud-api/DemandQueryController/types']);
  });

  it('serializes public list filters without identity fields', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const transport: EnterpriseApiTransport = async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return success({ list: [], pageNum: 1, pageSize: 20, pages: 0, total: 0 });
    };
    const client = new EnterpriseApiClient({ transport });

    await client.request(
      {
        operation: 'demand.list',
        payload: { keyword: '精密', typeId: 0, city: '沈阳市', status: 0, pageNum: 1, pageSize: 20 },
      },
      context
    );

    expect(calls).toEqual([
      {
        url: 'https://cloud.lslnii.com/cloud-api/DemandQueryController/list',
        body: { keyword: '精密', typeId: 0, city: '沈阳市', status: 0, pageNum: 1, pageSize: 20 },
      },
    ]);
    expect(calls[0]?.body).not.toHaveProperty('openId');
    expect(calls[0]?.body).not.toHaveProperty('userId');
  });

  it('normalizes detail and drops backend-only identity fields', async () => {
    const transport: EnterpriseApiTransport = async () =>
      success({
        demandId: '101',
        typeId: 0,
        typeName: '机加外包',
        title: '精密加工',
        primaryTags: [],
        fields: [{ key: 'processType', label: '加工工艺', value: '车削', valueType: 'TEXT' }],
        OPEN_ID: 'must-not-cross-boundary',
      });
    const client = new EnterpriseApiClient({ transport });

    const result = await client.request(
      { operation: 'demand.detail', payload: { demandId: '101', typeId: 0 } },
      context
    );

    expect(result).toEqual({
      operation: 'demand.detail',
      data: {
        demandId: '101',
        typeId: 0,
        typeName: '机加外包',
        title: '精密加工',
        primaryTags: [],
        fields: [{ key: 'processType', label: '加工工艺', value: '车削', valueType: 'TEXT' }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('must-not-cross-boundary');
  });

  it.each([
    { operation: 'demand.detail', payload: { demandId: '0', typeId: 0 } },
    { operation: 'demand.detail', payload: { demandId: '101', typeId: -1 } },
    { operation: 'demand.list', payload: { pageNum: 1, pageSize: 101 } },
  ])('rejects invalid demand requests before transport', async (request) => {
    let calls = 0;
    const client = new EnterpriseApiClient({
      transport: async () => {
        calls += 1;
        return success(null);
      },
    });

    await expect(client.request(request as EnterpriseRequest, context)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(calls).toBe(0);
  });
});
