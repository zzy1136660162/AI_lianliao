import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DesktopVersionApiClient } from '@process/services/enterprise/desktop-version/desktopVersionApiClient';
import type { DesktopVersionApiError } from '@process/services/enterprise/desktop-version/desktopVersionApiClient';

const { electronNetFetch } = vi.hoisted(() => ({ electronNetFetch: vi.fn() }));

vi.mock('electron', () => ({ net: { fetch: electronNetFetch } }));

const response = {
  code: 2000,
  message: 'success',
  success: true,
  data: {
    available: true,
    version: {
      id: '701',
      versionCode: 2026072101,
      versionName: '2.1.28',
      releaseNotes: 'Desktop release notes',
      forceUpdate: false,
      status: 'PUBLISHED',
      publishedAt: 1_700_000_000_000,
    },
    package: {
      id: '801',
      platform: 'WINDOWS',
      architecture: 'X64',
      downloadUrl: 'https://downloads.example.com/lianliao-ai-2.1.28.exe',
      sha256: 'a3e214d9cf9611c91e410a2e5c6a67d354676eeec65e4c6fcbbe67f1019cf845',
      sizeBytes: 1024,
    },
  },
};

describe('DesktopVersionApiClient', () => {
  beforeEach(() => {
    electronNetFetch.mockReset();
  });

  it('checks the fixed local policy API with the main-process version and runtime selection', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
    const client = new DesktopVersionApiClient({ baseUrl: 'http://127.0.0.1:12580/', fetchImpl });

    const release = await client.getPolicy('2.1.27', 'WINDOWS', 'X64');

    expect(release?.version.versionName).toBe('2.1.28');
    expect(release?.packageInfo.downloadUrl).toContain('downloads.example.com');
    const [url, options] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:12580/cloud-api/DesktopVersionController/getPolicy');
    expect(options.body).toBe(JSON.stringify({ currentVersion: '2.1.27', platform: 'WINDOWS', architecture: 'X64' }));
    expect(options.body).not.toContain('openId');
  });

  it('uses Electron net.fetch by default so version checks inherit the application proxy', async () => {
    electronNetFetch.mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    const client = new DesktopVersionApiClient({ baseUrl: 'https://cloud.lslnii.com/' });

    await expect(client.getPolicy('2.1.27', 'WINDOWS', 'X64')).resolves.toBeTruthy();

    expect(electronNetFetch).toHaveBeenCalledWith(
      'https://cloud.lslnii.com/cloud-api/DesktopVersionController/getPolicy',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('rejects a successful envelope that omits package metadata', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ...response, data: { available: true } }), { status: 200 })
    );
    const client = new DesktopVersionApiClient({ baseUrl: 'http://127.0.0.1:12580/', fetchImpl });

    await expect(client.getPolicy('2.1.27', 'WINDOWS', 'X64')).rejects.toEqual(
      expect.objectContaining<Partial<DesktopVersionApiError>>({ code: 'INVALID_RESPONSE' })
    );
  });
});
