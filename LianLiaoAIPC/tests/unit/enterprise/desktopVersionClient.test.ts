import { describe, expect, it } from 'vitest';

import type { DesktopVersionCheckResult } from '@/common/enterprise/desktop-version/contracts';
import { createDesktopVersionClient } from '@/renderer/services/enterprise/desktop-version/desktopVersionClient';
import type { DesktopVersionRendererError } from '@/renderer/services/enterprise/desktop-version/desktopVersionClient';

const result: DesktopVersionCheckResult = {
  checkedAt: 1_700_000_000_000,
  currentVersion: '2.1.27',
  release: null,
  updateAvailable: false,
};

describe('desktop version renderer client', () => {
  it('accepts a validated main-process response without requiring a renderer OpenID or download URL', async () => {
    const client = createDesktopVersionClient(() => ({
      check: async () => ({ ok: true, data: result }),
      download: async () => ({
        ok: true,
        data: { fileName: 'installer.exe', filePath: 'C:\\Downloads\\installer.exe' },
      }),
      openDownloaded: async () => ({ ok: true, data: { opened: true } }),
      installRequired: async () => ({ ok: true, data: { launched: true } }),
    }));

    await expect(client.check()).resolves.toEqual(result);
    await expect(client.download()).resolves.toEqual({
      fileName: 'installer.exe',
      filePath: 'C:\\Downloads\\installer.exe',
    });
  });

  it('rebuilds an untrusted error response from the fixed error map', async () => {
    const client = createDesktopVersionClient(() => ({
      check: async () => ({ ok: false, error: { code: 'NETWORK', message: 'forged error text' } }),
      download: async () => ({
        ok: true,
        data: { fileName: 'installer.exe', filePath: 'C:\\Downloads\\installer.exe' },
      }),
      openDownloaded: async () => ({ ok: true, data: { opened: true } }),
      installRequired: async () => ({ ok: true, data: { launched: true } }),
    }));

    await expect(client.check()).rejects.toEqual(
      expect.objectContaining<Partial<DesktopVersionRendererError>>({
        code: 'INVALID_IPC_RESPONSE',
      })
    );
  });
});
