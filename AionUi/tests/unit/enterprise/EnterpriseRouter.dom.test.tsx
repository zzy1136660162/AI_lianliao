import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Outlet } from 'react-router-dom';

import type { EnterpriseAuthContextValue } from '@/renderer/hooks/context/EnterpriseAuthContext';
import Router from '@/renderer/components/layout/Router';

const routerMocks = vi.hoisted(() => ({
  appStatus: 'authenticated' as 'checking' | 'authenticated' | 'unauthenticated',
  desktop: true,
  enterpriseStatus: 'authenticated' as EnterpriseAuthContextValue['status'],
  logout: vi.fn<EnterpriseAuthContextValue['logout']>(async () => true),
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

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: routerMocks.appStatus }),
}));

vi.mock('@/renderer/hooks/context/EnterpriseAuthContext', () => ({
  useEnterpriseAuth: (): EnterpriseAuthContextValue => ({
    status: routerMocks.enterpriseStatus,
    user: {
      registered: true,
      openId: 'openid-must-not-be-rendered',
      companyName: '辽宁测试企业',
      userName: '测试用户',
    },
    loginSession: null,
    registrationOpenId: null,
    errorCode: null,
    startLogin: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    logout: routerMocks.logout,
    checkRegistration: vi.fn(async () => undefined),
    isExpired: false,
    remainingSeconds: 0,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => routerMocks.desktop,
  isMacOS: () => false,
}));

vi.mock('@/renderer/components/layout/WindowControls', () => ({
  default: () => <div data-testid='shared-window-controls'>shared controls</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/pages/login', () => ({ default: () => <div>original-login-page</div> }));
vi.mock('@/renderer/pages/guid', () => ({ default: () => <div>original-guid-page</div> }));
vi.mock('@/renderer/pages/conversation', () => ({
  default: () => <div>original-conversation-page</div>,
}));
vi.mock('@/renderer/pages/enterprise/login/EnterpriseLoginPage', () => ({
  default: () => <div>enterprise-login-page</div>,
}));

const OriginalLayout = () => (
  <div>
    original-layout
    <Outlet />
  </div>
);

const renderAt = (path: string) => {
  window.location.hash = `#${path}`;
  return render(<Router layout={<OriginalLayout />} />);
};

describe('enterprise desktop routing', () => {
  beforeEach(() => {
    routerMocks.appStatus = 'authenticated';
    routerMocks.desktop = true;
    routerMocks.enterpriseStatus = 'authenticated';
    routerMocks.logout.mockReset();
    routerMocks.logout.mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    window.location.hash = '';
  });

  it('sends the authenticated Electron root to the enterprise dashboard', async () => {
    renderAt('/');

    await waitFor(() => expect(window.location.hash).toBe('#/enterprise/dashboard'));
    expect(
      await screen.findByRole('heading', { name: 'enterprise.routes.dashboard.title' }, { timeout: 5000 })
    ).toBeVisible();
  });

  it('keeps the Electron root stable while enterprise session restoration is checking', async () => {
    routerMocks.enterpriseStatus = 'checking';
    renderAt('/');

    await waitFor(() => expect(document.querySelector('.arco-spin')).toBeInTheDocument());
    expect(window.location.hash).toBe('#/');
    expect(screen.queryByText('enterprise-login-page')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated enterprise routes to the enterprise login', async () => {
    routerMocks.enterpriseStatus = 'unauthenticated';
    renderAt('/enterprise/projects/901');

    expect(await screen.findByText('enterprise-login-page')).toBeVisible();
    expect(window.location.hash).toBe('#/enterprise/login');
  });

  it('redirects an authenticated user away from enterprise login', async () => {
    renderAt('/enterprise/login');

    await waitFor(() => expect(window.location.hash).toBe('#/enterprise/dashboard'));
  });

  it.each([
    ['/enterprise/dashboard', 'enterprise.routes.dashboard.title'],
    ['/enterprise/companies', 'enterprise.routes.companies.title'],
    ['/enterprise/companies/company-1', 'enterprise.routes.companyDetail.title'],
    ['/enterprise/products', 'enterprise.routes.products.title'],
    ['/enterprise/products/1', 'enterprise.routes.productDetail.title'],
    ['/enterprise/projects', 'enterprise.routes.projects.title'],
    ['/enterprise/projects/901', 'enterprise.routes.projectDetail.title'],
    ['/enterprise/favorites', 'enterprise.routes.favorites.title'],
    ['/enterprise/leads', 'enterprise.routes.leads.title'],
  ])('registers %s inside the enterprise shell', async (path, heading) => {
    const { container } = renderAt(path);

    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'enterprise.accessibility.primaryNavigation' })).toBeVisible();
    expect(screen.getByTestId('shared-window-controls')).toBeVisible();
    expect(container).not.toHaveTextContent('openid-must-not-be-rendered');
  });

  it('clears the enterprise session and returns to enterprise login', async () => {
    routerMocks.logout.mockImplementationOnce(async () => {
      routerMocks.enterpriseStatus = 'unauthenticated';
      return true;
    });
    renderAt('/enterprise/dashboard');

    await userEvent.click(await screen.findByRole('button', { name: 'enterprise.shell.actions.logout' }));

    expect(routerMocks.logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('enterprise-login-page')).toBeVisible();
    expect(window.location.hash).toBe('#/enterprise/login');
  });

  it('shows a safe translated error and stays in the workspace when logout rejects', async () => {
    routerMocks.logout.mockRejectedValueOnce(new Error('raw-session-secret'));
    const { container } = renderAt('/enterprise/dashboard');

    await userEvent.click(await screen.findByRole('button', { name: 'enterprise.shell.actions.logout' }));

    expect(await screen.findByText('enterprise.shell.logoutError')).toBeVisible();
    expect(window.location.hash).toBe('#/enterprise/dashboard');
    expect(container).not.toHaveTextContent('raw-session-secret');
  });

  it('lets keyboard and pointer users collapse and restore the assistant slot', async () => {
    renderAt('/enterprise/dashboard');

    const hideButton = await screen.findByRole('button', {
      name: 'enterprise.assistant.actions.hide',
    });
    const assistant = screen.getByRole('complementary', {
      name: 'enterprise.accessibility.assistant',
    });
    expect(hideButton).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(hideButton);
    expect(assistant).toHaveAttribute('aria-hidden', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'enterprise.assistant.actions.show' }));
    expect(assistant).toHaveAttribute('aria-hidden', 'false');
  });

  it('keeps identity and assistant controls available to compact-window users', async () => {
    renderAt('/enterprise/dashboard');

    expect(await screen.findByText('辽宁测试企业')).toBeVisible();
    expect(screen.getByText('测试用户')).toBeVisible();
    expect(screen.getByRole('button', { name: 'enterprise.assistant.actions.hide' })).toBeVisible();
  });

  it('keeps compact footer actions in direct keyboard order after primary navigation', async () => {
    const user = userEvent.setup();
    renderAt('/enterprise/dashboard');
    const leads = await screen.findByRole('link', { name: 'enterprise.navigation.leads' });
    const ai = screen.getByRole('link', { name: 'enterprise.shell.actions.ai' });
    const settings = screen.getByRole('link', { name: 'enterprise.shell.actions.settings' });
    const logout = screen.getByRole('button', { name: 'enterprise.shell.actions.logout' });

    leads.focus();
    await user.tab();
    expect(ai).toHaveFocus();
    await user.tab();
    expect(settings).toHaveFocus();
    await user.tab();
    expect(logout).toHaveFocus();
  });
});

describe('existing WebUI routes', () => {
  beforeEach(() => {
    routerMocks.desktop = false;
    routerMocks.appStatus = 'authenticated';
    routerMocks.enterpriseStatus = 'unauthenticated';
  });

  afterEach(() => {
    cleanup();
    window.location.hash = '';
  });

  it('keeps the WebUI root pointed at guid', async () => {
    renderAt('/');

    await waitFor(() => expect(window.location.hash).toBe('#/guid'));
    expect(await screen.findByText('original-guid-page')).toBeVisible();
  });

  it.each([
    ['/guid', 'original-guid-page'],
    ['/conversation/conversation-1', 'original-conversation-page'],
  ])('keeps %s available', async (path, content) => {
    renderAt(path);
    expect(await screen.findByText(content)).toBeVisible();
  });

  it('keeps the original login route available', async () => {
    routerMocks.appStatus = 'unauthenticated';
    renderAt('/login');

    expect(await screen.findByText('original-login-page')).toBeVisible();
  });
});
