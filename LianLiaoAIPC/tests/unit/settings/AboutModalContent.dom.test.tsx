/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openExternalUrlMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  openExternalUrl: mocks.openExternalUrlMock,
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  default: () => null,
}));

import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';

const renderAboutModalContent = () =>
  render(
    <MemoryRouter initialEntries={['/settings/about']}>
      <Routes>
        <Route path='/settings/about' element={<AboutModalContent />} />
        <Route path='/enterprise/version-update' element={<div>enterprise-version-center</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('AboutModalContent database update channel', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '2.1.28');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the Chain Liao AI heading and preserves the upstream help link', async () => {
    mocks.openExternalUrlMock.mockResolvedValue(undefined);
    renderAboutModalContent();

    expect(screen.getByRole('heading', { name: '链辽AI' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('settings.helpDocumentation'));

    await waitFor(() => {
      expect(mocks.openExternalUrlMock).toHaveBeenCalledWith('https://github.com/iOfficeAI/AionUi/wiki');
    });
  });

  it('routes update checks to the enterprise database version center', async () => {
    renderAboutModalContent();

    fireEvent.click(screen.getByRole('button', { name: 'settings.checkForUpdates' }));

    expect(await screen.findByText('enterprise-version-center')).toBeInTheDocument();
  });
});
