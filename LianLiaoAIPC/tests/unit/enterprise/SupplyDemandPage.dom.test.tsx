import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  window.matchMedia = vi.fn((query: string) => {
    const minimumWidth = query.match(/min-width:\s*(\d+)px/)?.[1];
    const maximumWidth = query.match(/max-width:\s*(\d+)px/)?.[1];
    return {
      matches:
        (!minimumWidth || window.innerWidth >= Number(minimumWidth)) &&
        (!maximumWidth || window.innerWidth <= Number(maximumWidth)),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  }) as typeof window.matchMedia;
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoViewMock,
  });
  window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    return window.setTimeout(() => callback(0), 0);
  });
  window.cancelAnimationFrame = vi.fn((handle: number) => window.clearTimeout(handle));
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
        summary: 'List-only demand details must stay hidden',
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
    expect(screen.queryByText('List-only demand details must stay hidden')).not.toBeInTheDocument();
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

  it('keeps the demand table compact at small laptop width without horizontal scrolling', async () => {
    renderList(createClient());

    expect(await screen.findByText('精密零件加工')).toBeVisible();
    expect(screen.getByText('enterprise.supplyDemand.columns.title')).toBeVisible();
    expect(screen.getAllByText('enterprise.supplyDemand.columns.status')[0]).toBeVisible();
    expect(screen.queryByText('enterprise.supplyDemand.columns.region')).not.toBeInTheDocument();
    expect(screen.queryByText('enterprise.supplyDemand.columns.progress')).not.toBeInTheDocument();
    expect(screen.queryByText('enterprise.supplyDemand.columns.publishedAt')).not.toBeInTheDocument();
    expect(document.querySelector('.ll-ant-table-content')).not.toHaveAttribute('style');
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

  it('renders trusted demand image fields under the related-images label', async () => {
    const trustedImage = 'http://www.lslnii.com/upload/NFSImgFile/appl/images/demand.jpg';
    const client = createClient(async (request) => {
      if (request.operation !== 'demand.detail') throw new Error('unexpected operation');
      return {
        ...detailResponse,
        data: {
          ...detailResponse.data,
          fields: [
            ...detailResponse.data.fields,
            { key: 'images', label: '产品图片', value: trustedImage, valueType: 'IMAGE' },
          ],
        },
      };
    });
    renderDetail('/enterprise/supply-demand/0/101', client);

    const image = await screen.findByRole('img', {
      name: 'enterprise.supplyDemand.detail.relatedImageAlt',
    });
    expect(image).toHaveAttribute('src', trustedImage.replace('http://', 'https://'));
    expect(screen.getByText('enterprise.supplyDemand.detail.relatedImages')).toBeVisible();
    expect(screen.queryByText('产品图片')).not.toBeInTheDocument();
  });

  it('hides unsafe or failed demand image URLs behind a safe unavailable state', async () => {
    const client = createClient(async (request) => {
      if (request.operation !== 'demand.detail') throw new Error('unexpected operation');
      return {
        ...detailResponse,
        data: {
          ...detailResponse.data,
          fields: [
            {
              key: 'images',
              label: '产品图片',
              value: 'https://evil.example/private.jpg,https://www.lslnii.com/upload/demand.jpg',
              valueType: 'IMAGE',
            },
          ],
        },
      };
    });
    renderDetail('/enterprise/supply-demand/0/101', client);

    const image = await screen.findByRole('img', {
      name: 'enterprise.supplyDemand.detail.relatedImageAlt',
    });
    fireEvent.error(image);

    expect(
      await screen.findByRole('img', { name: 'enterprise.supplyDemand.detail.relatedImageUnavailable' })
    ).toBeVisible();
    expect(screen.queryByText(/evil\.example|lslnii\.com/)).not.toBeInTheDocument();
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
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
  });

  it('queries the first page once when the supply-demand type changes', async () => {
    const client = createClient(async (request) => {
      if (request.operation === 'demand.types') {
        return {
          operation: 'demand.types',
          data: [
            { typeId: 0, typeName: '机加外包' },
            { typeId: 5, typeName: '设备采购' },
          ],
        };
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
    const listCallCountBeforeTypeChange = vi
      .mocked(client.request)
      .mock.calls.filter(([request]) => request.operation === 'demand.list').length;

    fireEvent.mouseDown(screen.getByLabelText('enterprise.supplyDemand.filters.type'));
    fireEvent.click(await screen.findByText('设备采购'));

    await waitFor(() =>
      expect(client.request).toHaveBeenLastCalledWith({
        operation: 'demand.list',
        payload: { typeId: 5, pageNum: 1, pageSize: 20 },
      })
    );
    expect(
      vi.mocked(client.request).mock.calls.filter(([request]) => request.operation === 'demand.list')
    ).toHaveLength(listCallCountBeforeTypeChange + 1);
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
