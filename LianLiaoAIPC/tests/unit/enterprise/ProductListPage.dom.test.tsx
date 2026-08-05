import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { EnterpriseResponse } from '@/common/enterprise/contracts';
import EnterpriseAntdProvider from '@/renderer/pages/enterprise/layout/EnterpriseAntdProvider';
import ProductDetailPage, { DetailImage } from '@/renderer/pages/enterprise/products/ProductDetailPage';
import ProductListPage from '@/renderer/pages/enterprise/products/ProductListPage';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(',')}` : key),
  }),
}));

const createMatchMedia = (compact = false) =>
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    ...(compact && query === '(max-width: 820px)' ? { matches: true } : {}),
  })) as typeof window.matchMedia;

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
  window.matchMedia = createMatchMedia();
  window.requestAnimationFrame = requestAnimationFrameMock;
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  animationFrameCallbacks = [];
  requestAnimationFrameMock.mockClear();
});

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const page = (name: string, productId = '9', pageNum = 1, total = 1): EnterpriseResponse => ({
  operation: 'product.list',
  data: {
    list: [
      {
        productId,
        companyId: '42',
        name,
        companyName: 'Alpha Hydraulics',
        industry: 'Equipment',
        companyIndustry: 'Machinery',
        province: 'Liaoning',
        city: 'Shenyang',
        district: 'Hunnan',
        summary: '<strong>High pressure</strong>',
        imageUrl: 'https://cloud.lslnii.com/product/pump.png',
      },
    ],
    pageNum,
    pageSize: 20,
    pages: Math.ceil(total / 20),
    total,
  },
});

const industryOptions: Extract<EnterpriseResponse, { operation: 'company.industries' }> = {
  operation: 'company.industries',
  data: [
    { industry: 'Equipment', companyCount: 23 },
    { industry: 'Manufacturing', companyCount: 10 },
  ],
};

const createClient = (
  request: EnterpriseClient['request'],
  industryRequest: EnterpriseClient['request'] = vi.fn<EnterpriseClient['request']>().mockResolvedValue(industryOptions)
): EnterpriseClient => ({
  createLoginSession: vi.fn(),
  pollLoginSession: vi.fn(),
  completeRegistration: vi.fn(),
  restoreSession: vi.fn(),
  clearSession: vi.fn(),
  request: ((input) =>
    input.operation === 'company.industries' ? industryRequest(input) : request(input)) as EnterpriseClient['request'],
});

const LocationProbe = () => {
  const location = useLocation();
  return <output aria-label='location'>{location.pathname}</output>;
};

const renderList = (client: EnterpriseClient) =>
  render(
    <EnterpriseAntdProvider>
      <MemoryRouter initialEntries={['/enterprise/products']}>
        <Routes>
          <Route path='/enterprise/products' element={<ProductListPage client={client} />} />
          <Route path='/enterprise/products/:productId' element={<LocationProbe />} />
          <Route path='/enterprise/companies/:companyId' element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </EnterpriseAntdProvider>
  );

const replaceInput = async (user: ReturnType<typeof userEvent.setup>, placeholder: string, value: string) => {
  const input = screen.getByPlaceholderText(placeholder);
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

describe('product catalog interactions', () => {
  afterEach(() => {
    cleanup();
    window.matchMedia = createMatchMedia();
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockReset();
  });

  it('submits product filters at page one and renders a plain-text responsive card', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(page('Industrial pump'));
    const industryRequest = vi.fn<EnterpriseClient['request']>().mockResolvedValue(industryOptions);
    const user = userEvent.setup();
    const { container } = renderList(createClient(request, industryRequest));

    expect(await screen.findByRole('heading', { name: 'Industrial pump' })).toBeVisible();
    expect(container.querySelector('.enterprise-product-list .ll-ant-pagination')).toBeInTheDocument();
    expect(container.querySelector('.enterprise-product-list [class*="arco-"]')).not.toBeInTheDocument();
    await replaceInput(user, 'enterprise.products.filters.keywordPlaceholder', ' pump ');
    await selectAreaOption(
      user,
      'enterprise.companies.filters.industryPlaceholder',
      'enterprise.companies.filters.industryOption:Equipment,23'
    );
    expect(screen.queryByText('enterprise.products.filters.provinceLabel')).not.toBeInTheDocument();
    await selectAreaOption(user, 'enterprise.products.filters.cityPlaceholder', '沈阳市');
    await selectAreaOption(user, 'enterprise.products.filters.districtPlaceholder', '浑南区');
    await user.click(screen.getByRole('button', { name: 'enterprise.products.actions.search' }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1]?.[0]).toEqual({
      operation: 'product.list',
      payload: {
        keyword: 'pump',
        industry: 'Equipment',
        city: '沈阳市',
        district: '浑南区',
        pageNum: 1,
        pageSize: 20,
      },
    });
    expect(industryRequest).toHaveBeenCalledWith({ operation: 'company.industries', payload: {} });
    expect(screen.getByText('Alpha Hydraulics')).toBeVisible();
    const productCard = screen.getByRole('heading', { name: 'Industrial pump' }).closest('article');
    expect(productCard).not.toBeNull();
    expect(within(productCard as HTMLElement).getByText('Equipment')).toBeVisible();
    expect(screen.getByText('Liaoning / Shenyang / Hunnan')).toBeVisible();
    const listSummary = screen.getByText('High pressure');
    expect(listSummary).toBeVisible();
    expect(listSummary.tagName).toBe('P');
    expect(container).not.toHaveTextContent('<strong>');
    expect(container).not.toHaveTextContent('009');
  });

  it('keeps the product catalog usable when industry options fail to load', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(page('Industrial pump'));
    const industryRequest = vi
      .fn<EnterpriseClient['request']>()
      .mockRejectedValue(new Error('raw-industry-options-secret'));
    const { container } = renderList(createClient(request, industryRequest));

    expect(await screen.findByRole('heading', { name: 'Industrial pump' })).toBeVisible();
    expect(screen.getByText('enterprise.companies.filters.industryPlaceholder')).toBeVisible();
    expect(container).not.toHaveTextContent('raw-industry-options-secret');
    expect(request).toHaveBeenCalledTimes(1);
    expect(industryRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps old cards during pagination, clears quick view and ignores stale responses', async () => {
    const pageTwo = deferred<EnterpriseResponse>();
    const stalePage = deferred<EnterpriseResponse>();
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockResolvedValueOnce(page('Page one pump', '9', 1, 45))
      .mockReturnValueOnce(stalePage.promise)
      .mockReturnValueOnce(pageTwo.promise);
    renderList(createClient(request));

    const card = (await screen.findByRole('heading', { name: 'Page one pump' })).closest('article') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'enterprise.products.actions.quickPreview' }));
    expect(screen.getByRole('complementary', { name: 'enterprise.products.quickView.label' })).toBeVisible();
    fireEvent.click(screen.getByTitle('2'));
    flushAnimationFrame();
    expect(screen.getByRole('heading', { name: 'Page one pump' })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'enterprise.products.quickView.label' })).toBeNull();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

    fireEvent.click(screen.getByTitle('3'));
    flushAnimationFrame();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    pageTwo.resolve(page('Latest page pump', '11', 3, 45));
    expect(await screen.findByRole('heading', { name: 'Latest page pump' })).toBeVisible();
    stalePage.resolve(page('Stale page pump', '10', 2, 45));
    await Promise.resolve();
    expect(screen.queryByText('Stale page pump')).toBeNull();
  });

  it('keeps the article noninteractive and exposes separate keyboard-operable preview and detail actions', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(page('Industrial pump'));
    const user = userEvent.setup();
    const { unmount } = renderList(createClient(request));

    const card = (await screen.findByRole('heading', { name: 'Industrial pump' })).closest('article') as HTMLElement;
    expect(card).not.toHaveAttribute('tabindex');
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(screen.queryByRole('complementary', { name: 'enterprise.products.quickView.label' })).toBeNull();

    const previewButton = within(card).getByRole('button', {
      name: 'enterprise.products.actions.quickPreview',
    });
    expect(within(card).getByRole('button', { name: 'enterprise.products.actions.viewDetails' })).toBeVisible();
    previewButton.focus();
    await user.keyboard('{Enter}');
    const quickView = screen.getByRole('complementary', { name: 'enterprise.products.quickView.label' });
    expect(within(quickView).getByText('Alpha Hydraulics')).toBeVisible();
    expect(within(card).getByText('Equipment')).toBeVisible();
    expect(within(card).queryByText('Machinery')).toBeNull();
    expect(within(quickView).queryByText(/enterprise\.products\.quickView\.index|0009/)).toBeNull();
    expect(within(quickView).getByText('enterprise.products.quickView.title')).toBeVisible();
    expect(within(quickView).getByText('enterprise.products.quickView.hint')).toBeVisible();
    expect(within(quickView).getByText('High pressure').tagName).toBe('STRONG');
    expect(within(quickView).getByRole('button', { name: 'enterprise.products.quickView.action' })).toBeVisible();

    await user.click(within(quickView).getByRole('button', { name: 'enterprise.products.quickView.action' }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/products/9');

    unmount();
    const companyRender = renderList(createClient(request));
    const companyCard = (await screen.findByRole('heading', { name: 'Industrial pump' })).closest(
      'article'
    ) as HTMLElement;
    await user.click(
      within(companyCard).getByRole('button', {
        name: 'enterprise.products.actions.quickPreview',
      })
    );
    const companyQuickView = screen.getByRole('complementary', { name: 'enterprise.products.quickView.label' });
    await user.click(within(companyQuickView).getByRole('link', { name: 'enterprise.products.actions.viewCompany' }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/42');

    companyRender.unmount();
    renderList(createClient(request));
    const detailCard = (await screen.findByRole('heading', { name: 'Industrial pump' })).closest(
      'article'
    ) as HTMLElement;
    await user.click(within(detailCard).getByRole('button', { name: 'enterprise.products.actions.viewDetails' }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/products/9');
  });

  it('focuses and reveals the quick view at compact widths whenever the selected product changes', async () => {
    window.matchMedia = createMatchMedia(true);
    const products = page('First pump') as Extract<EnterpriseResponse, { operation: 'product.list' }>;
    products.data.list.push({ ...products.data.list[0], productId: '10', name: 'Second pump' });
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(products);
    const user = userEvent.setup();
    renderList(createClient(request));

    const previewButtons = await screen.findAllByRole('button', {
      name: 'enterprise.products.actions.quickPreview',
    });
    await user.click(previewButtons[0]);
    const quickView = screen.getByRole('complementary', { name: 'enterprise.products.quickView.label' });
    await waitFor(() => expect(quickView).toHaveFocus());
    expect(quickView).toHaveAttribute('tabindex', '-1');
    expect(within(quickView).getByRole('button', { name: 'enterprise.products.actions.closeQuickView' })).toBeVisible();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });

    await user.click(previewButtons[1]);
    expect(within(quickView).getByRole('heading', { name: 'Second pump' })).toBeVisible();
    await waitFor(() => expect(quickView).toHaveFocus());
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('shows an image text fallback without leaking an unsafe URL', async () => {
    const unsafePage = page('Unsafe image') as Extract<EnterpriseResponse, { operation: 'product.list' }>;
    unsafePage.data.list[0] = { ...unsafePage.data.list[0], imageUrl: 'https://evil.example/raw-secret.png' };
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(unsafePage);
    const { container } = renderList(createClient(request));

    expect(await screen.findByText('enterprise.products.imageUnavailable')).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
    expect(container).not.toHaveTextContent('raw-secret');
  });

  it('shows only a translated retryable failure and does not publish AbortError', async () => {
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockRejectedValueOnce(new Error('raw-openid-secret'))
      .mockResolvedValueOnce(page('Recovered pump'));
    const { container } = renderList(createClient(request));

    expect(await screen.findByText('enterprise.products.error.title')).toBeVisible();
    expect(container).not.toHaveTextContent('raw-openid-secret');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.actions.retry' }));
    expect(await screen.findByRole('heading', { name: 'Recovered pump' })).toBeVisible();

    cleanup();
    renderList(
      createClient(vi.fn<EnterpriseClient['request']>().mockRejectedValue(new DOMException('x', 'AbortError')))
    );
    expect(await screen.findByText('enterprise.products.empty.title')).toBeVisible();
    expect(screen.queryByText('enterprise.products.error.title')).toBeNull();
  });
});

describe('product detail', () => {
  afterEach(cleanup);

  const renderDetail = (client: EnterpriseClient, productId = '9') =>
    render(
      <EnterpriseAntdProvider>
        <MemoryRouter initialEntries={[`/enterprise/products/${productId}`]}>
          <Routes>
            <Route path='/enterprise/products/:productId' element={<ProductDetailPage client={client} />} />
            <Route path='/enterprise/companies/:companyId' element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </EnterpriseAntdProvider>
    );

  it('maps H5-backed fields as plain text and reveals the telephone only after permission succeeds', async () => {
    const request = vi.fn<EnterpriseClient['request']>(async (input) =>
      input.operation === 'contact.acquire'
        ? {
            operation: 'contact.acquire',
            data: {
              allowed: true,
              errType: 0,
              message: '',
              action: 'NONE',
              phone: '13800000000',
            },
          }
        : {
            operation: 'product.detail',
            data: {
              productId: '9',
              companyId: '42',
              name: 'Industrial pump',
              companyName: 'Alpha Hydraulics',
              industry: 'Equipment',
              companyIndustry: 'Machinery',
              phone: '1380000****',
              address: 'No. 8 Industry Road',
              summary: '<script>window.stolen=true</script><p><strong>High pressure</strong></p>',
            },
          }
    );
    const { container } = renderDetail(createClient(request));

    expect(await screen.findByRole('heading', { name: 'Industrial pump' })).toBeVisible();
    expect(screen.getByText('enterprise.products.fields.companyIndustry')).toBeVisible();
    expect(screen.getByText('Machinery')).toBeVisible();
    expect(screen.getByText('1380000****')).toBeVisible();
    expect(screen.getByText('High pressure').tagName).toBe('STRONG');
    expect(container).not.toHaveTextContent('window.stolen');
    expect(container.querySelector('.ll-ant-card')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.queryByText('enterprise.productDetail.contactPermissionNote')).toBeNull();
    expect(screen.getByRole('link', { name: 'Alpha Hydraulics' })).toHaveAttribute('href', '/enterprise/companies/42');
    expect(container.querySelector("a[href^='tel:']")).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '获取联系方式' }));
    expect(await screen.findByText('13800000000')).toBeVisible();
    expect(screen.getByRole('button', { name: '拨打电话' })).toBeVisible();
    expect(request).toHaveBeenCalledWith({
      operation: 'contact.acquire',
      payload: { resourceType: 'PRODUCT', resourceId: '9' },
    });
  });

  it('rejects a nonnumeric route without requesting or echoing it', async () => {
    const request = vi.fn<EnterpriseClient['request']>();
    const { container } = renderDetail(createClient(request), '9%3Fphone%3D13800000000');
    expect(await screen.findByText('enterprise.productDetail.invalid.title')).toBeVisible();
    expect(request).not.toHaveBeenCalled();
    expect(container).not.toHaveTextContent('13800000000');
  });

  it('recovers from a failed image when the same detail image receives a different product', async () => {
    const brokenProduct = {
      productId: '9',
      companyId: '42',
      name: 'Broken image pump',
      imageUrl: 'https://cloud.lslnii.com/product/broken.png',
    };
    const workingProduct = {
      productId: '10',
      companyId: '42',
      name: 'Working image pump',
      imageUrl: 'https://cloud.lslnii.com/product/working.png',
    };
    const { rerender } = render(<DetailImage product={brokenProduct} />);

    const brokenImage = screen.getByRole('img', { name: 'enterprise.products.imageAlt:Broken image pump' });
    fireEvent.error(brokenImage);
    expect(screen.getByRole('img', { name: 'enterprise.products.imageUnavailable' })).toBeVisible();

    rerender(<DetailImage product={workingProduct} />);
    expect(await screen.findByRole('img', { name: 'enterprise.products.imageAlt:Working image pump' })).toHaveAttribute(
      'src',
      'https://cloud.lslnii.com/product/working.png'
    );
  });
});
