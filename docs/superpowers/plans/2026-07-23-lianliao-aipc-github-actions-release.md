# LianLiaoAIPC GitHub Actions Windows Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build LianLiaoAIPC Windows x64 in GitHub Actions and publish the same installer plus SHA256 as both a 30-day Actions Artifact and a permanent GitHub Release.

**Architecture:** A root-level manually dispatched workflow validates the requested desktop version against `LianLiaoAIPC/package.json`, authenticates private Core Release downloads with the short-lived Actions token, runs the existing Windows packaging command, and stages exactly two release files. The workflow uploads the staged files as an Actions Artifact, then creates a draft `desktop-v<version>` Release, verifies its assets, and publishes it; an incomplete draft created by the current run is deleted on failure.

**Tech Stack:** GitHub Actions, PowerShell 7, Node.js 24, Bun 1.3.14, Electron Builder, GitHub CLI, Vitest 4.

---

## File Structure

- Create `.github/workflows/lianliao-aipc-release.yml`: owns validation, Windows packaging, Artifact upload, draft Release creation, asset verification, cleanup, and publication.
- Create `LianLiaoAIPC/tests/unit/installer/aipc-release-workflow.test.ts`: statically verifies the workflow contract and prevents accidental credential, platform, naming, or publication regressions.
- Modify `README.md`: links the workflow and documents the manual release procedure after the first successful run.
- Modify `LianLiaoAIPC/README.md`: records the AIPC-specific build command, Artifact name, Release Tag, and unsigned-installer limitation.

### Task 1: Implement the Windows x64 release workflow

**Files:**

- Create: `.github/workflows/lianliao-aipc-release.yml`

- [ ] **Step 1: Create the root workflow**

Create `.github/workflows/lianliao-aipc-release.yml` with this content:

```yaml
name: Release LianLiaoAIPC Windows

on:
  workflow_dispatch:
    inputs:
      version:
        description: Desktop version without v, for example 2.1.27
        required: true
        type: string

permissions:
  contents: write

concurrency:
  group: lianliao-aipc-release-${{ inputs.version }}
  cancel-in-progress: false

jobs:
  release-windows:
    name: Build and publish Windows x64
    runs-on: windows-latest
    defaults:
      run:
        working-directory: LianLiaoAIPC
    env:
      GH_TOKEN: ${{ github.token }}
      LIANLIAO_RELEASE_BUILD: "1"
    steps:
      - name: Checkout source
        uses: actions/checkout@v5

      - name: Validate release input
        id: release
        shell: pwsh
        run: |
          $ErrorActionPreference = 'Stop'
          $version = '${{ inputs.version }}'.Trim()
          if ($version -notmatch '^\d+\.\d+\.\d+$') {
            throw "Version must use x.y.z format without v. Received: $version"
          }
          if ('${{ github.ref_name }}' -ne 'master') {
            throw 'Formal desktop releases must run from master.'
          }

          $package = Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json
          if ($package.version -ne $version) {
            throw "Input version $version does not match package.json version $($package.version)."
          }

          $tag = "desktop-v$version"
          gh release view $tag --repo '${{ github.repository }}' *> $null
          if ($LASTEXITCODE -eq 0) {
            throw "Release $tag already exists and will not be overwritten."
          }

          "version=$version" >> $env:GITHUB_OUTPUT
          "tag=$tag" >> $env:GITHUB_OUTPUT
          "installer=LianLiaoAIPC-$version-win-x64.exe" >> $env:GITHUB_OUTPUT
          "artifact=LianLiaoAIPC-$version-windows-x64" >> $env:GITHUB_OUTPUT

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "24"

      - name: Set up Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14

      - name: Install dependencies
        shell: pwsh
        run: bun install --frozen-lockfile

      - name: Verify Core release lock
        shell: pwsh
        run: node scripts/verifyAioncoreReleaseLock.js

      - name: Build Windows x64 installer
        shell: pwsh
        run: bun run build-win:x64

      - name: Verify installer and generate SHA256
        id: package
        shell: pwsh
        env:
          VERSION: ${{ steps.release.outputs.version }}
          INSTALLER_NAME: ${{ steps.release.outputs.installer }}
        run: |
          $ErrorActionPreference = 'Stop'
          $source = Join-Path 'out' $env:INSTALLER_NAME
          if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw "Expected installer was not generated: $source"
          }

          $assets = Join-Path $PWD 'release-assets'
          New-Item -ItemType Directory -Force -Path $assets | Out-Null
          Get-ChildItem -LiteralPath $assets -Force | Remove-Item -Force

          $installer = Join-Path $assets $env:INSTALLER_NAME
          Copy-Item -LiteralPath $source -Destination $installer

          $sha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
          "$sha256  $env:INSTALLER_NAME" | Set-Content -LiteralPath (Join-Path $assets 'SHA256SUMS') -Encoding ascii

          $files = @(Get-ChildItem -LiteralPath $assets -File)
          if ($files.Count -ne 2) {
            throw "Expected exactly two staged release files, found $($files.Count)."
          }
          foreach ($expected in @($env:INSTALLER_NAME, 'SHA256SUMS')) {
            if ($expected -notin $files.Name) {
              throw "Missing staged release file: $expected"
            }
          }

          $size = (Get-Item -LiteralPath $installer).Length
          "sha256=$sha256" >> $env:GITHUB_OUTPUT
          "size=$size" >> $env:GITHUB_OUTPUT

          @"
          ## LianLiaoAIPC Windows build

          - Version: ``$env:VERSION``
          - Commit: ``${{ github.sha }}``
          - Installer: ``$env:INSTALLER_NAME``
          - Size: ``$size`` bytes
          - SHA256: ``$sha256``
          - Artifact: ``${{ steps.release.outputs.artifact }}``
          - Release tag: ``${{ steps.release.outputs.tag }}``
          "@ >> $env:GITHUB_STEP_SUMMARY

      - name: Upload Actions artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ steps.release.outputs.artifact }}
          path: LianLiaoAIPC/release-assets/*
          if-no-files-found: error
          retention-days: 30
          compression-level: 0

      - name: Create draft GitHub Release
        id: draft
        shell: pwsh
        env:
          VERSION: ${{ steps.release.outputs.version }}
          TAG: ${{ steps.release.outputs.tag }}
          INSTALLER_NAME: ${{ steps.release.outputs.installer }}
        run: |
          $ErrorActionPreference = 'Stop'
          @"
          ## 链上辽宁·产业云城 AI桌面平台 v$env:VERSION

          - 支持平台：Windows x64
          - 安装包：``$env:INSTALLER_NAME``
          - LianLiaoAICore：由 ``LianLiaoAIPC/aioncore-release-lock.json`` 固定版本和 SHA256
          - 完整性校验：下载后请使用同页 ``SHA256SUMS`` 校验
          - 签名说明：当前安装包尚未配置 Windows 代码签名证书，Windows SmartScreen 可能显示安全提示
          "@ | Set-Content -LiteralPath release-notes.md -Encoding utf8

          gh release create $env:TAG `
            --repo '${{ github.repository }}' `
            --target '${{ github.sha }}' `
            --title "链上辽宁·产业云城 AI桌面平台 v$env:VERSION" `
            --notes-file release-notes.md `
            --draft
          "created=true" >> $env:GITHUB_OUTPUT

      - name: Upload and verify Release assets
        shell: pwsh
        env:
          TAG: ${{ steps.release.outputs.tag }}
          INSTALLER_NAME: ${{ steps.release.outputs.installer }}
        run: |
          $ErrorActionPreference = 'Stop'
          gh release upload $env:TAG `
            (Join-Path 'release-assets' $env:INSTALLER_NAME) `
            (Join-Path 'release-assets' 'SHA256SUMS') `
            --repo '${{ github.repository }}'

          $actual = @(gh release view $env:TAG --repo '${{ github.repository }}' --json assets --jq '.assets[].name')
          $expected = @($env:INSTALLER_NAME, 'SHA256SUMS')
          if ($actual.Count -ne 2) {
            throw "Expected two Release assets, found $($actual.Count): $($actual -join ', ')"
          }
          foreach ($name in $expected) {
            if ($name -notin $actual) {
              throw "Release asset verification failed; missing $name."
            }
          }

      - name: Publish GitHub Release
        shell: pwsh
        env:
          TAG: ${{ steps.release.outputs.tag }}
        run: gh release edit $env:TAG --repo '${{ github.repository }}' --draft=false

      - name: Remove incomplete draft after failure
        if: failure() && steps.draft.outputs.created == 'true'
        shell: pwsh
        env:
          TAG: ${{ steps.release.outputs.tag }}
        run: gh release delete $env:TAG --repo '${{ github.repository }}' --cleanup-tag --yes
```

- [ ] **Step 2: Validate YAML syntax**

Run from the repository root:

```powershell
python -c "from pathlib import Path; import yaml; yaml.compose(Path('.github/workflows/lianliao-aipc-release.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader); print('workflow yaml ok')"
```

Expected output:

```text
workflow yaml ok
```

- [ ] **Step 3: Check the workflow for forbidden credentials and upstream Core fallbacks**

Run:

```powershell
rg -n "ghp_|github_pat_|iOfficeAI/AionCore|releases/latest|LIANLIAO_AICORE_LOCAL_BINARY|AIONUI_BACKEND_RUN_ID" .github/workflows/lianliao-aipc-release.yml
```

Expected: no matches.

- [ ] **Step 4: Commit the workflow**

```powershell
git add .github/workflows/lianliao-aipc-release.yml
git commit -m "ci(desktop): 添加 Windows 安装包发布流程"
```

### Task 2: Add workflow contract coverage

**Files:**

- Create: `LianLiaoAIPC/tests/unit/installer/aipc-release-workflow.test.ts`

- [ ] **Step 1: Add the static workflow contract test**

Create `LianLiaoAIPC/tests/unit/installer/aipc-release-workflow.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const desktopRoot = resolve(__dirname, "../../..");
const repositoryRoot = resolve(desktopRoot, "..");
const workflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/lianliao-aipc-release.yml"),
  "utf8",
);

describe("LianLiaoAIPC Windows release workflow", () => {
  it("is manually dispatched from the repository workflow directory", () => {
    expect(workflow).toContain("name: Release LianLiaoAIPC Windows");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("runs-on: windows-latest");
  });

  it("pins the supported toolchain and authenticated locked Core build", () => {
    expect(workflow).toContain("node-version: '24'");
    expect(workflow).toContain("bun-version: 1.3.14");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("GH_TOKEN: ${{ github.token }}");
    expect(workflow).toContain("LIANLIAO_RELEASE_BUILD: '1'");
    expect(workflow).toContain("node scripts/verifyAioncoreReleaseLock.js");
    expect(workflow).toContain("bun run build-win:x64");
  });

  it("publishes the same installer contract as an Artifact and a draft-first Release", () => {
    expect(workflow).toContain("LianLiaoAIPC-$version-win-x64.exe");
    expect(workflow).toContain("retention-days: 30");
    expect(workflow).toContain("desktop-v$version");
    expect(workflow).toContain("--draft");
    expect(workflow).toContain("--draft=false");
    expect(workflow).toContain("SHA256SUMS");
    expect(workflow).toContain("if: failure() && steps.draft.outputs.created == 'true'");
  });

  it("does not embed credentials or fall back to upstream Core assets", () => {
    expect(workflow).not.toMatch(/ghp_|github_pat_/);
    expect(workflow).not.toContain("iOfficeAI/AionCore");
    expect(workflow).not.toContain("releases/latest");
    expect(workflow).not.toContain("LIANLIAO_AICORE_LOCAL_BINARY");
    expect(workflow).not.toContain("AIONUI_BACKEND_RUN_ID");
  });
});
```

- [ ] **Step 2: Format the new files**

Run from the repository root:

```powershell
& '.\LianLiaoAIPC\node_modules\.bin\oxfmt.exe' `
  'LianLiaoAIPC\tests\unit\installer\aipc-release-workflow.test.ts' `
  '.github\workflows\lianliao-aipc-release.yml'
```

Expected: both files are formatted without errors.

- [ ] **Step 3: Run the focused test**

Run:

```powershell
bun run test -- tests/unit/installer/aipc-release-workflow.test.ts --reporter=verbose
```

Expected: one test file and four tests pass.

- [ ] **Step 4: Run affected release checks**

Run:

```powershell
node scripts/verifyAioncoreReleaseLock.js
bun run test -- tests/unit/assets/aioncoreReleaseLock.test.ts tests/unit/installer/aipc-release-workflow.test.ts --reporter=verbose
bunx tsc --noEmit
bun run lint -- --quiet
```

Expected:

- release lock reports four complete targets;
- both focused test files pass;
- TypeScript exits with code 0;
- Oxlint reports zero errors.

- [ ] **Step 5: Commit the test**

```powershell
git add tests/unit/installer/aipc-release-workflow.test.ts .github/workflows/lianliao-aipc-release.yml
git commit -m "test(ci): 校验桌面端发布工作流"
```

### Task 3: Document the operator workflow

**Files:**

- Modify: `README.md`
- Modify: `LianLiaoAIPC/README.md`

- [ ] **Step 1: Add the root operator procedure**

Add a `LianLiaoAIPC GitHub Actions 发布` section to `README.md` containing:

```markdown
## LianLiaoAIPC GitHub Actions 发布

1. 确认 `LianLiaoAIPC/package.json` 中的版本已经提交到 `master`。
2. 打开 GitHub 仓库的 `Actions` 页面。
3. 选择 `Release LianLiaoAIPC Windows`。
4. 点击 `Run workflow`，分支选择 `master`，输入不带 `v` 的版本号，例如 `2.1.27`。
5. 运行成功后，在该次运行页面底部下载保留 30 天的 Actions Artifact。
6. 在 Releases 页面下载长期保留的 `desktop-v2.1.27` 正式安装包和 `SHA256SUMS`。

正式发布同时使用 Actions Artifact 和 GitHub Release。Artifact 用于测试，不得作为数据库中的长期安装地址；Release Tag 已存在时工作流会停止，禁止覆盖正式版本。
```

- [ ] **Step 2: Add the desktop-specific notes**

Add this paragraph near the Core/release introduction in `LianLiaoAIPC/README.md`:

```markdown
Windows x64 正式安装包由根目录 `.github/workflows/lianliao-aipc-release.yml` 构建。手动输入版本必须与本目录 `package.json` 一致；成功后同时生成 30 天 Actions Artifact 和 `desktop-v<version>` GitHub Release。当前安装包尚未配置 Windows 代码签名证书，测试安装时可能出现 SmartScreen 提示。
```

- [ ] **Step 3: Check documentation and staged changes**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only the planned workflow, test, and documentation files are changed.

- [ ] **Step 4: Commit documentation**

```powershell
git add README.md LianLiaoAIPC/README.md
git commit -m "docs(ci): 补充桌面端发布操作说明"
```

### Task 4: Push and run the first 2.1.27 release

**Files:**

- No source files changed.
- External state: GitHub `master`, Actions run, Actions Artifact, and `desktop-v2.1.27` Release.

- [ ] **Step 1: Verify local history and worktree**

Run:

```powershell
git status --short
git log -4 --oneline
```

Expected: clean worktree and the workflow, test, documentation, and design commits at the branch tip.

- [ ] **Step 2: Push the branch tip to master**

Use the repository push wrapper if `just` is available:

```powershell
just push origin HEAD:master
```

If `just` is unavailable, execute the same Justfile gates manually:

```powershell
bun run lint -- --quiet
bun run format:check
bunx tsc --noEmit
bun run i18n:types
node scripts/check-i18n.js
bun run test
```

Record existing unrelated baseline failures instead of modifying unrelated generated files or old tests. After the affected workflow tests, release-lock checks, TypeScript, and strict lint pass, push:

```powershell
git push origin HEAD:master
```

Expected: remote `master` contains the new workflow.

- [ ] **Step 3: Trigger the workflow**

In GitHub:

1. Open `Actions`.
2. Select `Release LianLiaoAIPC Windows`.
3. Select `Run workflow`.
4. Select branch `master`.
5. Enter `2.1.27`.
6. Confirm `Run workflow`.

Expected: one run begins with `Build and publish Windows x64`.

- [ ] **Step 4: Monitor every release stage**

Observe the Actions log until all of these steps pass:

```text
Validate release input
Checkout source
Set up Node
Set up Bun
Install dependencies
Verify Core release lock
Build Windows x64 installer
Verify installer and generate SHA256
Upload Actions artifact
Create draft GitHub Release
Upload and verify Release assets
Publish GitHub Release
```

If a step fails, retain its exact log, diagnose the first failing stage, fix the workflow or source in a new commit, push, and rerun the same version. The cleanup step must remove a draft created by a failed run so the rerun is allowed.

- [ ] **Step 5: Verify Artifact and Release**

From the successful run page:

- confirm Artifact `LianLiaoAIPC-2.1.27-windows-x64` exists;
- confirm the run summary displays Commit, installer name, byte size, SHA256, Artifact name, and Release Tag.

From the Releases page:

- confirm `desktop-v2.1.27` is published, not draft;
- confirm exactly `LianLiaoAIPC-2.1.27-win-x64.exe` and `SHA256SUMS` are present;
- confirm the Release SHA256 equals the run-summary SHA256.

- [ ] **Step 6: Report the learning handoff**

Provide the user:

- Actions run URL;
- Release URL;
- build duration and final status;
- installer filename, size, and SHA256;
- a concise explanation of each workflow section;
- the exact six-click procedure for publishing the next version;
- the reminder that the next version requires updating `package.json` before running the workflow.
