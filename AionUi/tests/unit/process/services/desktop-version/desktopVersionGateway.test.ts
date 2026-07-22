import { describe, expect, it, vi } from 'vitest';

import type { DesktopVersionRemoteRelease } from '@process/services/enterprise/desktop-version/desktopVersionApiClient';
import {
  DesktopVersionGateway,
  type DesktopVersionGatewayApiClient,
  type DesktopVersionGatewayRuntime,
} from '@process/services/enterprise/desktop-version/desktopVersionGateway';

const remoteRelease: DesktopVersionRemoteRelease = {
  version: {
    id: '701',
    versionCode: 2026072101,
    versionName: '2.1.28',
    releaseNotes: 'Improves desktop notification and version delivery.',
    forceUpdate: true,
    publishedAt: 1_700_000_000_000,
  },
  packageInfo: {
    id: '801',
    platform: 'WINDOWS',
    architecture: 'X64',
    downloadUrl: 'https://downloads.example.com/lianliao-ai-2.1.28.exe',
    sha256: 'a3e214d9cf9611c91e410a2e5c6a67d354676eeec65e4c6fcbbe67f1019cf845',
    sizeBytes: 1024,
  },
};

const makeRuntime = (): DesktopVersionGatewayRuntime => ({
  arch: 'x64',
  getPath: vi.fn(() => 'C:\\Users\\demo\\Downloads'),
  getVersion: vi.fn(() => '2.1.27'),
  openPath: vi.fn(async () => ''),
  platform: 'win32',
});

const makeApiClient = (): DesktopVersionGatewayApiClient => ({
  getLatest: vi.fn(async () => remoteRelease),
});

describe('DesktopVersionGateway', () => {
  it('keeps installer URL, hash and OpenID out of the renderer-visible update check', async () => {
    const apiClient = makeApiClient();
    const gateway = new DesktopVersionGateway({
      apiClient,
      runtime: makeRuntime(),
      sessionStore: { loadOpenId: async () => 'persisted-open-id' },
    });

    const result = await gateway.check();

    expect(result).toMatchObject({
      currentVersion: '2.1.27',
      updateAvailable: true,
      release: { versionName: '2.1.28', forceUpdate: true, platform: 'WINDOWS' },
    });
    expect(JSON.stringify(result)).not.toContain('persisted-open-id');
    expect(JSON.stringify(result)).not.toContain(remoteRelease.packageInfo.downloadUrl);
    expect(JSON.stringify(result)).not.toContain(remoteRelease.packageInfo.sha256);
    expect(apiClient.getLatest).toHaveBeenCalledWith('persisted-open-id', 'WINDOWS', 'X64');
  });

  it('downloads only the cached server-selected artifact into Downloads and opens no renderer-selected path', async () => {
    const runtime = makeRuntime();
    const downloader = vi.fn(async () => ({
      fileName: 'lianliao-ai-2.1.28.exe',
      filePath: 'C:\\Users\\demo\\Downloads\\lianliao-ai-2.1.28.exe',
    }));
    const gateway = new DesktopVersionGateway({
      apiClient: makeApiClient(),
      downloader,
      runtime,
      sessionStore: { loadOpenId: async () => 'persisted-open-id' },
    });

    await gateway.check();
    const downloaded = await gateway.downloadLatest();
    const opened = await gateway.openDownloadedInstaller();

    expect(downloaded.filePath).toContain('Downloads');
    expect(downloader).toHaveBeenCalledWith({
      downloadsDirectory: 'C:\\Users\\demo\\Downloads',
      release: remoteRelease,
    });
    expect(runtime.openPath).toHaveBeenCalledWith(downloaded.filePath);
    expect(opened).toEqual({ opened: true });
  });
});
