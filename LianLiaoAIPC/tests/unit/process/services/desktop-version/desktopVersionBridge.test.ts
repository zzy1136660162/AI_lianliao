import { describe, expect, it, vi } from 'vitest';

import { DESKTOP_VERSION_IPC_CHANNELS } from '@/common/enterprise/desktop-version/constants';
import type {
  DesktopVersionCheckResult,
  DesktopVersionDownloadResult,
  DesktopVersionOpenDownloadedResult,
} from '@/common/enterprise/desktop-version/contracts';
import {
  initDesktopVersionBridge,
  type DesktopVersionBridgeGateway,
  type DesktopVersionIpcMain,
} from '@process/bridge/enterpriseBridge';

const checkResult: DesktopVersionCheckResult = {
  checkedAt: 1_700_000_000_000,
  currentVersion: '2.1.27',
  release: {
    architecture: 'X64',
    forceUpdate: false,
    packageSizeBytes: 1024,
    platform: 'WINDOWS',
    publishedAt: 1_700_000_000_000,
    releaseNotes: null,
    versionCode: 2026072101,
    versionId: '701',
    versionName: '2.1.28',
  },
  updateAvailable: true,
};

const makeIpcMain = () => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  const ipcMain: DesktopVersionIpcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  };
  return { handlers, ipcMain };
};

const makeGateway = (): DesktopVersionBridgeGateway => ({
  check: vi.fn(async (): Promise<DesktopVersionCheckResult> => checkResult),
  downloadLatest: vi.fn(
    async (): Promise<DesktopVersionDownloadResult> => ({
      fileName: 'lianliao-ai-2.1.28.exe',
      filePath: 'C:\\Users\\demo\\Downloads\\lianliao-ai-2.1.28.exe',
    })
  ),
  openDownloadedInstaller: vi.fn(async (): Promise<DesktopVersionOpenDownloadedResult> => ({ opened: true })),
});

describe('desktop-version IPC bridge', () => {
  it('rejects untrusted renderers before release lookup', async () => {
    const { handlers, ipcMain } = makeIpcMain();
    const gateway = makeGateway();
    initDesktopVersionBridge({ gateway, ipcMain, senderGuard: () => false });

    const result = await handlers.get(DESKTOP_VERSION_IPC_CHANNELS.CHECK)?.({});

    expect(result).toMatchObject({ ok: false, error: { code: 'UNTRUSTED_SENDER' } });
    expect(gateway.check).not.toHaveBeenCalled();
  });

  it('accepts no renderer-provided fields and never exposes raw installer metadata', async () => {
    const { handlers, ipcMain } = makeIpcMain();
    const gateway = makeGateway();
    initDesktopVersionBridge({ gateway, ipcMain, senderGuard: () => true });

    const forged = await handlers.get(DESKTOP_VERSION_IPC_CHANNELS.DOWNLOAD)?.({}, { url: 'https://forged.example' });
    const result = await handlers.get(DESKTOP_VERSION_IPC_CHANNELS.CHECK)?.({});

    expect(forged).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(gateway.downloadLatest).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, data: checkResult });
    expect(JSON.stringify(result)).not.toContain('downloadUrl');
    expect(JSON.stringify(result)).not.toContain('sha256');
  });
});
