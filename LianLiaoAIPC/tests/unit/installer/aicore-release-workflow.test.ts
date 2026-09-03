import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopRoot = resolve(__dirname, '../../..');
const repositoryRoot = resolve(desktopRoot, '..');
const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/lianliao-aicore-release.yml'), 'utf8');

describe('LianLiaoAICore release workflow', () => {
  it('defaults to Windows x64 and keeps all-platform targets behind an explicit scope', () => {
    expect(workflow).toContain('default: windows-x64');
    expect(workflow).toContain('- windows-x64');
    expect(workflow).toContain('- all');
    [
      'x86_64-pc-windows-msvc',
      'aarch64-pc-windows-msvc',
      'x86_64-apple-darwin',
      'aarch64-apple-darwin',
      'x86_64-unknown-linux-gnu',
    ].forEach((target) => expect(workflow).toContain(`"target":"${target}"`));
    expect(workflow).toContain('"os":"windows-11-arm"');
    expect(workflow).toContain('"os":"macos-15-intel"');
    expect(workflow).toContain('"os":"macos-15"');
    expect(workflow).toContain('Unsupported release scope');
  });

  it('requires Windows x64 by default and every archive for all-platform releases', () => {
    [
      'x86_64-pc-windows-msvc.zip',
      'aarch64-pc-windows-msvc.zip',
      'x86_64-apple-darwin.tar.gz',
      'aarch64-apple-darwin.tar.gz',
      'x86_64-unknown-linux-gnu.tar.gz',
    ].forEach((suffix) => expect(workflow).toContain(suffix));
    expect(workflow).toContain('Generate SHA256SUMS');
    expect(workflow).toContain('--draft=false');
  });

  it('uploads platform archives to the draft Release instead of Actions Artifact storage', () => {
    expect(workflow).toContain('Upload platform archive to draft Release');
    expect(workflow).not.toContain('actions/upload-artifact');
  });
});
