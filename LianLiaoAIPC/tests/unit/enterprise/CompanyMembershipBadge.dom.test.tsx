import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CompanyMembershipBadge from '@/renderer/pages/enterprise/membership/CompanyMembershipBadge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(',')}` : key),
  }),
}));

afterEach(cleanup);

describe('company membership badge', () => {
  it('renders the H5 VIP image with one translated accessible name', () => {
    render(<CompanyMembershipBadge level={2} />);

    const image = screen.getByRole('img', { name: 'enterprise.companies.memberLevel.vip' });
    expect(image).toHaveAttribute('src', expect.stringContaining('vip-member'));
    expect(image).toHaveAttribute('title', 'enterprise.companies.memberLevel.vip');
    expect(screen.queryByText('enterprise.companies.memberLevel.value:2')).toBeNull();
  });

  it('renders text instead of a broken image for an unmapped finite level', () => {
    const { container } = render(<CompanyMembershipBadge level={7} compact />);

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('enterprise.companies.memberLevel.fallback:7')).toBeVisible();
    expect(container.firstElementChild).toHaveAttribute('data-membership-kind', 'unknown');
  });

  it('renders the ungraded fallback when no level is available', () => {
    render(<CompanyMembershipBadge />);

    expect(screen.getByText('enterprise.companies.memberLevel.unknown')).toBeVisible();
  });
});
