import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MandatoryUpdateGate from '@/renderer/components/layout/MandatoryUpdateGate';

const desktopVersionClient = vi.hoisted(() => ({
  check: vi.fn(),
  download: vi.fn(),
  installRequired: vi.fn(),
}));

vi.mock('@/renderer/services/enterprise/desktop-version/desktopVersionClient', () => ({ desktopVersionClient }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { version?: string }) => (options?.version ? `${key}:${options.version}` : key),
  }),
}));

const mandatoryCheck = {
  checkedAt: 1_700_000_000_000,
  currentVersion: '2.1.32',
  release: {
    architecture: 'X64' as const,
    forceUpdate: true,
    packageSizeBytes: 1024,
    platform: 'WINDOWS' as const,
    publishedAt: 1_700_000_000_000,
    releaseNotes: null,
    versionCode: 2026081001,
    versionId: '701',
    versionName: '2.1.33',
  },
  updateAvailable: true,
};

describe('MandatoryUpdateGate', () => {
  beforeEach(() => {
    desktopVersionClient.check.mockReset();
    desktopVersionClient.download.mockReset();
    desktopVersionClient.installRequired.mockReset();
    desktopVersionClient.download.mockResolvedValue({
      fileName: 'installer.exe',
      filePath: 'C:\\cache\\installer.exe',
    });
    desktopVersionClient.installRequired.mockResolvedValue({ launched: true });
  });

  it('automatically downloads and launches a required update without rendering business routes', async () => {
    desktopVersionClient.check.mockResolvedValue(mandatoryCheck);

    render(
      <MandatoryUpdateGate>
        <div>business workspace</div>
      </MandatoryUpdateGate>
    );

    await waitFor(() => expect(desktopVersionClient.installRequired).toHaveBeenCalledOnce());
    expect(desktopVersionClient.download).toHaveBeenCalledOnce();
    expect(screen.queryByText('business workspace')).not.toBeInTheDocument();
  });

  it('allows business routes when the available update is optional', async () => {
    desktopVersionClient.check.mockResolvedValue({
      ...mandatoryCheck,
      release: { ...mandatoryCheck.release, forceUpdate: false },
    });

    render(
      <MandatoryUpdateGate>
        <div>business workspace</div>
      </MandatoryUpdateGate>
    );

    expect(await screen.findByText('business workspace')).toBeInTheDocument();
    expect(desktopVersionClient.download).not.toHaveBeenCalled();
  });

  it('keeps the workspace blocked and exposes retry when a mandatory download fails', async () => {
    desktopVersionClient.check.mockResolvedValue(mandatoryCheck);
    desktopVersionClient.download.mockRejectedValueOnce(new Error('offline'));

    render(
      <MandatoryUpdateGate>
        <div>business workspace</div>
      </MandatoryUpdateGate>
    );

    const retry = await screen.findByText('enterprise.versionUpdate.actions.retry');
    expect(screen.queryByText('business workspace')).not.toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(desktopVersionClient.download).toHaveBeenCalledTimes(2));
  });
});
