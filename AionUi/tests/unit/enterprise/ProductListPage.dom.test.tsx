import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { EnterpriseResponse } from '@/common/enterprise/contracts';
import ProductDetailPage from '@/renderer/pages/enterprise/products/ProductDetailPage';
import ProductListPage from '@/renderer/pages/enterprise/products/ProductListPage';
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
    <MemoryRouter initialEntries={['/enterprise/products']}>
      <Routes>
        <Route path='/enterprise/products' element={<ProductListPage client={client} />} />
        <Route path='/enterprise/products/:productId' element={<LocationProbe />} />
        <Route path='/enterprise/companies/:companyId' element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

const replaceInput = async (user: ReturnType<typeof userEvent.setup>, placeholder: string, value: string) => {
  const input = screen.getByPlaceholderText(placeholder);
  await user.clear(input);
  await user.type(input, value);
};

describe('product catalog interactions', () => {
  afterEach(cleanup);

  it('submits product filters at page one and renders a plain-text responsive card', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(page('Industrial pump'));
    const user = userEvent.setup();
    const { container } = renderList(createClient(request));

    expect(await screen.findByRole('heading', { name: 'Industrial pump' })).toBeVisible();
    await replaceInput(user, 'enterprise.products.filters.keywordPlaceholder', ' pump ');
    await replaceInput(user, 'enterprise.products.filters.industryPlaceholder', ' Equipment ');
    await replaceInput(user, 'enterprise.products.filters.provincePlaceholder', ' Liaoning ');
    await replaceInput(user, 'enterprise.products.filters.cityPlaceholder', ' Shenyang ');
    await replaceInput(user, 'enterprise.products.filters.districtPlaceholder', ' Hunnan ');
    await user.click(screen.getByRole('button', { name: 'enterprise.products.actions.search' }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1]?.[0]).toEqual({
      operation: 'product.list',
      payload: {
        keyword: 'pump',
        industry: 'Equipment',
        province: 'Liaoning',
        city: 'Shenyang',
        district: 'Hunnan',
        pageNum: 1,
        pageSize: 20,
      },
    });
    expect(screen.getByText('Alpha Hydraulics')).toBeVisible();
    expect(screen.getByText('Equipment')).toBeVisible();
    expect(screen.getByText('Liaoning / Shenyang / Hunnan')).toBeVisible();
    expect(screen.getByText('<strong>High pressure</strong>')).toBeVisible();
    expect(container.querySelector('strong strong')).toBeNull();
  });

  it('keeps old cards during pagination, clears quick view and ignores stale responses', async () => {
    const pageTwo = deferred<EnterpriseResponse>();
    const stalePage = deferred<EnterpriseResponse>();
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockResolvedValueOnce(page('Page one pump', '9', 1, 45))
      .mockReturnValueOnce(stalePage.promise)
      .mockReturnValueOnce(pageTwo.promise);
    const { container } = renderList(createClient(request));

    const card = (await screen.findByRole('heading', { name: 'Page one pump' })).closest('article') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'enterprise.products.actions.quickPreview' }));
    expect(screen.getByRole('complementary', { name: 'enterprise.products.quickView.label' })).toBeVisible();
    const pageTwoButton = Array.from(container.querySelectorAll('.arco-pagination-item')).find(
      (item) => item.textContent === '2'
    );
    fireEvent.click(pageTwoButton as HTMLElement);
    expect(screen.getByRole('heading', { name: 'Page one pump' })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'enterprise.products.quickView.label' })).toBeNull();

    const pageThreeButton = Array.from(container.querySelectorAll('.arco-pagination-item')).find(
      (item) => item.textContent === '3'
    );
    fireEvent.click(pageThreeButton as HTMLElement);
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
    await user.click(within(quickView).getByRole('link', { name: 'enterprise.products.actions.viewCompany' }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/42');

    unmount();
    renderList(createClient(request));
    const secondCard = (await screen.findByRole('heading', { name: 'Industrial pump' })).closest(
      'article'
    ) as HTMLElement;
    await user.click(within(secondCard).getByRole('button', { name: 'enterprise.products.actions.viewDetails' }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/products/9');
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
      <MemoryRouter initialEntries={[`/enterprise/products/${productId}`]}>
        <Routes>
          <Route path='/enterprise/products/:productId' element={<ProductDetailPage client={client} />} />
          <Route path='/enterprise/companies/:companyId' element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

  it('maps H5-backed fields as plain text and never offers dialing or unlocking', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
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
        summary: '<script>window.stolen=true</script>High pressure',
      },
    });
    const { container } = renderDetail(createClient(request));

    expect(await screen.findByRole('heading', { name: 'Industrial pump' })).toBeVisible();
    expect(screen.getByText('enterprise.products.fields.companyIndustry')).toBeVisible();
    expect(screen.getByText('Machinery')).toBeVisible();
    expect(screen.getByText('1380000****')).toBeVisible();
    expect(screen.getByText('<script>window.stolen=true</script>High pressure')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByRole('link', { name: 'Alpha Hydraulics' })).toHaveAttribute('href', '/enterprise/companies/42');
    expect(container.querySelector("a[href^='tel:']")).toBeNull();
    expect(screen.queryByRole('button', { name: /unlock|拨号|解锁/i })).toBeNull();
  });

  it('rejects a nonnumeric route without requesting or echoing it', async () => {
    const request = vi.fn<EnterpriseClient['request']>();
    const { container } = renderDetail(createClient(request), '9%3Fphone%3D13800000000');
    expect(await screen.findByText('enterprise.productDetail.invalid.title')).toBeVisible();
    expect(request).not.toHaveBeenCalled();
    expect(container).not.toHaveTextContent('13800000000');
  });
});
