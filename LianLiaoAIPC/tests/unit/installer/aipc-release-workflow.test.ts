import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopRoot = resolve(__dirname, '../../..');
const repositoryRoot = resolve(desktopRoot, '..');
const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/lianliao-aipc-release.yml'), 'utf8');

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
    [
      'runner: windows-latest',
      'runner: windows-11-arm',
      'runner: macos-15-intel',
      'runner: macos-15',
      'runner: ubuntu-22.04',
      'bun run build-win:x64',
      'bun run build-win:arm64',
      'bun run build-mac:x64',
      'bun run build-mac:arm64',
      'bun run build-deb',
    ].forEach((value) => expect(workflow).toContain(value));
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
    expect(workflow).toContain('source_suffixes: linux-amd64.deb');
    expect(workflow).toContain('asset_suffixes: linux-x64.deb');
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
