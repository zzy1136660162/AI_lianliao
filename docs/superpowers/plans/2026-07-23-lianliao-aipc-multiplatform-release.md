# LianLiaoAIPC Multi-Platform Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one verified LianLiaoAIPC GitHub Release containing Windows x64/ARM64, macOS Intel/Apple Silicon, and Ubuntu x64 installers backed by locked LianLiaoAICore assets.

**Architecture:** Extend the Core release matrix with a native Windows ARM64 runner, publish a new Core release, and pin all five Core assets by SHA256. Replace the Windows-only desktop workflow with validate, draft-release, platform-matrix, and verify/publish jobs; installers travel through the draft Release while Actions retains only one lightweight report artifact.

**Tech Stack:** GitHub Actions, GitHub CLI, PowerShell, Bash, Rust 1.95, Node.js 24, Bun 1.3.14, Electron 37, electron-builder 26, Vitest 4.

---

## File map

- Modify `.github/workflows/lianliao-aicore-release.yml`: add native Windows ARM64 Core build and require its archive before publishing.
- Create `LianLiaoAIPC/tests/unit/installer/aicore-release-workflow.test.ts`: lock the five-platform Core workflow contract.
- Modify `LianLiaoAICore/Cargo.toml`: advance the Core workspace version from `0.1.47` to `0.1.48`.
- Modify `LianLiaoAICore/CHANGELOG.md`: document the Windows ARM64 release target.
- Modify `LianLiaoAIPC/aioncore-release-lock.json`: pin the five assets from `aicore-v0.1.48`.
- Modify `LianLiaoAIPC/package.json`: advance the desktop version to `2.1.28` and align `aioncoreVersion` with the new lock.
- Modify `LianLiaoAIPC/tests/unit/assets/aioncoreReleaseLock.test.ts`: require `win32-arm64` and validate all five checksums.
- Modify `.github/workflows/lianliao-aipc-release.yml`: build all five desktop targets and publish one complete Release.
- Modify `LianLiaoAIPC/tests/unit/installer/aipc-release-workflow.test.ts`: replace the Windows-only assertions with the multi-platform contract.
- Modify `README.md`: document supported installers, workflow usage, and unsigned macOS behavior.
- Modify `AGENTS.md`: record platform/release invariants for future agents.

### Task 1: Lock the Core five-platform workflow contract

**Files:**
- Create: `LianLiaoAIPC/tests/unit/installer/aicore-release-workflow.test.ts`
- Modify: `.github/workflows/lianliao-aicore-release.yml`

- [ ] **Step 1: Write the failing workflow test**

Create the test with explicit runner, target, archive, and publish-gate assertions:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopRoot = resolve(__dirname, '../../..');
const repositoryRoot = resolve(desktopRoot, '..');
const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/lianliao-aicore-release.yml'), 'utf8');

describe('LianLiaoAICore release workflow', () => {
  it('builds all Core targets required by the desktop release', () => {
    [
      'x86_64-pc-windows-msvc',
      'aarch64-pc-windows-msvc',
      'x86_64-apple-darwin',
      'aarch64-apple-darwin',
      'x86_64-unknown-linux-gnu',
    ].forEach((target) => expect(workflow).toContain(`target: ${target}`));
    expect(workflow).toContain('os: windows-11-arm');
    expect(workflow).toContain('os: macos-15-intel');
    expect(workflow).toContain('os: macos-15');
  });

  it('requires every archive before publishing the Core release', () => {
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
```

- [ ] **Step 2: Run the test and verify the missing ARM64 contract fails**

Run:

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
bunx vitest run tests/unit/installer/aicore-release-workflow.test.ts
```

Expected: FAIL because `aarch64-pc-windows-msvc` and `windows-11-arm` are absent.

- [ ] **Step 3: Extend the Core build matrix**

In `.github/workflows/lianliao-aicore-release.yml`, use these five matrix entries:

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - os: windows-latest
        target: x86_64-pc-windows-msvc
        binary: aioncore.exe
        archive: zip
      - os: windows-11-arm
        target: aarch64-pc-windows-msvc
        binary: aioncore.exe
        archive: zip
      - os: macos-15-intel
        target: x86_64-apple-darwin
        binary: aioncore
        archive: tar.gz
      - os: macos-15
        target: aarch64-apple-darwin
        binary: aioncore
        archive: tar.gz
      - os: ubuntu-22.04
        target: x86_64-unknown-linux-gnu
        binary: aioncore
        archive: tar.gz
```

Add the Windows ARM64 archive to `expected_assets` and to the `sha256sum` command:

```bash
"lianliao-aicore-v${{ needs.prepare.outputs.version }}-aarch64-pc-windows-msvc.zip"
```

Keep `RUSTFLAGS: -C target-feature=+crt-static`, `--clobber`, draft-first publishing, and `contents: write`.

- [ ] **Step 4: Run the Core workflow contract test**

Run:

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
bunx vitest run tests/unit/installer/aicore-release-workflow.test.ts
```

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit the Core workflow extension**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao
git add -- .github/workflows/lianliao-aicore-release.yml LianLiaoAIPC/tests/unit/installer/aicore-release-workflow.test.ts
git commit -m "ci: 增加 Core Windows ARM64 构建"
```

### Task 2: Advance and publish the five-platform Core release

**Files:**
- Modify: `LianLiaoAICore/Cargo.toml`
- Modify: `LianLiaoAICore/CHANGELOG.md`

- [ ] **Step 1: Change the Core workspace version**

Change:

```toml
[workspace.package]
version = "0.1.48"
```

- [ ] **Step 2: Add the release note**

Insert at the top of `LianLiaoAICore/CHANGELOG.md`, below its title:

```markdown
## 0.1.48 (2026-07-23)

- 增加 Windows ARM64 (`aarch64-pc-windows-msvc`) 正式发布产物。
- 保持 Windows x64、macOS Intel、macOS Apple Silicon 和 Linux x64 发布兼容。
```

- [ ] **Step 3: Run the Core source checks**

Run:

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAICore
cargo metadata --no-deps --format-version 1
cargo check -p aionui-app
```

Expected: both commands exit 0 and metadata reports workspace version `0.1.48`.

- [ ] **Step 4: Commit and push the release source**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao
git add -- LianLiaoAICore/Cargo.toml LianLiaoAICore/CHANGELOG.md
git commit -m "chore(core): 发布 0.1.48 多平台版本"
git push origin HEAD:master
```

Expected: the remote `master` contains Task 1 and Task 2 commits.

- [ ] **Step 5: Trigger and watch the Core release**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao
gh workflow run lianliao-aicore-release.yml --repo zzy1136660162/AI_lianliao --ref master -f version=0.1.48
$runId = gh run list --repo zzy1136660162/AI_lianliao --workflow lianliao-aicore-release.yml --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $runId --repo zzy1136660162/AI_lianliao --exit-status
```

Expected: all five build jobs and the publish job succeed.

- [ ] **Step 6: Verify the published Core asset set**

```powershell
$expected = @(
  'lianliao-aicore-v0.1.48-x86_64-pc-windows-msvc.zip',
  'lianliao-aicore-v0.1.48-aarch64-pc-windows-msvc.zip',
  'lianliao-aicore-v0.1.48-x86_64-apple-darwin.tar.gz',
  'lianliao-aicore-v0.1.48-aarch64-apple-darwin.tar.gz',
  'lianliao-aicore-v0.1.48-x86_64-unknown-linux-gnu.tar.gz',
  'SHA256SUMS'
)
$actual = @(gh release view aicore-v0.1.48 --repo zzy1136660162/AI_lianliao --json assets --jq '.assets[].name')
Compare-Object $expected $actual
```

Expected: `Compare-Object` produces no output.

### Task 3: Pin the new Core Release in AIPC

**Files:**
- Modify: `LianLiaoAIPC/aioncore-release-lock.json`
- Modify: `LianLiaoAIPC/package.json`
- Modify: `LianLiaoAIPC/tests/unit/assets/aioncoreReleaseLock.test.ts`

- [ ] **Step 1: Update the failing lock test**

Change the lock contract to:

```ts
it('pins the current repository, release tag, and five platform assets', () => {
  const { lock } = releaseLockTools.loadReleaseLock(projectRoot);

  expect(lock.repository).toBe('zzy1136660162/AI_lianliao');
  expect(lock.version).toBe('v0.1.48');
  expect(lock.releaseTag).toBe('aicore-v0.1.48');
  expect(Object.keys(lock.assets).toSorted()).toEqual([
    'darwin-arm64',
    'darwin-x64',
    'linux-x64',
    'win32-arm64',
    'win32-x64',
  ]);
  expect(Object.values(lock.assets).every((asset) => asset.name.startsWith('lianliao-aicore-v0.1.48-'))).toBe(true);
  expect(Object.values(lock.assets).every((asset) => /^[a-f0-9]{64}$/.test(asset.sha256))).toBe(true);
});
```

Update URL assertions from `v0.1.47` to `v0.1.48`. Remove the assertion that hard-codes only the old Windows x64 hash; the all-assets checksum assertion above replaces it.

- [ ] **Step 2: Verify the test fails against the old lock**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
bunx vitest run tests/unit/assets/aioncoreReleaseLock.test.ts
```

Expected: FAIL because the lock still reports `v0.1.47` and lacks `win32-arm64`.

- [ ] **Step 3: Download the authoritative checksum file**

```powershell
$checksumDir = Join-Path $env:TEMP 'lianliao-aicore-v0.1.48-checksums'
New-Item -ItemType Directory -Force -Path $checksumDir | Out-Null
gh release download aicore-v0.1.48 --repo zzy1136660162/AI_lianliao --pattern SHA256SUMS --dir $checksumDir --clobber
Get-Content -LiteralPath (Join-Path $checksumDir 'SHA256SUMS')
```

Expected: exactly five checksum lines, one for each required Core archive. Use these observed lowercase values verbatim in the next patch; do not calculate values from filenames and do not leave an empty checksum.

- [ ] **Step 4: Generate the complete lock content from the published checksums**

Run this read-only transformation to produce the exact JSON that must be applied to `LianLiaoAIPC/aioncore-release-lock.json`:

```powershell
$checksumFile = Join-Path $checksumDir 'SHA256SUMS'
$hashes = @{}
Get-Content -LiteralPath $checksumFile | ForEach-Object {
  if ($_ -notmatch '^([a-f0-9]{64})  (.+)$') {
    throw "Invalid checksum line: $_"
  }
  $hashes[$Matches[2]] = $Matches[1]
}

$assetNames = [ordered]@{
  'win32-x64' = 'lianliao-aicore-v0.1.48-x86_64-pc-windows-msvc.zip'
  'win32-arm64' = 'lianliao-aicore-v0.1.48-aarch64-pc-windows-msvc.zip'
  'darwin-x64' = 'lianliao-aicore-v0.1.48-x86_64-apple-darwin.tar.gz'
  'darwin-arm64' = 'lianliao-aicore-v0.1.48-aarch64-apple-darwin.tar.gz'
  'linux-x64' = 'lianliao-aicore-v0.1.48-x86_64-unknown-linux-gnu.tar.gz'
}
$assets = [ordered]@{}
foreach ($entry in $assetNames.GetEnumerator()) {
  if (-not $hashes.ContainsKey($entry.Value)) {
    throw "Missing checksum for $($entry.Value)"
  }
  $assets[$entry.Key] = [ordered]@{
    name = $entry.Value
    sha256 = $hashes[$entry.Value]
  }
}
$generatedLock = [ordered]@{
  schemaVersion = 1
  repository = 'zzy1136660162/AI_lianliao'
  version = 'v0.1.48'
  releaseTag = 'aicore-v0.1.48'
  assets = $assets
} | ConvertTo-Json -Depth 5
$generatedLock
```

Apply the printed JSON verbatim with `apply_patch`. Do not write the file from PowerShell and do not manually retype a checksum. Also change:

```json
"version": "2.1.28",
"aioncoreVersion": "v0.1.48"
```

- [ ] **Step 5: Validate every lock entry**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
node scripts/verifyAioncoreReleaseLock.js
node scripts/verifyAioncoreReleaseLock.js win32-arm64
bunx vitest run tests/unit/assets/aioncoreReleaseLock.test.ts
```

Expected: the script reports five complete targets, resolves `win32-arm64`, and all tests pass.

- [ ] **Step 6: Commit the Core lock**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao
git add -- LianLiaoAIPC/aioncore-release-lock.json LianLiaoAIPC/package.json LianLiaoAIPC/tests/unit/assets/aioncoreReleaseLock.test.ts
git commit -m "build: 锁定 Core 0.1.48 五平台资源"
```

### Task 4: Replace the Windows-only AIPC workflow contract

**Files:**
- Modify: `LianLiaoAIPC/tests/unit/installer/aipc-release-workflow.test.ts`

- [ ] **Step 1: Replace the test suite with multi-platform assertions**

Use:

```ts
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
```

- [ ] **Step 2: Run the test and verify the Windows-only workflow fails**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
bunx vitest run tests/unit/installer/aipc-release-workflow.test.ts
```

Expected: FAIL on the multi-job and non-Windows assertions.

- [ ] **Step 3: Commit the failing contract test**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao
git add -- LianLiaoAIPC/tests/unit/installer/aipc-release-workflow.test.ts
git commit -m "test(ci): 定义桌面端五平台发布契约"
```

### Task 5: Implement the multi-platform AIPC release workflow

**Files:**
- Modify: `.github/workflows/lianliao-aipc-release.yml`

- [ ] **Step 1: Add validate and draft-release jobs**

The `validate` job must run on `ubuntu-22.04`, verify `master`, semantic version, `package.json`, the absence of the tag derived as `desktop-v${version}`, and `aioncore-release-lock.json` completeness. Export `version` and `tag`.

The `create-draft-release` job must depend on `validate` and execute:

```bash
gh release create "${TAG}" \
  --repo "${GITHUB_REPOSITORY}" \
  --target "${GITHUB_SHA}" \
  --title "链上辽宁·产业云城 AI桌面平台 v${VERSION}" \
  --notes-file release-notes.md \
  --draft
```

Release notes must list all five targets and state that macOS packages use ad-hoc signatures and are not notarized.

- [ ] **Step 2: Add the native platform matrix**

Use this exact matrix:

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - key: windows-x64
        runner: windows-latest
        command: bun run build-win:x64
        assets: LianLiaoAIPC-${{ needs.validate.outputs.version }}-win-x64.exe
      - key: windows-arm64
        runner: windows-11-arm
        command: bun run build-win:arm64
        assets: LianLiaoAIPC-${{ needs.validate.outputs.version }}-win-arm64.exe
      - key: macos-x64
        runner: macos-15-intel
        command: bun run build-mac:x64
        assets: LianLiaoAIPC-${{ needs.validate.outputs.version }}-mac-x64.dmg LianLiaoAIPC-${{ needs.validate.outputs.version }}-mac-x64.zip
      - key: macos-arm64
        runner: macos-15
        command: bun run build-mac:arm64
        assets: LianLiaoAIPC-${{ needs.validate.outputs.version }}-mac-arm64.dmg LianLiaoAIPC-${{ needs.validate.outputs.version }}-mac-arm64.zip
      - key: linux-x64
        runner: ubuntu-22.04
        command: bun run build-deb
        assets: LianLiaoAIPC-${{ needs.validate.outputs.version }}-linux-x64.deb
```

Set `runs-on: ${{ matrix.runner }}` and dependencies on `validate` plus `create-draft-release`.

- [ ] **Step 3: Install, verify, build, and stage each matrix target**

Each matrix job must:

```yaml
- uses: actions/checkout@v5
- uses: actions/setup-node@v4
  with:
    node-version: "24"
- uses: oven-sh/setup-bun@v2
  with:
    bun-version: 1.3.14
- run: bun install --frozen-lockfile
- run: node scripts/verifyAioncoreReleaseLock.js
- run: ${{ matrix.command }}
```

Set:

```yaml
env:
  GH_TOKEN: ${{ github.token }}
  LIANLIAO_RELEASE_BUILD: "1"
  NODE_OPTIONS: --max-old-space-size=6144
```

For Ubuntu, install DEB packaging dependencies before the build:

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends fakeroot dpkg
```

Stage only the whitespace-separated `matrix.assets` from `out/` into `release-assets/`. For every expected name, require a regular file and reject an empty file.

- [ ] **Step 4: Upload each platform directly to the draft Release**

Use Git Bash consistently on all runners:

```bash
set -euo pipefail
mapfile -t assets < <(find release-assets -maxdepth 1 -type f -print | sort)
if [[ "${#assets[@]}" -eq 0 ]]; then
  echo "No staged release assets found" >&2
  exit 1
fi
gh release upload "${TAG}" "${assets[@]}" --repo "${GITHUB_REPOSITORY}"
```

Name the step exactly `Upload platform assets to draft Release`.

- [ ] **Step 5: Add the final asset gate and checksum**

The `verify-and-publish` job runs on `ubuntu-22.04` and depends on `validate`, `create-draft-release`, and `build-platform`. Download the seven installer assets into `release-assets/`, define the exact expected array, and reject any missing or extra installer:

```bash
expected=(
  "LianLiaoAIPC-${VERSION}-win-x64.exe"
  "LianLiaoAIPC-${VERSION}-win-arm64.exe"
  "LianLiaoAIPC-${VERSION}-mac-x64.dmg"
  "LianLiaoAIPC-${VERSION}-mac-x64.zip"
  "LianLiaoAIPC-${VERSION}-mac-arm64.dmg"
  "LianLiaoAIPC-${VERSION}-mac-arm64.zip"
  "LianLiaoAIPC-${VERSION}-linux-x64.deb"
)
mapfile -t actual < <(find release-assets -maxdepth 1 -type f -printf '%f\n' | sort)
mapfile -t wanted < <(printf '%s\n' "${expected[@]}" | sort)
diff -u <(printf '%s\n' "${wanted[@]}") <(printf '%s\n' "${actual[@]}")
(cd release-assets && sha256sum "${wanted[@]}" > SHA256SUMS.txt)
```

Upload `SHA256SUMS.txt`, query the Release asset list, and require the seven installers plus checksum before:

```bash
gh release edit "${TAG}" --repo "${GITHUB_REPOSITORY}" --draft=false
```

- [ ] **Step 6: Upload one lightweight report Artifact**

Create `release-report/manifest.txt` containing version, commit, Release tag, runner targets, sizes, and checksums. Upload only:

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: LianLiaoAIPC-${{ needs.validate.outputs.version }}-release-report
    path: release-report
    if-no-files-found: error
    retention-days: 30
```

Before upload, delete older Actions Artifacts whose names start with `LianLiaoAIPC-` so only the newest report remains.

- [ ] **Step 7: Keep failed Releases private**

Add a final cleanup/diagnostic job with `if: failure()`. It may report the draft Release URL, but must never set `--draft=false`. Do not delete an already published Release and do not overwrite an existing Tag.

- [ ] **Step 8: Run the release workflow unit contract**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
bunx vitest run tests/unit/installer/aipc-release-workflow.test.ts
```

Expected: PASS with 5 tests.

- [ ] **Step 9: Commit the workflow**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao
git add -- .github/workflows/lianliao-aipc-release.yml
git commit -m "ci: 发布桌面端五平台安装包"
```

### Task 6: Run local regression checks

**Files:**
- No production file changes.

- [ ] **Step 1: Run focused release tests**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
bunx vitest run `
  tests/unit/installer/aicore-release-workflow.test.ts `
  tests/unit/installer/aipc-release-workflow.test.ts `
  tests/unit/assets/aioncoreReleaseLock.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run static checks**

```powershell
node scripts/verifyAioncoreReleaseLock.js
bun run typecheck:enterprise-tests
bun run lint
```

Expected: all commands exit 0. If repository-wide lint reports pre-existing unrelated failures, record the exact files and confirm none are touched by this implementation.

- [ ] **Step 3: Validate the Windows x64 build path locally**

```powershell
bun run package
node scripts/build-with-builder.js x64 --win --x64 --skip-vite
```

Expected: `out/LianLiaoAIPC-2.1.28-win-x64.exe` exists and the package contains the locked `win32-x64` Core resources.

### Task 7: Document and publish the AIPC release workflow

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update user-facing release documentation**

Document:

```text
Supported installers:
- Windows x64 EXE
- Windows ARM64 EXE
- macOS Intel DMG/ZIP
- macOS Apple Silicon DMG/ZIP
- Ubuntu x64 DEB

Workflow:
gh workflow run lianliao-aipc-release.yml --ref master -f version=2.1.28

macOS notice:
The first multi-platform release uses ad-hoc signing and is not notarized.
Gatekeeper may require the user to confirm the first launch.
```

Also document that formal packages use only `aioncore-release-lock.json` and that Release publication is atomic across all required platforms.

- [ ] **Step 2: Add future-agent invariants**

Add to `AGENTS.md`:

```text
- A formal desktop Release must contain all seven platform installers plus SHA256SUMS.txt.
- Windows ARM64 uses the native windows-11-arm runner and the locked win32-arm64 Core asset.
- macOS Intel uses macos-15-intel; macOS ARM64 uses macos-15.
- Installers are staged through a draft GitHub Release. Actions Artifact stores only one lightweight report.
- Never publish a partial Release, use an upstream/latest Core fallback, change the Windows NSIS GUID, or rename aioncore.exe.
```

Preserve unrelated existing edits in both files and integrate the new paragraphs without replacing other deployment documentation.

- [ ] **Step 3: Commit documentation**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao
git add -- README.md AGENTS.md
git commit -m "docs: 说明桌面端多平台发布流程"
```

- [ ] **Step 4: Push and trigger the desktop Release**

```powershell
git push origin HEAD:master
gh workflow run lianliao-aipc-release.yml --repo zzy1136660162/AI_lianliao --ref master -f version=2.1.28
$runId = gh run list --repo zzy1136660162/AI_lianliao --workflow lianliao-aipc-release.yml --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $runId --repo zzy1136660162/AI_lianliao --exit-status
```

Expected: the workflow succeeds and publishes `desktop-v2.1.28`.

- [ ] **Step 5: Verify the final desktop Release**

```powershell
$expected = @(
  'LianLiaoAIPC-2.1.28-win-x64.exe',
  'LianLiaoAIPC-2.1.28-win-arm64.exe',
  'LianLiaoAIPC-2.1.28-mac-x64.dmg',
  'LianLiaoAIPC-2.1.28-mac-x64.zip',
  'LianLiaoAIPC-2.1.28-mac-arm64.dmg',
  'LianLiaoAIPC-2.1.28-mac-arm64.zip',
  'LianLiaoAIPC-2.1.28-linux-x64.deb',
  'SHA256SUMS.txt'
)
$actual = @(gh release view desktop-v2.1.28 --repo zzy1136660162/AI_lianliao --json assets --jq '.assets[].name')
Compare-Object $expected $actual
```

Expected: no output. Download the Release into a temporary directory and verify every line in `SHA256SUMS.txt` with `sha256sum --check`.
