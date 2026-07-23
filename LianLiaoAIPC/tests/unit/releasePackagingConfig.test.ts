import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const projectRoot = resolve(__dirname, '../..');
// Git Bash and the nested Node hash helpers can start slowly on Windows,
// especially when endpoint security scans every temporary executable.
const releaseScriptTimeoutMs = process.platform === 'win32' ? 120_000 : 30_000;

function resolveBashExecutable(): string {
  const candidates: string[] = [];

  if (process.platform === 'win32') {
    const gitExecPathResult = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
    if (gitExecPathResult.status === 0 && typeof gitExecPathResult.stdout === 'string') {
      const gitExecPath = gitExecPathResult.stdout.trim();
      if (gitExecPath) candidates.push(resolve(gitExecPath, '../../..', 'bin', 'bash.exe'));
    }

    const whereGitResult = spawnSync('where.exe', ['git'], { encoding: 'utf8' });
    if (whereGitResult.status === 0 && typeof whereGitResult.stdout === 'string') {
      for (const gitPath of whereGitResult.stdout.split(/\r?\n/).filter(Boolean)) {
        const gitRoot = resolve(dirname(gitPath), '..');
        candidates.push(resolve(gitRoot, 'bin', 'bash.exe'), resolve(gitRoot, 'usr', 'bin', 'bash.exe'));
      }
    }

    for (const basePath of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
      if (basePath) candidates.push(resolve(basePath, 'Git', 'bin', 'bash.exe'));
    }
    if (process.env.LOCALAPPDATA) {
      candidates.push(resolve(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'));
    }
  } else {
    candidates.push('bash');
  }

  for (const candidate of new Set(candidates)) {
    if (process.platform === 'win32' && !existsSync(candidate)) continue;
    const versionResult = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (
      versionResult.status === 0 &&
      typeof versionResult.stdout === 'string' &&
      versionResult.stdout.includes('GNU bash')
    ) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate GNU Bash required for release packaging tests. Checked: ${candidates.join(', ') || 'bash on PATH'}`
  );
}

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), 'utf8');
}

function yamlBlock(content: string, key: string): string {
  const startMatch = content.match(new RegExp(`^${key}:\\s*$`, 'm'));
  if (!startMatch || startMatch.index === undefined) return '';

  const blockStart = startMatch.index + startMatch[0].length;
  const rest = content.slice(blockStart);
  const nextTopLevelKey = rest.search(/^[a-zA-Z][a-zA-Z0-9]*:\s*$/m);
  return nextTopLevelKey === -1 ? rest : rest.slice(0, nextTopLevelKey);
}

function metadataReferences(content: string): string[] {
  const references = [...content.matchAll(/^\s*-\s*url:\s*(.+)$/gm)].map((match) => match[1].trim());
  const pathReference = content.match(/^path:\s*(.+)$/m)?.[1]?.trim();
  if (pathReference) references.push(pathReference);
  return [...new Set(references)];
}

describe('release packaging configuration', () => {
  const bashExecutable = resolveBashExecutable();

  it('uses the LianLiaoAIPC package identity and full desktop product name', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      name?: string;
      productName?: string;
      desktopName?: string;
      executableName?: string;
      homepage?: string;
    };

    expect(packageJson.name).toBe('lianliao-ai-pc');
    expect(packageJson.productName).toBe('链上辽宁·产业云城 AI桌面平台');
    expect(packageJson.desktopName).toBe('com.lianliao.app.desktop');
    expect(packageJson.executableName).toBe('LianLiaoAIPC');
    // Linux DEB metadata is generated through electron-builder's FPM target,
    // which rejects packages that do not declare a public project homepage.
    expect(packageJson.homepage).toBe('https://github.com/zzy1136660162/AI_lianliao');
  });

  it('uses the full desktop identity in packaging', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');

    expect(config).toContain('productName: 链上辽宁·产业云城 AI桌面平台');
    expect(config).toContain('executableName: LianLiaoAIPC');
    expect(config).toContain('  - name: 链辽桌面平台协议');
    expect(config).toContain('      Name: 链上辽宁·产业云城 AI桌面平台');
    expect(config).toContain('      Icon: LianLiaoAIPC');
    expect(config).toContain('  syncDesktopName: true');
  });

  it('uses the new app identity while preserving installer and protocol compatibility', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');

    expect(config).toContain('appId: com.lianliao.app');
    expect(config).toContain('copyright: Copyright © 2026 链上辽宁·产业云城');
    expect(config).toContain('  guid: f3bfde38-8429-545c-a4e9-a078d87dee6c');
    expect(config).toContain('      - lianliao');
    expect(config).toContain('      - aionui');
    expect(config).toContain('  shortcutName: ${productName}');
    expect(config).toContain('  uninstallDisplayName: ${productName}');
    expect(config.match(/artifactName: LianLiaoAIPC-\$\{version\}-\$\{os\}-\$\{arch\}\.\$\{ext\}/g)).toHaveLength(4);
    expect(config).toContain('  maintainer: 链上辽宁·产业云城');
    expect(config).toContain('  vendor: 链上辽宁·产业云城');
    expect(config).toContain('  owner: zzy1136660162');
    expect(config).toContain('  repo: AI_lianliao');
    expect(config).toContain('  publishAutoUpdate: false');
  });

  it('keeps mac zip artifacts enabled', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const macBlock = yamlBlock(config, 'mac');

    expect(macBlock).toContain('    - dmg');
    expect(macBlock).toContain('    - zip');
  });

  it('disables DMG update metadata while keeping DMG packaging enabled', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const dmgBlock = yamlBlock(config, 'dmg');

    expect(dmgBlock).toContain('  writeUpdateInfo: false');
    expect(dmgBlock).toContain('  format: UDZO');
  });

  it('does not build Windows zip artifacts', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const winBlock = yamlBlock(config, 'win');

    expect(winBlock).toContain('    - nsis');
    expect(winBlock).not.toContain('    - zip');
  });

  it('uses stable ASCII desktop artifact names while retaining compatible updater references', () => {
    const createMockScript = readProjectFile('scripts/create-mock-release-artifacts.sh');
    const prepareScript = readProjectFile('scripts/prepare-release-assets.sh');
    const verifyScript = readProjectFile('scripts/verify-release-assets.sh');

    expect(createMockScript).toContain('windows-build-x64/LianLiaoAIPC-1.0.0-win-x64.exe');
    expect(createMockScript).toContain('url: AionUi-Setup-1.0.0.exe');
    expect(createMockScript).toContain('path: AionUi-1.0.0-mac.zip');
    expect(prepareScript).toContain('asset="LianLiaoAIPC-${VERSION}-mac-${arch}.${ext}"');
    expect(verifyScript).toContain('LianLiaoAIPC-1.0.0-win-x64.exe');
    expect(verifyScript).toContain('LianLiaoAIPC-1.0.0-arm64.deb');
    expect(verifyScript).not.toContain('AionUi-1.0.0');

    for (const script of [createMockScript, prepareScript, verifyScript]) {
      expect(script).toContain('aionui-web-');
    }
  });

  it('preserves legacy updater fixtures while using the Chain Liao release repository', () => {
    const cdnFixture = readProjectFile('tests/unit/updateBridgeCdnRewrite.test.ts');
    const installer = readProjectFile('scripts/install-ubuntu.sh');

    expect(cdnFixture).toContain('AionUi-1.9.22-mac-arm64.dmg');
    expect(installer).toContain('https://github.com/zzy1136660162/AI_lianliao/releases/download');
  });

  it('retries mac prepackaged builds with both dmg and zip targets', () => {
    const script = readProjectFile('scripts/build-with-builder.js');

    expect(script).toMatch(/--mac\s+dmg\s+zip\s+--\$\{targetArch\}\s+--prepackaged/);
  });

  it('streams release artifact hashing instead of loading installers into memory', () => {
    const prepareScript = readProjectFile('scripts/prepare-release-assets.sh');
    const verifyScript = readProjectFile('scripts/verify-release-assets.sh');

    expect(prepareScript).toContain('createReadStream');
    expect(verifyScript).toContain('createReadStream');
    expect(prepareScript).not.toContain("createHash('sha512').update(readFileSync(filePath))");
  });

  it(
    'prepares ASCII aliases for updater metadata without removing Unicode artifacts',
    () => {
      const tempDir = mkdtempSync(resolve(tmpdir(), 'aionui-release-assets-'));
      const artifactsDir = resolve(tempDir, 'build-artifacts');
      const outputDir = resolve(tempDir, 'release-assets');

      try {
        const env = { ...process.env, MOCK_VERSION: '1.0.0' };
        const createResult = spawnSync(bashExecutable, ['scripts/create-mock-release-artifacts.sh', artifactsDir], {
          cwd: projectRoot,
          env,
          encoding: 'utf8',
        });
        expect(createResult.status).toBe(0);
        expect(existsSync(resolve(artifactsDir, 'windows-build-x64', 'AionUi-Setup-1.0.0.exe'))).toBe(false);

        const prepareResult = spawnSync(
          bashExecutable,
          ['scripts/prepare-release-assets.sh', artifactsDir, outputDir],
          {
            cwd: projectRoot,
            env,
            encoding: 'utf8',
          }
        );
        expect(prepareResult.status).toBe(0);

        const verifyResult = spawnSync(bashExecutable, ['scripts/verify-release-assets.sh', outputDir], {
          cwd: projectRoot,
          env,
          encoding: 'utf8',
        });
        expect(verifyResult.status).toBe(0);

        const releaseContracts = [
          ['latest.yml', [['AionUi-Setup-1.0.0.exe', 'LianLiaoAIPC-1.0.0-win-x64.exe']]],
          ['latest-win-arm64.yml', [['AionUi-Setup-1.0.0-arm64.exe', 'LianLiaoAIPC-1.0.0-win-arm64.exe']]],
          ['latest-mac.yml', [['AionUi-1.0.0-mac.zip', 'LianLiaoAIPC-1.0.0-mac-x64.zip']]],
          ['latest-arm64-mac.yml', [['AionUi-1.0.0-arm64-mac.zip', 'LianLiaoAIPC-1.0.0-mac-arm64.zip']]],
          ['latest-linux.yml', [['AionUi-1.0.0-amd64.deb', 'LianLiaoAIPC-1.0.0.deb']]],
          ['latest-linux-arm64.yml', [['AionUi-1.0.0-arm64.deb', 'LianLiaoAIPC-1.0.0-arm64.deb']]],
        ] as const;

        for (const [metadataName, artifacts] of releaseContracts) {
          expect(metadataReferences(readFileSync(resolve(outputDir, metadataName), 'utf8'))).toEqual(
            artifacts.map(([aliasName]) => aliasName)
          );
          for (const [aliasName, unicodeName] of artifacts) {
            expect(existsSync(resolve(outputDir, aliasName))).toBe(true);
            expect(existsSync(resolve(outputDir, unicodeName))).toBe(true);
            expect(readFileSync(resolve(outputDir, aliasName))).toEqual(readFileSync(resolve(outputDir, unicodeName)));
          }
        }

        expect(existsSync(resolve(outputDir, 'LianLiaoAIPC-1.0.0-mac-x64.dmg'))).toBe(true);
        expect(existsSync(resolve(outputDir, 'LianLiaoAIPC-1.0.0-mac-arm64.dmg'))).toBe(true);
        expect(existsSync(resolve(outputDir, 'AionUi-1.0.0.dmg'))).toBe(false);
        expect(metadataReferences(readFileSync(resolve(outputDir, 'latest-mac.yml'), 'utf8'))).not.toContain(
          'AionUi-1.0.0.dmg'
        );
      } finally {
        rmSync(tempDir, { force: true, recursive: true });
      }
    },
    releaseScriptTimeoutMs
  );

  it(
    'fails verification when an updater alias no longer matches metadata sha512 and size',
    () => {
      const tempDir = mkdtempSync(resolve(tmpdir(), 'aionui-release-assets-'));
      const artifactsDir = resolve(tempDir, 'build-artifacts');
      const outputDir = resolve(tempDir, 'release-assets');

      try {
        const env = { ...process.env, MOCK_VERSION: '1.0.0' };
        const createResult = spawnSync(bashExecutable, ['scripts/create-mock-release-artifacts.sh', artifactsDir], {
          cwd: projectRoot,
          env,
          encoding: 'utf8',
        });
        expect(createResult.status).toBe(0);

        const prepareResult = spawnSync(
          bashExecutable,
          ['scripts/prepare-release-assets.sh', artifactsDir, outputDir],
          {
            cwd: projectRoot,
            env,
            encoding: 'utf8',
          }
        );
        expect(prepareResult.status).toBe(0);

        writeFileSync(resolve(outputDir, 'AionUi-1.0.0-mac.zip'), 'tampered-updater-alias');
        const verifyResult = spawnSync(bashExecutable, ['scripts/verify-release-assets.sh', outputDir], {
          cwd: projectRoot,
          env,
          encoding: 'utf8',
        });

        expect(verifyResult.status).not.toBe(0);
        expect(`${verifyResult.stdout}\n${verifyResult.stderr}`).toContain('sha512/size');
      } finally {
        rmSync(tempDir, { force: true, recursive: true });
      }
    },
    releaseScriptTimeoutMs
  );

  it(
    'rejects a sole same-extension source artifact when its metadata hash does not match',
    () => {
      const tempDir = mkdtempSync(resolve(tmpdir(), 'aionui-release-assets-'));
      const artifactsDir = resolve(tempDir, 'build-artifacts');
      const outputDir = resolve(tempDir, 'release-assets');

      try {
        const env = { ...process.env, MOCK_VERSION: '1.0.0' };
        const createResult = spawnSync(bashExecutable, ['scripts/create-mock-release-artifacts.sh', artifactsDir], {
          cwd: projectRoot,
          env,
          encoding: 'utf8',
        });
        expect(createResult.status).toBe(0);

        writeFileSync(resolve(artifactsDir, 'linux-build-x64', 'LianLiaoAIPC-1.0.0.deb'), 'mock-linux-x64-rpm');
        const prepareResult = spawnSync(
          bashExecutable,
          ['scripts/prepare-release-assets.sh', artifactsDir, outputDir],
          {
            cwd: projectRoot,
            env,
            encoding: 'utf8',
          }
        );

        expect(prepareResult.status).not.toBe(0);
        expect(`${prepareResult.stdout}\n${prepareResult.stderr}`).toContain('sha512/size');
      } finally {
        rmSync(tempDir, { force: true, recursive: true });
      }
    },
    releaseScriptTimeoutMs
  );

  it(
    'rejects unsafe metadata references without writing outside the output directory',
    () => {
      const tempDir = mkdtempSync(resolve(tmpdir(), 'aionui-release-assets-'));
      const artifactsDir = resolve(tempDir, 'build-artifacts');
      const outputDir = resolve(tempDir, 'release-assets');
      const escapedArtifact = resolve(outputDir, '..', 'escaped.exe');

      try {
        const env = { ...process.env, MOCK_VERSION: '1.0.0' };
        const createResult = spawnSync(bashExecutable, ['scripts/create-mock-release-artifacts.sh', artifactsDir], {
          cwd: projectRoot,
          env,
          encoding: 'utf8',
        });
        expect(createResult.status).toBe(0);

        const metadataPath = resolve(artifactsDir, 'windows-build-x64', 'latest.yml');
        writeFileSync(
          metadataPath,
          readFileSync(metadataPath, 'utf8').replaceAll('AionUi-Setup-1.0.0.exe', '../escaped.exe')
        );
        const prepareResult = spawnSync(
          bashExecutable,
          ['scripts/prepare-release-assets.sh', artifactsDir, outputDir],
          {
            cwd: projectRoot,
            env,
            encoding: 'utf8',
          }
        );

        expect(prepareResult.status).not.toBe(0);
        expect(`${prepareResult.stdout}\n${prepareResult.stderr}`).toContain('Unsafe updater artifact reference');
        expect(existsSync(escapedArtifact)).toBe(false);
      } finally {
        rmSync(tempDir, { force: true, recursive: true });
      }
    },
    releaseScriptTimeoutMs
  );

  it(
    'fails release asset preparation when a mac zip is missing',
    () => {
      const tempDir = mkdtempSync(resolve(tmpdir(), 'aionui-release-assets-'));
      const artifactsDir = resolve(tempDir, 'build-artifacts');
      const outputDir = resolve(tempDir, 'release-assets');

      try {
        const env = { ...process.env, MOCK_VERSION: '1.0.0' };
        const createResult = spawnSync(bashExecutable, ['scripts/create-mock-release-artifacts.sh', artifactsDir], {
          cwd: projectRoot,
          env,
          encoding: 'utf8',
        });
        expect(createResult.status).toBe(0);

        rmSync(resolve(artifactsDir, 'macos-build-arm64', 'LianLiaoAIPC-1.0.0-mac-arm64.zip'), { force: true });

        const prepareResult = spawnSync(
          bashExecutable,
          ['scripts/prepare-release-assets.sh', artifactsDir, outputDir],
          {
            cwd: projectRoot,
            env,
            encoding: 'utf8',
          }
        );

        expect(prepareResult.status).not.toBe(0);
        expect(`${prepareResult.stdout}\n${prepareResult.stderr}`).toContain('Missing macOS zip artifact');
      } finally {
        rmSync(tempDir, { force: true, recursive: true });
      }
    },
    releaseScriptTimeoutMs
  );
});
