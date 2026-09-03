import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCatalogReturnState,
  createCompanyDetailProductReturnState,
  createProductDetailCompanyReturnState,
  getEnterpriseCatalogScrollTop,
  readAiConversationReturnState,
  readCatalogReturnState,
  readCompanyDetailProductReturnState,
  readProductDetailCompanyReturnState,
  restoreProductDetailOriginState,
  restoreEnterpriseCatalogScroll,
} from '@/renderer/pages/enterprise/layout/catalog/catalogReturnState';

describe('enterprise catalog return state', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('round-trips a negative-id company selection with filters and pagination', () => {
    const state = createCatalogReturnState({
      kind: 'companies',
      path: '/enterprise/companies',
      query: {
        keyword: '装备',
        province: '辽宁省',
        companyLevel: 3.1,
        vip: true,
        pageNum: 3,
        pageSize: 50,
      },
      selectedId: '-8',
      scrollTop: 640,
    });

    expect(readCatalogReturnState(state, 'companies')).toEqual(state.catalogReturn);
    expect(readCatalogReturnState(state, 'products')).toBeNull();
  });

  it('rejects malformed or cross-catalog route state', () => {
    expect(
      readCatalogReturnState(
        {
          catalogReturn: {
            kind: 'products',
            path: '/enterprise/companies',
            query: { pageNum: 0, pageSize: 20 },
            scrollTop: -1,
          },
        },
        'products'
      )
    ).toBeNull();
    expect(readCatalogReturnState({ catalogReturn: { kind: 'products' } }, 'products')).toBeNull();
  });

  it('reads and restores the enterprise shell scroller', () => {
    const scroller = document.createElement('main');
    scroller.className = 'enterprise-shell__main';
    scroller.scrollTop = 245;
    document.body.append(scroller);
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    expect(getEnterpriseCatalogScrollTop()).toBe(245);
    restoreEnterpriseCatalogScroll(720);
    expect(scroller.scrollTop).toBe(720);

    requestAnimationFrame.mockRestore();
  });

  it('preserves a validated AI conversation return through company-to-product navigation', () => {
    const aiReturn = {
      kind: 'ai-conversation' as const,
      path: '/conversation/conversation-1' as const,
      conversationId: 'conversation-1',
      targetMessageId: 'message-1',
      scrollTop: 420,
    };
    const state = createProductDetailCompanyReturnState('-8', null, aiReturn);

    expect(readProductDetailCompanyReturnState(state)?.aiConversationReturn).toEqual(aiReturn);
  });

  it('round-trips the product and company-catalog origin through an owning-company visit', () => {
    const catalogReturn = createCatalogReturnState({
      kind: 'companies',
      path: '/enterprise/companies',
      query: { keyword: '泵', pageNum: 2, pageSize: 20 },
      selectedId: '42',
      scrollTop: 880,
    }).catalogReturn;
    const state = createCompanyDetailProductReturnState('901', { kind: 'catalog', catalogReturn });
    const parsed = readCompanyDetailProductReturnState(state);

    expect(parsed).toEqual(state.companyDetailReturn);
    expect(parsed && restoreProductDetailOriginState(parsed)).toEqual(createCatalogReturnState(catalogReturn));
  });

  it('rejects a forged product return path or malformed nested catalog state', () => {
    expect(
      readCompanyDetailProductReturnState({
        companyDetailReturn: { kind: 'product-detail', productId: '../../settings' },
      })
    ).toBeNull();
    expect(
      readCompanyDetailProductReturnState({
        companyDetailReturn: {
          kind: 'product-detail',
          productId: '901',
          origin: {
            kind: 'catalog',
            catalogReturn: {
              kind: 'companies',
              path: '/enterprise/products',
              query: { pageNum: 1, pageSize: 20 },
              scrollTop: 0,
            },
          },
        },
      })
    ).toBeNull();
  });

  it('rejects a forged conversation path that could escape the local route', () => {
    expect(
      readAiConversationReturnState({
        kind: 'ai-conversation',
        path: '/conversation/../../settings',
        conversationId: '../../settings',
        targetMessageId: 'message-1',
        scrollTop: 0,
      })
    ).toBeNull();
  });
});
