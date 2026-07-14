import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { EnterpriseResponse } from '@/common/enterprise/contracts';
import CompanyDetailPage from '@/renderer/pages/enterprise/companies/CompanyDetailPage';
import CompanyListPage from '@/renderer/pages/enterprise/companies/CompanyListPage';
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

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const companyPage = (
  name: string,
  companyId = '42',
  pageNum = 1,
  total = 1
): Extract<EnterpriseResponse, { operation: 'company.list' }> => ({
  operation: 'company.list',
  data: {
    list: [
      {
        companyId,
        name,
        industry: 'Equipment',
        province: 'Liaoning',
        city: 'Shenyang',
        district: 'Hunnan',
        companyLevel: 3,
        businessSummary: 'Hydraulic systems',
        updatedAt: '2026-07-14',
      },
    ],
    pageNum,
    pageSize: 20,
    pages: Math.ceil(total / 20),
    total,
  },
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

const renderList = (client: EnterpriseClient) =>
  render(
    <MemoryRouter initialEntries={['/enterprise/companies']}>
      <Routes>
        <Route path='/enterprise/companies' element={<CompanyListPage client={client} />} />
        <Route path='/enterprise/companies/:companyId' element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

const replaceInput = async (user: ReturnType<typeof userEvent.setup>, input: HTMLElement, value: string) => {
  await user.clear(input);
  await user.type(input, value);
};

describe('company list data lifecycle', () => {
  afterEach(cleanup);

  it('maps filters, resets the page and hides old rows during a filter load', async () => {
    const nextPage = deferred<EnterpriseResponse>();
    const filtered = deferred<EnterpriseResponse>();
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockResolvedValueOnce(companyPage('Alpha Hydraulics', '42', 1, 45))
      .mockReturnValueOnce(nextPage.promise)
      .mockReturnValueOnce(filtered.promise);
    const user = userEvent.setup();
    const { container } = renderList(createClient(request));

    expect(await screen.findByText('Alpha Hydraulics')).toBeVisible();
    const pageTwo = Array.from(container.querySelectorAll('.arco-pagination-item')).find(
      (item) => item.textContent === '2'
    );
    expect(pageTwo).toBeDefined();
    await user.click(pageTwo as HTMLElement);

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Alpha Hydraulics')).toBeVisible();
    expect(request.mock.calls[1]?.[0]).toMatchObject({ payload: { pageNum: 2, pageSize: 20 } });

    nextPage.resolve(companyPage('Page Two Company', '43', 2, 45));
    expect(await screen.findByText('Page Two Company')).toBeVisible();
    await replaceInput(user, screen.getByPlaceholderText('enterprise.companies.filters.keywordPlaceholder'), ' steel ');
    await replaceInput(
      user,
      screen.getByPlaceholderText('enterprise.companies.filters.industryPlaceholder'),
      'Equipment'
    );
    await replaceInput(
      user,
      screen.getByPlaceholderText('enterprise.companies.filters.provincePlaceholder'),
      'Liaoning'
    );
    await replaceInput(user, screen.getByPlaceholderText('enterprise.companies.filters.cityPlaceholder'), 'Shenyang');
    await replaceInput(user, screen.getByPlaceholderText('enterprise.companies.filters.districtPlaceholder'), 'Hunnan');
    await user.click(screen.getByRole('button', { name: 'enterprise.companies.actions.search' }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('Page Two Company')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'enterprise.companies.loading' })).toBeVisible();
    expect(request.mock.calls[2]?.[0]).toEqual({
      operation: 'company.list',
      payload: {
        keyword: 'steel',
        industry: 'Equipment',
        province: 'Liaoning',
        city: 'Shenyang',
        district: 'Hunnan',
        pageNum: 1,
        pageSize: 20,
      },
    });
    filtered.resolve(companyPage('Filtered Company'));
    expect(await screen.findByText('Filtered Company')).toBeVisible();
  });

  it('ignores a stale filter response that resolves after the latest query', async () => {
    const firstFilter = deferred<EnterpriseResponse>();
    const latestFilter = deferred<EnterpriseResponse>();
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockResolvedValueOnce(companyPage('Initial Company'))
      .mockReturnValueOnce(firstFilter.promise)
      .mockReturnValueOnce(latestFilter.promise);
    const user = userEvent.setup();
    renderList(createClient(request));

    await screen.findByText('Initial Company');
    const keyword = screen.getByPlaceholderText('enterprise.companies.filters.keywordPlaceholder');
    await replaceInput(user, keyword, 'first');
    await user.click(screen.getByRole('button', { name: 'enterprise.companies.actions.search' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await replaceInput(user, keyword, 'latest');
    await user.click(screen.getByRole('button', { name: 'enterprise.companies.actions.search' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));

    latestFilter.resolve(companyPage('Latest Company'));
    expect(await screen.findByText('Latest Company')).toBeVisible();
    firstFilter.resolve(companyPage('Stale Company'));
    await Promise.resolve();
    expect(screen.queryByText('Stale Company')).not.toBeInTheDocument();
    expect(screen.getByText('Latest Company')).toBeVisible();
  });

  it('shows only safe translated errors and retries the same query', async () => {
    const rawSecret = 'raw-phone-13800000000';
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockRejectedValueOnce(new Error(rawSecret))
      .mockResolvedValueOnce(companyPage('Recovered Company'));
    const { container } = renderList(createClient(request));

    expect(await screen.findByText('enterprise.companies.error.title')).toBeVisible();
    expect(container).not.toHaveTextContent(rawSecret);
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.actions.retry' }));

    expect(await screen.findByText('Recovered Company')).toBeVisible();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toEqual(request.mock.calls[0]?.[0]);
  });
});

describe('company list interactions', () => {
  afterEach(cleanup);

  it('opens an accessible quick view by pointer or keyboard and navigates by action or double-click', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(companyPage('Alpha Hydraulics'));
    const user = userEvent.setup();
    const { unmount } = renderList(createClient(request));

    const name = await screen.findByText('Alpha Hydraulics');
    const row = name.closest('tr');
    expect(row).toHaveAttribute('tabindex', '0');
    await user.click(row as HTMLElement);
    const quickView = screen.getByRole('complementary', {
      name: 'enterprise.companies.quickView.label',
    });
    expect(within(quickView).getByText('Hydraulic systems')).toBeVisible();

    fireEvent.keyDown(row as HTMLElement, { key: 'Enter' });
    await user.click(within(quickView).getByRole('button', { name: 'enterprise.companies.actions.viewDetails' }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/42');

    unmount();
    renderList(createClient(request));
    const secondRow = (await screen.findByText('Alpha Hydraulics')).closest('tr');
    fireEvent.doubleClick(secondRow as HTMLElement);
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/42');
  });

  it('does not open quick view when the row detail action is clicked', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(companyPage('Alpha Hydraulics'));
    renderList(createClient(request));

    await screen.findByText('Alpha Hydraulics');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.companies.actions.viewDetails' }));

    expect(
      screen.queryByRole('complementary', { name: 'enterprise.companies.quickView.label' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/42');
  });
});

describe('company detail', () => {
  afterEach(cleanup);

  const renderDetail = (client: EnterpriseClient, companyId = '42') =>
    render(
      <MemoryRouter initialEntries={[`/enterprise/companies/${companyId}`]}>
        <Routes>
          <Route path='/enterprise/companies/:companyId' element={<CompanyDetailPage client={client} />} />
          <Route path='/enterprise/products/:productId' element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

  it('shows only returned contact permissions, plain-text profile fields and related products', async () => {
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation === 'company.detail') {
        return {
          operation: 'company.detail',
          data: {
            companyId: '42',
            name: 'Alpha Hydraulics',
            industry: 'Equipment',
            province: 'Liaoning',
            city: 'Shenyang',
            district: 'Hunnan',
            address: 'No. 8 Industry Road',
            legalRepresentative: 'Zhang',
            companyType: 'Limited company',
            unifiedSocialCreditCode: 'CODE-42',
            contactName: 'Permission protected',
            phone: '***********',
            businessSummary: '<strong>Hydraulic systems</strong>',
            description: '<script>window.stolen=true</script>Trusted profile',
          },
        };
      }
      return {
        operation: 'product.list',
        data: {
          list: [{ productId: '9', companyId: '42', name: 'Industrial pump', summary: 'High pressure' }],
          pageNum: 1,
          pageSize: 12,
          pages: 1,
          total: 1,
        },
      };
    });
    const { container } = renderDetail(createClient(request));

    expect(await screen.findByRole('heading', { name: 'Alpha Hydraulics' })).toBeVisible();
    expect(screen.getByText('***********')).toBeVisible();
    expect(screen.getByText('<strong>Hydraulic systems</strong>')).toBeVisible();
    expect(screen.getByText('<script>window.stolen=true</script>Trusted profile')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('Industrial pump').closest('a')).toHaveAttribute('href', '/enterprise/products/9');
    expect(request).toHaveBeenCalledWith({
      operation: 'company.detail',
      payload: { companyId: '42' },
    });
    expect(request).toHaveBeenCalledWith({
      operation: 'product.list',
      payload: { companyId: '42', pageNum: 1, pageSize: 12 },
    });
  });

  it('rejects malformed route parameters without requesting or echoing them', async () => {
    const request = vi.fn<EnterpriseClient['request']>();
    const { container } = renderDetail(createClient(request), '42%3Fphone%3D13800000000');

    expect(await screen.findByText('enterprise.companyDetail.invalid.title')).toBeVisible();
    expect(request).not.toHaveBeenCalled();
    expect(container).not.toHaveTextContent('13800000000');
  });

  it('shows a safe retryable detail error without raw response text', async () => {
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockRejectedValueOnce(new Error('raw-openid-secret'))
      .mockResolvedValueOnce({
        operation: 'company.detail',
        data: { companyId: '42', name: 'Recovered Company' },
      })
      .mockResolvedValueOnce({
        operation: 'product.list',
        data: { list: [], pageNum: 1, pageSize: 12, pages: 0, total: 0 },
      });
    const { container } = renderDetail(createClient(request));

    expect(await screen.findByText('enterprise.companyDetail.error.title')).toBeVisible();
    expect(container).not.toHaveTextContent('raw-openid-secret');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.actions.retry' }));
    expect(await screen.findByRole('heading', { name: 'Recovered Company' })).toBeVisible();
  });
});
