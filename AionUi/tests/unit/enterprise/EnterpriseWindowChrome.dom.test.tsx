import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EnterpriseWindowChrome from '@/renderer/pages/enterprise/layout/EnterpriseWindowChrome';

const platform = vi.hoisted(() => ({ desktop: true, mac: false }));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => platform.desktop,
  isMacOS: () => platform.mac,
}));

vi.mock('@/renderer/components/layout/WindowControls', () => ({
  default: () => <div data-testid='shared-window-controls'>shared controls</div>,
}));

describe('EnterpriseWindowChrome', () => {
  beforeEach(() => {
    platform.desktop = true;
    platform.mac = false;
  });

  afterEach(() => cleanup());

  it('provides a draggable desktop title region and reuses shared controls on Windows and Linux', () => {
    render(<EnterpriseWindowChrome title='Enterprise Code' />);

    expect(screen.getByRole('banner', { name: 'Enterprise Code' })).toHaveClass('enterprise-window-chrome--desktop');
    expect(screen.getByTestId('shared-window-controls')).toBeVisible();
  });

  it('keeps the drag region but leaves native traffic lights unobstructed on macOS', () => {
    platform.mac = true;
    render(<EnterpriseWindowChrome title='Enterprise Code' />);

    expect(screen.getByRole('banner', { name: 'Enterprise Code' })).toHaveClass('enterprise-window-chrome--mac');
    expect(screen.queryByTestId('shared-window-controls')).not.toBeInTheDocument();
  });

  it('does not add desktop window chrome to WebUI', () => {
    platform.desktop = false;
    render(<EnterpriseWindowChrome title='Enterprise Code' />);

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });
});
