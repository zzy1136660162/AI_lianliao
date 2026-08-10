import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DesktopVersionRemoteRelease } from '@process/services/enterprise/desktop-version/desktopVersionApiClient';
import { createDesktopVersionPolicyStore } from '@process/services/enterprise/desktop-version/desktopVersionPolicyStore';

const mandatoryRelease: DesktopVersionRemoteRelease = {
  version: {
    id: '701',
    versionCode: 2026081001,
    versionName: '2.1.33',
    releaseNotes: null,
    forceUpdate: true,
    publishedAt: 1_700_000_000_000,
  },
  packageInfo: {
    id: '801',
    platform: 'WINDOWS',
    architecture: 'X64',
    downloadUrl: 'https://downloads.example.com/LianLiaoAIPC-2.1.33-win-x64.exe',
    sha256: 'a3e214d9cf9611c91e410a2e5c6a67d354676eeec65e4c6fcbbe67f1019cf845',
    sizeBytes: 1024,
  },
};

describe('desktop mandatory policy store', () => {
  let userDataDirectory: string;

  beforeEach(async () => {
    userDataDirectory = await mkdtemp(path.join(tmpdir(), 'lianliao-policy-store-'));
  });

  afterEach(async () => {
    await rm(userDataDirectory, { force: true, recursive: true });
  });

  it('persists and clears only schema-valid mandatory release metadata', async () => {
    const store = createDesktopVersionPolicyStore(userDataDirectory);

    await store.saveMandatory(mandatoryRelease);
    expect(await store.loadMandatory()).toEqual(mandatoryRelease);
    await store.clearMandatory();
    expect(await store.loadMandatory()).toBeNull();
  });

  it('ignores a corrupted local policy instead of treating it as mandatory', async () => {
    const store = createDesktopVersionPolicyStore(userDataDirectory);
    const updatesDirectory = path.join(userDataDirectory, 'updates');
    await store.saveMandatory(mandatoryRelease);
    await writeFile(path.join(updatesDirectory, 'mandatory-policy.json'), '{"forceUpdate":true}', 'utf8');

    expect(await store.loadMandatory()).toBeNull();
    expect(await readFile(path.join(updatesDirectory, 'mandatory-policy.json'), 'utf8')).toContain('forceUpdate');
  });

  it('rejects attempts to cache an optional update as an offline mandate', async () => {
    const store = createDesktopVersionPolicyStore(userDataDirectory);

    await expect(
      store.saveMandatory({ ...mandatoryRelease, version: { ...mandatoryRelease.version, forceUpdate: false } })
    ).rejects.toThrow('Only mandatory');
    expect(await store.loadMandatory()).toBeNull();
  });
});
