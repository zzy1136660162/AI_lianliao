import { describe, expect, it } from 'vitest';

import { resolveCompanyMembership } from '@/renderer/pages/enterprise/membership/companyMembership';

describe('company membership presentation', () => {
  it.each([
    [1, 'verified', 'enterprise.companies.memberLevel.verified'],
    [1.1, 'ordinary', 'enterprise.companies.memberLevel.ordinary'],
    [1.2, 'vip', 'enterprise.companies.memberLevel.vip'],
    [2, 'vip', 'enterprise.companies.memberLevel.vip'],
    [3, 'vip', 'enterprise.companies.memberLevel.vip'],
    [4, 'star', 'enterprise.companies.memberLevel.fourStar'],
    [5, 'star', 'enterprise.companies.memberLevel.fiveStar'],
    [6, 'flagship', 'enterprise.companies.memberLevel.flagship'],
  ] as const)('maps H5 company level %s to %s', (level, kind, labelKey) => {
    expect(resolveCompanyMembership(level)).toMatchObject({ kind, labelKey });
    expect(resolveCompanyMembership(level).iconSrc).toBeTruthy();
  });

  it('does not create a broken icon for H5 levels without an asset', () => {
    expect(resolveCompanyMembership(3.1)).toEqual({
      kind: 'unknown',
      labelKey: 'enterprise.companies.memberLevel.fallback',
      labelValues: { level: 3.1 },
      iconSrc: null,
    });
  });

  it('uses the ungraded fallback for absent and non-finite values', () => {
    expect(resolveCompanyMembership(undefined)).toEqual({
      kind: 'unknown',
      labelKey: 'enterprise.companies.memberLevel.unknown',
      iconSrc: null,
    });
    expect(resolveCompanyMembership(Number.NaN).iconSrc).toBeNull();
  });
});
