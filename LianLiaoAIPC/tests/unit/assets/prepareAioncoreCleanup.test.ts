import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const {
  cleanupGeneratedRuntimeDirectories,
  moveExistingDirectoryAside,
  prepareAioncore,
  sha256File,
  tryReusePreparedAioncore,
  tryTrustLocalPreparedAioncore,
} = require('../../../packages/shared-scripts/src/prepare-aioncore');
const temporaryRoots: string[] = [];

const lock = {
  repository: 'zzy1136660162/AI_lianliao',
  version: 'v0.1.48',
  releaseTag: 'aicore-v0.1.48',
};
const asset = {
  name: 'lianliao-aicore-v0.1.48-x86_64-pc-windows-msvc.zip',
  sha256: '99426d0c5b551da7adc1ffcacfbbd6a280c46b723a33b5f52f906eb72a94eb91',
};

function writeFile(filePath: string, content = '') {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function writeJson(filePath: string, value: unknown) {
  writeFile(filePath, JSON.stringify(value));
}

function createPreparedCache(root: string) {
  const targetDir = join(root, 'resources', 'bundled-aioncore', 'win32-x64');
  const binaryPath = join(targetDir, 'aioncore.exe');
  writeFile(binaryPath, 'verified-core');
  writeJson(join(targetDir, 'manifest.json'), {
    platform: 'win32',
    arch: 'x64',
    version: lock.version,
    sourceType: 'locked-release',
    source: {
      repository: lock.repository,
      releaseTag: lock.releaseTag,
      assetName: asset.name,
      expectedSha256: asset.sha256,
      actualSha256: asset.sha256,
    },
  });

  writeFile(join(targetDir, 'managed-resources', 'node', 'node-v24.11.0-win-x64', 'node.exe'));

  const tools = [
    {
      id: 'codex-acp',
      entrypoint: 'node_modules/@agentclientprotocol/codex-acp/dist/index.js',
      executable: 'node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe',
    },
    {
      id: 'claude-agent-acp',
      entrypoint: 'node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js',
      executable: 'node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
    },
  ];

  for (const tool of tools) {
    const platformRoot = join(targetDir, 'managed-resources', 'acp', tool.id, '1.0.0', 'win32-x64');
    writeJson(join(platformRoot, 'manifest.json'), { entrypoint: tool.entrypoint });
    writeFile(join(platformRoot, tool.entrypoint));
    writeJson(join(platformRoot, 'package.json'), {});
    writeJson(join(platformRoot, 'package-lock.json'), {});
    writeFile(join(platformRoot, tool.executable));
  }

  return { targetDir, binaryPath };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('prepareAioncore cleanup', () => {
  it('moves an existing runtime directory aside before a replacement build', () => {
    const root = mkdtempSync(join(tmpdir(), 'aionui-aioncore-cleanup-'));
    temporaryRoots.push(root);
    const runtimeDir = join(root, 'win32-x64');
    mkdirSync(runtimeDir);

    const backupDir = moveExistingDirectoryAside(runtimeDir);

    expect(existsSync(runtimeDir)).toBe(false);
    expect(backupDir).not.toBeNull();
    expect(existsSync(backupDir!)).toBe(true);
  });

  it('removes abandoned generated directories without touching valid or unrelated directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'aionui-aioncore-generated-'));
    temporaryRoots.push(root);
    mkdirSync(join(root, 'win32-x64'));
    mkdirSync(join(root, 'win32-x64.preparing-2147483647'));
    mkdirSync(join(root, 'win32-x64.stale-1-2147483647'));
    mkdirSync(join(root, 'notes.preparing-2147483647'));

    const result = cleanupGeneratedRuntimeDirectories(root);

    expect(result.removed.toSorted()).toEqual(['win32-x64.preparing-2147483647', 'win32-x64.stale-1-2147483647']);
    expect(existsSync(join(root, 'win32-x64'))).toBe(true);
    expect(existsSync(join(root, 'notes.preparing-2147483647'))).toBe(true);
  });

  it('preserves the active build preparation directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'aionui-aioncore-active-'));
    temporaryRoots.push(root);
    const activeDirectory = join(root, `win32-x64.preparing-${process.pid}`);
    mkdirSync(activeDirectory);

    const result = cleanupGeneratedRuntimeDirectories(root);

    expect(result.skippedActive).toEqual([`win32-x64.preparing-${process.pid}`]);
    expect(existsSync(activeDirectory)).toBe(true);
  });

  it('reuses a complete locked-release cache and upgrades its legacy manifest hash', () => {
    const root = mkdtempSync(join(tmpdir(), 'aionui-aioncore-cache-'));
    temporaryRoots.push(root);
    const { targetDir, binaryPath } = createPreparedCache(root);

    const result = tryReusePreparedAioncore({
      targetDir,
      platform: 'win32',
      arch: 'x64',
      lock,
      asset,
      isReleaseBuild: false,
      localBinaryPath: '',
      actionsRunId: '',
    });

    const manifest = JSON.parse(readFileSync(join(targetDir, 'manifest.json'), 'utf8')) as { binarySha256?: string };
    expect(result).toEqual(expect.objectContaining({ cached: true, dir: targetDir }));
    expect(manifest.binarySha256).toBe(sha256File(binaryPath));
  });

  it('trusts local prepared resources without reading a Release manifest or SHA256', () => {
    const root = mkdtempSync(join(tmpdir(), 'aionui-aioncore-trusted-local-'));
    temporaryRoots.push(root);
    const targetDir = join(root, 'resources', 'bundled-aioncore', 'win32-x64');
    writeFile(join(targetDir, 'aioncore.exe'), 'local-core');
    mkdirSync(join(targetDir, 'managed-resources'), { recursive: true });

    const result = tryTrustLocalPreparedAioncore({
      targetDir,
      platform: 'win32',
      enabled: true,
      isReleaseBuild: false,
    });

    expect(result).toEqual(expect.objectContaining({ trustedLocal: true, dir: targetDir }));
  });

  it('does not trust incomplete local Core resources', () => {
    const root = mkdtempSync(join(tmpdir(), 'aionui-aioncore-incomplete-local-'));
    temporaryRoots.push(root);
    const targetDir = join(root, 'resources', 'bundled-aioncore', 'win32-x64');
    mkdirSync(join(targetDir, 'managed-resources'), { recursive: true });

    const result = tryTrustLocalPreparedAioncore({
      targetDir,
      platform: 'win32',
      enabled: true,
      isReleaseBuild: false,
    });

    expect(result).toBeNull();
  });

  it('rejects trusted-local mode in a formal release build', () => {
    const previousReleaseBuild = process.env.LIANLIAO_RELEASE_BUILD;
    const previousTrustPrepared = process.env.LIANLIAO_AICORE_TRUST_PREPARED;
    process.env.LIANLIAO_RELEASE_BUILD = '1';
    process.env.LIANLIAO_AICORE_TRUST_PREPARED = '1';

    try {
      expect(() =>
        prepareAioncore({
          projectRoot: 'unused-for-rejected-release-mode',
          platform: 'win32',
          arch: 'x64',
          version: 'unused',
        })
      ).toThrow('LIANLIAO_AICORE_TRUST_PREPARED is not allowed in a release build');
    } finally {
      if (previousReleaseBuild === undefined) delete process.env.LIANLIAO_RELEASE_BUILD;
      else process.env.LIANLIAO_RELEASE_BUILD = previousReleaseBuild;
      if (previousTrustPrepared === undefined) delete process.env.LIANLIAO_AICORE_TRUST_PREPARED;
      else process.env.LIANLIAO_AICORE_TRUST_PREPARED = previousTrustPrepared;
    }
  });

  it('rejects a prepared cache whose Core binary hash changed', () => {
    const root = mkdtempSync(join(tmpdir(), 'aionui-aioncore-tampered-'));
    temporaryRoots.push(root);
    const { targetDir } = createPreparedCache(root);
    const manifestPath = join(targetDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    writeJson(manifestPath, { ...manifest, binarySha256: '0'.repeat(64) });

    const result = tryReusePreparedAioncore({
      targetDir,
      platform: 'win32',
      arch: 'x64',
      lock,
      asset,
      isReleaseBuild: false,
      localBinaryPath: '',
      actionsRunId: '',
    });

    expect(result).toBeNull();
  });

  it('bypasses the prepared cache for formal release builds', () => {
    const root = mkdtempSync(join(tmpdir(), 'aionui-aioncore-release-'));
    temporaryRoots.push(root);
    const { targetDir } = createPreparedCache(root);

    const result = tryReusePreparedAioncore({
      targetDir,
      platform: 'win32',
      arch: 'x64',
      lock,
      asset,
      isReleaseBuild: true,
      localBinaryPath: '',
      actionsRunId: '',
    });

    expect(result).toBeNull();
  });
});
