/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mirror the project convention: t() echoes the key so labels/tooltips are assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Tooltip: ({
      children,
      content,
      disabled,
      trigger,
    }: {
      children: React.ReactNode;
      content?: React.ReactNode;
      disabled?: boolean;
      trigger?: unknown;
    }) => {
      const triggerValue = Array.isArray(trigger)
        ? trigger.length > 0
          ? trigger.join(',')
          : 'none'
        : typeof trigger === 'string'
          ? trigger
          : undefined;

      return (
        <span
          data-tooltip-content={typeof content === 'string' ? content : undefined}
          data-tooltip-disabled={String(Boolean(disabled))}
          data-tooltip-trigger={triggerValue}
        >
          {children}
        </span>
      );
    },
  };
});

// react-router-dom: control location, capture navigate.
const navigate = vi.fn();
let currentPathname = '/guid';
const platformMocks = vi.hoisted(() => ({
  isElectronDesktopMock: vi.fn(() => false),
}));
const siderMocks = vi.hoisted(() => ({
  blurActiveElement: vi.fn(),
  cleanupSiderTooltips: vi.fn(),
  closePreview: vi.fn(),
  logout: vi.fn(async () => undefined),
  onSessionClick: vi.fn(),
  setTheme: vi.fn(async () => undefined),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: currentPathname, search: '', hash: '' }),
  useNavigationType: () => 'POP',
  Outlet: () => null,
}));

// Hidden devtools easter-egg target (icon) — assert it is independent of navigation.
const openDevTools = vi.fn(() => Promise.resolve());
vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      openDevTools: { invoke: () => openDevTools() },
      logStream: { on: () => () => {} },
    },
    task: { stopAll: { invoke: () => Promise.resolve({ success: false }) } },
  },
}));

// Trim Layout's collaborators to keep this a focused brand-behaviour test.
vi.mock('@/common/config/constants', () => ({
  AI_WORKSPACE_TITLE: '链上辽宁·产业云城AI助手',
  TEAM_MODE_ENABLED: false,
}));
vi.mock('@/renderer/components/layout/PwaPullToRefresh', () => ({ default: () => null }));
vi.mock('@/renderer/components/layout/Titlebar', () => ({ default: () => null }));
vi.mock('@/renderer/components/settings/UpdateModal', () => ({ default: () => null }));
vi.mock('@renderer/hooks/system/useDeepLink', () => ({ useDeepLink: () => {} }));
vi.mock('@renderer/hooks/system/notification/useNotificationClick', () => ({ useNotificationClick: () => {} }));
vi.mock('@renderer/hooks/system/notification/useBrowserNotification', () => ({ useBrowserNotification: () => {} }));
vi.mock('@renderer/hooks/file/useDirectorySelection', () => ({
  useDirectorySelection: () => ({ contextHolder: null }),
}));
vi.mock('@renderer/utils/ui/siderTooltip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/utils/ui/siderTooltip')>();
  return { ...actual, cleanupSiderTooltips: siderMocks.cleanupSiderTooltips };
});
vi.mock('@renderer/utils/ui/focus', () => ({ blurActiveElement: siderMocks.blurActiveElement }));
vi.mock('@renderer/hooks/ui/useConversationShortcuts', () => ({ useConversationShortcuts: () => {} }));
vi.mock('@renderer/utils/platform', () => ({ isElectronDesktop: platformMocks.isElectronDesktopMock }));
vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ logout: siderMocks.logout, status: 'authenticated' }),
}));
vi.mock('@renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', setTheme: siderMocks.setTheme }),
}));
vi.mock('@renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ closePreview: siderMocks.closePreview }),
}));
vi.mock('@renderer/pages/conversation/GroupedHistory', () => ({
  default: () => <div data-testid='conversation-history'>conversation history</div>,
}));
vi.mock('@renderer/components/layout/Sider/TeamSiderSection', () => ({ default: () => null }));
vi.mock('@renderer/pages/conversation/GroupedHistory/ConversationSearchPopover', () => ({
  default: ({ label }: { label: string }) => <button type='button'>{label}</button>,
}));

import Layout from '@renderer/components/layout/Layout';
import Sider from '@renderer/components/layout/Sider';
import { LayoutContext } from '@renderer/hooks/context/LayoutContext';

const renderLayout = () => render(<Layout sider={<div>sider</div>} />);

const BACK_KEY = 'common.back';
const ENTERPRISE_KEY = 'enterprise.shell.brand';

type RenderSiderOptions = {
  collapsed?: boolean;
  isMobile?: boolean;
};

const renderSider = async ({ collapsed = false, isMobile = false }: RenderSiderOptions = {}) => {
  const result = render(
    <LayoutContext.Provider value={{ isMobile, siderCollapsed: collapsed, setSiderCollapsed: vi.fn() }}>
      <Sider collapsed={collapsed} onSessionClick={siderMocks.onSessionClick} />
    </LayoutContext.Provider>
  );
  await screen.findByTestId('conversation-history');
  return result;
};

describe('Layout sider brand Home button', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    navigate.mockClear();
    openDevTools.mockClear();
    platformMocks.isElectronDesktopMock.mockReturnValue(false);
    sessionStorage.clear();
    currentPathname = '/guid';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to the recorded last non-settings path when clicked in a settings route', () => {
    currentPathname = '/settings/about';
    sessionStorage.setItem('aion:last-non-settings-path', '/conversation/abc');
    renderLayout();

    fireEvent.click(screen.getByLabelText(BACK_KEY));
    expect(navigate).toHaveBeenCalledWith('/conversation/abc');
  });

  it('falls back to /guid in a settings route when no path is recorded', () => {
    currentPathname = '/settings/system';
    renderLayout();

    fireEvent.click(screen.getByLabelText(BACK_KEY));
    expect(navigate).toHaveBeenCalledWith('/guid');
  });

  it('falls back to /guid when the recorded path is itself a settings path', () => {
    currentPathname = '/settings/about';
    sessionStorage.setItem('aion:last-non-settings-path', '/settings/system');
    renderLayout();

    fireEvent.click(screen.getByLabelText(BACK_KEY));
    expect(navigate).toHaveBeenCalledWith('/guid');
  });

  it('activates via keyboard (Enter and Space) in a settings route', () => {
    currentPathname = '/settings/about';
    sessionStorage.setItem('aion:last-non-settings-path', '/conversation/abc');
    renderLayout();

    const brand = screen.getByLabelText(BACK_KEY);
    fireEvent.keyDown(brand, { key: 'Enter' });
    fireEvent.keyDown(brand, { key: ' ' });
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith('/conversation/abc');
  });

  it('ignores non-activation keys in a settings route', () => {
    currentPathname = '/settings/about';
    sessionStorage.setItem('aion:last-non-settings-path', '/conversation/abc');
    renderLayout();

    const brand = screen.getByLabelText(BACK_KEY);
    fireEvent.keyDown(brand, { key: 'Tab' });
    fireEvent.keyDown(brand, { key: 'a' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('renders the wordmark as a non-actionable element in a non-settings route', () => {
    currentPathname = '/guid';
    renderLayout();

    // No actionable role/label in chat routes.
    expect(screen.queryByLabelText(BACK_KEY)).toBeNull();
    const wordmark = screen.getByText('链上辽宁·产业云城AI助手');
    fireEvent.click(wordmark);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate when the wordmark is clicked in a non-settings route', () => {
    currentPathname = '/conversation/xyz';
    renderLayout();

    fireEvent.click(screen.getByText('链上辽宁·产业云城AI助手'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('clicking the logo icon counts toward the devtools easter-egg and never navigates', () => {
    currentPathname = '/settings/about';
    sessionStorage.setItem('aion:last-non-settings-path', '/conversation/abc');
    const { container } = renderLayout();

    // The workbench brand image remains the clickable devtools easter-egg target.
    const icon = container.querySelector('.ai-brand-mark') as HTMLElement;
    expect(icon).toBeTruthy();
    for (let i = 0; i < 4; i++) fireEvent.click(icon);
    expect(openDevTools).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens the database version page for tray update checks', () => {
    platformMocks.isElectronDesktopMock.mockReturnValue(true);
    const openListener = vi.fn();
    window.addEventListener('aionui-open-update-modal', openListener);

    try {
      renderLayout();

      window.dispatchEvent(new Event('tray:check-update'));

      expect(navigate).toHaveBeenCalledWith('/enterprise/version-update');
      expect(openListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('aionui-open-update-modal', openListener);
    }
  });
});

describe('AI sider enterprise workspace entry', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    navigate.mockReset();
    currentPathname = '/guid';
    siderMocks.blurActiveElement.mockClear();
    siderMocks.cleanupSiderTooltips.mockClear();
    siderMocks.closePreview.mockClear();
    siderMocks.onSessionClick.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders outside session history immediately above the footer and opens the enterprise dashboard', async () => {
    const { container } = await renderSider();

    const entry = screen.getByRole('button', { name: ENTERPRISE_KEY });
    const entryRegion = entry.closest('.sider-enterprise-entry');
    const footer = container.querySelector('.sider-footer');
    const history = screen.getByTestId('conversation-history');

    expect(entryRegion?.nextElementSibling).toBe(footer);
    expect(history).not.toContainElement(entry);

    fireEvent.click(entry);

    expect(navigate).toHaveBeenCalledWith('/enterprise/dashboard');
  });

  it('cleans transient UI state and closes the mobile sider after activation', async () => {
    await renderSider({ isMobile: true });

    fireEvent.click(screen.getByRole('button', { name: ENTERPRISE_KEY }));

    expect(siderMocks.cleanupSiderTooltips).toHaveBeenCalledOnce();
    expect(siderMocks.blurActiveElement).toHaveBeenCalledOnce();
    expect(siderMocks.closePreview).toHaveBeenCalledOnce();
    expect(siderMocks.onSessionClick).toHaveBeenCalledOnce();
  });

  it('keeps the collapsed icon entry accessible and exposes the standard sider tooltip', async () => {
    await renderSider({ collapsed: true });

    const entry = screen.getByRole('button', { name: ENTERPRISE_KEY });
    expect(entry.querySelector('svg')).not.toBeNull();
    expect(entry.parentElement).toHaveAttribute('data-tooltip-content', ENTERPRISE_KEY);
    expect(entry.parentElement).toHaveAttribute('data-tooltip-disabled', 'false');
    expect(entry.parentElement).toHaveAttribute('data-tooltip-trigger', 'hover');
  });

  it('disables the collapsed enterprise tooltip on mobile', async () => {
    await renderSider({ collapsed: true, isMobile: true });

    const entry = screen.getByRole('button', { name: ENTERPRISE_KEY });
    expect(entry.parentElement).toHaveAttribute('data-tooltip-disabled', 'true');
    expect(entry.parentElement).toHaveAttribute('data-tooltip-trigger', 'none');
  });

  it('catches rejected enterprise navigation without leaving an unhandled rejection', async () => {
    const navigationError = new Error('enterprise navigation unavailable');
    navigate.mockRejectedValueOnce(navigationError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderSider();

    fireEvent.click(screen.getByRole('button', { name: ENTERPRISE_KEY }));

    await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Navigation failed:', navigationError));
  });
});
