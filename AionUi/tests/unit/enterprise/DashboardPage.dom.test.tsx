import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { EnterpriseRequest, EnterpriseResponse, EnterpriseUserContext } from '@/common/enterprise/contracts';
import DashboardPage from '@/renderer/pages/enterprise/dashboard/DashboardPage';
import EnterpriseAntdProvider from '@/renderer/pages/enterprise/layout/EnterpriseAntdProvider';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

const authUser: EnterpriseUserContext = {
  registered: true,
  openId: 'openid-must-never-appear',
  userName: 'Chen Wei',
  companyName: 'Liaoning Precision Equipment',
  companyLevel: 3,
};

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const scrollIntoView = vi.fn();

vi.mock('@/renderer/hooks/context/EnterpriseAuthContext', () => ({
  useEnterpriseAuth: () => ({ user: authUser }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(',')}` : key),
  }),
}));

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
});

const dashboardResponse = (): EnterpriseResponse => ({
  operation: 'project.dashboard',
  data: {
    runId: 'run-9',
    projectCount: 128,
    categoryL1Count: 6,
    categoryL2Count: 24,
    materialShortNameCount: 48,
    materialNameCount: 96,
    investmentTotalYi: 36.5,
    regionDistribution: [{ label: 'Shenyang', value: 80 }],
    budgetDistribution: [],
    categoryDistribution: [],
    materialTop: [{ label: 'Industrial pumps', value: 42 }],
  },
});

const drillResponse = (): EnterpriseResponse => ({
  operation: 'project.drill',
  data: [
    {
      label: 'Equipment',
      dimension: 'l1',
      categoryL1: 'Equipment',
      materialNameCount: 12,
      projectCount: 40,
    },
  ],
});

const companyResponse = (name: string): EnterpriseResponse => ({
  operation: 'company.list',
  data: { list: [{ companyId: '11', name, industry: 'Equipment' }], pageNum: 1, pageSize: 5, pages: 1, total: 1 },
});

const productResponse = (name: string): EnterpriseResponse => ({
  operation: 'product.list',
  data: {
    list: [
      {
        productId: '22',
        companyId: '11',
        name,
        companyName: 'Liaoning Precision Equipment',
        phone: '138****0000',
      },
    ],
    pageNum: 1,
    pageSize: 5,
    pages: 1,
    total: 1,
  },
});

const projectResponse = (projectName: string, hpInfoId = '33'): EnterpriseResponse => ({
  operation: 'project.list',
  data: {
    list: [
      {
        hpInfoId,
        projectName,
        constructionUnit: 'Confidential Group',
        province: 'Liaoning',
        constructionNature: 'New build',
      },
    ],
    pageNum: 1,
    pageSize: 5,
    pages: 1,
    total: 1,
  },
});

const defaultRequest = vi.fn<EnterpriseClient['request']>((request: EnterpriseRequest) => {
  if (request.operation === 'project.dashboard') return Promise.resolve(dashboardResponse());
  if (request.operation === 'project.drill') return Promise.resolve(drillResponse());
  if (request.operation === 'company.list') return Promise.resolve(companyResponse('Search company'));
  if (request.operation === 'product.list') return Promise.resolve(productResponse('Search product'));
  if (request.operation === 'project.list') return Promise.resolve(projectResponse('RAW confidential project'));
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

const dashboardTree = (client: EnterpriseClient) => (
  <EnterpriseAntdProvider>
    <MemoryRouter initialEntries={['/enterprise/dashboard']}>
      <Routes>
        <Route path='/enterprise/dashboard' element={<DashboardPage client={client} />} />
        <Route path='*' element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  </EnterpriseAntdProvider>
);

const renderDashboard = (client = createClient(defaultRequest)) => render(dashboardTree(client));
const setSearchValue = (input: HTMLElement, value: string) => {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
};

describe('enterprise dashboard', () => {
  beforeEach(() => {
    defaultRequest.mockClear();
    scrollIntoView.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    authUser.companyName = 'Liaoning Precision Equipment';
    authUser.userName = 'Chen Wei';
    authUser.companyLevel = 3;
  });

  it('shows the authenticated identity and live procurement summary without exposing openid or fake counters', async () => {
    const { container } = renderDashboard();

    expect(await screen.findByText('Liaoning Precision Equipment')).toBeVisible();
    expect(container.querySelector('.ll-ant-select-auto-complete')).toBeInTheDocument();
    expect(screen.getByText('Chen Wei')).toBeVisible();
    expect(await screen.findByText('128')).toBeVisible();
    expect(screen.getByText('Shenyang')).toBeVisible();
    expect(screen.getByText('Industrial pumps')).toBeVisible();
    expect(container).not.toHaveTextContent('openid-must-never-appear');
    expect(container).not.toHaveTextContent('enterprise.dashboard.metrics.favorites');
    expect(container).not.toHaveTextContent('enterprise.dashboard.metrics.leads');
  });

  it('uses translated identity fallbacks when optional profile labels are absent', async () => {
    authUser.companyName = undefined;
    authUser.userName = undefined;
    authUser.companyLevel = undefined;
    renderDashboard();

    expect(await screen.findByText('enterprise.shell.unknownCompany')).toBeVisible();
    expect(screen.getByText('enterprise.shell.unknownUser')).toBeVisible();
    expect(screen.queryByText(/enterprise\.companies\.memberLevel\.value/)).toBeNull();
  });

  it('waits 300ms and requires two trimmed characters before searching', async () => {
    vi.useFakeTimers();
    renderDashboard();
    await act(async () => undefined);
    const search = screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' });
    const initialCalls = defaultRequest.mock.calls.length;

    setSearchValue(search, ' a ');
    await act(async () => vi.advanceTimersByTime(500));
    expect(defaultRequest).toHaveBeenCalledTimes(initialCalls);

    setSearchValue(search, ' ab ');
    await act(async () => vi.advanceTimersByTime(299));
    expect(defaultRequest).toHaveBeenCalledTimes(initialCalls);
    await act(async () => vi.advanceTimersByTime(1));

    expect(defaultRequest).toHaveBeenCalledWith({
      operation: 'company.list',
      payload: { keyword: 'ab', pageNum: 1, pageSize: 5 },
    });
    expect(defaultRequest).toHaveBeenCalledWith({
      operation: 'product.list',
      payload: { keyword: 'ab', pageNum: 1, pageSize: 5 },
    });
    expect(defaultRequest).toHaveBeenCalledWith({
      operation: 'project.list',
      payload: { keyword: 'ab', pageNum: 1, pageSize: 5 },
    });
  });

  it('shows loading inside the controlled autocomplete popup', async () => {
    const pendingSearch = deferred<EnterpriseResponse>();
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'project.dashboard') return Promise.resolve(dashboardResponse());
      if (operation.operation === 'project.drill') return Promise.resolve(drillResponse());
      return pendingSearch.promise;
    });
    renderDashboard(createClient(request));
    const input = screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' });

    setSearchValue(input, 'pump');
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('enterprise.dashboard.search.loading')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
  });

  it('keeps partial results, reports the failed group and routes clicks to real details', async () => {
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'project.dashboard') return Promise.resolve(dashboardResponse());
      if (operation.operation === 'project.drill') return Promise.resolve(drillResponse());
      if (operation.operation === 'company.list') return Promise.resolve(companyResponse('Clickable company'));
      if (operation.operation === 'product.list') return Promise.reject(new Error('raw-product-failure'));
      if (operation.operation === 'project.list') return Promise.resolve(projectResponse('RAW secret project'));
      return Promise.reject(new Error('unexpected operation'));
    });
    renderDashboard(createClient(request));

    setSearchValue(screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' }), 'pump');

    const companyResult = await screen.findByRole('option', { name: /Clickable company/ });
    const listbox = companyResult.closest('[role="listbox"]') as HTMLElement;
    expect(companyResult).toBeInTheDocument();
    expect(within(listbox).getByText('enterprise.dashboard.search.groupError')).toBeInTheDocument();
    expect(within(listbox).queryByText('RAW secret project')).toBeNull();

    await userEvent.click(companyResult);
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/11');
  });

  it('navigates the first grouped result with ArrowDown and Enter and closes on Escape', async () => {
    const user = userEvent.setup();
    renderDashboard();
    const input = screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' });
    setSearchValue(input, 'pump');
    await screen.findByRole('option', { name: /Search company/ });

    const listbox = screen.getByRole('listbox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);

    await user.click(input);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/11');

    renderDashboard();
    const nextInput = screen.getAllByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' }).at(-1)!;
    setSearchValue(nextInput, 'pump');
    await screen.findAllByRole('listbox');
    fireEvent.keyDown(nextInput, { key: 'Escape' });
    await waitFor(() => expect(nextInput).toHaveAttribute('aria-expanded', 'false'));
  });

  it('renders grouped Ant options without exposing protected phone data', async () => {
    renderDashboard();
    const input = screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' });
    setSearchValue(input, 'pump');
    await screen.findByRole('option', { name: /Search company/ });

    expect(screen.getByText('enterprise.dashboard.search.groups.companies')).toBeInTheDocument();
    expect(screen.getByText('enterprise.dashboard.search.groups.products')).toBeInTheDocument();
    expect(screen.getByText('enterprise.dashboard.search.groups.projects')).toBeInTheDocument();
    expect(screen.queryByText('138****0000')).toBeNull();
  });

  it('reopens closed results from the focused input and selects the directional edge', async () => {
    renderDashboard();
    const input = screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' });
    setSearchValue(input, 'pump');
    await screen.findByRole('option', { name: /Search company/ });
    act(() => input.focus());

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).toBe(input);
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'false'));
    fireEvent.focus(input);
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
    expect(await screen.findByRole('option', { name: /Search company/ })).toBeInTheDocument();
  });

  it('clears a stale active option when the same query receives a shorter result set', async () => {
    const initialClient = createClient(defaultRequest);
    const nextRequest = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'project.dashboard') return Promise.resolve(dashboardResponse());
      if (operation.operation === 'project.drill') return Promise.resolve(drillResponse());
      if (operation.operation === 'company.list') return Promise.resolve(companyResponse('Only company'));
      if (operation.operation === 'product.list') {
        return Promise.resolve({
          operation: 'product.list',
          data: { list: [], pageNum: 1, pageSize: 5, pages: 0, total: 0 },
        });
      }
      if (operation.operation === 'project.list') {
        return Promise.resolve({
          operation: 'project.list',
          data: { list: [], pageNum: 1, pageSize: 5, pages: 0, total: 0 },
        });
      }
      return Promise.reject(new Error('unexpected operation'));
    });
    const view = renderDashboard(initialClient);
    const input = screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' });
    setSearchValue(input, 'pump');
    await screen.findByRole('option', { name: /enterprise\.projectDetail\.lockedProjectTitle/ });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveAttribute('aria-activedescendant');

    view.rerender(dashboardTree(createClient(nextRequest)));
    expect(await screen.findByRole('option', { name: /Only company/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Search product/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /enterprise\.projectDetail\.lockedProjectTitle/ })).toBeNull();
  });

  it('routes a protected project result by numeric identity without rendering its raw name', async () => {
    const { container } = renderDashboard();
    setSearchValue(screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' }), 'pump');

    const projectOption = await screen.findByRole('option', {
      name: /enterprise\.projectDetail\.lockedProjectTitle/,
    });
    expect(container).not.toHaveTextContent('RAW confidential project');
    await userEvent.click(projectOption);
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/projects/33');
  });

  it('shows an empty state when all three successful groups contain no records', async () => {
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'project.dashboard') return Promise.resolve(dashboardResponse());
      if (operation.operation === 'project.drill') return Promise.resolve(drillResponse());
      return Promise.resolve({
        operation: operation.operation,
        data: { list: [], pageNum: 1, pageSize: 5, pages: 0, total: 0 },
      } as EnterpriseResponse);
    });
    renderDashboard(createClient(request));
    const input = screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' });
    setSearchValue(input, 'none');

    await waitFor(() => expect(screen.getByRole('listbox')).toHaveTextContent('enterprise.dashboard.search.empty'));
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
  });

  it('discards stale search results when the query changes during a request', async () => {
    const firstCompany = deferred<EnterpriseResponse>();
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'project.dashboard') return Promise.resolve(dashboardResponse());
      if (operation.operation === 'project.drill') return Promise.resolve(drillResponse());
      if (operation.operation === 'company.list' && operation.payload.keyword === 'ab') return firstCompany.promise;
      if (operation.operation === 'company.list') return Promise.resolve(companyResponse('Latest company'));
      if (operation.operation === 'product.list')
        return Promise.resolve(productResponse(`Product ${operation.payload.keyword}`));
      if (operation.operation === 'project.list')
        return Promise.resolve(projectResponse(`Project ${operation.payload.keyword}`));
      return Promise.reject(new Error('unexpected operation'));
    });
    renderDashboard(createClient(request));
    const input = screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' });

    setSearchValue(input, 'ab');
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ operation: 'company.list' })));
    setSearchValue(input, 'cd');
    expect(await screen.findByRole('option', { name: /Latest company/ })).toBeInTheDocument();
    firstCompany.resolve(companyResponse('Stale company'));
    await act(async () => undefined);

    expect(screen.queryByText('Stale company')).toBeNull();
    expect(screen.getByRole('option', { name: /Latest company/ })).toBeInTheDocument();
  });

  it('shows one total search error when all groups fail without leaking raw errors', async () => {
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'project.dashboard') return Promise.resolve(dashboardResponse());
      if (operation.operation === 'project.drill') return Promise.resolve(drillResponse());
      return Promise.reject(new Error('raw-openid-secret'));
    });
    const { container } = renderDashboard(createClient(request));
    const input = screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' });
    setSearchValue(input, 'pump');

    await waitFor(() =>
      expect(screen.getByRole('listbox')).toHaveTextContent('enterprise.dashboard.search.totalError')
    );
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(container).not.toHaveTextContent('raw-openid-secret');
  });

  it('lets the procurement summary fail and retry independently from identity and shortcuts', async () => {
    let dashboardCalls = 0;
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'project.dashboard') {
        dashboardCalls += 1;
        return dashboardCalls === 1
          ? Promise.reject(new Error('raw-dashboard-error'))
          : Promise.resolve(dashboardResponse());
      }
      if (operation.operation === 'project.drill') return Promise.resolve(drillResponse());
      return Promise.reject(new Error('unexpected operation'));
    });
    const { container } = renderDashboard(createClient(request));

    expect(await screen.findByText('enterprise.dashboard.radar.errorTitle')).toBeVisible();
    expect(screen.getByText('Liaoning Precision Equipment')).toBeVisible();
    expect(screen.getByRole('link', { name: 'enterprise.navigation.companies' })).toHaveAttribute(
      'href',
      '/enterprise/companies'
    );
    expect(container).not.toHaveTextContent('raw-dashboard-error');

    await userEvent.click(screen.getByRole('button', { name: 'enterprise.actions.retry' }));
    expect(await screen.findByText('128')).toBeVisible();
    expect(dashboardCalls).toBe(2);
  });
});
