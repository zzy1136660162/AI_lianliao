import { describe, expect, it, vi } from 'vitest';

import type {
  EnterpriseCompanySummary,
  EnterpriseDemandSummary,
  EnterpriseProductSummary,
  EnterpriseProjectSummary,
  EnterpriseRequest,
  EnterpriseResponse,
} from '@/common/enterprise/contracts';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import {
  CatalogAssistantCancelledError,
  runCatalogAssistant,
} from '@/renderer/pages/enterprise/layout/catalog/assistant/catalogAssistantOrchestrator';
import { buildDeterministicCatalogPlan } from '@/renderer/pages/enterprise/layout/catalog/assistant/deterministicCatalogPlanner';

const company = (id: string): EnterpriseCompanySummary => ({
  companyId: id,
  name: `企业 ${id}`,
  industry: '机械加工',
  city: '沈阳市',
  district: '沈北新区',
  businessSummary: '精密机械零部件加工',
});

const product = (id: string): EnterpriseProductSummary => ({
  productId: id,
  name: `产品 ${id}`,
  companyId: '-8',
  companyName: '沈阳精密制造有限公司',
  industry: '机械加工',
  city: '沈阳市',
  district: '沈北新区',
  summary: '304 不锈钢精密加工件',
});

const project = (id: string): EnterpriseProjectSummary => ({
  hpInfoId: id,
  projectName: `项目 ${id}`,
  constructionUnit: '沈阳产业建设有限公司',
  province: '辽宁省',
  city: '沈阳市',
  totalInvestment: 8_000,
  projectNature: '新建',
  materialMatch: '机电设备',
  procurementSummary: '采购机电设备和配套材料',
  publishedAt: '2026-07-28',
});

const demand = (id: string): EnterpriseDemandSummary => ({
  demandId: id,
  typeId: 12,
  typeName: '机加外包',
  title: `机械加工需求 ${id}`,
  city: '沈阳市',
  district: '沈北新区',
  budget: '面议',
  summary: '采购一批精密机械加工件',
  publishedAt: '2026-08-08',
  status: 0,
  primaryTags: ['机械加工', '采购'],
});

const createClient = (request: (input: EnterpriseRequest) => Promise<EnterpriseResponse>): EnterpriseClient =>
  ({
    createLoginSession: vi.fn(),
    pollLoginSession: vi.fn(),
    completeRegistration: vi.fn(),
    restoreSession: vi.fn(),
    clearSession: vi.fn(),
    request: vi.fn(request),
  }) as unknown as EnterpriseClient;

const run = (client: EnterpriseClient, signal = new AbortController().signal) =>
  runCatalogAssistant(client, {
    requestId: 'request-1',
    message: '查询沈阳精密机械企业',
    signal,
    isCurrent: (requestId) => requestId === 'request-1',
    onProgress: vi.fn(),
  });

describe('catalog assistant orchestrator', () => {
  it('links product results to trusted company cards and applies sort inside the same match tier', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.workflowPlan') {
        return {
          operation: input.operation,
          data: {
            version: 1,
            mode: 'NEW_SEARCH',
            targetEntityType: 'COMPANY',
            steps: [
              {
                stepId: 'products',
                tool: 'PRODUCT_SEARCH',
                dependsOn: [],
                filters: { keyword: '航空箱', province: '辽宁省', city: '沈阳市' },
              },
              {
                stepId: 'companies',
                tool: 'COMPANY_BATCH_GET',
                dependsOn: ['products'],
                binding: { fromStepId: 'products', sourceField: 'companyId', targetField: 'companyIds' },
              },
            ],
            resultLimit: 6,
            summary: '检索航空箱产品并关联所属企业',
          },
        };
      }
      if (input.operation === 'product.list') {
        return {
          operation: input.operation,
          data: {
            list: [
              { ...product('-101'), companyId: '-8', name: '航空运输箱', sort: 80 },
              { ...product('-102'), companyId: '-9', name: '铝合金航空箱', sort: 95 },
            ],
            pageNum: 1,
            pageSize: 20,
            pages: 1,
            total: 2,
          },
        };
      }
      if (input.operation === 'company.batchGet') {
        expect(input.payload.companyIds).toEqual(['-8', '-9']);
        return {
          operation: input.operation,
          data: [
            { ...company('-8'), sort: 100, logoUrl: 'https://www.lslnii.com/company-8.png' },
            { ...company('-9'), sort: 20 },
          ],
        };
      }
      if (input.operation === 'catalogAssistant.workflowRank') {
        return {
          operation: input.operation,
          data: {
            summary: '找到两家提供航空箱的企业',
            items: [
              { id: '-9', matchLevel: 'EXACT', reason: '重点产品包含航空箱' },
              { id: '-8', matchLevel: 'EXACT', reason: '重点产品包含航空运输箱' },
            ],
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await runCatalogAssistant(createClient(request), {
      requestId: 'product-company-workflow',
      message: '沈阳做航空箱的企业有哪些',
      signal: new AbortController().signal,
      isCurrent: () => true,
      onProgress: vi.fn(),
    });

    expect(request.mock.calls.map(([input]) => input.operation)).toEqual([
      'catalogAssistant.workflowPlan',
      'product.list',
      'company.batchGet',
      'catalogAssistant.workflowRank',
    ]);
    expect(result.results.map((entry) => entry.item.companyId)).toEqual(['-8', '-9']);
    expect(result.results[0]).toMatchObject({
      entityType: 'COMPANY',
      evidenceProducts: [{ id: '-101', name: '航空运输箱', sort: 80 }],
    });
  });

  it('queries approved demand listings through the allowlisted workflow and resolves the public type id', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'enterpriseAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            intent: 'CATALOG_SEARCH',
            confidence: 0.98,
            requiresConfirmation: false,
            reason: '用户希望查询公开供需信息',
            initialMessage: input.payload.message,
          },
        };
      }
      if (input.operation === 'catalogAssistant.workflowPlan') {
        return {
          operation: input.operation,
          data: {
            version: 1,
            mode: 'NEW_SEARCH',
            targetEntityType: 'DEMAND',
            steps: [
              {
                stepId: 'demands',
                tool: 'DEMAND_SEARCH',
                dependsOn: [],
                filters: {
                  keyword: '机械加工',
                  city: '沈阳市',
                  demandType: '机加外包',
                  demandStatus: 'OPEN',
                },
              },
            ],
            resultLimit: 6,
            summary: '查询沈阳机械加工需求',
          },
        };
      }
      if (input.operation === 'demand.types') {
        return {
          operation: input.operation,
          data: [
            { typeId: 11, typeName: '闲置资源' },
            { typeId: 12, typeName: '机加外包' },
          ],
        };
      }
      if (input.operation === 'demand.list') {
        expect(input.payload).toMatchObject({
          keyword: '机械加工',
          typeId: 12,
          city: '沈阳市',
          status: 0,
          pageNum: 1,
          pageSize: 20,
        });
        return {
          operation: input.operation,
          data: { list: [demand('-301')], pageNum: 1, pageSize: 20, pages: 1, total: 1 },
        };
      }
      if (input.operation === 'catalogAssistant.workflowRank') {
        expect(input.payload.candidates).toEqual([
          expect.objectContaining({
            id: '-301',
            entityType: 'DEMAND',
            industry: '机加外包',
            nature: 'OPEN',
          }),
        ]);
        expect(input.payload.candidates[0]).not.toHaveProperty('grabCount');
        expect(input.payload.candidates[0]).not.toHaveProperty('remainingGrabCount');
        expect(input.payload.candidates[0]).not.toHaveProperty('contactName');
        expect(input.payload.candidates[0]).not.toHaveProperty('phone');
        return {
          operation: input.operation,
          data: {
            summary: '找到一条公开机械加工需求',
            items: [{ id: '-301', matchLevel: 'EXACT', reason: '类型、地区和状态匹配' }],
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await runCatalogAssistant(createClient(request), {
      requestId: 'demand-workflow',
      message: '查找沈阳进行中的机械加工需求',
      signal: new AbortController().signal,
      isCurrent: () => true,
      onProgress: vi.fn(),
    });

    expect(request.mock.calls.map(([input]) => input.operation)).toEqual([
      'enterpriseAssistant.plan',
      'catalogAssistant.workflowPlan',
      'demand.types',
      'demand.list',
      'catalogAssistant.workflowRank',
    ]);
    expect(result).toMatchObject({
      fallback: false,
      results: [
        {
          entityType: 'DEMAND',
          reason: '类型、地区和状态匹配',
          item: { demandId: '-301', typeId: 12, status: 0 },
        },
      ],
    });
  });

  it('does not guess an ambiguous demand type id', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'enterpriseAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            intent: 'CATALOG_SEARCH',
            confidence: 0.98,
            requiresConfirmation: false,
            reason: '查询供需',
            initialMessage: input.payload.message,
          },
        };
      }
      if (input.operation === 'catalogAssistant.workflowPlan') {
        return {
          operation: input.operation,
          data: {
            version: 1,
            mode: 'NEW_SEARCH',
            targetEntityType: 'DEMAND',
            steps: [
              {
                stepId: 'demands',
                tool: 'DEMAND_SEARCH',
                dependsOn: [],
                filters: { keyword: '加工', demandType: '加工' },
              },
            ],
            resultLimit: 6,
            summary: '查询加工需求',
          },
        };
      }
      if (input.operation === 'demand.types') {
        return {
          operation: input.operation,
          data: [
            { typeId: 12, typeName: '机械加工' },
            { typeId: 13, typeName: '来料加工' },
          ],
        };
      }
      if (input.operation === 'demand.list') {
        expect(input.payload.typeId).toBeUndefined();
        return {
          operation: input.operation,
          data: { list: [demand('-302')], pageNum: 1, pageSize: 20, pages: 1, total: 1 },
        };
      }
      if (input.operation === 'catalogAssistant.workflowRank') {
        return {
          operation: input.operation,
          data: {
            summary: '找到加工需求',
            items: [{ id: '-302', matchLevel: 'RELATED', reason: '关键词匹配' }],
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await runCatalogAssistant(createClient(request), {
      requestId: 'ambiguous-demand-type',
      message: '查找加工需求',
      signal: new AbortController().signal,
      isCurrent: () => true,
      onProgress: vi.fn(),
    });

    expect(result.results[0]).toMatchObject({ entityType: 'DEMAND', item: { demandId: '-302' } });
  });

  it('keeps public demand search usable when type lookup and model ranking are unavailable', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'enterpriseAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            intent: 'CATALOG_SEARCH',
            confidence: 0.98,
            requiresConfirmation: false,
            reason: '查询供需',
            initialMessage: input.payload.message,
          },
        };
      }
      if (input.operation === 'catalogAssistant.workflowPlan') {
        return {
          operation: input.operation,
          data: {
            version: 1,
            mode: 'NEW_SEARCH',
            targetEntityType: 'DEMAND',
            steps: [
              {
                stepId: 'demands',
                tool: 'DEMAND_SEARCH',
                dependsOn: [],
                filters: { keyword: '机械加工', demandType: '机加外包' },
              },
            ],
            resultLimit: 6,
            summary: '查询机械加工需求',
          },
        };
      }
      if (input.operation === 'demand.types') throw new Error('type service unavailable');
      if (input.operation === 'demand.list') {
        expect(input.payload.typeId).toBeUndefined();
        return {
          operation: input.operation,
          data: { list: [demand('-303')], pageNum: 1, pageSize: 20, pages: 1, total: 1 },
        };
      }
      if (input.operation === 'catalogAssistant.workflowRank') throw new Error('ranking unavailable');
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await runCatalogAssistant(createClient(request), {
      requestId: 'demand-service-fallback',
      message: '查找机械加工需求',
      signal: new AbortController().signal,
      isCurrent: () => true,
      onProgress: vi.fn(),
    });

    expect(result.fallback).toBe(true);
    expect(result.results[0]).toMatchObject({
      entityType: 'DEMAND',
      reason: 'enterprise.catalogAssistant.fallbackReason',
      item: { demandId: '-303' },
    });
  });

  it('converts an explicit recent Shenyang project request into a deterministic fallback plan', () => {
    const plan = buildDeterministicCatalogPlan(
      '找沈阳近期采购机电设备的在建项目',
      undefined,
      new Date('2026-07-30T04:00:00.000Z')
    );

    expect(plan).toMatchObject({
      mode: 'NEW_SEARCH',
      entityType: 'PROJECT',
      filters: {
        keyword: '机电设备',
        province: '辽宁省',
        city: '沈阳市',
        publishedFrom: '2026-05-01',
        publishedTo: '2026-07-30',
      },
      resultLimit: 6,
    });
  });

  it('continues a clear project search when the cloud planner is unavailable', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') throw new Error('planner unavailable');
      if (input.operation === 'project.filterOptions') {
        const options =
          input.payload.dimension === 'province'
            ? [
                { value: '辽宁', label: '辽宁', projectCount: 2_824 },
                { value: '辽宁省', label: '辽宁省', projectCount: 19 },
              ]
            : [{ value: '沈阳', label: '沈阳', projectCount: 784 }];
        return {
          operation: input.operation,
          data: options,
        };
      }
      if (input.operation === 'project.list') {
        expect(input.payload).toMatchObject({
          province: '辽宁',
          city: '沈阳',
          pageNum: 1,
        });
        expect(input.payload.publishedFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
        if (input.payload.keyword === '机电设备') {
          return {
            operation: input.operation,
            data: { list: [], pageNum: 1, pageSize: 20, pages: 0, total: 0 },
          };
        }
        expect(input.payload.keyword).toBe('设备');
        return {
          operation: input.operation,
          data: { list: [project('-903')], pageNum: 1, pageSize: 20, pages: 1, total: 1 },
        };
      }
      if (input.operation === 'catalogAssistant.rank') throw new Error('rank unavailable');
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await runCatalogAssistant(createClient(request), {
      requestId: 'project-planner-fallback',
      message: '找沈阳近期采购机电设备的在建项目',
      signal: new AbortController().signal,
      isCurrent: () => true,
      onProgress: vi.fn(),
    });

    expect(result).toMatchObject({
      plan: { entityType: 'PROJECT', filters: { keyword: '机电设备', city: '沈阳市' } },
      fallback: true,
      results: [{ entityType: 'PROJECT', item: { hpInfoId: '-903' } }],
    });
  });

  it('uses company.list and joins ranked ids back to trusted company data', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'COMPANY',
            filters: { keyword: '精密机械', city: '沈阳' },
            resultLimit: 3,
            summary: '查询沈阳企业',
          },
        };
      }
      if (input.operation === 'company.list') {
        expect(input.payload.city).toBe('沈阳市');
        return {
          operation: input.operation,
          data: { list: [company('-8')], pageNum: 1, pageSize: 20, pages: 1, total: 1 },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        return {
          operation: input.operation,
          data: {
            summary: '已找到匹配企业',
            items: [{ id: '-8', reason: '地区和行业匹配' }],
          },
        };
      }
      if (input.operation === 'company.detail') {
        expect(input.payload.companyId).toBe('-8');
        return {
          operation: input.operation,
          data: {
            ...company('-8'),
            logoUrl: 'https://www.lslnii.com/upload/company-8.png',
            companyLevel: 5,
            registeredCapital: '5000万元人民币',
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await run(createClient(request));

    expect(request.mock.calls.map(([input]) => input.operation)).toEqual([
      'catalogAssistant.plan',
      'company.list',
      'catalogAssistant.rank',
      'company.detail',
    ]);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      entityType: 'COMPANY',
      reason: '地区和行业匹配',
      item: {
        companyId: '-8',
        name: '企业 -8',
        logoUrl: 'https://www.lslnii.com/upload/company-8.png',
        companyLevel: 5,
        registeredCapital: '5000万元人民币',
      },
    });
  });

  it('keeps the trusted company summary when detail enrichment is unavailable', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'COMPANY',
            filters: { keyword: '精密机械' },
            resultLimit: 3,
            summary: '查询企业',
          },
        };
      }
      if (input.operation === 'company.list') {
        return {
          operation: input.operation,
          data: { list: [company('-8')], pageNum: 1, pageSize: 20, pages: 1, total: 1 },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        return {
          operation: input.operation,
          data: { summary: '找到企业', items: [{ id: '-8', reason: '业务匹配' }] },
        };
      }
      if (input.operation === 'company.detail') throw new Error('detail unavailable');
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await run(createClient(request));

    expect(result.results[0]).toMatchObject({
      entityType: 'COMPANY',
      item: { companyId: '-8', name: '企业 -8' },
    });
  });

  it('uses product.list and joins ranked ids back to trusted product data', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'PRODUCT',
            filters: { keyword: '304 不锈钢', district: '沈北新区' },
            resultLimit: 3,
            summary: '查询沈北新区重点产品',
          },
        };
      }
      if (input.operation === 'product.list') {
        expect(input.payload).toMatchObject({
          keyword: '304 不锈钢',
          province: '辽宁省',
          district: '沈北新区',
          pageNum: 1,
          pageSize: 20,
        });
        return {
          operation: input.operation,
          data: { list: [product('-18')], pageNum: 1, pageSize: 20, pages: 1, total: 1 },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        return {
          operation: input.operation,
          data: {
            summary: '已找到匹配产品',
            items: [{ id: '-18', reason: '材质、地区和工艺匹配' }],
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await run(createClient(request));

    expect(request.mock.calls.map(([input]) => input.operation)).toEqual([
      'catalogAssistant.plan',
      'product.list',
      'catalogAssistant.rank',
    ]);
    expect(result.results[0]).toMatchObject({
      entityType: 'PRODUCT',
      reason: '材质、地区和工艺匹配',
      item: { productId: '-18', name: '产品 -18' },
    });
  });

  it('resolves project database options and joins ranked ids back to trusted project data', async () => {
    const optionDimensions: string[] = [];
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'PROJECT',
            filters: {
              keyword: '机电设备',
              province: '辽宁',
              city: '沈阳',
              materialName: '机电设备',
              minInvestment: '5000',
            },
            resultLimit: 6,
            summary: '查询沈阳机电设备项目',
          },
        };
      }
      if (input.operation === 'project.filterOptions') {
        optionDimensions.push(input.payload.dimension);
        const value =
          input.payload.dimension === 'province'
            ? '辽宁省'
            : input.payload.dimension === 'city'
              ? '沈阳市'
              : '机电设备';
        return {
          operation: input.operation,
          data: [{ value, label: value, projectCount: 12 }],
        };
      }
      if (input.operation === 'project.list') {
        expect(input.payload).toMatchObject({
          keyword: '机电设备',
          province: '辽宁省',
          city: '沈阳市',
          materialName: '机电设备',
          minInvestment: 5_000,
          pageNum: 1,
          pageSize: 20,
        });
        return {
          operation: input.operation,
          data: { list: [project('-901')], pageNum: 1, pageSize: 20, pages: 1, total: 1 },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        expect(input.payload.candidates[0]).toMatchObject({
          id: '-901',
          name: '项目 -901',
          investment: 8_000,
          nature: '新建',
        });
        return {
          operation: input.operation,
          data: {
            summary: '已找到匹配项目',
            items: [{ id: '-901', reason: '地区、投资额和采购内容匹配' }],
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await runCatalogAssistant(createClient(request), {
      requestId: 'project-search',
      message: '找沈阳投资五千万以上采购机电设备的在建项目',
      signal: new AbortController().signal,
      isCurrent: () => true,
      onProgress: vi.fn(),
    });

    expect(optionDimensions).toEqual(['province', 'city', 'materialName']);
    expect(result.results[0]).toMatchObject({
      entityType: 'PROJECT',
      reason: '地区、投资额和采购内容匹配',
      item: { hpInfoId: '-901', projectName: '项目 -901' },
    });
  });

  it('continues project search with normalized filters when option lookup is unavailable', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'PROJECT',
            filters: { province: '辽宁省', keyword: '机电设备' },
            resultLimit: 6,
            summary: '查询项目',
          },
        };
      }
      if (input.operation === 'project.filterOptions') throw new Error('options unavailable');
      if (input.operation === 'project.list') {
        expect(input.payload.province).toBe('辽宁省');
        return {
          operation: input.operation,
          data: { list: [project('-902')], pageNum: 1, pageSize: 20, pages: 1, total: 1 },
        };
      }
      if (input.operation === 'catalogAssistant.rank') throw new Error('rank unavailable');
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await runCatalogAssistant(createClient(request), {
      requestId: 'project-option-fallback',
      message: '查辽宁省机电设备项目',
      signal: new AbortController().signal,
      isCurrent: () => true,
      onProgress: vi.fn(),
    });

    expect(result.fallback).toBe(true);
    expect(result.results[0]).toMatchObject({ entityType: 'PROJECT', item: { hpInfoId: '-902' } });
  });

  it('returns up to fifty trusted results when the user explicitly requests them', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'PRODUCT',
            filters: { keyword: '工业产品' },
            resultLimit: 50,
            summary: '查询五十条重点产品',
          },
        };
      }
      if (input.operation === 'product.list') {
        const start = (input.payload.pageNum - 1) * 20;
        const length = input.payload.pageNum < 3 ? 20 : 10;
        return {
          operation: input.operation,
          data: {
            list: Array.from({ length }, (_, index) => product(`-${start + index + 1}`)),
            pageNum: input.payload.pageNum,
            pageSize: 20,
            pages: 3,
            total: 50,
          },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        expect(input.payload.candidates).toHaveLength(50);
        return {
          operation: input.operation,
          data: {
            summary: '已筛选五十条重点产品',
            items: input.payload.candidates.map((candidate) => ({
              id: candidate.id,
              reason: '符合检索条件',
            })),
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await run(createClient(request));

    expect(result.results).toHaveLength(50);
    expect(request.mock.calls.filter(([input]) => input.operation === 'product.list')).toHaveLength(3);
  });

  it('normalizes model cities and retries without an over-specific industry intersection', async () => {
    const productQueries: Array<Extract<EnterpriseRequest, { operation: 'product.list' }>['payload']> = [];
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'PRODUCT',
            filters: { keyword: '工业机器人', industry: '智能装备', city: '沈阳' },
            resultLimit: 3,
            summary: '查询沈阳工业机器人',
          },
        };
      }
      if (input.operation === 'product.list') {
        productQueries.push(input.payload);
        const list = input.payload.industry ? [] : [product('-20')];
        return {
          operation: input.operation,
          data: { list, pageNum: 1, pageSize: 20, pages: 1, total: list.length },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        return {
          operation: input.operation,
          data: { summary: '已找到匹配产品', items: [{ id: '-20', reason: '产品名称和地区匹配' }] },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await run(createClient(request));

    expect(productQueries).toHaveLength(2);
    expect(productQueries[0]).toMatchObject({
      keyword: '工业机器人',
      industry: '智能装备',
      city: '沈阳市',
    });
    expect(productQueries[1]?.keyword).toBe('工业机器人');
    expect(productQueries[1]?.industry).toBeUndefined();
    expect(result.results[0]?.item).toMatchObject({ productId: '-20' });
  });

  it('retries an unmatched industry as a product-name keyword without dropping location', async () => {
    const productQueries: Array<Extract<EnterpriseRequest, { operation: 'product.list' }>['payload']> = [];
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'PRODUCT',
            filters: { industry: '包装', city: '沈阳' },
            resultLimit: 3,
            summary: '查询沈阳包装产品',
          },
        };
      }
      if (input.operation === 'product.list') {
        productQueries.push(input.payload);
        const list = input.payload.keyword === '包装' ? [product('-21')] : [];
        return {
          operation: input.operation,
          data: { list, pageNum: 1, pageSize: 20, pages: 1, total: list.length },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        return {
          operation: input.operation,
          data: { summary: '已找到包装产品', items: [{ id: '-21', reason: '产品名称匹配' }] },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await run(createClient(request));

    expect(productQueries).toHaveLength(2);
    expect(productQueries[0]).toMatchObject({ industry: '包装', city: '沈阳市' });
    expect(productQueries[1]?.keyword).toBe('包装');
    expect(productQueries[1]?.industry).toBeUndefined();
    expect(productQueries[1]?.city).toBe('沈阳市');
    expect(result.results[0]?.item).toMatchObject({ productId: '-21' });
  });

  it('retries a product capability phrase with its core keyword without dropping location', async () => {
    const productQueries: Array<Extract<EnterpriseRequest, { operation: 'product.list' }>['payload']> = [];
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'PRODUCT',
            filters: {
              keyword: '不锈钢加工产品',
              city: '沈阳',
              district: '沈北新区',
            },
            resultLimit: 3,
            summary: '查询沈北新区不锈钢加工产品',
          },
        };
      }
      if (input.operation === 'product.list') {
        productQueries.push(input.payload);
        const list = input.payload.keyword === '不锈钢' ? [product('-22')] : [];
        return {
          operation: input.operation,
          data: { list, pageNum: 1, pageSize: 20, pages: 1, total: list.length },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        expect(input.payload.message).toBe('查沈北新区的不锈钢加工产品');
        return {
          operation: input.operation,
          data: {
            summary: '已找到匹配产品',
            items: [{ id: '-22', reason: '材质、加工能力和地区匹配' }],
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await runCatalogAssistant(createClient(request), {
      requestId: 'product-keyword-fallback',
      message: '查沈北新区的不锈钢加工产品',
      signal: new AbortController().signal,
      isCurrent: (requestId) => requestId === 'product-keyword-fallback',
      onProgress: vi.fn(),
    });

    expect(productQueries.map((query) => query.keyword)).toEqual(['不锈钢加工产品', '不锈钢']);
    expect(productQueries[1]).toMatchObject({
      province: '辽宁省',
      city: '沈阳市',
      district: '沈北新区',
    });
    expect(result.results[0]?.item).toMatchObject({ productId: '-22' });
  });

  it('passes structured runtime context into a follow-up plan request', async () => {
    const context = {
      lastEntityType: 'COMPANY' as const,
      lastFilters: { keyword: '机械加工', city: '沈阳市' },
      lastResultCount: 3,
      lastUserMessage: '找机械加工企业',
      lastSummary: '已找到三个企业',
      excludedIds: ['-8', '-9', '-10'],
    };
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        expect(input.payload.context).toEqual(context);
        return {
          operation: input.operation,
          data: {
            filters: {},
            resultLimit: 3,
            clarification: '是否继续查找沈阳的企业？',
            summary: '需要确认检索范围',
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    await runCatalogAssistant(createClient(request), {
      requestId: 'request-context',
      message: '再换一批',
      context,
      signal: new AbortController().signal,
      isCurrent: () => true,
      onProgress: vi.fn(),
    });

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('filters a referenced district only inside the current trusted result scope', async () => {
    const scopeId = '17db0b73-1989-45fb-81a4-958b4fca8c80';
    const currentResults = [
      {
        entityType: 'COMPANY' as const,
        reason: '上一轮匹配',
        item: { ...company('-8'), district: '沈北新区' },
      },
      {
        entityType: 'COMPANY' as const,
        reason: '上一轮匹配',
        item: { ...company('-9'), district: '于洪区' },
      },
      {
        entityType: 'COMPANY' as const,
        reason: '上一轮匹配',
        item: { ...company('-10'), district: '和平区' },
      },
    ];
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            mode: 'REFINE_CURRENT',
            entityType: 'COMPANY',
            baseScopeId: scopeId,
            filters: { keyword: '包装印刷', city: '沈阳市', district: '于洪区' },
            resultLimit: 6,
            summary: '筛选当前结果中的于洪区企业',
          },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        expect(input.payload.candidates.map(({ id }) => id)).toEqual(['-9']);
        return {
          operation: input.operation,
          data: {
            summary: '当前结果中有一家位于于洪区',
            items: [{ id: '-9', reason: '位于于洪区' }],
          },
        };
      }
      if (input.operation === 'company.detail') {
        return { operation: input.operation, data: currentResults[1]!.item };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await runCatalogAssistant(createClient(request), {
      requestId: 'request-refine',
      message: '这里面哪个是于洪的',
      context: {
        lastEntityType: 'COMPANY',
        lastFilters: { keyword: '包装印刷', city: '沈阳市' },
        currentScope: {
          scopeId,
          entityType: 'COMPANY',
          filters: { keyword: '包装印刷', city: '沈阳市' },
          resultIds: ['-8', '-9', '-10'],
          resultDigest: currentResults.map(({ item }) => ({
            id: item.companyId,
            name: item.name,
            city: item.city,
            district: item.district,
            industry: item.industry,
          })),
          createdAt: Date.now(),
        },
      },
      currentResults,
      signal: new AbortController().signal,
      isCurrent: () => true,
      onProgress: vi.fn(),
    });

    expect(request.mock.calls.some(([input]) => input.operation === 'company.list')).toBe(false);
    expect(result.results.map((entry) => entry.item.companyId)).toEqual(['-9']);
  });

  it('returns a confirmation proposal without querying catalogs for demand publishing intent', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation !== 'enterpriseAssistant.plan') {
        throw new Error(`unexpected operation ${input.operation}`);
      }
      return {
        operation: input.operation,
        data: {
          intent: 'DEMAND_PUBLISH',
          confidence: 0.98,
          requiresConfirmation: true,
          targetModule: 'SUPPLY_DEMAND_PUBLISH',
          reason: '识别到加工需求',
          initialMessage: '我想加工不锈钢配件，包工包料，一个月内到沈阳',
        },
      };
    });

    const result = await runCatalogAssistant(createClient(request), {
      requestId: 'request-navigation',
      message: '我想加工不锈钢配件，包工包料，一个月内到沈阳',
      signal: new AbortController().signal,
      isCurrent: () => true,
      onProgress: vi.fn(),
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.navigationProposal).toMatchObject({
      intent: 'DEMAND_PUBLISH',
      targetModule: 'SUPPLY_DEMAND_PUBLISH',
    });
    expect(result.results).toEqual([]);
  });

  it('stops at five pages and one hundred unique candidates', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'COMPANY',
            filters: { city: '沈阳市' },
            resultLimit: 3,
            summary: '查询沈阳企业',
          },
        };
      }
      if (input.operation === 'company.list') {
        const offset = (input.payload.pageNum - 1) * 20;
        return {
          operation: input.operation,
          data: {
            list: Array.from({ length: 20 }, (_, index) => company(`-${offset + index + 1}`)),
            pageNum: input.payload.pageNum,
            pageSize: 20,
            pages: 99,
            total: 1_980,
          },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        expect(input.payload.candidates).toHaveLength(100);
        return {
          operation: input.operation,
          data: {
            summary: '结果',
            items: [{ id: '-1', reason: '匹配' }],
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    await run(createClient(request));

    expect(request.mock.calls.filter(([input]) => input.operation === 'company.list')).toHaveLength(5);
  });

  it('uses deterministic fallback and drops unknown ranked ids', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'COMPANY',
            filters: { city: '沈阳市' },
            resultLimit: 3,
            summary: '查询沈阳企业',
          },
        };
      }
      if (input.operation === 'company.list') {
        return {
          operation: input.operation,
          data: {
            list: [company('-8'), company('-9'), company('-10'), company('-11')],
            pageNum: 1,
            pageSize: 20,
            pages: 1,
            total: 4,
          },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        return {
          operation: input.operation,
          data: {
            summary: '不可信结果',
            items: [{ id: '999', reason: '未知候选' }],
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await run(createClient(request));

    expect(result.fallback).toBe(true);
    expect(result.results.map((entry) => entry.item.companyId)).toEqual(['-8', '-9', '-10']);
    expect(result.results[0]?.reason).toBe('enterprise.catalogAssistant.fallbackReason');
  });

  it('uses deterministic fallback when ranking request fails', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'COMPANY',
            filters: { city: '沈阳市' },
            resultLimit: 4,
            summary: '查询沈阳企业',
          },
        };
      }
      if (input.operation === 'company.list') {
        return {
          operation: input.operation,
          data: {
            list: [company('-8'), company('-9'), company('-10'), company('-11')],
            pageNum: 1,
            pageSize: 20,
            pages: 1,
            total: 4,
          },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        throw new Error('ranking unavailable');
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });

    const result = await run(createClient(request));

    expect(result.fallback).toBe(true);
    expect(result.results.map((entry) => entry.item.companyId)).toEqual(['-8', '-9', '-10', '-11']);
  });

  it('does not start a catalog request when plan asks for clarification', async () => {
    const request = vi.fn(
      async (): Promise<EnterpriseResponse> => ({
        operation: 'catalogAssistant.plan',
        data: {
          filters: {},
          resultLimit: 3,
          clarification: '您想找企业还是重点产品？',
          summary: '需要确认检索对象',
        },
      })
    );

    const result = await run(createClient(request));

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.clarification).toBe('您想找企业还是重点产品？');
    expect(result.results).toEqual([]);
  });

  it('rejects stale request ids before publishing progress', async () => {
    const client = createClient(vi.fn());
    const promise = runCatalogAssistant(client, {
      requestId: 'old-request',
      message: '查询沈阳企业',
      signal: new AbortController().signal,
      isCurrent: () => false,
      onProgress: vi.fn(),
    });

    await expect(promise).rejects.toBeInstanceOf(CatalogAssistantCancelledError);
    expect(client.request).not.toHaveBeenCalled();
  });

  it('does not publish progress or results after aborting an in-flight plan', async () => {
    const controller = new AbortController();
    const onProgress = vi.fn();
    let resolvePlan!: (response: EnterpriseResponse) => void;
    const pendingPlan = new Promise<EnterpriseResponse>((resolve) => {
      resolvePlan = resolve;
    });
    const request = vi.fn(async (): Promise<EnterpriseResponse> => pendingPlan);
    const client = createClient(request);

    const promise = runCatalogAssistant(client, {
      requestId: 'request-abort',
      message: '查询沈阳企业',
      signal: controller.signal,
      isCurrent: () => true,
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledTimes(1);
    controller.abort();
    resolvePlan({
      operation: 'catalogAssistant.plan',
      data: {
        entityType: 'COMPANY',
        filters: {},
        resultLimit: 3,
        summary: '查询企业',
      },
    });

    await expect(promise).rejects.toBeInstanceOf(CatalogAssistantCancelledError);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
