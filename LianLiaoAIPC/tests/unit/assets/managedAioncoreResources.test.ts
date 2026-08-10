import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const {
  copyVerifiedManagedResourcesForLocalCore,
  createManagedResourcesIntegrity,
  verifyManagedResourcesIntegrity,
} = require('../../../packages/shared-scripts/src/managed-aioncore-resources');

const temporaryRoots: string[] = [];
const bridgeIntegrity =
  'sha512-qE/R1WdqJJ9OFHsHGvbmVmS2j9iCMZzpWT3g2XIViXrGHu1fLOALLINBIlW+WzKDllCh131aB6cqcIWSt0otbw==';
const codexIntegrity =
  'sha512-wk+2CWiBNXiJLBoN2D08N9RceWkSBnlgk5g2K1a4CXrP/C0gdlHyRUG7RFzm9y41DCK/7tvCct233JVxyFmznw==';
const platformIntegrity =
  'sha512-dN39VnjEthKz5io1RNWwZDtErdSn07nW3pGUgvlA6DMxgm/nuGaIAZO/sG/Hgxq/x5j9HteAENfrFgVkpZ0lFg==';

function writeFile(filePath: string, content = '') {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function writeJson(filePath: string, value: unknown) {
  writeFile(filePath, JSON.stringify(value));
}

function createFixture(root: string) {
  const projectRoot = join(root, 'LianLiaoAIPC');
  const targetDir = join(projectRoot, 'resources', 'bundled-aioncore', 'win32-x64');
  const stagingDir = `${targetDir}.preparing-test`;
  const dependencyLockPath = join(root, 'managed-acp-lock.json');
  const codexRoot = join(targetDir, 'managed-resources', 'acp', 'codex-acp', '1.1.2', 'win32-x64');
  const executable = 'node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe';

  writeJson(dependencyLockPath, {
    schemaVersion: 1,
    codexAcp: {
      bridge: { package: '@agentclientprotocol/codex-acp', version: '1.1.2', integrity: bridgeIntegrity },
      codexCli: { package: '@openai/codex', version: '0.144.6', integrity: codexIntegrity },
      platforms: {
        'win32-x64': {
          aliasPackage: '@openai/codex-win32-x64',
          package: '@openai/codex',
          version: '0.144.6-win32-x64',
          integrity: platformIntegrity,
          executable,
        },
      },
    },
  });
  writeJson(join(targetDir, 'managed-resources', 'manifest.json'), {
    schemaVersion: 1,
    runtimeKey: 'win32-x64',
    node: { version: '24.11.0', root: 'node/node-v24.11.0-win-x64', executable: 'node.exe' },
    acpTools: [
      {
        slug: 'codex-acp',
        version: '1.1.2',
        packageName: '@agentclientprotocol/codex-acp',
        root: 'acp/codex-acp/1.1.2/win32-x64',
        platformDirectory: 'win32-x64',
        manifest: 'manifest.json',
        entrypoint: 'node_modules/@agentclientprotocol/codex-acp/dist/index.js',
        pathEntries: ['node_modules/.bin'],
        requiredFiles: ['package.json', 'package-lock.json'],
        requiredDirectories: ['node_modules'],
        platformExecutable: executable,
      },
    ],
  });
  writeFile(join(targetDir, 'managed-resources', 'node', 'node-v24.11.0-win-x64', 'node.exe'), 'node');
  writeJson(join(codexRoot, 'manifest.json'), {
    entrypoint: 'node_modules/@agentclientprotocol/codex-acp/dist/index.js',
    path_entries: ['node_modules/.bin'],
  });
  writeJson(join(codexRoot, 'package.json'), {
    name: 'aionui-managed-acp-dev',
    dependencies: { '@agentclientprotocol/codex-acp': '1.1.2' },
  });
  writeJson(join(codexRoot, 'package-lock.json'), {
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { '@agentclientprotocol/codex-acp': '1.1.2' } },
      'node_modules/@agentclientprotocol/codex-acp': { version: '1.1.2', integrity: bridgeIntegrity },
      'node_modules/@openai/codex': { version: '0.144.6', integrity: codexIntegrity },
      'node_modules/@openai/codex-win32-x64': {
        name: '@openai/codex',
        version: '0.144.6-win32-x64',
        integrity: platformIntegrity,
      },
    },
  });
  writeJson(join(codexRoot, 'node_modules', '@agentclientprotocol', 'codex-acp', 'package.json'), {
    version: '1.1.2',
  });
  writeFile(join(codexRoot, 'node_modules', '@agentclientprotocol', 'codex-acp', 'dist', 'index.js'), 'bridge');
  writeJson(join(codexRoot, 'node_modules', '@openai', 'codex', 'package.json'), { version: '0.144.6' });
  writeJson(join(codexRoot, 'node_modules', '@openai', 'codex-win32-x64', 'package.json'), {
    version: '0.144.6-win32-x64',
  });
  writeFile(join(codexRoot, ...executable.split('/')), 'codex');
  mkdirSync(stagingDir, { recursive: true });

  return { projectRoot, targetDir, stagingDir, dependencyLockPath, codexRoot };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('managed AionCore resources', () => {
  it('reuses a locked legacy tree and upgrades its root dependency metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'lianliao-managed-reuse-'));
    temporaryRoots.push(root);
    const fixture = createFixture(root);

    const integrity = copyVerifiedManagedResourcesForLocalCore({
      ...fixture,
      runtimeKey: 'win32-x64',
    });

    const packageJson = JSON.parse(
      readFileSync(
        join(fixture.stagingDir, 'managed-resources', 'acp', 'codex-acp', '1.1.2', 'win32-x64', 'package.json'),
        'utf8'
      )
    );
    expect(packageJson.dependencies['@openai/codex']).toBe('0.144.6');
    expect(() => verifyManagedResourcesIntegrity(fixture.stagingDir, integrity)).not.toThrow();
  });

  it('rejects a previously verified tree after a managed file changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'lianliao-managed-tamper-'));
    temporaryRoots.push(root);
    const fixture = createFixture(root);
    const integrity = createManagedResourcesIntegrity(fixture.targetDir);
    writeFile(join(fixture.codexRoot, 'node_modules', '@openai', 'codex', 'package.json'), '{"version":"tampered"}');

    expect(() =>
      copyVerifiedManagedResourcesForLocalCore({
        ...fixture,
        runtimeKey: 'win32-x64',
        existingIntegrity: integrity,
      })
    ).toThrow('Managed resources integrity mismatch');
  });

  it('rejects a platform package whose npm integrity differs from the Core lock', () => {
    const root = mkdtempSync(join(tmpdir(), 'lianliao-managed-lock-'));
    temporaryRoots.push(root);
    const fixture = createFixture(root);
    const packageLockPath = join(fixture.codexRoot, 'package-lock.json');
    const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'));
    packageLock.packages['node_modules/@openai/codex-win32-x64'].integrity = 'sha512-tampered';
    writeJson(packageLockPath, packageLock);

    expect(() => copyVerifiedManagedResourcesForLocalCore({ ...fixture, runtimeKey: 'win32-x64' })).toThrow(
      'integrity mismatch'
    );
  });
});
