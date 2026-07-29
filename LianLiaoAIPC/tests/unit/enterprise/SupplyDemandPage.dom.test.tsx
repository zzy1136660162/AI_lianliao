import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { EnterpriseResponse } from '@/common/enterprise/contracts';
import EnterpriseAntdProvider from '@/renderer/pages/enterprise/layout/EnterpriseAntdProvider';
import SupplyDemandDetailPage from '@/renderer/pages/enterprise/supplyDemand/SupplyDemandDetailPage';
import SupplyDemandListPage from '@/renderer/pages/enterprise/supplyDemand/SupplyDemandListPage';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const scrollIntoViewMock = vi.fn();

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as typeof window.matchMedia;
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoViewMock,
  });
  window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

const listResponse: EnterpriseResponse = {
  operation: 'demand.list',
  data: {
    list: [
      {
        demandId: '101',
        typeId: 0,
        typeName: '机加外包',
        title: '精密零件加工',
        companyName: '辽宁装备制造有限公司',
        city: '沈阳市',
        district: '铁西区',
        budget: '面议',
        publishedAt: '2026-07-20',
        status: 0,
        grabCount: 1,
        remainingGrabCount: 9,
        primaryTags: ['车削', '铝合金'],
      },
    ],
    pageNum: 1,
    pageSize: 20,
    pages: 1,
    total: 1,
  },
};

const detailResponse: EnterpriseResponse = {
  operation: 'demand.detail',
  data: {
    ...listResponse.data.list[0],
    address: '沈阳经济技术开发区',
    summary: '需要长期稳定供应商',
    fields: [
      { key: 'purchaseQuantity', label: '采购数量', value: '1', valueType: 'NUMBER' },
      { key: 'productParameters', label: '产品参数', value: '车削', valueType: 'TEXT' },
    ],
  },
};

const listResponseWith = (title: string, pageNum = 1, total = 1): EnterpriseResponse => ({
  operation: 'demand.list',
  data: {
    ...listResponse.data,
    list: [{ ...listResponse.data.list[0], title }],
    pageNum,
    pages: Math.ceil(total / listResponse.data.pageSize),
    total,
  },
});

const defaultRequest: EnterpriseClient['request'] = (request) => {
  if (request.operation === 'demand.types') {
    return Promise.resolve({ operation: 'demand.types', data: [{ typeId: 0, typeName: '机加外包' }] });
  }
  if (request.operation === 'demand.list') return Promise.resolve(listResponse);
  if (request.operation === 'demand.detail') return Promise.resolve(detailResponse);
  return Promise.reject(new Error('unexpected operation'));
};

const createClient = (implementation: EnterpriseClient['request'] = defaultRequest): EnterpriseClient => ({
  createLoginSession: vi.fn(),
  pollLoginSession: vi.fn(),
  completeRegistration: vi.fn(),
  restoreSession: vi.fn(),
  clearSession: vi.fn(),
  request: vi.fn(implementation),
});

const LocationProbe = () => {
  const location = useLocation();
  return <output aria-label='location'>{location.pathname}</output>;
};

const renderList = (client: EnterpriseClient) =>
  render(
    <EnterpriseAntdProvider>
      <MemoryRouter initialEntries={['/enterprise/supply-demand']}>
        <Routes>
          <Route path='/enterprise/supply-demand' element={<SupplyDemandListPage client={client} />} />
          <Route path='/enterprise/supply-demand/:typeId/:demandId' element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </EnterpriseAntdProvider>
  );

const renderDetail = (path: string, client: EnterpriseClient) =>
  render(
    <EnterpriseAntdProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path='/enterprise/supply-demand/:typeId/:demandId'
            element={<SupplyDemandDetailPage client={client} />}
          />
        </Routes>
      </MemoryRouter>
    </EnterpriseAntdProvider>
  );

describe('supply-demand pages', () => {
  afterEach(() => {
    cleanup();
    scrollIntoViewMock.mockClear();
  });

  it('renders filters, public demand data and navigates to a type-aware detail route', async () => {
    const client = createClient();
    renderList(client);

    expect(await screen.findByText('精密零件加工')).toBeVisible();
    expect(screen.getByText('机加外包')).toBeVisible();
    expect(screen.queryByText('辽宁装备制造有限公司')).not.toBeInTheDocument();
    expect(screen.getAllByText('enterprise.supplyDemand.columns.status')[0]).toBeVisible();
    expect(screen.queryByText(/open.?id/i)).not.toBeInTheDocument();

    const previewAction = screen.getByRole('button', {
      name: 'enterprise.supplyDemand.actions.preview',
    });
    const detailAction = screen.getByRole('link', {
      name: 'enterprise.supplyDemand.actions.detail',
    });

    // 操作入口共享不可换行样式，避免窄列中的“查看详情”被拆成两行。
    expect(previewAction.className).toContain('rowAction');
    expect(detailAction.className).toContain('rowAction');
    expect(detailAction.parentElement?.className).toContain('rowActions');

    await userEvent.click(detailAction);
    expect(screen.getByLabelText('location')).toHaveTextContent('/enterprise/supply-demand/0/101');
  });

  it('renders mapped Chinese fields on the detail page', async () => {
    const client = createClient();
    renderDetail('/enterprise/supply-demand/0/101', client);

    expect(await screen.findByRole('heading', { name: '精密零件加工' })).toBeVisible();
    expect(screen.queryByText('enterprise.supplyDemand.detail.fieldsTitle')).not.toBeInTheDocument();
    expect(screen.getByText('采购数量')).toBeVisible();
    expect(screen.getByText('产品参数')).toBeVisible();
    expect(screen.getByText('1')).toBeVisible();
    expect(screen.getAllByText('车削')).toHaveLength(2);
    expect(screen.getByText('需要长期稳定供应商')).toBeVisible();
    expect(screen.queryByText('辽宁装备制造有限公司')).not.toBeInTheDocument();
    expect(screen.queryByText('沈阳经济技术开发区')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.ll-ant-card')).toHaveLength(2);
  });

  it('submits trimmed filters and resets to page one', async () => {
    const client = createClient();
    renderList(client);
    await screen.findByText('精密零件加工');

    await userEvent.type(screen.getByLabelText('enterprise.supplyDemand.filters.keyword'), '  航空零件  ');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.supplyDemand.actions.search' }));

    await waitFor(() =>
      expect(client.request).toHaveBeenLastCalledWith({
        operation: 'demand.list',
        payload: { keyword: '航空零件', pageNum: 1, pageSize: 20 },
      })
    );
  });

  it('retries a failed list request without reloading the page', async () => {
    let listCalls = 0;
    const client = createClient(async (request) => {
      if (request.operation === 'demand.types') {
        return { operation: 'demand.types', data: [{ typeId: 0, typeName: '机加外包' }] };
      }
      if (request.operation === 'demand.list') {
        listCalls += 1;
        if (listCalls === 1) throw new Error('network');
        return listResponse;
      }
      throw new Error('unexpected operation');
    });
    renderList(client);

    await userEvent.click(await screen.findByRole('button', { name: 'enterprise.actions.retry' }));
    expect(await screen.findByText('精密零件加工')).toBeVisible();
    expect(listCalls).toBe(2);
  });

  it('ignores a stale list response after filters change', async () => {
    const firstDeferred: { resolve?: (response: EnterpriseResponse) => void } = {};
    const firstList = new Promise<EnterpriseResponse>((resolve) => {
      firstDeferred.resolve = resolve;
    });
    let listCalls = 0;
    const client = createClient(async (request) => {
      if (request.operation === 'demand.types') {
        return { operation: 'demand.types', data: [{ typeId: 0, typeName: '机加外包' }] };
      }
      if (request.operation === 'demand.list') {
        listCalls += 1;
        if (listCalls === 1) return firstList;
        return listResponseWith('航空零件加工');
      }
      throw new Error('unexpected operation');
    });
    renderList(client);

    await userEvent.type(screen.getByLabelText('enterprise.supplyDemand.filters.keyword'), '航空零件');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.supplyDemand.actions.search' }));
    expect(await screen.findByText('航空零件加工')).toBeVisible();

    await act(async () => firstDeferred.resolve?.(listResponseWith('旧供需结果')));
    await waitFor(() => expect(screen.queryByText('旧供需结果')).not.toBeInTheDocument());
  });

  it('loads the selected page and scrolls back to the list heading', async () => {
    const client = createClient(async (request) => {
      if (request.operation === 'demand.types') {
        return { operation: 'demand.types', data: [{ typeId: 0, typeName: '机加外包' }] };
      }
      if (request.operation === 'demand.list') {
        return listResponseWith('精密零件加工', request.payload.pageNum, 21);
      }
      throw new Error('unexpected operation');
    });
    renderList(client);
    await screen.findByText('精密零件加工');

    await userEvent.click(screen.getByTitle('2'));
    await waitFor(() =>
      expect(client.request).toHaveBeenLastCalledWith({
        operation: 'demand.list',
        payload: { pageNum: 2, pageSize: 20 },
      })
    );
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it('does not call IO for an invalid detail route', async () => {
    const client = createClient();
    renderDetail('/enterprise/supply-demand/0/1%20OR%201=1', client);

    expect(await screen.findByText('enterprise.supplyDemand.errors.invalidRoute')).toBeVisible();
    expect(client.request).not.toHaveBeenCalled();
  });

  it('retries a failed detail request', async () => {
    let detailCalls = 0;
    const client = createClient(async (request) => {
      if (request.operation === 'demand.detail') {
        detailCalls += 1;
        if (detailCalls === 1) throw new Error('network');
        return detailResponse;
      }
      throw new Error('unexpected operation');
    });
    renderDetail('/enterprise/supply-demand/0/101', client);

    await userEvent.click(await screen.findByRole('button', { name: 'enterprise.actions.retry' }));
    expect(await screen.findByRole('heading', { name: '精密零件加工' })).toBeVisible();
    expect(detailCalls).toBe(2);
  });
});
