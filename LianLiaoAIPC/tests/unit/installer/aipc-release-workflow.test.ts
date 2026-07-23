import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopRoot = resolve(__dirname, '../../..');
const repositoryRoot = resolve(desktopRoot, '..');
const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/lianliao-aipc-release.yml'), 'utf8');

describe('LianLiaoAIPC Windows release workflow', () => {
  it('is manually dispatched from the repository workflow directory', () => {
    expect(workflow).toContain('name: Release LianLiaoAIPC Windows');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('runs-on: windows-latest');
  });

  it('pins the supported toolchain and authenticated locked Core build', () => {
    expect(workflow).toContain('node-version: "24"');
    expect(workflow).toContain('bun-version: 1.3.14');
    expect(workflow).toContain('bun install --frozen-lockfile');
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).toContain('LIANLIAO_RELEASE_BUILD: "1"');
    expect(workflow).toContain('NODE_OPTIONS: --max-old-space-size=6144');
    expect(workflow).toContain("$ErrorActionPreference = 'SilentlyContinue'");
    expect(workflow).toContain('$releaseLookupExitCode = $LASTEXITCODE');
    expect(workflow).toContain('$global:LASTEXITCODE = 0');
    expect(workflow).toContain('node scripts/verifyAioncoreReleaseLock.js');
    expect(workflow).toContain('bun run build-win:x64');
  });

  it('publishes the same installer contract as an Artifact and a draft-first Release', () => {
    expect(workflow).toContain('LianLiaoAIPC-$version-win-x64.exe');
    expect(workflow).toContain('retention-days: 30');
    expect(workflow).toContain('desktop-v$version');
    expect(workflow).toContain('--draft');
    expect(workflow).toContain('--draft=false');
    expect(workflow).toContain('SHA256SUMS');
    expect(workflow).toContain("if: failure() && steps.draft.outputs.created == 'true'");
    expect(workflow).toContain("if ($isDraft -eq 'true')");
  });

  it('does not embed credentials or fall back to upstream Core assets', () => {
    expect(workflow).not.toMatch(/ghp_|github_pat_/);
    expect(workflow).not.toContain('iOfficeAI/AionCore');
    expect(workflow).not.toContain('releases/latest');
    expect(workflow).not.toContain('LIANLIAO_AICORE_LOCAL_BINARY');
    expect(workflow).not.toContain('AIONUI_BACKEND_RUN_ID');
  });
});
