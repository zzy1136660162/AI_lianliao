import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const projectRoot = resolve(__dirname, '../../..');
const releaseLockTools = require(resolve(projectRoot, 'scripts/verifyAioncoreReleaseLock.js')) as {
  getLockedAsset(
    root: string,
    runtimeKey: string,
    options?: { requireChecksum?: boolean }
  ): {
    lock: { repository: string; version: string; releaseTag: string };
    asset: { name: string; sha256: string };
  };
  loadReleaseLock(root: string): {
    lock: {
      repository: string;
      version: string;
      releaseTag: string;
      assets: Record<string, { name: string; sha256: string }>;
    };
  };
};
const prepareTools = require(resolve(projectRoot, 'packages/shared-scripts/src/prepare-aioncore.js')) as {
  assertSha256(filePath: string, expectedSha256: string): string;
  getDownloadUrl(assetName: string, releaseTag: string): string;
  getGitHubAuthenticationHint(): string;
  getReleaseAssetApiPath(assetId: number): string;
  getReleaseByTagApiPath(releaseTag: string): string;
  sha256File(filePath: string): string;
};

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('LianLiaoAICore release lock', () => {
  it('pins the current repository, release tag, and four platform assets', () => {
    const { lock } = releaseLockTools.loadReleaseLock(projectRoot);

    expect(lock.repository).toBe('zzy1136660162/AI_lianliao');
    expect(lock.version).toBe('v0.1.47');
    expect(lock.releaseTag).toBe('aicore-v0.1.47');
    expect(Object.keys(lock.assets).toSorted()).toEqual(['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64']);
    expect(Object.values(lock.assets).every((asset) => asset.name.startsWith('lianliao-aicore-v0.1.47-'))).toBe(true);
  });

  it('resolves formal assets only with a published SHA256', () => {
    const { asset } = releaseLockTools.getLockedAsset(projectRoot, 'win32-x64');

    expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(asset.sha256).toBe('bb866d05163f19837e8685646ea799daeee977c6abb698d9b87927cbe8cf6a18');
  });

  it('builds download URLs only from the Chain Liao repository', () => {
    expect(prepareTools.getDownloadUrl('lianliao-aicore-v0.1.47-x86_64-pc-windows-msvc.zip', 'aicore-v0.1.47')).toBe(
      'https://github.com/zzy1136660162/AI_lianliao/releases/download/aicore-v0.1.47/lianliao-aicore-v0.1.47-x86_64-pc-windows-msvc.zip'
    );
    expect(prepareTools.getReleaseByTagApiPath('aicore-v0.1.47')).toBe(
      'repos/zzy1136660162/AI_lianliao/releases/tags/aicore-v0.1.47'
    );
    expect(prepareTools.getReleaseAssetApiPath(123456)).toBe('repos/zzy1136660162/AI_lianliao/releases/assets/123456');
  });

  it('explains private release authentication without storing a token', () => {
    const hint = prepareTools.getGitHubAuthenticationHint();

    expect(hint).toContain('gh auth login');
    expect(hint).toContain('GH_TOKEN/GITHUB_TOKEN');
    expect(hint).toContain('HTTPS_PROXY/HTTP_PROXY');
    expect(hint).toContain('Never commit');
  });

  it('accepts the correct SHA256 and rejects a mismatch', () => {
    const root = mkdtempSync(join(tmpdir(), 'lianliao-aicore-hash-'));
    temporaryRoots.push(root);
    const filePath = join(root, 'asset.zip');
    writeFileSync(filePath, 'verified-core-asset', 'utf8');
    const expected = prepareTools.sha256File(filePath);

    expect(prepareTools.assertSha256(filePath, expected)).toBe(expected);
    expect(() => prepareTools.assertSha256(filePath, '0'.repeat(64))).toThrow('LianLiaoAICore SHA256 mismatch');
  });

  it('contains no upstream or latest fallback in the production resolver', () => {
    const prepareSource = readFileSync(resolve(projectRoot, 'packages/shared-scripts/src/prepare-aioncore.js'), 'utf8');
    const resolverSource = readFileSync(resolve(projectRoot, 'scripts/resolveAioncoreVersion.js'), 'utf8');

    expect(prepareSource).not.toContain("const GITHUB_OWNER = 'iOfficeAI'");
    expect(prepareSource).not.toContain("const GITHUB_REPO = 'AionCore'");
    expect(prepareSource).not.toContain('resolveLatestTag');
    expect(resolverSource).not.toContain("return 'latest'");
  });
});
