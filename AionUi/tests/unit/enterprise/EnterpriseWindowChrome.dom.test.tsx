import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WindowControls from '@/renderer/components/layout/WindowControls';
import EnterpriseWindowChrome from '@/renderer/pages/enterprise/layout/EnterpriseWindowChrome';

type MaximizeListener = (payload: { is_maximized: boolean }) => void;

const platform = vi.hoisted(() => ({ desktop: true, mac: false }));
const controls = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  isMaximized: vi.fn(async () => false),
  listener: undefined as MaximizeListener | undefined,
  maximize: vi.fn(async () => undefined),
  minimize: vi.fn(async () => undefined),
  onMaximizedChanged: vi.fn(),
  unmaximize: vi.fn(async () => undefined),
  unsubscribe: vi.fn(),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => platform.desktop,
  isMacOS: () => platform.mac,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    windowControls: {
      close: { invoke: controls.close },
      isMaximized: { invoke: controls.isMaximized },
      maximize: { invoke: controls.maximize },
      maximizedChanged: { on: controls.onMaximizedChanged },
      minimize: { invoke: controls.minimize },
      unmaximize: { invoke: controls.unmaximize },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('EnterpriseWindowChrome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platform.desktop = true;
    platform.mac = false;
    controls.listener = undefined;
    controls.isMaximized.mockResolvedValue(false);
    controls.onMaximizedChanged.mockImplementation((listener: MaximizeListener) => {
      controls.listener = listener;
      return controls.unsubscribe;
    });
  });

  afterEach(() => cleanup());

  it('uses a non-landmark drag container and localized shared controls on Windows and Linux', async () => {
    const { container } = render(<EnterpriseWindowChrome title='Enterprise Code' />);

    const chrome = container.querySelector('.enterprise-window-chrome');
    expect(chrome?.tagName).toBe('DIV');
    expect(chrome).toHaveClass('enterprise-window-chrome--desktop');
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'enterprise.windowControls.minimize' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'enterprise.windowControls.maximize' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'enterprise.windowControls.close' })).toBeVisible();
  });

  it('routes all shared window actions through IPC and removes the maximize listener on cleanup', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<EnterpriseWindowChrome title='Enterprise Code' />);
    await waitFor(() => expect(controls.onMaximizedChanged).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('button', { name: 'enterprise.windowControls.minimize' }));
    await user.click(screen.getByRole('button', { name: 'enterprise.windowControls.maximize' }));
    await user.click(screen.getByRole('button', { name: 'enterprise.windowControls.close' }));
    expect(controls.minimize).toHaveBeenCalledOnce();
    expect(controls.maximize).toHaveBeenCalledOnce();
    expect(controls.close).toHaveBeenCalledOnce();

    act(() => controls.listener?.({ is_maximized: true }));
    await user.click(screen.getByRole('button', { name: 'enterprise.windowControls.restore' }));
    expect(controls.unmaximize).toHaveBeenCalledOnce();

    unmount();
    expect(controls.unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps the shared English labels as defaults for existing callers', async () => {
    render(<WindowControls />);

    expect(await screen.findByRole('button', { name: 'Minimize' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Maximize' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  it('keeps the drag region but leaves native traffic lights unobstructed on macOS', () => {
    platform.mac = true;
    const { container } = render(<EnterpriseWindowChrome title='Enterprise Code' />);

    expect(container.querySelector('.enterprise-window-chrome')).toHaveClass('enterprise-window-chrome--mac');
    expect(container.querySelector('.app-window-controls')).not.toBeInTheDocument();
  });

  it('does not add desktop window chrome to WebUI', () => {
    platform.desktop = false;
    const { container } = render(<EnterpriseWindowChrome title='Enterprise Code' />);

    expect(container.querySelector('.enterprise-window-chrome')).not.toBeInTheDocument();
  });

  it('keeps the chrome draggable while excluding the shared controls from the drag region', () => {
    const chromeCss = readFileSync(
      resolve('packages/desktop/src/renderer/pages/enterprise/layout/enterprise-window-chrome.css'),
      'utf8'
    );
    const titlebarCss = readFileSync(
      resolve('packages/desktop/src/renderer/components/layout/Titlebar/titlebar.css'),
      'utf8'
    );

    expect(chromeCss).toMatch(/\.enterprise-window-chrome\s*\{[^}]*-webkit-app-region:\s*drag/s);
    expect(titlebarCss).toMatch(/\.app-window-controls\s*\{[^}]*-webkit-app-region:\s*no-drag/s);
  });
});
