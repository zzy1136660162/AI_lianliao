import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

import type {
  EnterpriseLoginPollResult,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '@/common/enterprise/contracts';
import { EnterpriseAuthProvider } from '@/renderer/hooks/context/EnterpriseAuthContext';
import EnterpriseSider from '@/renderer/pages/enterprise/layout/EnterpriseSider';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const USER: EnterpriseUserContext = {
  registered: true,
  openId: 'openid-must-not-be-rendered',
  companyName: '辽宁测试企业',
  userName: '测试用户',
};

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid='location'>{location.pathname}</output>;
};

const makeClient = (clearSession: EnterpriseClient['clearSession']): EnterpriseClient => ({
  createLoginSession: vi.fn(async () => {
    throw new Error('not used');
  }),
  pollLoginSession: vi.fn(async (): Promise<EnterpriseLoginPollResult> => ({ status: 'WAITING' })),
  completeRegistration: vi.fn(async () => USER),
  restoreSession: vi.fn(async () => USER),
  clearSession,
  request: vi.fn(async (): Promise<EnterpriseResponse> => {
    throw new Error('not used');
  }),
});

describe('enterprise sider integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the graphical product mark instead of the translated placeholder', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/enterprise/dashboard']}>
        <EnterpriseAuthProvider client={makeClient(vi.fn(async () => undefined))}>
          <EnterpriseSider />
        </EnterpriseAuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText(USER.companyName!)).toBeVisible();
    expect(container.querySelector('.enterprise-sider__brand-mark img')).toBeInTheDocument();
    expect(screen.queryByText('enterprise.shell.brandMark')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'enterprise.navigation.supplyDemand' })).toHaveAttribute(
      'href',
      '/enterprise/supply-demand'
    );
  });

  it('keeps the real authenticated provider and sider in the workbench after clear failure', async () => {
    const clearSession = vi
      .fn<EnterpriseClient['clearSession']>()
      .mockRejectedValueOnce(new Error('raw-session-secret'))
      .mockResolvedValueOnce(undefined);
    const { container } = render(
      <MemoryRouter initialEntries={['/enterprise/dashboard']}>
        <EnterpriseAuthProvider client={makeClient(clearSession)}>
          <EnterpriseSider />
          <LocationProbe />
        </EnterpriseAuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText(USER.companyName!)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.shell.actions.logout' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/enterprise/dashboard');
    expect(screen.getByText(USER.companyName!)).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('enterprise.shell.logoutError');
    expect(container).not.toHaveTextContent('raw-session-secret');

    await userEvent.click(screen.getByRole('button', { name: 'enterprise.shell.actions.logout' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/enterprise/login'));
    expect(clearSession).toHaveBeenCalledTimes(2);
  });
});
