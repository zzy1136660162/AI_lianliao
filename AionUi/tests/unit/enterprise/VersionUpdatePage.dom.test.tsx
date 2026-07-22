import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { DesktopVersionClient } from '@/renderer/services/enterprise/desktop-version/desktopVersionClient';
import VersionUpdatePage from '@/renderer/pages/enterprise/notifications/VersionUpdatePage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => `${key}${values?.version ?? values?.path ?? ''}`,
  }),
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

const client: DesktopVersionClient = {
  check: vi.fn(async () => ({
    checkedAt: 1_700_000_000_000,
    currentVersion: '2.1.27',
    updateAvailable: true,
    release: {
      architecture: 'X64',
      forceUpdate: false,
      packageSizeBytes: 1024,
      platform: 'WINDOWS',
      publishedAt: 1_700_000_000_000,
      releaseNotes: 'Desktop update notes',
      versionCode: 2026072101,
      versionId: '701',
      versionName: '2.1.28',
    },
  })),
  download: vi.fn(async () => ({
    fileName: 'lianliao-ai-2.1.28.exe',
    filePath: 'C:\\Downloads\\lianliao-ai-2.1.28.exe',
  })),
  openDownloaded: vi.fn(async () => ({ opened: true })),
};

describe('VersionUpdatePage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('requires an explicit download action and offers to open only the downloaded installer', async () => {
    render(<VersionUpdatePage client={client} />);

    await screen.findByText('Desktop update notes');
    expect(client.download).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'enterprise.versionUpdate.actions.download' }));
    await waitFor(() => expect(client.download).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/C:\\Downloads\\lianliao-ai-2.1.28.exe/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'enterprise.versionUpdate.actions.open' }));
    await waitFor(() => expect(client.openDownloaded).toHaveBeenCalledTimes(1));
  });
});
