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
    expect(ENTERPRISE_API_ROUTES['demand.publishSchema']).toBe('cloud-api/DemandPublishController/schema');
    expect(ENTERPRISE_API_ROUTES['demand.aiParse']).toBe('cloud-api/DemandPublishController/parse');
    expect(ENTERPRISE_API_ROUTES['demand.publish']).toBe('cloud-api/DemandPublishController/publish');
    expect(ENTERPRISE_API_ROUTES['demand.uploadImage']).toBe('cloud-api/DemandPublishController/image/upload');
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

  it('loads a dynamic publishing schema and keeps source columns server controlled', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const client = new EnterpriseApiClient({
      transport: async (url, init) => {
        calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
        return success({
          typeId: 22,
          typeName: '紧急采购',
          fields: [
            {
              sourceColumn: 'PARAM3',
              fieldKey: 'quantity',
              fieldLabel: '采购数量',
              inputType: 'NUMBER',
              required: false,
              maxLength: 255,
              options: [],
            },
          ],
        });
      },
    });

    await expect(
      client.request({ operation: 'demand.publishSchema', payload: { typeId: 22 } }, context)
    ).resolves.toMatchObject({
      operation: 'demand.publishSchema',
      data: { typeId: 22, fields: [{ sourceColumn: 'PARAM3', fieldKey: 'quantity' }] },
    });
    expect(calls).toEqual([
      {
        url: 'https://cloud.lslnii.com/cloud-api/DemandPublishController/schema',
        body: { typeId: 22 },
      },
    ]);
  });

  it('injects the trusted session openId for AI parsing and publishing', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const client = new EnterpriseApiClient({
      transport: async (url, init) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        calls.push({ url, body });
        if (url.endsWith('/parse')) return success({ suggestedFields: { title: '采购零件' }, warnings: [] });
        return success({ demandId: '-101', typeId: 22, reviewStatus: 'PENDING' });
      },
    });

    await client.request(
      { operation: 'demand.aiParse', payload: { typeId: 22, description: '采购200件不锈钢零件' } },
      context
    );
    await client.request(
      {
        operation: 'demand.publish',
        payload: { typeId: 22, title: '采购零件', summary: '采购200件不锈钢零件', fields: { quantity: '200' } },
      },
      context
    );

    expect(calls[0]?.body).toMatchObject({ openId: 'sensitive-open-id', typeId: 22 });
    expect(calls[1]?.body).toMatchObject({ openId: 'sensitive-open-id', title: '采购零件' });
  });

  it('uploads demand images as multipart data with the trusted session openId', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new EnterpriseApiClient({
      transport: async (url, init) => {
        calls.push({ url, init });
        return success({
          url: 'https://www.lslnii.com/upload/NFSImgFile/demand/example.png',
          width: 800,
          height: 600,
          sizeBytes: 4,
          mimeType: 'image/png',
        });
      },
    });

    await expect(
      client.request(
        {
          operation: 'demand.uploadImage',
          payload: {
            fileName: 'example.png',
            mimeType: 'image/png',
            bytes: [137, 80, 78, 71],
          },
        },
        context
      )
    ).resolves.toMatchObject({
      operation: 'demand.uploadImage',
      data: { mimeType: 'image/png', width: 800, height: 600 },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://cloud.lslnii.com/cloud-api/DemandPublishController/image/upload');
    expect(calls[0]?.init.headers).toEqual({ Accept: 'application/json' });
    const body = calls[0]?.init.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('openId')).toBe('sensitive-open-id');
    expect((body as FormData).get('file')).toBeInstanceOf(Blob);
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
