import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesktopVersionRemoteRelease } from '@process/services/enterprise/desktop-version/desktopVersionApiClient';
import { downloadDesktopVersionInstaller } from '@process/services/enterprise/desktop-version/desktopVersionDownloader';

const electronFetchMock = vi.hoisted(() => vi.fn());
const nodeFetchMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  net: {
    fetch: electronFetchMock,
  },
}));

const makeRelease = (content: Uint8Array): DesktopVersionRemoteRelease => ({
  version: {
    id: '701',
    versionCode: 2026072101,
    versionName: '2.1.28',
    releaseNotes: null,
    forceUpdate: false,
    publishedAt: 1_700_000_000_000,
  },
  packageInfo: {
    id: '801',
    platform: 'WINDOWS',
    architecture: 'X64',
    downloadUrl: 'https://downloads.example.com/LianLiaoAIPC-2.1.28-win-x64.exe',
    sha256: createHash('sha256').update(content).digest('hex'),
    sizeBytes: content.byteLength,
  },
});

describe('desktop version installer download network boundary', () => {
  let downloadsDirectory: string;

  beforeEach(async () => {
    electronFetchMock.mockReset();
    nodeFetchMock.mockReset();
    nodeFetchMock.mockRejectedValue(new Error('Node fetch must not be used by Electron downloads'));
    vi.stubGlobal('fetch', nodeFetchMock);
    downloadsDirectory = await mkdtemp(path.join(tmpdir(), 'lianliao-version-download-'));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(downloadsDirectory, { force: true, recursive: true });
  });

  it('downloads through the Electron default-session network stack', async () => {
    const content = new TextEncoder().encode('proxy-aware-installer');
    const release = makeRelease(content);
    electronFetchMock.mockResolvedValue(new Response(content, { status: 200 }));

    const result = await downloadDesktopVersionInstaller({ downloadsDirectory, release });

    expect(await readFile(result.filePath)).toEqual(Buffer.from(content));
    expect(electronFetchMock).toHaveBeenCalledWith(release.packageInfo.downloadUrl, { redirect: 'manual' });
    expect(nodeFetchMock).not.toHaveBeenCalled();
  });

  it('preserves the download error and removes partial files when Electron networking fails', async () => {
    const content = new TextEncoder().encode('installer');
    electronFetchMock.mockRejectedValue(new Error('proxy connection failed'));

    await expect(
      downloadDesktopVersionInstaller({
        downloadsDirectory,
        release: makeRelease(content),
      })
    ).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
    });
    expect(await readdir(downloadsDirectory)).toEqual([]);
    expect(nodeFetchMock).not.toHaveBeenCalled();
  });
});
