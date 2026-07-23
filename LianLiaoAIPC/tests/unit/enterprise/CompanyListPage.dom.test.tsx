import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { EnterpriseResponse } from '@/common/enterprise/contracts';
import CompanyDetailPage from '@/renderer/pages/enterprise/companies/CompanyDetailPage';
import CompanyListPage from '@/renderer/pages/enterprise/companies/CompanyListPage';
import EnterpriseAntdProvider from '@/renderer/pages/enterprise/layout/EnterpriseAntdProvider';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(',')}` : key),
  }),
}));

const scrollIntoViewMock = vi.fn();
let animationFrameCallbacks: FrameRequestCallback[] = [];
const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
  animationFrameCallbacks.push(callback);
  return animationFrameCallbacks.length;
});

const flushAnimationFrame = () => {
  const callbacks = animationFrameCallbacks.splice(0);
  callbacks.forEach((callback) => callback(0));
};

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
  window.requestAnimationFrame = requestAnimationFrameMock;
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoViewMock,
  });
});

beforeEach(() => {
  animationFrameCallbacks = [];
  requestAnimationFrameMock.mockClear();
  scrollIntoViewMock.mockClear();
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
    <EnterpriseAntdProvider>
      <MemoryRouter initialEntries={['/enterprise/companies']}>
        <Routes>
          <Route path='/enterprise/companies' element={<CompanyListPage client={client} />} />
          <Route path='/enterprise/companies/:companyId' element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </EnterpriseAntdProvider>
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
    expect(container.querySelector('.ll-ant-table')).toBeInTheDocument();
    expect(container.querySelector('.arco-table')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'enterprise.companies.memberLevel.vip' })).toBeVisible();
    expect(screen.queryByText('enterprise.companies.columns.updatedAt')).toBeNull();
    expect(container.querySelector('table')).toHaveStyle({ width: '1016px' });
    await user.click(screen.getByTitle('2'));

    flushAnimationFrame();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
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
  }, 20_000);

  it('offers the H5 member levels and resets page one when selecting the VIP aggregate', async () => {
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation !== 'company.list') throw new Error('unexpected operation');
      return companyPage(`Page ${input.payload.pageNum}`, '42', input.payload.pageNum, 45);
    });
    const user = userEvent.setup();
    renderList(createClient(request));

    await screen.findByText('Page 1');
    await user.click(screen.getByTitle('2'));
    expect(await screen.findByText('Page 2')).toBeVisible();

    const levelSelect = screen
      .getByText('enterprise.companies.filters.memberLevelPlaceholder')
      .closest('.ll-ant-select');
    expect(levelSelect).not.toBeNull();
    await user.click(levelSelect as HTMLElement);
    const vipOptionContent = await screen.findByText('enterprise.companies.memberLevel.vipAggregate');
    const memberPopup = vipOptionContent.closest('.ll-ant-select-dropdown');
    expect(memberPopup).not.toBeNull();
    const popup = within(memberPopup as HTMLElement);
    for (const label of [
      'enterprise.companies.memberLevel.verified',
      'enterprise.companies.memberLevel.ordinary',
      'enterprise.companies.memberLevel.fourStar',
      'enterprise.companies.memberLevel.fiveStar',
      'enterprise.companies.memberLevel.flagship',
    ]) {
      expect(popup.getByRole('img', { name: label })).toBeInTheDocument();
    }
    expect(popup.getAllByRole('img', { name: 'enterprise.companies.memberLevel.vip' })).toHaveLength(4);
    for (const level of [3.1, 7, 8, 9, 10]) {
      expect(popup.getByText(`enterprise.companies.memberLevel.fallback:${level}`)).toBeInTheDocument();
    }
    fireEvent.click(vipOptionContent.closest('.ll-ant-select-item-option') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'enterprise.companies.actions.search' }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(request.mock.calls[2]?.[0]).toEqual({
      operation: 'company.list',
      payload: { vip: true, pageNum: 1, pageSize: 20 },
    });
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

  it('does not publish AbortError as a company-list failure', async () => {
    const abortError = new DOMException('cancelled', 'AbortError');
    const request = vi.fn<EnterpriseClient['request']>().mockRejectedValue(abortError);
    renderList(createClient(request));

    expect(await screen.findByText('enterprise.companies.empty.title')).toBeVisible();
    expect(screen.queryByText('enterprise.companies.error.title')).not.toBeInTheDocument();
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
    expect(within(quickView).queryByText('enterprise.companies.columns.updatedAt')).toBeNull();
    expect(within(quickView).getByRole('img', { name: 'enterprise.companies.memberLevel.vip' })).toBeVisible();
    expect(within(quickView).queryByText(/enterprise\.companies\.quickView\.index|0042/)).toBeNull();
    expect(within(quickView).getByText('enterprise.companies.quickView.title')).toBeVisible();
    expect(within(quickView).getByText('enterprise.companies.quickView.hint')).toBeVisible();

    fireEvent.keyDown(row as HTMLElement, { key: 'Enter' });
    await user.click(within(quickView).getByRole('button', { name: 'enterprise.companies.quickView.action' }));
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

  it('clears the selected quick view when submitted filters replace the result set', async () => {
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockResolvedValueOnce(companyPage('Alpha Hydraulics', '42'))
      .mockResolvedValueOnce(companyPage('Beta Controls', '43'));
    const user = userEvent.setup();
    renderList(createClient(request));

    const row = (await screen.findByText('Alpha Hydraulics')).closest('tr');
    await user.click(row as HTMLElement);
    expect(screen.getByRole('complementary', { name: 'enterprise.companies.quickView.label' })).toBeVisible();
    await replaceInput(user, screen.getByPlaceholderText('enterprise.companies.filters.keywordPlaceholder'), 'beta');
    await user.click(screen.getByRole('button', { name: 'enterprise.companies.actions.search' }));

    expect(await screen.findByText('Beta Controls')).toBeVisible();
    expect(
      screen.queryByRole('complementary', { name: 'enterprise.companies.quickView.label' })
    ).not.toBeInTheDocument();
  });

  it('clears the selected quick view synchronously when filters are reset', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(companyPage('Alpha Hydraulics'));
    const user = userEvent.setup();
    renderList(createClient(request));

    const row = (await screen.findByText('Alpha Hydraulics')).closest('tr');
    await user.click(row as HTMLElement);
    expect(screen.getByRole('complementary', { name: 'enterprise.companies.quickView.label' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'enterprise.companies.actions.reset' }));

    expect(
      screen.queryByRole('complementary', { name: 'enterprise.companies.quickView.label' })
    ).not.toBeInTheDocument();
  });

  it('clears the selected quick view synchronously when pagination changes', async () => {
    const nextPage = deferred<EnterpriseResponse>();
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockResolvedValueOnce(companyPage('Alpha Hydraulics', '42', 1, 45))
      .mockReturnValueOnce(nextPage.promise);
    renderList(createClient(request));

    const row = (await screen.findByText('Alpha Hydraulics')).closest('tr');
    fireEvent.click(row as HTMLElement);
    expect(screen.getByRole('complementary', { name: 'enterprise.companies.quickView.label' })).toBeVisible();
    fireEvent.click(screen.getByTitle('2'));
    flushAnimationFrame();

    expect(
      screen.queryByRole('complementary', { name: 'enterprise.companies.quickView.label' })
    ).not.toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    nextPage.resolve(companyPage('Page Two Company', '43', 2, 45));
    expect(await screen.findByText('Page Two Company')).toBeVisible();
  });
});

describe('company detail', () => {
  afterEach(cleanup);

  const renderDetail = (client: EnterpriseClient, companyId = '42') =>
    render(
      <EnterpriseAntdProvider>
        <MemoryRouter initialEntries={[`/enterprise/companies/${companyId}`]}>
          <Routes>
            <Route path='/enterprise/companies/:companyId' element={<CompanyDetailPage client={client} />} />
            <Route path='/enterprise/products/:productId' element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </EnterpriseAntdProvider>
    );

  it('shows only returned contact permissions, plain-text profile fields and related products', async () => {
    const rawPhone = '13800000000';
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
            companyLevel: 3,
            unifiedSocialCreditCode: 'CODE-42',
            contactName: 'Permission protected',
            phone: '1380000****',
            businessSummary: '<strong>Business summary</strong>',
            description: '<script>window.stolen=true</script>Enterprise introduction',
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
    expect(screen.getAllByRole('img', { name: 'enterprise.companies.memberLevel.vip' })).toHaveLength(2);
    expect(screen.getByText('1380000****')).toBeVisible();
    expect(container).not.toHaveTextContent(rawPhone);
    const contactSection = screen.getByText('enterprise.companyDetail.sections.contact').closest('.ll-ant-card');
    expect(contactSection).not.toBeNull();
    expect(contactSection?.querySelector('button, a')).toBeNull();
    const summarySection = screen
      .getByText('enterprise.companyDetail.sections.businessSummary')
      .closest('.ll-ant-card');
    const descriptionSection = screen
      .getByText('enterprise.companyDetail.sections.description')
      .closest('.ll-ant-card');
    expect(within(summarySection as HTMLElement).getByText('<strong>Business summary</strong>')).toBeVisible();
    expect(
      within(descriptionSection as HTMLElement).getByText('<script>window.stolen=true</script>Enterprise introduction')
    ).toBeVisible();
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
