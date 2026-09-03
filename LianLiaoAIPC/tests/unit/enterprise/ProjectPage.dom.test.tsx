import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import type { EnterpriseRequest, EnterpriseResponse } from '@/common/enterprise/contracts';
import EnterpriseAntdProvider from '@/renderer/pages/enterprise/layout/EnterpriseAntdProvider';
import ProjectDetailPage from '@/renderer/pages/enterprise/projects/ProjectDetailPage';
import ProjectPage from '@/renderer/pages/enterprise/projects/ProjectPage';

const chartMocks = vi.hoisted(() => ({
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
  use: vi.fn(),
}));

vi.mock('echarts/core', () => ({ init: chartMocks.init, use: chartMocks.use }));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {}, ScatterChart: {}, TreemapChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, LegendComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(',')}` : key),
  }),
}));

const createMatchMedia = (compact = false, reducedMotion = false) =>
  vi.fn().mockImplementation((query: string) => ({
    matches:
      (compact && query === '(max-width: 820px)') || (reducedMotion && query === '(prefers-reduced-motion: reduce)'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;

beforeAll(() => {
  window.matchMedia = createMatchMedia();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const dashboardResponse = (): EnterpriseResponse => ({
  operation: 'project.dashboard',
  data: {
    runId: 'run-20260715',
    updatedAt: '2026-07-15',
    projectCount: 128,
    categoryL1Count: 6,
    categoryL2Count: 24,
    materialShortNameCount: 48,
    materialNameCount: 96,
    investmentTotalYi: 36.5,
    regionDistribution: [
      { label: 'Shenyang', value: 80 },
      { label: 'Dalian', value: 48 },
    ],
    budgetDistribution: [{ label: '10-50m', value: 30 }],
    categoryDistribution: [{ label: 'Building materials', value: 72 }],
    materialTop: [{ label: 'Cement', value: 42 }],
  },
});

const drillResponse = (): EnterpriseResponse => ({
  operation: 'project.drill',
  data: [
    {
      label: 'Building materials',
      dimension: 'l1',
      categoryL1: 'Building materials',
      categoryL2Count: 4,
      materialNameCount: 22,
      projectCount: 72,
    },
  ],
});

const filterOptionsResponse = (dimension: string): EnterpriseResponse =>
  ({
    operation: 'project.filterOptions',
    data:
      dimension === 'province'
        ? [{ value: 'Liaoning', label: 'Liaoning', projectCount: 128 }]
        : dimension === 'city'
          ? [{ value: 'Shenyang', label: 'Shenyang', projectCount: 80 }]
          : dimension === 'categoryL1'
            ? [{ value: 'Building materials', label: 'Building materials', projectCount: 72 }]
            : dimension === 'categoryL2'
              ? [
                  { value: 'Cement', label: 'Cement', projectCount: 51 },
                  { value: 'Low volume', label: 'Low volume', projectCount: 50 },
                ]
              : dimension === 'materialShortName'
                ? [{ value: 'Portland cement', label: 'Portland cement', projectCount: 21 }]
                : [{ value: 'P.O 42.5', label: 'P.O 42.5', projectCount: 12 }],
  }) as unknown as EnterpriseResponse;

const listResponse = (
  name = 'Factory expansion',
  hpInfoId = '901',
  pageNum = 1,
  total = 1,
  province = 'Liaoning'
): EnterpriseResponse => ({
  operation: 'project.list',
  data: {
    list: [
      {
        hpInfoId,
        projectName: name,
        constructionUnit: 'Acme Manufacturing',
        province,
        city: 'Shenyang',
        totalInvestment: 5000,
        constructionNature: 'New build',
        projectNature: 'Industrial',
        procurementSummary: '<strong>Steel and cement</strong>',
        publishedAt: '2026-06-20',
      },
    ],
    pageNum,
    pageSize: 20,
    pages: Math.ceil(total / 20),
    total,
  },
});

const createRequest = () =>
  vi.fn<EnterpriseClient['request']>((request: EnterpriseRequest) => {
    if (request.operation === 'project.dashboard') return Promise.resolve(dashboardResponse());
    if (request.operation === 'project.drill') return Promise.resolve(drillResponse());
    if (request.operation === 'project.list') return Promise.resolve(listResponse());
    if ((request as { operation: string }).operation === 'project.filterOptions') {
      return Promise.resolve(
        filterOptionsResponse((request as unknown as { payload: { dimension: string } }).payload.dimension)
      );
    }
    return Promise.reject(new Error('unexpected operation'));
  });

const createClient = (request: EnterpriseClient['request']): EnterpriseClient => ({
  createLoginSession: vi.fn(),
  pollLoginSession: vi.fn(),
  completeRegistration: vi.fn(),
  restoreSession: vi.fn(),
  clearSession: vi.fn(),
  request,
});

const LocationProbe = () => {
  const location = useLocation();
  return <output aria-label='location'>{location.pathname}</output>;
};

const renderProjects = (client: EnterpriseClient) =>
  render(
    <EnterpriseAntdProvider>
      <MemoryRouter initialEntries={['/enterprise/projects']}>
        <Routes>
          <Route path='/enterprise/projects' element={<ProjectPage client={client} />} />
          <Route path='/enterprise/projects/:hpInfoId' element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </EnterpriseAntdProvider>
  );

const selectProjectFilterOption = async (_user: ReturnType<typeof userEvent.setup>, label: string, option: RegExp) => {
  const combobox = screen.getByRole('combobox', { name: label });
  fireEvent.mouseDown(combobox);
  const optionTextNodes = await screen.findAllByText(option);
  const optionElement = optionTextNodes
    .map((node) => node.closest('.ll-ant-select-item-option'))
    .find((node): node is HTMLElement => node instanceof HTMLElement);
  expect(optionElement).toBeDefined();
  fireEvent.click(optionElement!);
};

describe('project dashboard and catalog', () => {
  afterEach(() => {
    cleanup();
    window.matchMedia = createMatchMedia();
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockReset();
  });

  it('renders live KPI, distribution, drill and plain-text project rows', async () => {
    const { container } = renderProjects(createClient(createRequest()));

    expect(await screen.findByRole('heading', { name: /enterprise\.projectDetail\.lockedProjectTitle/ })).toBeVisible();
    expect(container.querySelector('.ll-ant-table')).toBeInTheDocument();
    expect(container.querySelector('[class*="arco-"]')).not.toBeInTheDocument();
    expect(screen.queryByText('128')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /enterprise\.projects\.dashboard\.expand/ }));
    const expandedToggle = await screen.findByRole('button', {
      name: /enterprise\.projects\.dashboard\.collapse/,
    });
    expect(expandedToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(container).toHaveTextContent('36.5');
    expect(screen.getByRole('img', { name: 'enterprise.projects.dashboard.regionTitle' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'enterprise.projects.dashboard.materialTitle' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'enterprise.projects.dashboard.categoryTitle' })).toBeInTheDocument();
    expect(screen.getByText('Shenyang')).toBeInTheDocument();
    expect(screen.getByText('Building materials')).toBeInTheDocument();
    expect(screen.getByText('<strong>Steel and cement</strong>')).toBeInTheDocument();
    expect(container.querySelector('strong strong')).toBeNull();
  });

  it('shows localized empty states instead of mounting charts without data', async () => {
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'project.dashboard') {
        const response = dashboardResponse();
        if (response.operation !== 'project.dashboard') throw new Error('unexpected dashboard response');
        return Promise.resolve({
          ...response,
          data: {
            ...response.data,
            regionDistribution: [],
            materialTop: [],
          },
        });
      }
      if (operation.operation === 'project.drill') return Promise.resolve({ operation: 'project.drill', data: [] });
      if (operation.operation === 'project.list') return Promise.resolve(listResponse());
      return Promise.reject(new Error('unexpected operation'));
    });

    renderProjects(createClient(request));
    await screen.findByRole('heading', { name: /enterprise\.projectDetail\.lockedProjectTitle/ });
    fireEvent.click(screen.getByRole('button', { name: /enterprise\.projects\.dashboard\.expand/ }));

    const expandedToggle = await screen.findByRole('button', {
      name: /enterprise\.projects\.dashboard\.collapse/,
    });
    expect(expandedToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('enterprise.projects.dashboard.categoryEmpty')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'enterprise.projects.dashboard.regionTitle' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'enterprise.projects.dashboard.materialTitle' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'enterprise.projects.dashboard.categoryTitle' })).toBeNull();
    expect(screen.getAllByText('enterprise.projects.dashboard.distributionEmpty')).toHaveLength(2);
  });

  it('desensitizes list and quick-view names while preserving the numeric detail route', async () => {
    const { container } = renderProjects(createClient(createRequest()));

    const protectedHeading = await screen.findByRole('heading', {
      name: /enterprise\.projectDetail\.lockedProjectTitle/,
    });
    expect(container).not.toHaveTextContent('Factory expansion');
    expect(container).not.toHaveTextContent('Acme Manufacturing');

    fireEvent.click(protectedHeading.closest('tr') as HTMLElement);
    const quickView = screen.getByRole('complementary', { name: 'enterprise.projects.quickView.label' });
    expect(quickView).not.toHaveTextContent('Factory expansion');
    expect(quickView).not.toHaveTextContent('Acme Manufacturing');
    expect(quickView).not.toHaveTextContent(/enterprise\.projects\.quickView\.index|0901/);
    expect(within(quickView).getByText('enterprise.projects.quickView.title')).toBeVisible();
    expect(within(quickView).getByText('enterprise.projects.quickView.hint')).toBeVisible();
    expect(within(quickView).getByRole('button', { name: 'enterprise.projects.quickView.action' })).toBeVisible();
    fireEvent.click(within(quickView).getByRole('button', { name: 'enterprise.projects.quickView.action' }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/projects/901');
  });

  it('submits only the visible linked project filters at page one', async () => {
    const user = userEvent.setup();
    const request = createRequest();
    renderProjects(createClient(request));
    await screen.findByRole('heading', { name: /enterprise\.projectDetail\.lockedProjectTitle/ });

    fireEvent.change(screen.getByPlaceholderText('enterprise.projects.filters.keywordPlaceholder'), {
      target: { value: ' factory ' },
    });
    await selectProjectFilterOption(user, 'enterprise.projects.filters.provinceLabel', /^Liaoning \(128\)$/);
    await selectProjectFilterOption(user, 'enterprise.projects.filters.categoryL1Label', /^Building materials \(72\)$/);
    await selectProjectFilterOption(user, 'enterprise.projects.filters.categoryL2Label', /^Cement \(51\)$/);
    await selectProjectFilterOption(
      user,
      'enterprise.projects.filters.materialShortNameLabel',
      /^Portland cement \(21\)$/
    );
    await selectProjectFilterOption(user, 'enterprise.projects.filters.materialNameLabel', /^P\.O 42\.5 \(12\)$/);
    fireEvent.click(screen.getByRole('button', { name: 'enterprise.projects.actions.search' }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({
        operation: 'project.list',
        payload: {
          keyword: 'factory',
          categoryL1: 'Building materials',
          categoryL2: 'Cement',
          materialShortName: 'Portland cement',
          materialName: 'P.O 42.5',
          province: 'Liaoning',
          pageNum: 1,
          pageSize: 20,
        },
      })
    );
  }, 60_000);

  it('loads database filter roots and scopes linked categories to the selected province', async () => {
    const user = userEvent.setup();
    const request = createRequest();
    renderProjects(createClient(request));
    await screen.findByRole('heading', { name: /enterprise\.projectDetail\.lockedProjectTitle/ });

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith({
        operation: 'project.filterOptions',
        payload: { dimension: 'province', limit: 500 },
      });
      expect(request).toHaveBeenCalledWith({
        operation: 'project.filterOptions',
        payload: { dimension: 'categoryL1', limit: 500 },
      });
    });

    await selectProjectFilterOption(user, 'enterprise.projects.filters.provinceLabel', /^Liaoning \(128\)$/);

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({
        operation: 'project.filterOptions',
        payload: { dimension: 'categoryL1', province: 'Liaoning', limit: 500 },
      })
    );
    expect(screen.queryByRole('combobox', { name: 'enterprise.projects.filters.cityLabel' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'enterprise.projects.filters.categoryL2Label' })).toBeDisabled();
  });

  it('shows only second-level categories with more than 50 projects', async () => {
    const user = userEvent.setup();
    renderProjects(createClient(createRequest()));
    await screen.findByRole('heading', { name: /enterprise\.projectDetail\.lockedProjectTitle/ });

    await selectProjectFilterOption(user, 'enterprise.projects.filters.categoryL1Label', /^Building materials \(72\)$/);
    const categoryL2 = screen.getByRole('combobox', { name: 'enterprise.projects.filters.categoryL2Label' });
    await waitFor(() => expect(categoryL2).toBeEnabled());
    fireEvent.mouseDown(categoryL2);

    expect(await screen.findByText('Cement (51)')).toBeInTheDocument();
    expect(screen.queryByText('Low volume (50)')).toBeNull();
  });

  it('bounds project filter controls before they can reach IPC', async () => {
    renderProjects(createClient(createRequest()));
    await screen.findByRole('heading', { name: /enterprise\.projectDetail\.lockedProjectTitle/ });

    expect(screen.getByPlaceholderText('enterprise.projects.filters.keywordPlaceholder')).toHaveAttribute(
      'maxlength',
      '100'
    );
    expect(screen.getByRole('combobox', { name: 'enterprise.projects.filters.provinceLabel' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'enterprise.projects.filters.categoryL1Label' })).toBeEnabled();
    expect(screen.queryByRole('combobox', { name: 'enterprise.projects.filters.cityLabel' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'enterprise.projects.filters.materialNameLabel' })).toBeDisabled();
    expect(screen.queryByPlaceholderText('enterprise.projects.filters.minInvestmentPlaceholder')).toBeNull();
    expect(screen.queryByPlaceholderText('enterprise.projects.filters.maxInvestmentPlaceholder')).toBeNull();
    expect(screen.queryByText('enterprise.projects.columns.nature')).toBeNull();
  });

  it('places linked material filters before the keyword, province and search row', async () => {
    renderProjects(createClient(createRequest()));
    await screen.findByRole('heading', { name: /enterprise\.projectDetail\.lockedProjectTitle/ });

    const categoryL1 = screen.getByRole('combobox', { name: 'enterprise.projects.filters.categoryL1Label' });
    const keyword = screen.getByPlaceholderText('enterprise.projects.filters.keywordPlaceholder');
    const province = screen.getByRole('combobox', { name: 'enterprise.projects.filters.provinceLabel' });
    const search = screen.getByRole('button', { name: 'enterprise.projects.actions.search' });
    const form = keyword.closest('form');

    expect(form?.firstElementChild).toContainElement(categoryL1);
    expect(categoryL1.compareDocumentPosition(keyword) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(keyword.compareDocumentPosition(province) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(province.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps old rows while paging, clears preview and ignores stale responses', async () => {
    const pageTwo = deferred<EnterpriseResponse>();
    const pageThree = deferred<EnterpriseResponse>();
    let listCalls = 0;
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'project.dashboard') return Promise.resolve(dashboardResponse());
      if (operation.operation === 'project.drill') return Promise.resolve(drillResponse());
      listCalls += 1;
      if (listCalls === 1) return Promise.resolve(listResponse('Page one project', '901', 1, 45, 'Region one'));
      if (listCalls === 2) return pageTwo.promise;
      return pageThree.promise;
    });
    renderProjects(createClient(request));

    const row = (await screen.findByRole('heading', { name: /Region one/ })).closest('tr') as HTMLElement;
    fireEvent.click(row);
    expect(screen.getByRole('complementary', { name: 'enterprise.projects.quickView.label' })).toBeVisible();
    fireEvent.click(screen.getByTitle('2'));
    await waitFor(() =>
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    );
    expect(screen.getByRole('heading', { name: /Region one/ })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'enterprise.projects.quickView.label' })).toBeNull();
    fireEvent.click(screen.getByTitle('3'));

    pageThree.resolve(listResponse('Latest project', '903', 3, 45, 'Region three'));
    expect(await screen.findByRole('heading', { name: /Region three/ })).toBeVisible();
    pageTwo.resolve(listResponse('Stale project', '902', 2, 45, 'Region two'));
    await Promise.resolve();
    expect(screen.queryByText(/Region two/)).toBeNull();
  });

  it('focuses and reveals quick view at compact width and respects reduced motion', async () => {
    window.matchMedia = createMatchMedia(true, true);
    const user = userEvent.setup();
    renderProjects(createClient(createRequest()));

    const row = (await screen.findByRole('heading', { name: /enterprise\.projectDetail\.lockedProjectTitle/ })).closest(
      'tr'
    ) as HTMLElement;
    row.focus();
    await user.keyboard('{Enter}');
    const quickView = screen.getByRole('complementary', { name: 'enterprise.projects.quickView.label' });
    await waitFor(() => expect(quickView).toHaveFocus());
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
    expect(within(quickView).getByRole('button', { name: 'enterprise.projects.quickView.action' })).toBeVisible();
  });

  it.each([
    ['desktop close button', false, 'button'],
    ['compact Escape', true, 'escape'],
  ] as const)('restores row focus after %s closes the quick view', async (_label, compact, closeMethod) => {
    window.matchMedia = createMatchMedia(compact, true);
    const user = userEvent.setup();
    renderProjects(createClient(createRequest()));

    const row = (await screen.findByRole('heading', { name: /enterprise\.projectDetail\.lockedProjectTitle/ })).closest(
      'tr'
    ) as HTMLElement;
    row.focus();
    await user.keyboard('{Enter}');
    const quickView = screen.getByRole('complementary', { name: 'enterprise.projects.quickView.label' });
    await waitFor(() => expect(quickView).toHaveFocus());
    if (closeMethod === 'escape') {
      await user.keyboard('{Escape}');
    } else {
      await user.click(within(quickView).getByRole('button', { name: 'enterprise.projects.actions.closeQuickView' }));
    }

    await waitFor(() => expect(row).toHaveFocus());
    expect(screen.queryByRole('complementary', { name: 'enterprise.projects.quickView.label' })).toBeNull();
  });

  it('moves focus to the stable catalog region when paging clears a preview row', async () => {
    const user = userEvent.setup();
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'project.dashboard') return Promise.resolve(dashboardResponse());
      if (operation.operation === 'project.drill') return Promise.resolve(drillResponse());
      return Promise.resolve(
        listResponse('Paged project', operation.payload.pageNum === 2 ? '902' : '901', operation.payload.pageNum, 21)
      );
    });
    renderProjects(createClient(request));

    const row = (await screen.findByRole('heading', { name: /enterprise\.projectDetail\.lockedProjectTitle/ })).closest(
      'tr'
    ) as HTMLElement;
    row.focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('complementary', { name: 'enterprise.projects.quickView.label' })).toHaveFocus()
    );
    const pageTwo = screen.getByTitle('2');
    await user.click(pageTwo);

    const catalog = screen.getByRole('region', { name: 'enterprise.projects.catalog.title' });
    await waitFor(() => expect(catalog).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it('shows a safe retryable error with an empty list and never injects H5 mock projects', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockRejectedValue(new Error('raw-openid-secret'));
    const { container } = renderProjects(createClient(request));

    expect(await screen.findByText('enterprise.projects.error.title')).toBeVisible();
    expect(container).not.toHaveTextContent('raw-openid-secret');
    expect(container).not.toHaveTextContent('90001');
    expect(container).not.toHaveTextContent('90002');
    expect(container.querySelector('tbody tr')).toBeNull();
    expect(screen.getByRole('button', { name: 'enterprise.actions.retry' })).toBeVisible();
  });
});

describe('project detail permission display', () => {
  afterEach(cleanup);

  const renderDetail = (client: EnterpriseClient, hpInfoId = '901') =>
    render(
      <EnterpriseAntdProvider>
        <MemoryRouter initialEntries={[`/enterprise/projects/${hpInfoId}`]}>
          <Routes>
            <Route path='/enterprise/projects/:hpInfoId' element={<ProjectDetailPage client={client} />} />
          </Routes>
        </MemoryRouter>
      </EnterpriseAntdProvider>
    );

  it('hides protected fields until the H5-compatible project unlock succeeds and refreshes detail', async () => {
    let purchased = false;
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation === 'contact.acquire') {
        return {
          operation: 'contact.acquire',
          data: {
            allowed: true,
            errType: 0,
            message: '',
            action: 'NONE',
            ...(input.payload.consumeQuota === false ? {} : { phone: '13800000000' }),
          },
        };
      }
      if (input.operation === 'project.contactUnlock') {
        purchased = true;
        return { operation: 'project.contactUnlock', data: { purchased: true, inserted: true } };
      }
      return {
        operation: 'project.detail',
        data: {
          hpInfoId: '901',
          projectName: 'Factory expansion',
          constructionUnit: 'Secret owner',
          contactName: 'Secret contact',
          phone: '138********',
          address: 'Secret address',
          constructionNature: 'New build',
          totalInvestment: 5000,
          constructionPeriod: '2026-2027',
          projectComposition: 'Plant and warehouse',
          equipment: 'Production line',
          materials: 'Steel and cement',
          purchased,
        },
      };
    });
    const { container } = renderDetail(createClient(request));

    expect(await screen.findByText('enterprise.projectDetail.locked.title')).toBeVisible();
    expect(container.querySelector('.ll-ant-card')).toBeInTheDocument();
    expect(container.querySelector('[class*="arco-"]')).not.toBeInTheDocument();
    expect(screen.getByText(/enterprise\.projectDetail\.lockedProjectTitle/)).toBeVisible();
    expect(screen.getByText('Plant and warehouse')).toBeVisible();
    expect(container).not.toHaveTextContent('Factory expansion');
    expect(container).not.toHaveTextContent('Secret owner');
    expect(container).not.toHaveTextContent('Secret contact');
    expect(container).not.toHaveTextContent('Secret address');
    expect(container).not.toHaveTextContent('1380000');
    expect(container.querySelectorAll('[data-protected="true"]')).toHaveLength(3);
    expect(screen.getByText('138********')).not.toHaveAttribute('data-protected');

    await userEvent.click(screen.getByRole('button', { name: 'enterprise.projectDetail.unlock.action' }));
    const acquireButton = await screen.findByRole('button', { name: '解锁联系方式' });
    expect(container).not.toHaveTextContent('Factory expansion');
    expect(container).not.toHaveTextContent('Secret owner');
    expect(container.querySelectorAll('[data-protected="true"]')).toHaveLength(3);

    await userEvent.click(acquireButton);
    expect(await screen.findByRole('heading', { name: 'Factory expansion' })).toBeVisible();
    expect(screen.getByText('Secret owner')).not.toHaveAttribute('data-protected');
    expect(screen.getByText('Secret contact')).not.toHaveAttribute('data-protected');
    expect(screen.getByText('Secret address')).not.toHaveAttribute('data-protected');
    expect(screen.getAllByText('13800000000')).not.toHaveLength(0);
    expect(container.querySelector('[data-protected="true"]')).toBeNull();
    expect(request).toHaveBeenCalledWith({
      operation: 'contact.acquire',
      payload: { resourceType: 'PROJECT', resourceId: '901', consumeQuota: false },
    });
    expect(request).toHaveBeenCalledWith({
      operation: 'project.contactUnlock',
      payload: { hpInfoId: '901' },
    });
    expect(request).toHaveBeenCalledWith({
      operation: 'contact.acquire',
      payload: { resourceType: 'PROJECT', resourceId: '901' },
    });
  });

  it('does not misreport a technical unlock failure as a membership restriction', async () => {
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation === 'contact.acquire') throw new Error('temporary failure');
      return {
        operation: 'project.detail',
        data: {
          hpInfoId: '901',
          projectName: 'Factory expansion',
          constructionUnit: 'Secret owner',
          contactName: 'Secret contact',
          phone: '138********',
          address: 'Secret address',
          purchased: false,
        },
      };
    });
    renderDetail(createClient(request));

    await screen.findByText('enterprise.projectDetail.locked.title');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.projectDetail.unlock.action' }));

    expect(await screen.findByText('enterprise.projectDetail.unlock.failed')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens membership guidance only for an explicit membership entitlement response', async () => {
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation === 'contact.acquire') {
        return {
          operation: 'contact.acquire',
          data: { allowed: false, errType: 9, message: 'Quota reached', action: 'UPGRADE' },
        };
      }
      return {
        operation: 'project.detail',
        data: {
          hpInfoId: '901',
          projectName: 'Factory expansion',
          constructionUnit: 'Secret owner',
          contactName: 'Secret contact',
          phone: '138********',
          address: 'Secret address',
          purchased: false,
        },
      };
    });
    renderDetail(createClient(request));

    await screen.findByText('enterprise.projectDetail.locked.title');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.projectDetail.unlock.action' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Quota reached')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith({
      operation: 'project.contactUnlock',
      payload: { hpInfoId: '901' },
    });
  });

  it('shows authorized fields and renders rich-looking content as text for a purchased project', async () => {
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation === 'contact.acquire') {
        return {
          operation: 'contact.acquire',
          data: {
            allowed: true,
            errType: 0,
            message: '',
            action: 'NONE',
            phone: '13800000000',
          },
        };
      }
      return {
        operation: 'project.detail',
        data: {
          hpInfoId: '901',
          projectName: 'Factory expansion',
          constructionUnit: 'Acme Manufacturing',
          contactName: 'Jane',
          phone: '13800000000',
          address: 'No. 8 Industry Road',
          constructionNature: 'New build',
          totalInvestment: 5000,
          constructionPeriod: '2026-2027',
          projectComposition: '<script>window.stolen=true</script>Plant',
          equipment: 'Production line',
          materials: 'Steel and cement',
          purchased: true,
        },
      };
    });
    const { container } = renderDetail(createClient(request));

    const acquireButton = await screen.findByRole('button', { name: '解锁联系方式' });
    expect(container).not.toHaveTextContent('Factory expansion');
    expect(container).not.toHaveTextContent('Acme Manufacturing');
    expect(container).not.toHaveTextContent('Jane');
    expect(container).not.toHaveTextContent('No. 8 Industry Road');
    expect(container).not.toHaveTextContent('13800000000');
    expect(screen.getAllByText('138********')).not.toHaveLength(0);
    expect(container.querySelectorAll('[data-protected="true"]')).toHaveLength(3);
    expect(screen.getByText('<script>window.stolen=true</script>Plant')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector("a[href^='tel:']")).toBeNull();

    await userEvent.click(acquireButton);
    expect(await screen.findByRole('heading', { name: 'Factory expansion' })).toBeVisible();
    expect(screen.getByText('Acme Manufacturing')).toBeVisible();
    expect(screen.getByText('Jane')).toBeVisible();
    expect(screen.getByText('No. 8 Industry Road')).toBeVisible();
    expect(screen.getAllByText('13800000000')).not.toHaveLength(0);
    expect(container.querySelector('[data-protected="true"]')).toBeNull();
  });

  it('rejects a nonnumeric detail route before any IPC request', async () => {
    const request = vi.fn<EnterpriseClient['request']>();
    const { container } = renderDetail(createClient(request), '901%3Fphone%3D13800000000');
    expect(await screen.findByText('enterprise.projectDetail.invalid.title')).toBeVisible();
    expect(request).not.toHaveBeenCalled();
    expect(container).not.toHaveTextContent('13800000000');
  });
});
