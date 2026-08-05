import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopRoot = resolve(__dirname, '../../..');
const repositoryRoot = resolve(desktopRoot, '..');
const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/lianliao-aipc-release.yml'), 'utf8');

interface ReleaseMatrixEntry {
  key: string;
  runner: string;
  runtime: string;
  command: string;
  source_suffixes: string;
  asset_suffixes: string;
}

const readScopeMatrix = (scope: 'all' | 'windows-x64'): ReleaseMatrixEntry[] => {
  const scopeSection = workflow.slice(workflow.indexOf(`            ${scope})`));
  const match = scopeSection.match(/matrix_json='([^']+)'/);
  if (!match) throw new Error(`Missing release matrix for scope: ${scope}`);
  return (JSON.parse(match[1]) as { include: ReleaseMatrixEntry[] }).include;
};

describe('LianLiaoAIPC multi-platform release workflow', () => {
  it('uses validation, draft, platform build, and publish gates', () => {
    expect(workflow).toContain('name: Release LianLiaoAIPC');
    expect(workflow).toContain('validate:');
    expect(workflow).toContain('create-draft-release:');
    expect(workflow).toContain('build-platform:');
    expect(workflow).toContain('verify-and-publish:');
    expect(workflow).toContain('fail-fast: false');
  });

  it('builds the five supported desktop targets on native runners', () => {
    expect(readScopeMatrix('all')).toMatchObject([
      { key: 'windows-x64', runner: 'windows-latest', command: 'bun run build-win:x64' },
      { key: 'windows-arm64', runner: 'windows-11-arm', command: 'bun run build-win:arm64' },
      { key: 'macos-x64', runner: 'macos-15-intel', command: 'bun run build-mac:x64' },
      { key: 'macos-arm64', runner: 'macos-15', command: 'bun run build-mac:arm64' },
      { key: 'linux-x64', runner: 'ubuntu-22.04', command: 'bun run build-deb' },
    ]);
  });

  it('supports an explicit Windows x64-only release without scheduling other runners', () => {
    expect(workflow).toContain('release_scope:');
    expect(workflow).toContain('- windows-x64');
    expect(readScopeMatrix('windows-x64')).toEqual([
      {
        key: 'windows-x64',
        runner: 'windows-latest',
        runtime: 'win32-x64',
        command: 'bun run build-win:x64',
        source_suffixes: 'win-x64.exe',
        asset_suffixes: 'win-x64.exe',
      },
    ]);
  });

  it('requires the complete installer set before publishing', () => {
    [
      'win-x64.exe',
      'win-arm64.exe',
      'mac-x64.dmg',
      'mac-x64.zip',
      'mac-arm64.dmg',
      'mac-arm64.zip',
      'linux-x64.deb',
      'SHA256SUMS.txt',
    ].forEach((suffix) => expect(workflow).toContain(suffix));
    expect(workflow).toContain('--draft');
    expect(workflow).toContain('--draft=false');
  });

  it('stores installers in Release and only one lightweight Actions Artifact', () => {
    expect(workflow).toContain('Upload platform assets to draft Release');
    expect(workflow).toContain('name: LianLiaoAIPC-${{ needs.validate.outputs.version }}-release-report');
    expect(workflow).toContain('path: release-report');
    expect(workflow).not.toContain('path: LianLiaoAIPC/release-assets/*');
  });

  it('uses macOS-compatible Bash while normalizing the DEB architecture name', () => {
    const uploadStep = workflow.slice(
      workflow.indexOf('- name: Upload platform assets to draft Release'),
      workflow.indexOf('- name: Report platform build')
    );

    expect(uploadStep).not.toContain('mapfile');
    expect(uploadStep).toContain('while IFS= read -r asset');
    expect(readScopeMatrix('all').find(({ key }) => key === 'linux-x64')).toMatchObject({
      source_suffixes: 'linux-amd64.deb',
      asset_suffixes: 'linux-x64.deb',
    });
  });

  it('pins the build toolchain and never embeds credentials or upstream Core fallbacks', () => {
    expect(workflow).toContain('node-version: "24"');
    expect(workflow).toContain('bun-version: 1.3.14');
    expect(workflow).toContain('bun install --frozen-lockfile');
    expect(workflow).toContain('LIANLIAO_RELEASE_BUILD: "1"');
    expect(workflow).not.toMatch(/ghp_|github_pat_/);
    expect(workflow).not.toContain('iOfficeAI/AionCore');
    expect(workflow).not.toContain('releases/latest');
  });
});
