import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCatalogReturnState,
  getEnterpriseCatalogScrollTop,
  readCatalogReturnState,
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
});
