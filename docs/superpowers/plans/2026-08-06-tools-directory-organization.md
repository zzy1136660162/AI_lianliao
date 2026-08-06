# Tools Directory Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `tools` into purpose-based directories while preserving every tool's behavior and updating all executable repository references.

**Architecture:** Keep one authoritative file for each tool under `ai`, `auth`, `build/windows`, or `database/oracle`; keep tests together under `tools/tests`. Resolve repository roots from the moved script location, update imports and documentation atomically, then verify syntax, unit tests, dry-run build behavior, and stale-path absence.

**Tech Stack:** PowerShell 5.1, Python 3.10, `unittest`, Git path/reference validation.

---

### Task 1: Move and harden the Windows build scripts

**Files:**
- Move: `tools/build_lianliao_aipc_windows.ps1` → `tools/build/windows/build_lianliao_aipc_windows.ps1`
- Move: `tools/build_lianliao_aipc_windows_fast.ps1` → `tools/build/windows/build_lianliao_aipc_windows_fast.ps1`
- Modify: `tools/build/windows/build_lianliao_aipc_windows.ps1`

- [ ] **Step 1: Create the destination and move both scripts without copying them**

```powershell
New-Item -ItemType Directory -Path tools\build\windows -Force
Move-Item -LiteralPath tools\build_lianliao_aipc_windows.ps1 -Destination tools\build\windows\build_lianliao_aipc_windows.ps1
Move-Item -LiteralPath tools\build_lianliao_aipc_windows_fast.ps1 -Destination tools\build\windows\build_lianliao_aipc_windows_fast.ps1
```

Expected: the old files no longer exist and both new files retain their UTF-8 BOM.

- [ ] **Step 2: Replace the fixed parent lookup with repository-root discovery**

Add this function before path initialization:

```powershell
function Find-RepositoryRoot {
    $candidate = Get-Item -LiteralPath $PSScriptRoot
    while ($null -ne $candidate) {
        $aipc = Join-Path $candidate.FullName "LianLiaoAIPC"
        $core = Join-Path $candidate.FullName "LianLiaoAICore"
        if ((Test-Path -LiteralPath $aipc -PathType Container) -and
            (Test-Path -LiteralPath $core -PathType Container)) {
            return $candidate.FullName
        }
        $candidate = $candidate.Parent
    }

    throw "无法从脚本目录定位 AI_lianliao 仓库根目录：$PSScriptRoot"
}
```

Replace:

```powershell
$repoRoot = Split-Path -Parent $PSScriptRoot
```

with:

```powershell
$repoRoot = Find-RepositoryRoot
```

Update the full-build hint to `tools\build\windows\build_lianliao_aipc_windows.ps1`.

- [ ] **Step 3: Parse both scripts and verify the fast wrapper still targets its sibling**

Before parsing, wrap the fast entry invocation with timing that preserves failures:

```powershell
$startedAt = Get-Date
try {
    & $mainScript @parameters
} finally {
    $finishedAt = Get-Date
    $elapsed = $finishedAt - $startedAt
    $parts = @()
    if ($elapsed.Hours -gt 0) { $parts += "$($elapsed.Hours) 小时" }
    if ($elapsed.Minutes -gt 0) { $parts += "$($elapsed.Minutes) 分" }
    $parts += "$($elapsed.Seconds) 秒"
    Write-Host "快速构建开始：$($startedAt.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host "快速构建结束：$($finishedAt.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host "总耗时：$($parts -join ' ')" -ForegroundColor Cyan
}
```

The wrapper must not catch and suppress exceptions from the main script.

```powershell
$files = @(
  'tools\build\windows\build_lianliao_aipc_windows.ps1',
  'tools\build\windows\build_lianliao_aipc_windows_fast.ps1'
)
foreach ($file in $files) {
  $tokens = $null
  $errors = $null
  [void][Management.Automation.Language.Parser]::ParseFile((Resolve-Path $file), [ref]$tokens, [ref]$errors)
  if ($errors.Count) { throw "$file PowerShell 语法失败" }
}
```

Expected: no exception.

- [ ] **Step 4: Verify fast timing on both success and failure paths**

```powershell
$success = & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tools\build\windows\build_lianliao_aipc_windows_fast.ps1 -WhatIf 2>&1
if ($LASTEXITCODE -ne 0 -or ($success -join "`n") -notmatch '总耗时：') {
    throw '快速构建成功路径未输出耗时'
}

$failure = & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tools\build\windows\build_lianliao_aipc_windows_fast.ps1 -CorePath Z:\missing\aioncore.exe -WhatIf 2>&1
if ($LASTEXITCODE -eq 0 -or ($failure -join "`n") -notmatch '总耗时：') {
    throw '快速构建失败路径未保留非零状态或未输出耗时'
}
```

Expected: success exits 0, failure exits nonzero, and both outputs contain start time, end time, and `总耗时`.

- [ ] **Step 5: Run both non-mutating build previews**

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tools\build\windows\build_lianliao_aipc_windows.ps1 -WhatIf
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tools\build\windows\build_lianliao_aipc_windows_fast.ps1 -WhatIf
```

Expected: both resolve `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC`; fast mode reports matching Core SHA256 and resource reuse.

### Task 2: Move Python tools into their responsibility directories

**Files:**
- Move: `tools/catalog_ai_model_integration.py` → `tools/ai/catalog_ai_model_integration.py`
- Move: `tools/enterprise_openid_login.py` → `tools/auth/enterprise_openid_login.py`
- Move: `tools/oracle/oracle_readonly.py` → `tools/database/oracle/oracle_readonly.py`
- Move: `tools/oracle/verify_desktop_message_schema.py` → `tools/database/oracle/verify_desktop_message_schema.py`
- Move: `tools/oracle/import_urgent_purchases.py` → `tools/database/oracle/import_urgent_purchases.py`
- Move: `tools/oracle/requirements.txt` → `tools/database/oracle/requirements.txt`
- Modify: `tools/database/oracle/oracle_readonly.py`
- Modify: `tools/database/oracle/import_urgent_purchases.py`

- [ ] **Step 1: Create destinations and move each authoritative file**

```powershell
New-Item -ItemType Directory -Path tools\ai,tools\auth,tools\database\oracle -Force
Move-Item tools\catalog_ai_model_integration.py tools\ai\catalog_ai_model_integration.py
Move-Item tools\enterprise_openid_login.py tools\auth\enterprise_openid_login.py
Move-Item tools\oracle\oracle_readonly.py tools\database\oracle\oracle_readonly.py
Move-Item tools\oracle\verify_desktop_message_schema.py tools\database\oracle\verify_desktop_message_schema.py
Move-Item tools\oracle\import_urgent_purchases.py tools\database\oracle\import_urgent_purchases.py
Move-Item tools\oracle\requirements.txt tools\database\oracle\requirements.txt
```

Expected: no Python source remains directly under `tools` or `tools/oracle`.

- [ ] **Step 2: Correct the projects-root depth for the nested Oracle directory**

In `oracle_readonly.py`, replace:

```python
PROJECTS_ROOT = Path(__file__).resolve().parents[3]
```

with:

```python
PROJECTS_ROOT = Path(__file__).resolve().parents[4]
```

In `import_urgent_purchases.py`, change its default-input root from `parents[3]` to `parents[4]`. Update the dependency error command to:

```text
python -m pip install -r tools/database/oracle/requirements.txt
```

- [ ] **Step 3: Compile every moved Python source**

```powershell
python -m py_compile `
  tools\ai\catalog_ai_model_integration.py `
  tools\auth\enterprise_openid_login.py `
  tools\database\oracle\oracle_readonly.py `
  tools\database\oracle\verify_desktop_message_schema.py `
  tools\database\oracle\import_urgent_purchases.py
```

Expected: exit code 0.

### Task 3: Update tests and validate behavior

**Files:**
- Modify: `tools/tests/test_enterprise_openid_login.py`
- Modify: `tools/tests/test_import_urgent_purchases.py`
- Modify: `tools/tests/test_oracle_readonly.py`
- Modify: `tools/tests/test_verify_desktop_message_schema.py`

- [ ] **Step 1: Update Python imports to the new authoritative modules**

Use these import roots:

```python
from tools.auth.enterprise_openid_login import ...
from tools.database.oracle.import_urgent_purchases import ...
from tools.database.oracle.oracle_readonly import ...
from tools.database.oracle.verify_desktop_message_schema import ...
```

- [ ] **Step 2: Run all tool unit tests from the repository root**

```powershell
python -m unittest `
  tools.tests.test_enterprise_openid_login `
  tools.tests.test_import_urgent_purchases `
  tools.tests.test_oracle_readonly `
  tools.tests.test_verify_desktop_message_schema -v
```

Expected: every test passes; no `ModuleNotFoundError` or stale path failure.

- [ ] **Step 3: Verify direct CLI entry points**

```powershell
python tools\auth\enterprise_openid_login.py --help
python tools\ai\catalog_ai_model_integration.py --help
python tools\database\oracle\oracle_readonly.py --help
python tools\database\oracle\verify_desktop_message_schema.py --help
python tools\database\oracle\import_urgent_purchases.py --help
```

Expected: each command exits 0 and prints its argument help without connecting to an external service.

### Task 4: Update documentation and remove generated cache

**Files:**
- Modify: `tools/README.md`
- Modify: `tools/.gitignore`
- Modify: executable path references found under `LianLiaoAIPC/docs/ai-development-handoff`
- Modify: current command references under `docs/superpowers/specs` and `docs/superpowers/plans`
- Remove: `tools/**/__pycache__/`
- Remove: `tools/**/*.pyc`

- [ ] **Step 1: Rewrite README commands and the directory tree**

Use these command prefixes consistently:

```text
tools/build/windows/build_lianliao_aipc_windows.ps1
tools/build/windows/build_lianliao_aipc_windows_fast.ps1
tools/auth/enterprise_openid_login.py
tools/ai/catalog_ai_model_integration.py
tools/database/oracle/oracle_readonly.py
tools/database/oracle/verify_desktop_message_schema.py
tools/database/oracle/import_urgent_purchases.py
tools/database/oracle/requirements.txt
```

The README directory tree must match the design spec exactly.

- [ ] **Step 2: Mechanically update executable repository references**

Replace active command/import references as follows:

```text
tools/oracle/                         -> tools/database/oracle/
tools\oracle\                        -> tools\database\oracle\
tools/enterprise_openid_login.py      -> tools/auth/enterprise_openid_login.py
tools\enterprise_openid_login.py     -> tools\auth\enterprise_openid_login.py
tools/build_lianliao_aipc_windows     -> tools/build/windows/build_lianliao_aipc_windows
tools\build_lianliao_aipc_windows    -> tools\build\windows\build_lianliao_aipc_windows
```

Do not rewrite migration tables where the old path is explicitly labelled as the source of a historical move.

- [ ] **Step 3: Keep recursive Python cache rules and remove only generated bytecode**

Ensure `tools/.gitignore` contains:

```gitignore
__pycache__/
*.py[cod]
```

Delete only `__pycache__` directories and `.pyc` files below `tools`; do not delete logs, source files, query results, or test fixtures.

### Task 5: Final integrity verification

**Files:**
- Verify only: `tools/**`
- Verify only: updated documentation references

- [ ] **Step 1: Verify the root layout**

```powershell
Get-ChildItem tools -Force | Select-Object Name,PSIsContainer
```

Expected top-level entries: `.gitignore`, `README.md`, `ai`, `auth`, `build`, `database`, `tests`; no loose `.py` or `.ps1` files.

- [ ] **Step 2: Search for stale executable paths**

```powershell
rg -n "tools[\\/](oracle|enterprise_openid_login\.py|build_lianliao_aipc_windows)" .
```

Expected: only historical migration statements that explicitly describe an old source path; no executable command, import, or error hint uses an old path.

- [ ] **Step 3: Re-run syntax and behavior checks after cache cleanup**

```powershell
python -m unittest tools.tests.test_enterprise_openid_login tools.tests.test_import_urgent_purchases tools.tests.test_oracle_readonly tools.tests.test_verify_desktop_message_schema -v
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tools\build\windows\build_lianliao_aipc_windows_fast.ps1 -WhatIf
git diff --check
```

Expected: all tests pass, fast build preview succeeds, and `git diff --check` exits 0.

- [ ] **Step 4: Review scope without staging or committing**

```powershell
git status --short
git diff -- tools docs LianLiaoAIPC/docs/ai-development-handoff
```

Expected: the tool reorganization is visible alongside untouched user changes. Do not stage or commit because the user did not request either operation.
