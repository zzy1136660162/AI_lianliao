import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { EnterpriseRequest, EnterpriseResponse, EnterpriseUserContext } from '@/common/enterprise/contracts';
import DashboardPage from '@/renderer/pages/enterprise/dashboard/DashboardPage';
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

const renderDashboard = (client = createClient(defaultRequest)) =>
  render(
    <MemoryRouter initialEntries={['/enterprise/dashboard']}>
      <Routes>
        <Route path='/enterprise/dashboard' element={<DashboardPage client={client} />} />
        <Route path='*' element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

describe('enterprise dashboard', () => {
  beforeEach(() => {
    defaultRequest.mockClear();
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

    fireEvent.change(search, { target: { value: ' a ' } });
    await act(async () => vi.advanceTimersByTime(500));
    expect(defaultRequest).toHaveBeenCalledTimes(initialCalls);

    fireEvent.change(search, { target: { value: ' ab ' } });
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

  it('does not expose combobox popup relationships while search results are loading', async () => {
    const pendingSearch = deferred<EnterpriseResponse>();
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'project.dashboard') return Promise.resolve(dashboardResponse());
      if (operation.operation === 'project.drill') return Promise.resolve(drillResponse());
      return pendingSearch.promise;
    });
    renderDashboard(createClient(request));
    const input = screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' });

    fireEvent.change(input, { target: { value: 'pump' } });
    expect(await screen.findByText('enterprise.dashboard.search.loading')).toBeVisible();

    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-controls');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox', { name: 'enterprise.dashboard.search.resultsLabel' })).toBeNull();
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

    fireEvent.change(screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' }), {
      target: { value: 'pump' },
    });

    const listbox = await screen.findByRole('listbox', { name: 'enterprise.dashboard.search.resultsLabel' });
    expect(await within(listbox).findByText('Clickable company')).toBeVisible();
    expect(within(listbox).getByText('enterprise.dashboard.search.groupError')).toBeVisible();
    expect(within(listbox).queryByText('RAW secret project')).toBeNull();

    await userEvent.click(within(listbox).getByRole('option', { name: /Clickable company/ }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/11');
  });

  it('cycles across grouped results with Arrow keys, navigates on Enter and closes on Escape', async () => {
    renderDashboard();
    const input = screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' });
    fireEvent.change(input, { target: { value: 'pump' } });
    await screen.findByRole('option', { name: /Search company/ });

    const listbox = screen.getByRole('listbox', { name: 'enterprise.dashboard.search.resultsLabel' });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const selectedProject = screen.getByRole('option', { name: /enterprise\.projectDetail\.lockedProjectTitle/ });
    expect(selectedProject).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', selectedProject.id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Search company/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.queryByText('138****0000')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/products/22');

    renderDashboard();
    const nextInput = screen.getAllByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' }).at(-1)!;
    fireEvent.change(nextInput, { target: { value: 'pump' } });
    await screen.findAllByRole('listbox', { name: 'enterprise.dashboard.search.resultsLabel' });
    fireEvent.keyDown(nextInput, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('listbox', { name: 'enterprise.dashboard.search.resultsLabel' })).toBeNull()
    );
  });

  it('routes a protected project result by numeric identity without rendering its raw name', async () => {
    const { container } = renderDashboard();
    fireEvent.change(screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' }), {
      target: { value: 'pump' },
    });

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
    fireEvent.change(input, {
      target: { value: 'none' },
    });

    expect(await screen.findByText('enterprise.dashboard.search.empty')).toBeVisible();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-controls');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox', { name: 'enterprise.dashboard.search.resultsLabel' })).toBeNull();
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

    fireEvent.change(input, { target: { value: 'ab' } });
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ operation: 'company.list' })));
    fireEvent.change(input, { target: { value: 'cd' } });
    expect(await screen.findByText('Latest company')).toBeVisible();
    firstCompany.resolve(companyResponse('Stale company'));
    await act(async () => undefined);

    expect(screen.queryByText('Stale company')).toBeNull();
    expect(screen.getByText('Latest company')).toBeVisible();
  });

  it('shows one total search error when all groups fail without leaking raw errors', async () => {
    const request = vi.fn<EnterpriseClient['request']>((operation) => {
      if (operation.operation === 'project.dashboard') return Promise.resolve(dashboardResponse());
      if (operation.operation === 'project.drill') return Promise.resolve(drillResponse());
      return Promise.reject(new Error('raw-openid-secret'));
    });
    const { container } = renderDashboard(createClient(request));
    const input = screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' });
    fireEvent.change(input, {
      target: { value: 'pump' },
    });

    expect(await screen.findByText('enterprise.dashboard.search.totalError')).toBeVisible();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-controls');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox', { name: 'enterprise.dashboard.search.resultsLabel' })).toBeNull();
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
