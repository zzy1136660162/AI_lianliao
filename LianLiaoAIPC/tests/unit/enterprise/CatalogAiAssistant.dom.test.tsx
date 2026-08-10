import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

import type { EnterpriseRequest, EnterpriseResponse } from '@/common/enterprise/contracts';
import EnterpriseAntdProvider from '@/renderer/pages/enterprise/layout/EnterpriseAntdProvider';
import { CatalogAiAssistant } from '@/renderer/pages/enterprise/layout/catalog/assistant/CatalogAiAssistant';
import { CatalogAssistantProvider } from '@/renderer/pages/enterprise/layout/catalog/assistant/CatalogAssistantProvider';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(',')}` : key),
  }),
}));

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;
});

afterEach(() => cleanup());

const createClient = (request: (input: EnterpriseRequest) => Promise<EnterpriseResponse>): EnterpriseClient =>
  ({
    createLoginSession: vi.fn(),
    pollLoginSession: vi.fn(),
    completeRegistration: vi.fn(),
    restoreSession: vi.fn(),
    clearSession: vi.fn(),
    request: vi.fn(request),
  }) as unknown as EnterpriseClient;

const LocationProbe: React.FC = () => {
  const location = useLocation();
  return <output aria-label='location'>{`${location.pathname}${location.search}`}</output>;
};

const renderAssistant = (client: EnterpriseClient) =>
  render(
    <EnterpriseAntdProvider>
      <MemoryRouter initialEntries={['/enterprise/companies']}>
        <CatalogAssistantProvider client={client}>
          <CatalogAiAssistant />
          <LocationProbe />
        </CatalogAssistantProvider>
      </MemoryRouter>
    </EnterpriseAntdProvider>
  );

describe('CatalogAiAssistant', () => {
  it('shows an explicit loading indicator while the planning request is pending', async () => {
    let resolvePlan!: (response: EnterpriseResponse) => void;
    const pendingPlan = new Promise<EnterpriseResponse>((resolve) => {
      resolvePlan = resolve;
    });
    const request = vi.fn(async (): Promise<EnterpriseResponse> => pendingPlan);
    const user = userEvent.setup();
    renderAssistant(createClient(request));

    const input = screen.getByPlaceholderText('enterprise.catalogAssistant.placeholder');
    await user.type(input, '查找沈阳企业{Enter}');

    const assistant = screen.getByLabelText('enterprise.catalogAssistant.title');
    const status = await within(assistant).findByRole('status');
    expect(status).toHaveTextContent('enterprise.catalogAssistant.planning');
    expect(status.querySelector('[class*="ant-spin"]')).toBeInTheDocument();
    expect(assistant.querySelector('[aria-busy=true]')).not.toBeNull();

    resolvePlan({
      operation: 'catalogAssistant.plan',
      data: {
        filters: {},
        resultLimit: 3,
        clarification: '请确认检索对象',
        summary: '需要确认',
      },
    });
    expect(await screen.findByText('请确认检索对象')).toBeVisible();
  });

  it('submits an example, renders trusted data, and opens the company detail route', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'COMPANY',
            filters: { keyword: '精密机械', city: '沈阳市' },
            resultLimit: 3,
            summary: '查询沈阳企业',
          },
        };
      }
      if (input.operation === 'company.list') {
        return {
          operation: input.operation,
          data: {
            list: [
              {
                companyId: '-8',
                name: '沈阳精密制造有限公司',
                industry: '机械加工',
                city: '沈阳市',
                district: '沈北新区',
              },
            ],
            pageNum: 1,
            pageSize: 20,
            pages: 1,
            total: 1,
          },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        return {
          operation: input.operation,
          data: {
            summary: '已找到匹配企业',
            items: [{ id: '-8', reason: '地区与行业匹配' }],
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });
    const user = userEvent.setup();
    renderAssistant(createClient(request));

    await user.click(
      screen.getByRole('button', {
        name: 'enterprise.catalogAssistant.examples.company',
      })
    );

    expect(await screen.findByText('沈阳精密制造有限公司')).toBeVisible();
    expect(screen.getByText('地区与行业匹配')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'enterprise.catalogAssistant.viewCompany' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('/enterprise/companies/-8');
  });

  it('renders a trusted project card and opens the project detail route', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'catalogAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            entityType: 'PROJECT',
            filters: { keyword: '机电设备' },
            resultLimit: 6,
            summary: '查询机电设备项目',
          },
        };
      }
      if (input.operation === 'project.list') {
        return {
          operation: input.operation,
          data: {
            list: [
              {
                hpInfoId: '-901',
                projectName: '沈阳产业园机电设备项目',
                province: '辽宁省',
                city: '沈阳市',
                totalInvestment: 8_000,
                projectNature: '新建',
                procurementSummary: '采购机电设备和配套材料',
              },
            ],
            pageNum: 1,
            pageSize: 20,
            pages: 1,
            total: 1,
          },
        };
      }
      if (input.operation === 'catalogAssistant.rank') {
        return {
          operation: input.operation,
          data: {
            summary: '已找到匹配项目',
            items: [{ id: '-901', reason: '采购内容匹配' }],
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });
    const user = userEvent.setup();
    renderAssistant(createClient(request));

    await user.click(
      screen.getByRole('button', {
        name: 'enterprise.catalogAssistant.examples.project',
      })
    );

    expect(await screen.findByText('沈阳产业园机电设备项目')).toBeVisible();
    expect(screen.getByText('采购机电设备和配套材料')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'enterprise.catalogAssistant.viewProject' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('/enterprise/projects/-901');
  });

  it('renders a trusted demand card and opens the existing supply-demand detail route', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'enterpriseAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            intent: 'CATALOG_SEARCH',
            confidence: 0.98,
            requiresConfirmation: false,
            reason: '查询公开供需信息',
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
                filters: { keyword: '机械加工', demandStatus: 'OPEN' },
              },
            ],
            resultLimit: 6,
            summary: '查询机械加工需求',
          },
        };
      }
      if (input.operation === 'demand.list') {
        return {
          operation: input.operation,
          data: {
            list: [
              {
                demandId: '-301',
                typeId: 12,
                typeName: '机加外包',
                title: '沈阳精密机械加工需求',
                city: '沈阳市',
                district: '沈北新区',
                budget: '面议',
                summary: '采购一批精密机械加工件',
                status: 0,
                primaryTags: ['机械加工'],
              },
            ],
            pageNum: 1,
            pageSize: 20,
            pages: 1,
            total: 1,
          },
        };
      }
      if (input.operation === 'catalogAssistant.workflowRank') {
        return {
          operation: input.operation,
          data: {
            summary: '已找到匹配需求',
            items: [{ id: '-301', matchLevel: 'EXACT', reason: '需求内容匹配' }],
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });
    const user = userEvent.setup();
    renderAssistant(createClient(request));

    const input = screen.getByPlaceholderText('enterprise.catalogAssistant.placeholder');
    await user.type(input, '查找沈阳机械加工需求{Enter}');

    expect(await screen.findByText('沈阳精密机械加工需求')).toBeVisible();
    expect(screen.getByText('采购一批精密机械加工件')).toBeVisible();
    expect(screen.queryByText(/机加外包.*沈阳市.*面议/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/enterprise\.supplyDemand\.status\.open/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/联系人|联系电话|13800000000/u)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'enterprise.catalogAssistant.viewDemand' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('/enterprise/supply-demand/12/-301');
  });

  it('submits with Enter, shows clarification without catalog paging, and clears the session', async () => {
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
    const user = userEvent.setup();
    renderAssistant(createClient(request));

    const input = screen.getByPlaceholderText('enterprise.catalogAssistant.placeholder');
    await user.type(input, '帮我找一下{Enter}');

    expect(await screen.findByText('您想找企业还是重点产品？')).toBeVisible();
    const catalogPlanCalls = request.mock.calls.filter(
      ([candidate]) => candidate.operation === 'catalogAssistant.plan'
    );
    expect(catalogPlanCalls).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'enterprise.catalogAssistant.clear' }));
    await waitFor(() => {
      expect(screen.queryByText('您想找企业还是重点产品？')).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', {
        name: 'enterprise.catalogAssistant.examples.company',
      })
    ).toBeVisible();
  });

  it('keeps visible conversation history and sends compact prior context on follow-up requests', async () => {
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation !== 'catalogAssistant.plan') throw new Error(`unexpected operation ${input.operation}`);
      if (input.payload.message === '帮我找机械加工企业') {
        return {
          operation: input.operation,
          data: {
            filters: {},
            resultLimit: 3,
            clarification: '请确认需要查询企业',
            summary: '等待确认企业类型',
          },
        };
      }
      expect(input.payload.context?.lastUserMessage).toBe('帮我找机械加工企业');
      expect(input.payload.context?.lastSummary).toContain('请确认需要查询企业');
      return {
        operation: input.operation,
        data: {
          filters: {},
          resultLimit: 3,
          clarification: '请补充所在城市',
          summary: '等待确认地区',
        },
      };
    });
    const user = userEvent.setup();
    renderAssistant(createClient(request));

    const input = screen.getByPlaceholderText('enterprise.catalogAssistant.placeholder');
    await user.type(input, '帮我找机械加工企业{Enter}');
    expect(await screen.findByText('请确认需要查询企业')).toBeVisible();

    await user.type(input, '就是企业{Enter}');

    expect(await screen.findByText('请补充所在城市')).toBeVisible();
    expect(screen.getByText('帮我找机械加工企业')).toBeVisible();
    expect(screen.getByText('请确认需要查询企业')).toBeVisible();
    expect(request.mock.calls.filter(([candidate]) => candidate.operation === 'catalogAssistant.plan')).toHaveLength(2);
  });

  it('creates a demand AI session only after the user confirms the allowlisted navigation', async () => {
    const sessionId = 'c1d7599a-0c56-42bf-be40-54d37645b29c';
    const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
      if (input.operation === 'enterpriseAssistant.plan') {
        return {
          operation: input.operation,
          data: {
            intent: 'DEMAND_PUBLISH',
            confidence: 0.98,
            requiresConfirmation: true,
            targetModule: 'SUPPLY_DEMAND_PUBLISH',
            reason: '识别到加工需求',
            initialMessage: input.payload.message,
          },
        };
      }
      if (input.operation === 'demand.aiConversation.start') {
        return {
          operation: input.operation,
          data: {
            sessionId,
            version: 1,
            state: 'COLLECTING_FIELDS',
            action: 'ASK',
            message: '请补充加工数量',
            lineDecision: { typeId: 0, typeName: '机加外包', candidates: [] },
            fieldPatch: {},
            formValues: {},
            missingRequiredFields: ['quantity'],
            warnings: [],
            completion: 0.4,
          },
        };
      }
      throw new Error(`unexpected operation ${input.operation}`);
    });
    const user = userEvent.setup();
    renderAssistant(createClient(request));

    const input = screen.getByPlaceholderText('enterprise.catalogAssistant.placeholder');
    await user.type(input, '我想加工不锈钢配件，包工包料，一个月内到沈阳{Enter}');
    expect(await screen.findByText('enterprise.catalogAssistant.navigation.demandTitle')).toBeVisible();
    expect(request.mock.calls.some(([candidate]) => candidate.operation === 'demand.aiConversation.start')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'enterprise.catalogAssistant.navigation.enterDemand' }));

    await waitFor(() => {
      expect(screen.getByLabelText('location')).toHaveTextContent(
        `/enterprise/supply-demand/publish?aiSession=${sessionId}`
      );
    });
  });
});
