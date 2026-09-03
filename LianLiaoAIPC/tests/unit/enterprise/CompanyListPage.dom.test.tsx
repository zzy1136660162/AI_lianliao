import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { EnterpriseResponse } from '@/common/enterprise/contracts';
import CompanyDetailPage from '@/renderer/pages/enterprise/companies/CompanyDetailPage';
import CompanyListPage from '@/renderer/pages/enterprise/companies/CompanyListPage';
import EnterpriseAntdProvider from '@/renderer/pages/enterprise/layout/EnterpriseAntdProvider';
import ProductDetailPage from '@/renderer/pages/enterprise/products/ProductDetailPage';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(',')}` : key),
    i18n: { language: 'en-US', resolvedLanguage: 'en-US' },
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
        legalRepresentative: 'Zhang',
        registeredCapital: '5000万元人民币',
        companyType: 'Limited company',
        establishedAt: '2014-02-21',
        businessSummary: 'Hydraulic systems',
        updatedAt: '2026-07-14',
        featuredProducts: [
          {
            productId: '901',
            companyId,
            name: 'Precision pump',
            imageUrl: 'https://cloud.lslnii.com/products/pump.jpg',
          },
          {
            productId: '902',
            companyId,
            name: 'Hydraulic valve',
          },
          {
            productId: '903',
            companyId,
            name: 'Control unit',
          },
        ],
        featuredProductCount: 5,
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
  request: ((input) =>
    input.operation === 'company.industries'
      ? Promise.resolve({
          operation: 'company.industries',
          data: [
            { industry: 'Equipment', companyCount: 23 },
            { industry: 'Manufacturing', companyCount: 10 },
          ],
        })
      : request(input)) as EnterpriseClient['request'],
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
          <Route path='/enterprise/products/:productId' element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </EnterpriseAntdProvider>
  );

const replaceInput = async (user: ReturnType<typeof userEvent.setup>, input: HTMLElement, value: string) => {
  await user.clear(input);
  await user.type(input, value);
};

const selectAreaOption = async (user: ReturnType<typeof userEvent.setup>, placeholder: string, optionLabel: string) => {
  const select = screen.getByText(placeholder).closest('.ll-ant-select');
  expect(select).not.toBeNull();
  await user.click(select as HTMLElement);
  const option = await screen.findByText(optionLabel);
  fireEvent.click(option.closest('.ll-ant-select-item-option') as HTMLElement);
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
    expect(container.querySelector('.ll-ant-table')).not.toBeInTheDocument();
    expect(screen.getByText('enterprise.companyDetail.fields.legalRepresentative')).toBeVisible();
    expect(screen.getByText('5000万元人民币')).toBeVisible();
    expect(screen.getByText('Precision pump')).toBeVisible();
    expect(screen.getByText('+2')).toBeVisible();
    const resultsRegion = screen.getByRole('region', {
      name: 'enterprise.companies.resultCount:45',
    });
    expect(
      within(resultsRegion).getByRole('heading', {
        name: 'enterprise.navigation.companies',
      })
    ).toBeVisible();
    expect(
      within(resultsRegion).queryByRole('button', {
        name: /export|导出|enterprise\.companies\.actions\.export/i,
      })
    ).not.toBeInTheDocument();
    const featuredHeader = screen.getByText('enterprise.navigation.products').parentElement;
    expect(featuredHeader).not.toBeNull();
    expect(
      within(featuredHeader as HTMLElement).getByRole('button', {
        name: 'enterprise.companies.actions.viewDetails',
      })
    ).toBeVisible();
    expect(screen.getByRole('img', { name: 'enterprise.companies.memberLevel.vip' })).toBeVisible();
    expect(screen.queryByText('enterprise.companies.columns.updatedAt')).toBeNull();
    expect(container.querySelector('article')).toHaveAttribute('aria-selected', 'false');
    await user.click(screen.getByTitle('2'));

    flushAnimationFrame();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(screen.getByText('Alpha Hydraulics')).toBeVisible();
    expect(request.mock.calls[1]?.[0]).toMatchObject({ payload: { pageNum: 2, pageSize: 20 } });

    nextPage.resolve(companyPage('Page Two Company', '43', 2, 45));
    expect(await screen.findByText('Page Two Company')).toBeVisible();
    await replaceInput(user, screen.getByPlaceholderText('enterprise.companies.filters.keywordPlaceholder'), ' steel ');
    await selectAreaOption(
      user,
      'enterprise.companies.filters.industryPlaceholder',
      'enterprise.companies.filters.industryOption:Equipment,23'
    );
    expect(screen.queryByText('enterprise.companies.filters.provinceLabel')).not.toBeInTheDocument();
    expect(screen.queryByText('enterprise.companies.filters.memberLevelLabel')).not.toBeInTheDocument();
    await selectAreaOption(user, 'enterprise.companies.filters.cityPlaceholder', '沈阳市');
    await selectAreaOption(user, 'enterprise.companies.filters.districtPlaceholder', '浑南区');
    await user.click(screen.getByRole('button', { name: 'enterprise.companies.actions.search' }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('Page Two Company')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'enterprise.companies.loading' })).toBeVisible();
    expect(request.mock.calls[2]?.[0]).toEqual({
      operation: 'company.list',
      payload: {
        keyword: 'steel',
        industry: 'Equipment',
        city: '沈阳市',
        district: '浑南区',
        pageNum: 1,
        pageSize: 20,
      },
    });
    filtered.resolve(companyPage('Filtered Company'));
    expect(await screen.findByText('Filtered Company')).toBeVisible();
  }, 40_000);

  it('offers only Liaoning cities and clears the district when the selected city changes', async () => {
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation !== 'company.list') throw new Error('unexpected operation');
      return companyPage(`Page ${input.payload.pageNum}`, '42', input.payload.pageNum, 45);
    });
    const user = userEvent.setup();
    renderList(createClient(request));

    await screen.findByText('Page 1');
    await user.click(screen.getByTitle('2'));
    expect(await screen.findByText('Page 2')).toBeVisible();

    await selectAreaOption(user, 'enterprise.companies.filters.cityPlaceholder', '沈阳市');
    await selectAreaOption(user, 'enterprise.companies.filters.districtPlaceholder', '浑南区');
    const cityFormItem = screen.getByText('enterprise.companies.filters.cityLabel').closest('.ll-ant-form-item');
    const citySelect = cityFormItem?.querySelector('.ll-ant-select');
    expect(citySelect).not.toBeNull();
    await user.click(citySelect as HTMLElement);
    expect(screen.queryByText('北京市')).not.toBeInTheDocument();
    const dalianOption = await screen.findByText('大连市');
    fireEvent.click(dalianOption.closest('.ll-ant-select-item-option') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'enterprise.companies.actions.search' }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(request.mock.calls[2]?.[0]).toEqual({
      operation: 'company.list',
      payload: { city: '大连市', pageNum: 1, pageSize: 20 },
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

  it('selects an accessible profile row and navigates by keyboard, product action, or double-click', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(companyPage('Alpha Hydraulics'));
    const user = userEvent.setup();
    const { unmount } = renderList(createClient(request));

    const name = await screen.findByText('Alpha Hydraulics');
    const row = name.closest('article');
    expect(row).toHaveAttribute('tabindex', '0');
    await user.click(row as HTMLElement);
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('complementary', { name: 'enterprise.companies.quickView.label' })).toBeNull();

    fireEvent.keyDown(row as HTMLElement, { key: 'Enter' });
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/42');

    unmount();
    const productNavigation = renderList(createClient(request));
    await user.click(await screen.findByRole('button', { name: 'Precision pump' }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/products/901');

    productNavigation.unmount();
    renderList(createClient(request));
    const secondRow = (await screen.findByText('Alpha Hydraulics')).closest('article');
    fireEvent.doubleClick(secondRow as HTMLElement);
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/42');
  });

  it('keeps contextual returns across company list, product detail and owning company detail', async () => {
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation === 'company.list') return companyPage('Alpha Hydraulics');
      if (input.operation === 'product.detail') {
        return {
          operation: 'product.detail',
          data: {
            productId: '901',
            companyId: '42',
            name: 'Precision pump',
            companyName: 'Alpha Hydraulics',
            industry: 'Equipment',
            phone: '1380000****',
          },
        };
      }
      if (input.operation === 'company.detail') {
        return {
          operation: 'company.detail',
          data: { companyId: '42', name: 'Alpha Hydraulics', industry: 'Equipment', phone: '1380000****' },
        };
      }
      if (input.operation === 'product.list') {
        return {
          operation: 'product.list',
          data: {
            list: [{ productId: '901', companyId: '42', name: 'Precision pump' }],
            pageNum: 1,
            pageSize: 12,
            pages: 1,
            total: 1,
          },
        };
      }
      throw new Error(`Unexpected operation: ${input.operation}`);
    });
    const client = createClient(request);
    const user = userEvent.setup();

    render(
      <EnterpriseAntdProvider>
        <MemoryRouter initialEntries={['/enterprise/companies']}>
          <Routes>
            <Route path='/enterprise/companies' element={<CompanyListPage client={client} />} />
            <Route path='/enterprise/companies/:companyId' element={<CompanyDetailPage client={client} />} />
            <Route path='/enterprise/products/:productId' element={<ProductDetailPage client={client} />} />
          </Routes>
        </MemoryRouter>
      </EnterpriseAntdProvider>
    );

    await user.click(await screen.findByRole('button', { name: 'Precision pump' }));
    expect(await screen.findByRole('heading', { name: 'Precision pump' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'enterprise.productDetail.backToCompanyList' })).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'Alpha Hydraulics' }));
    expect(await screen.findByRole('heading', { name: 'Alpha Hydraulics' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'enterprise.companyDetail.backToProductDetail' }));

    expect(await screen.findByRole('heading', { name: 'Precision pump' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'enterprise.productDetail.backToCompanyList' }));
    expect(await screen.findByText('Alpha Hydraulics')).toBeVisible();
  });

  it('opens company details directly from the row action', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(companyPage('Alpha Hydraulics'));
    renderList(createClient(request));

    await screen.findByText('Alpha Hydraulics');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.companies.actions.viewDetails' }));

    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/42');
  });

  it('clears the selected row when submitted filters replace the result set', async () => {
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockResolvedValueOnce(companyPage('Alpha Hydraulics', '42'))
      .mockResolvedValueOnce(companyPage('Beta Controls', '43'));
    const user = userEvent.setup();
    renderList(createClient(request));

    const row = (await screen.findByText('Alpha Hydraulics')).closest('article');
    await user.click(row as HTMLElement);
    expect(row).toHaveAttribute('aria-selected', 'true');
    await replaceInput(user, screen.getByPlaceholderText('enterprise.companies.filters.keywordPlaceholder'), 'beta');
    await user.click(screen.getByRole('button', { name: 'enterprise.companies.actions.search' }));

    expect(await screen.findByText('Beta Controls')).toBeVisible();
    expect(screen.getByText('Beta Controls').closest('article') as HTMLElement).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('clears the selected row synchronously when filters are reset', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(companyPage('Alpha Hydraulics'));
    const user = userEvent.setup();
    renderList(createClient(request));

    const row = (await screen.findByText('Alpha Hydraulics')).closest('article');
    await user.click(row as HTMLElement);
    expect(row).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: 'enterprise.companies.actions.reset' }));

    expect((await screen.findByText('Alpha Hydraulics')).closest('article')).toHaveAttribute('aria-selected', 'false');
  });

  it('clears the selected row synchronously when pagination changes', async () => {
    const nextPage = deferred<EnterpriseResponse>();
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockResolvedValueOnce(companyPage('Alpha Hydraulics', '42', 1, 45))
      .mockReturnValueOnce(nextPage.promise);
    renderList(createClient(request));

    const row = (await screen.findByText('Alpha Hydraulics')).closest('article');
    fireEvent.click(row as HTMLElement);
    expect(row).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTitle('2'));
    flushAnimationFrame();

    expect(row).toHaveAttribute('aria-selected', 'false');
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

  it('returns from a related product detail to the originating company detail', async () => {
    const request = vi.fn<EnterpriseClient['request']>(async (input) => {
      if (input.operation === 'company.detail') {
        return {
          operation: 'company.detail',
          data: { companyId: '42', name: 'Alpha Hydraulics' },
        };
      }
      if (input.operation === 'product.list') {
        return {
          operation: 'product.list',
          data: {
            list: [{ productId: '9', companyId: '42', name: 'Industrial pump' }],
            pageNum: 1,
            pageSize: 12,
            pages: 1,
            total: 1,
          },
        };
      }
      if (input.operation === 'product.detail') {
        return {
          operation: 'product.detail',
          data: {
            productId: '9',
            companyId: '42',
            companyName: 'Alpha Hydraulics',
            name: 'Industrial pump',
          },
        };
      }
      throw new Error(`Unexpected operation: ${input.operation}`);
    });
    const client = createClient(request);
    const user = userEvent.setup();

    render(
      <EnterpriseAntdProvider>
        <MemoryRouter initialEntries={['/enterprise/companies/42']}>
          <Routes>
            <Route path='/enterprise/companies/:companyId' element={<CompanyDetailPage client={client} />} />
            <Route path='/enterprise/products/:productId' element={<ProductDetailPage client={client} />} />
          </Routes>
        </MemoryRouter>
      </EnterpriseAntdProvider>
    );

    await user.click((await screen.findByText('Industrial pump')).closest('a') as HTMLElement);
    expect(await screen.findByRole('heading', { name: 'Industrial pump' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'enterprise.productDetail.backToCompanyDetail' }));
    expect(await screen.findByRole('heading', { name: 'Alpha Hydraulics' })).toBeVisible();
  });

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
      if (input.operation === 'contact.acquire') {
        return {
          operation: 'contact.acquire',
          data: {
            allowed: true,
            errType: 0,
            message: '',
            action: 'NONE',
            phone: rawPhone,
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
    expect(within(contactSection as HTMLElement).getByRole('button', { name: '解锁联系方式' })).toBeVisible();
    await userEvent.click(within(contactSection as HTMLElement).getByRole('button', { name: '解锁联系方式' }));
    expect(await within(contactSection as HTMLElement).findByText(rawPhone)).toBeVisible();
    expect(request).toHaveBeenCalledWith({
      operation: 'contact.acquire',
      payload: { resourceType: 'COMPANY', resourceId: '42' },
    });
    const summarySection = screen
      .getByText('enterprise.companyDetail.sections.businessSummary')
      .closest('.ll-ant-card');
    const descriptionSection = screen
      .getByText('enterprise.companyDetail.sections.description')
      .closest('.ll-ant-card');
    expect(within(summarySection as HTMLElement).getByText('<strong>Business summary</strong>')).toBeVisible();
    expect(within(descriptionSection as HTMLElement).getByText('Enterprise introduction')).toBeVisible();
    expect(within(descriptionSection as HTMLElement).queryByText(/window\.stolen/)).toBeNull();
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
