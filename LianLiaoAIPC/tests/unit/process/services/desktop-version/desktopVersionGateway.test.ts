import { describe, expect, it, vi } from 'vitest';

import type { DesktopVersionRemoteRelease } from '@process/services/enterprise/desktop-version/desktopVersionApiClient';
import {
  DesktopVersionGateway,
  type DesktopVersionGatewayApiClient,
  type DesktopVersionGatewayRuntime,
} from '@process/services/enterprise/desktop-version/desktopVersionGateway';
import type { DesktopVersionPolicyStore } from '@process/services/enterprise/desktop-version/desktopVersionPolicyStore';

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
  getPath: vi.fn((name) =>
    name === 'userData' ? 'C:\\Users\\demo\\AppData\\LianLiaoAIPC' : 'C:\\Users\\demo\\Downloads'
  ),
  getVersion: vi.fn(() => '2.1.27'),
  openPath: vi.fn(async () => ''),
  platform: 'win32',
  quit: vi.fn(),
});

const makeApiClient = (): DesktopVersionGatewayApiClient => ({
  getPolicy: vi.fn(async () => remoteRelease),
});

const makePolicyStore = (cached: DesktopVersionRemoteRelease | null = null): DesktopVersionPolicyStore => ({
  clearMandatory: vi.fn(async () => undefined),
  loadMandatory: vi.fn(async () => cached),
  saveMandatory: vi.fn(async () => undefined),
});

describe('DesktopVersionGateway', () => {
  it('keeps installer URL and hash out of the renderer-visible update check', async () => {
    const apiClient = makeApiClient();
    const gateway = new DesktopVersionGateway({
      apiClient,
      policyStore: makePolicyStore(),
      runtime: makeRuntime(),
    });

    const result = await gateway.check();

    expect(result).toMatchObject({
      currentVersion: '2.1.27',
      updateAvailable: true,
      release: { versionName: '2.1.28', forceUpdate: true, platform: 'WINDOWS' },
    });
    expect(JSON.stringify(result)).not.toContain(remoteRelease.packageInfo.downloadUrl);
    expect(JSON.stringify(result)).not.toContain(remoteRelease.packageInfo.sha256);
    expect(apiClient.getPolicy).toHaveBeenCalledWith('2.1.27', 'WINDOWS', 'X64');
  });

  it('downloads only the cached server-selected artifact into the private update cache', async () => {
    const runtime = makeRuntime();
    const downloader = vi.fn(async () => ({
      fileName: 'lianliao-ai-2.1.28.exe',
      filePath: 'C:\\Users\\demo\\Downloads\\lianliao-ai-2.1.28.exe',
    }));
    const gateway = new DesktopVersionGateway({
      apiClient: makeApiClient(),
      downloader,
      policyStore: makePolicyStore(),
      runtime,
    });

    await gateway.check();
    const downloaded = await gateway.downloadLatest();
    const opened = await gateway.openDownloadedInstaller();

    expect(downloader).toHaveBeenCalledWith({
      downloadsDirectory: 'C:\\Users\\demo\\AppData\\LianLiaoAIPC\\updates',
      release: remoteRelease,
    });
    expect(runtime.openPath).toHaveBeenCalledWith(downloaded.filePath);
    expect(opened).toEqual({ opened: true });
  });

  it('enforces a cached mandatory policy when the network lookup fails', async () => {
    const apiClient: DesktopVersionGatewayApiClient = {
      getPolicy: vi.fn(async () => {
        throw new Error('offline');
      }),
    };
    const gateway = new DesktopVersionGateway({
      apiClient,
      policyStore: makePolicyStore(remoteRelease),
      runtime: makeRuntime(),
    });

    const result = await gateway.check();

    expect(result.release?.forceUpdate).toBe(true);
    expect(result.updateAvailable).toBe(true);
  });

  it('rejects an invalid Windows signature before launching a required installer', async () => {
    const runtime = makeRuntime();
    const gateway = new DesktopVersionGateway({
      apiClient: makeApiClient(),
      downloader: vi.fn(async () => ({ fileName: 'installer.exe', filePath: 'C:\\cache\\installer.exe' })),
      isPackaged: true,
      policyStore: makePolicyStore(),
      runtime,
      signatureVerifier: vi.fn(async () => 'INVALID'),
    });
    await gateway.check();
    await gateway.downloadLatest();

    await expect(gateway.installRequiredUpdate()).rejects.toMatchObject({ code: 'SIGNATURE_INVALID' });
    expect(runtime.openPath).not.toHaveBeenCalled();
    expect(runtime.quit).not.toHaveBeenCalled();
  });

  it('launches a verified required installer and exits the outdated process', async () => {
    const runtime = makeRuntime();
    const gateway = new DesktopVersionGateway({
      apiClient: makeApiClient(),
      downloader: vi.fn(async () => ({ fileName: 'installer.exe', filePath: 'C:\\cache\\installer.exe' })),
      isPackaged: true,
      policyStore: makePolicyStore(),
      runtime,
      signatureVerifier: vi.fn(async () => 'VALID'),
    });
    await gateway.check();
    await gateway.downloadLatest();

    await expect(gateway.installRequiredUpdate()).resolves.toEqual({ launched: true });
    expect(runtime.openPath).toHaveBeenCalledWith('C:\\cache\\installer.exe');
    expect(runtime.quit).toHaveBeenCalledOnce();
  });

  it('keeps unsigned installers compatible while SHA256 and size validation remain mandatory', async () => {
    const runtime = makeRuntime();
    const gateway = new DesktopVersionGateway({
      apiClient: makeApiClient(),
      downloader: vi.fn(async () => ({ fileName: 'installer.exe', filePath: 'C:\\cache\\installer.exe' })),
      isPackaged: true,
      policyStore: makePolicyStore(),
      runtime,
      signatureVerifier: vi.fn(async () => 'UNSIGNED'),
    });
    await gateway.check();
    await gateway.downloadLatest();

    await expect(gateway.installRequiredUpdate()).resolves.toEqual({ launched: true });
    expect(runtime.openPath).toHaveBeenCalledWith('C:\\cache\\installer.exe');
    expect(runtime.quit).toHaveBeenCalledOnce();
  });
});
