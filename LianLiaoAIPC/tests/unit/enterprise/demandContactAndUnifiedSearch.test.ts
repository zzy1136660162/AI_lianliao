import { describe, expect, it } from 'vitest';

import { buildMembershipUpgradeUrl } from '@/common/enterprise/demand-contact/constants';
import { parseDemandContactAccess } from '@/common/enterprise/demand-contact/schemas';
import { enterpriseRequestSchema } from '@/common/enterprise/rawSchemas';
import { parseUnifiedSearchResult } from '@/common/enterprise/unified-search/schemas';

describe('demand contact security contract', () => {
  it('keeps openId out of renderer contact requests', () => {
    expect(
      enterpriseRequestSchema.safeParse({
        operation: 'demand.contactAcquire',
        payload: { typeId: 0, demandId: '-101' },
      }).success
    ).toBe(true);

    expect(
      enterpriseRequestSchema.safeParse({
        operation: 'demand.contactAcquire',
        payload: { typeId: 0, demandId: '-101', openId: 'renderer-must-not-send-this' },
      }).success
    ).toBe(false);
  });

  it('only exposes contact values for owner or unlocked states', () => {
    expect(() =>
      parseDemandContactAccess({
        state: 'PAYMENT_REQUIRED',
        canAcquire: false,
        canUpgrade: true,
        contact: { contactPhone: '13800000000' },
      })
    ).toThrow();

    expect(
      parseDemandContactAccess({
        state: 'UNLOCKED',
        canAcquire: false,
        canUpgrade: false,
        contact: { contactPhone: '13800000000' },
      }).contact?.contactPhone
    ).toBe('13800000000');
  });

  it('accepts cloud-api unlocked responses with nullable optional metadata', () => {
    const access = parseDemandContactAccess({
      state: 'UNLOCKED',
      memberLevel: null,
      memberLevelLabel: null,
      remainingQuota: null,
      canAcquire: false,
      canUpgrade: false,
      contact: {
        companyName: '沈阳北软信息职业技术学院',
        contactPerson: '冷老师',
        contactPhone: '18940243759',
        address: '沈北路53号',
      },
    });

    expect(access.state).toBe('UNLOCKED');
    expect(access.memberLevel).toBeUndefined();
    expect(access.remainingQuota).toBeUndefined();
  });

  it('normalizes nullable or blank optional contact fields without hiding a successful unlock', () => {
    const access = parseDemandContactAccess({
      state: 'OWNER',
      memberLevel: null,
      memberLevelLabel: null,
      remainingQuota: null,
      canAcquire: false,
      canUpgrade: false,
      contact: {
        companyName: '测试企业',
        contactPerson: null,
        contactPhone: ' 13800000000 ',
        address: '   ',
      },
    });

    expect(access.contact).toEqual({
      companyName: '测试企业',
      contactPerson: undefined,
      contactPhone: '13800000000',
      address: undefined,
    });
  });

  it('builds only the approved HTTPS membership QR destination', () => {
    const url = new URL(buildMembershipUpgradeUrl(123456));

    expect(url.origin).toBe('https://sjbang.lslnii.com');
    expect(url.pathname).toBe('/jjgc/foreground/increment_service/increment_service.html');
    expect(url.searchParams.get('paytype')).toBe('3');
    expect(url.searchParams.get('version')).toBe('123456');
  });
});

describe('unified search response boundary', () => {
  it('normalizes nullable optional fields from Java responses', () => {
    const result = parseUnifiedSearchResult({
      total: 1,
      pageNum: 1,
      pageSize: 20,
      items: [
        {
          resourceType: 'PRODUCT',
          businessId: '407563',
          title: '测试产品',
          subtitle: null,
          coverUrl: null,
          publishedAt: null,
          tags: [],
        },
      ],
    });

    expect(result.items[0].subtitle).toBeUndefined();
    expect(result.items[0].coverUrl).toBeUndefined();
    expect(result.items[0].publishedAt).toBeUndefined();
  });

  it('accepts signed nonzero business IDs and rejects unexpected sensitive fields', () => {
    const safeItem = {
      resourceType: 'COMPANY',
      businessId: '-88',
      title: '沈阳测试企业',
      tags: ['装备制造'],
    };

    expect(
      parseUnifiedSearchResult({
        total: 1,
        pageNum: 1,
        pageSize: 20,
        items: [safeItem],
      }).items[0].businessId
    ).toBe('-88');

    expect(() =>
      parseUnifiedSearchResult({
        total: 1,
        pageNum: 1,
        pageSize: 20,
        items: [{ ...safeItem, contactPhone: '13800000000' }],
      })
    ).toThrow();
  });

  it('rejects zero IDs and non-HTTPS covers', () => {
    expect(() =>
      parseUnifiedSearchResult({
        total: 1,
        pageNum: 1,
        pageSize: 20,
        items: [
          {
            resourceType: 'PRODUCT',
            businessId: '0',
            title: '测试产品',
            coverUrl: 'http://example.com/product.png',
            tags: [],
          },
        ],
      })
    ).toThrow();
  });
});
