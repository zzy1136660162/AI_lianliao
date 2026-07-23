# 链辽桌面端与 AI Core 品牌迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将仓库中的 Electron 桌面端和 Rust Core 安全迁移为 `LianLiaoAIPC`、`LianLiaoAICore`，统一系统品牌，并让正式构建只使用链辽仓库中固定版本且经过 SHA256 校验的 Core。

**Architecture:** Electron 主进程新增集中式产品身份、用户数据迁移和双协议解析模块；构建侧使用 Release lock 固定 Core 仓库、版本、资产与 SHA256；Rust 内部 crate、`aioncore.exe`、数据库和 API/WS 契约保持不变。源码目录物理重命名后更新所有路径引用，旧用户数据只复制、校验和切换，不自动删除。

**Tech Stack:** Electron 37、React 19、TypeScript 5、Node.js、electron-builder/NSIS、Vitest、Rust 2024、Clap、Cargo、GitHub Actions。

**Execution policy:** 用户明确要求先开发后测试，因此本计划不采用 TDD；测试集中在功能实现之后执行。当前工作区包含大量已有修改，实施时不自动提交、不重置、不清理任何无关文件。

**Implementation status (2026-07-23):** Task 1–7 已实施；桌面端定向测试、TypeScript 检查、lint 和 Vite 生产构建已通过。Task 8 的本机 Rust 编译验证尚未执行，因为当前机器未安装 Rust/Cargo；正式安装器构建按设计继续被空的 Release SHA256 阻断，需先运行 `Release LianLiaoAICore` 工作流并将真实校验值写回 lock。当前未提交、未推送、未创建 GitHub Release。

---

### Task 1: 记录状态并物理重命名项目目录

**Files:**
- Move: `AionUi` → `LianLiaoAIPC`
- Move: `AionCore` → `LianLiaoAICore`
- Modify: `.gitignore`
- Modify: `.idea/*` 中实际存在的旧目录引用
- Modify: `docs/**/*.md` 中实际存在的旧绝对路径

- [ ] **Step 1: 记录重命名前状态**

Run:

```powershell
git -C E:\ZZY_PROJECT\AI_lianliao status --short --branch
Get-Process electron,node,aioncore -ErrorAction SilentlyContinue |
  Select-Object Id,ProcessName,Path
```

Expected: 输出当前 `codex/urgent-purchase-import` 分支、已有修改和可能占用目录的进程，不修改文件。

- [ ] **Step 2: 只停止从旧项目目录启动的进程**

先通过进程命令行确认工作目录或脚本路径包含 `E:\ZZY_PROJECT\AI_lianliao\AionUi`，再停止对应进程树。不得按进程名全局终止所有 Node/Electron。

- [ ] **Step 3: 校验并移动目录**

```powershell
$root = 'E:\ZZY_PROJECT\AI_lianliao'
$uiSource = Join-Path $root 'AionUi'
$uiTarget = Join-Path $root 'LianLiaoAIPC'
$coreSource = Join-Path $root 'AionCore'
$coreTarget = Join-Path $root 'LianLiaoAICore'

foreach ($path in @($uiSource, $coreSource)) {
  if (-not (Test-Path -LiteralPath $path -PathType Container)) {
    throw "Source directory missing: $path"
  }
}
foreach ($path in @($uiTarget, $coreTarget)) {
  if (Test-Path -LiteralPath $path) {
    throw "Target already exists: $path"
  }
}

Move-Item -LiteralPath $uiSource -Destination $uiTarget
Move-Item -LiteralPath $coreSource -Destination $coreTarget
```

Expected: 两个新目录存在，两个旧目录不存在，目录内已修改和未跟踪文件均被保留。

- [ ] **Step 4: 更新仓库级路径**

将 `.gitignore` 中：

```gitignore
/AionUi/resources/aionui sort file 2.gif
/AionUi/resources/AionUi_team.gif
```

改为：

```gitignore
/LianLiaoAIPC/resources/aionui sort file 2.gif
/LianLiaoAIPC/resources/AionUi_team.gif
```

仅修改路径，不改兼容资源文件名。

- [ ] **Step 5: 扫描遗漏的源码目录引用**

Run:

```powershell
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' `
  'AI_lianliao[\\/]+AionUi|AI_lianliao[\\/]+AionCore|(^|[\\/])AionUi([\\/]|$)|(^|[\\/])AionCore([\\/]|$)' `
  E:\ZZY_PROJECT\AI_lianliao
```

Expected: 只剩明确标记为“旧目录”“兼容目录”或上游历史说明的引用。

### Task 2: 集中桌面身份并修复安装升级身份

**Files:**
- Create: `LianLiaoAIPC/packages/desktop/src/common/platform/productIdentity.ts`
- Create: `LianLiaoAIPC/packages/desktop/src/process/utils/configureDesktopIdentity.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/utils/configureChromium.ts`
- Modify: `LianLiaoAIPC/packages/desktop/electron-builder.yml`
- Modify: `LianLiaoAIPC/package.json`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/index.html`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/config/constants.ts`

- [ ] **Step 1: 新增集中式身份常量**

`productIdentity.ts` 定义：

```ts
export const DESKTOP_PRODUCT_NAME = '链上辽宁·产业云城 AI桌面平台';
export const DESKTOP_PACKAGE_NAME = 'lianliao-ai-pc';
export const DESKTOP_APP_ID = 'com.lianliao.app';
export const PRIMARY_PROTOCOL_SCHEME = 'lianliao';
export const LEGACY_PROTOCOL_SCHEMES = ['aionui'] as const;
export const SUPPORTED_PROTOCOL_SCHEMES = [
  PRIMARY_PROTOCOL_SCHEME,
  ...LEGACY_PROTOCOL_SCHEMES,
] as const;
```

`AI_PRODUCT_NAME = '链辽AI'` 继续表示 AI 功能区名称，不替代桌面应用的系统名称。

- [ ] **Step 2: 在任何窗口创建前设置桌面身份**

`configureDesktopIdentity.ts` 提供：

```ts
import type { App } from 'electron';
import { DESKTOP_APP_ID, DESKTOP_PRODUCT_NAME } from '@/common/platform/productIdentity';

export function configureDesktopIdentity(app: Pick<App, 'setAppUserModelId' | 'setName'>): void {
  app.setName(DESKTOP_PRODUCT_NAME);
  if (process.platform === 'win32') {
    app.setAppUserModelId(DESKTOP_APP_ID);
  }
}
```

在 `configureChromium.ts` 中先调用 `configureDesktopIdentity(app)`，随后执行用户数据路径配置，且两者均位于任何 BrowserWindow 创建和通知发送之前。

- [ ] **Step 3: 更新 electron-builder 身份**

`electron-builder.yml` 使用：

```yaml
appId: com.lianliao.app
productName: 链上辽宁·产业云城 AI桌面平台
executableName: LianLiaoAIPC
copyright: Copyright © 2026 链上辽宁·产业云城

protocols:
  - name: 链辽桌面平台协议
    schemes:
      - lianliao
      - aionui

nsis:
  guid: f3bfde38-8429-545c-a4e9-a078d87dee6c
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
```

`f3bfde38-8429-545c-a4e9-a078d87dee6c` 是旧 `com.aionui.app` 按 electron-builder 命名空间计算的 UUID v5，用于保持 Windows 覆盖升级身份。

Linux desktop entry 使用：

```yaml
Name: 链上辽宁·产业云城 AI桌面平台
Icon: LianLiaoAIPC
MimeType: x-scheme-handler/lianliao;x-scheme-handler/aionui;
```

- [ ] **Step 4: 更新包元数据**

`package.json` 至少更新：

```json
{
  "name": "lianliao-ai-pc",
  "description": "链上辽宁·产业云城 AI桌面平台",
  "author": {
    "name": "链上辽宁·产业云城"
  },
  "desktopName": "com.lianliao.app.desktop",
  "productName": "链上辽宁·产业云城 AI桌面平台"
}
```

工作区包名 `@aionui/*` 暂不重命名，避免破坏内部依赖。

### Task 3: 实现幂等用户数据目录迁移

**Files:**
- Create: `LianLiaoAIPC/packages/desktop/src/common/platform/userDataMigration.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/platform/userDataPath.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/platform/index.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/utils/configureChromium.ts`

- [ ] **Step 1: 定义新旧目录映射**

`userDataPath.ts` 使用：

```ts
export const PACKAGED_USER_DATA_DIRECTORY = 'LianLiaoAIPC';
export const LEGACY_PACKAGED_USER_DATA_DIRECTORY = 'AionUi';
export const DEV_USER_DATA_DIRECTORY = 'LianLiaoAIPC-Dev';
export const LEGACY_DEV_USER_DATA_DIRECTORY = 'AionUi-Dev';
export const MULTI_INSTANCE_DEV_USER_DATA_DIRECTORY = 'LianLiaoAIPC-Dev-2';
export const LEGACY_MULTI_INSTANCE_DEV_USER_DATA_DIRECTORY = 'AionUi-Dev-2';
```

正式版、单实例开发版和第二开发实例均返回新目录；显示名称不再参与路径计算。

- [ ] **Step 2: 实现纯文件系统迁移器**

`userDataMigration.ts` 定义可注入文件系统接口和结果：

```ts
export type UserDataMigrationStatus =
  | 'not-needed'
  | 'migrated'
  | 'source-missing'
  | 'target-in-use'
  | 'failed';

export interface UserDataMigrationResult {
  status: UserDataMigrationStatus;
  sourcePath: string;
  targetPath: string;
  error?: string;
}

export function migrateLegacyUserData(options: {
  sourcePath: string;
  targetPath: string;
  applicationVersion: string;
}): UserDataMigrationResult;
```

实现规则：

1. 目标存在且非空时返回 `target-in-use`；
2. 源不存在时返回 `source-missing`；
3. 复制到 `${targetPath}.migrating-${process.pid}`；
4. 比对关键文件的大小，并以只读方式打开存在的 `aionui.db`；
5. 写入 `lianliao-migration.json`；
6. 将临时目录重命名为目标目录；
7. 失败时清理临时目录，保留源目录。

迁移元数据结构：

```ts
interface UserDataMigrationRecord {
  schemaVersion: 1;
  sourcePath: string;
  targetPath: string;
  applicationVersion: string;
  migratedAt: string;
  validatedDatabase: boolean;
}
```

- [ ] **Step 3: 在 setPath 前执行迁移**

`configureUserDataPath` 顺序固定为：

```ts
const defaultUserDataPath = app.getPath('userData');
const { sourcePath, targetPath } = resolveUserDataMigrationPaths(defaultUserDataPath, options);
migrateLegacyUserData({ sourcePath, targetPath, applicationVersion: app.getVersion() });
ensureDirectory(targetPath, { recursive: true });
app.setPath('userData', targetPath);
return targetPath;
```

开发多实例只迁移对应的 `AionUi-Dev-2`，不读取正式版目录。

### Task 4: 同时支持 `lianliao://` 与 `aionui://`

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/process/utils/deepLink.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/index.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/hooks/system/useDeepLink.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/settings/components/AddPlatformModal.tsx`
- Modify: `LianLiaoAIPC/scripts/install-ubuntu.sh`

- [ ] **Step 1: 统一解析函数**

`deepLink.ts` 使用 `SUPPORTED_PROTOCOL_SCHEMES`：

```ts
export function isSupportedDeepLinkUrl(value: string): boolean {
  return SUPPORTED_PROTOCOL_SCHEMES.some((scheme) => value.startsWith(`${scheme}://`));
}

export const parseDeepLinkUrl = (
  url: string
): { action: string; params: Record<string, string> } | null => {
  const parsed = new URL(url);
  const scheme = parsed.protocol.slice(0, -1);
  if (!SUPPORTED_PROTOCOL_SCHEMES.includes(scheme as (typeof SUPPORTED_PROTOCOL_SCHEMES)[number])) {
    return null;
  }
  // 后续 action、查询参数和 data 解码逻辑继续复用现有实现。
};
```

- [ ] **Step 2: 主进程注册和接收两种协议**

`index.ts`：

```ts
for (const scheme of SUPPORTED_PROTOCOL_SCHEMES) {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(scheme);
  }
}
```

启动参数和 second-instance 参数都通过 `isSupportedDeepLinkUrl` 查找，不再只匹配单个常量。

- [ ] **Step 3: 新生成链接只使用主协议**

设置页、复制链接和 Linux 安装脚本生成 `lianliao://`；旧 `aionui://` 只用于接收兼容。

### Task 5: 固定链辽 AICore Release 与 SHA256

**Files:**
- Create: `LianLiaoAIPC/aioncore-release-lock.json`
- Create: `LianLiaoAIPC/scripts/verifyAioncoreReleaseLock.js`
- Modify: `LianLiaoAIPC/packages/shared-scripts/src/prepare-aioncore.js`
- Modify: `LianLiaoAIPC/scripts/prepareAioncore.js`
- Modify: `LianLiaoAIPC/scripts/resolveAioncoreVersion.js`
- Modify: `LianLiaoAIPC/scripts/build-with-builder.js`
- Modify: `LianLiaoAIPC/package.json`

- [ ] **Step 1: 定义 Release lock**

文件结构固定为：

```json
{
  "schemaVersion": 1,
  "repository": "zzy1136660162/AI_lianliao",
  "version": "v0.1.47",
  "assets": {
    "win32-x64": {
      "name": "lianliao-aicore-v0.1.47-x86_64-pc-windows-msvc.zip",
      "sha256": ""
    },
    "darwin-x64": {
      "name": "lianliao-aicore-v0.1.47-x86_64-apple-darwin.tar.gz",
      "sha256": ""
    },
    "darwin-arm64": {
      "name": "lianliao-aicore-v0.1.47-aarch64-apple-darwin.tar.gz",
      "sha256": ""
    },
    "linux-x64": {
      "name": "lianliao-aicore-v0.1.47-x86_64-unknown-linux-gnu.tar.gz",
      "sha256": ""
    }
  }
}
```

空 SHA256 表示该平台尚未发布，`verifyAioncoreReleaseLock.js` 和正式构建必须明确失败；不得跳过校验。发布 Core 后用真实 SHA256 更新 lock。

- [ ] **Step 2: 删除 latest 和上游回退**

`prepare-aioncore.js` 使用：

```js
const GITHUB_OWNER = 'zzy1136660162';
const GITHUB_REPO = 'AI_lianliao';
```

删除 `resolveLatestTag()` 生产路径和 `latest` 默认值。下载 URL固定为：

```js
function getDownloadUrl(assetName, tag) {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}/${assetName}`;
}
```

Release 下载失败时直接抛错，不再仅 `console.warn` 后尝试其他生产来源。

- [ ] **Step 3: 下载后立即校验**

```js
const crypto = require('crypto');

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function assertSha256(filePath, expectedSha256) {
  const actual = sha256File(filePath);
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(`LianLiaoAICore SHA256 mismatch: expected ${expectedSha256}, got ${actual}`);
  }
}
```

校验发生在解压和执行 `prepare-managed-resources` 之前。manifest 记录 repository、asset、expectedSha256 和 actualSha256。

- [ ] **Step 4: 保留显式本地开发入口**

支持：

```text
LIANLIAO_AICORE_LOCAL_BINARY=E:\...\aioncore.exe
```

仅当该变量显式存在时复制本地 binary；manifest 的 `sourceType` 写为 `local-development`。正式 CI 设置 `LIANLIAO_RELEASE_BUILD=1` 时拒绝本地 binary。

### Task 6: 调整 LianLiaoAICore 品牌与根级发布工作流

**Files:**
- Modify: `LianLiaoAICore/crates/aionui-app/src/cli.rs`
- Modify: `LianLiaoAICore/ARCHITECTURE.md`
- Modify: `LianLiaoAICore/ARCHITECTURE.zh-CN.md`
- Create: `.github/workflows/lianliao-aicore-release.yml`
- Keep compatible: `LianLiaoAICore/crates/*` crate names and `[[bin]] name = "aioncore"`

- [ ] **Step 1: 修改 CLI 用户可见标题**

保持命令名，修改说明：

```rust
#[derive(Parser)]
#[command(
    name = "aioncore",
    about = "链辽 AI Core 本地服务",
    long_about = "链辽 AI Core 本地服务，为链上辽宁·产业云城 AI桌面平台提供会话、Agent、MCP、技能与运行时能力。",
    version
)]
pub(crate) struct Cli {
    // 参数、子命令和兼容环境变量保持不变。
}
```

不修改现有 REST、WebSocket、MCP、SQLite 和 `AIONUI_*` 标识。

- [ ] **Step 2: 在仓库根目录创建有效 GitHub 工作流**

GitHub 只执行仓库根 `.github/workflows`，因此工作流必须位于根目录，并为 Cargo 命令设置：

```yaml
defaults:
  run:
    working-directory: LianLiaoAICore
```

触发条件：

```yaml
on:
  workflow_dispatch:
    inputs:
      version:
        description: LianLiaoAICore version without v prefix
        required: true
  push:
    tags:
      - "aicore-v*"
```

矩阵构建 Windows x64、macOS x64/arm64、Linux x64；二进制内部名称保持 `aioncore`/`aioncore.exe`，归档名称使用 `lianliao-aicore-v{version}-{target}`。

- [ ] **Step 3: 生成校验清单并发布**

发布 job 下载所有构建 artifact，执行：

```bash
sha256sum lianliao-aicore-* > SHA256SUMS
gh release create "aicore-v${VERSION}" lianliao-aicore-* SHA256SUMS \
  --repo "${GITHUB_REPOSITORY}" \
  --title "LianLiaoAICore v${VERSION}"
```

若 Release 已存在则使用 `gh release upload --clobber`。工作流只发布当前仓库，不引用上游 Release。

### Task 7: 补充 README、AGENTS 与长期维护约束

**Files:**
- Create: `README.md`
- Create: `AGENTS.md`
- Modify: `LianLiaoAIPC/readme.md`
- Modify: `LianLiaoAIPC/AGENTS.md`
- Create: `LianLiaoAICore/README.md`
- Modify: `LianLiaoAICore/AGENTS.md`
- Modify: `LianLiaoAIPC/docs/ai-development-handoff/*.md`

- [ ] **Step 1: 根 README**

记录：

- `LianLiaoAIPC` 与 `LianLiaoAICore` 的职责；
- 用户可见品牌与内部兼容名称的边界；
- 本地开发命令；
- Core Release、lock 和 SHA256 更新流程；
- Windows 安装包上传服务器 `10.2.202.23:/mnt/web/beiruan_ai/desktop_lianliao`；
- 不记录 SSH 密码、Token、数据库凭据。

- [ ] **Step 2: 根 AGENTS**

写入强制规则：

```text
- 正式桌面构建不得下载 iOfficeAI/AionCore 或 latest。
- 不得重命名 aioncore.exe、内部 Rust crate、REST/WS 事件、SQLite 文件或 AIONUI_* 兼容变量。
- 修改 appId 时必须保留 NSIS guid f3bfde38-8429-545c-a4e9-a078d87dee6c。
- 用户数据迁移只复制和校验，不自动删除 AionUi/AionUi-Dev。
- Release 资产必须来自 zzy1136660162/AI_lianliao 并通过 lock 中 SHA256。
- 源码目录固定为 LianLiaoAIPC 与 LianLiaoAICore。
```

- [ ] **Step 3: 子项目文档**

桌面端文档说明身份、协议、数据迁移、构建和回退；Core 文档说明内部兼容边界、构建矩阵、发布资产和上游吸收流程。

### Task 8: 开发完成后集中补充并运行测试

**Files:**
- Modify: `LianLiaoAIPC/tests/unit/process/userDataPath.test.ts`
- Create: `LianLiaoAIPC/tests/unit/process/userDataMigration.test.ts`
- Create: `LianLiaoAIPC/tests/unit/process/productIdentity.test.ts`
- Create: `LianLiaoAIPC/tests/unit/process/deepLink.test.ts`
- Modify: `LianLiaoAIPC/tests/unit/releasePackagingConfig.test.ts`
- Create: `LianLiaoAIPC/tests/unit/assets/aioncoreReleaseLock.test.ts`
- Modify: `LianLiaoAICore/crates/aionui-app/src/cli.rs` 内现有单元测试

- [ ] **Step 1: 用户数据迁移测试**

覆盖：

```ts
it('copies legacy packaged data into LianLiaoAIPC and preserves the source');
it('does not overwrite a non-empty LianLiaoAIPC directory');
it('is idempotent after a successful migration');
it('removes only the temporary target after validation failure');
it('maps AionUi-Dev-2 only to LianLiaoAIPC-Dev-2');
```

- [ ] **Step 2: 身份与协议测试**

验证：

```ts
expect(DESKTOP_PRODUCT_NAME).toBe('链上辽宁·产业云城 AI桌面平台');
expect(DESKTOP_APP_ID).toBe('com.lianliao.app');
expect(parseDeepLinkUrl('lianliao://add-provider?x=1')).not.toBeNull();
expect(parseDeepLinkUrl('aionui://add-provider?x=1')).not.toBeNull();
expect(parseDeepLinkUrl('https://example.com')).toBeNull();
```

- [ ] **Step 3: Release lock 测试**

验证：

```ts
expect(lock.repository).toBe('zzy1136660162/AI_lianliao');
expect(Object.values(lock.assets).every((asset) => asset.name.startsWith('lianliao-aicore-'))).toBe(true);
expect(source).not.toContain("const GITHUB_OWNER = 'iOfficeAI'");
expect(source).not.toContain("version = 'latest'");
```

并使用临时文件验证 SHA256 正确时通过、错误时抛出 `LianLiaoAICore SHA256 mismatch`。

- [ ] **Step 4: 运行桌面端验证**

Run:

```powershell
cd E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
npm run typecheck:enterprise-tests
npx vitest run tests/unit/process/userDataPath.test.ts `
  tests/unit/process/userDataMigration.test.ts `
  tests/unit/process/productIdentity.test.ts `
  tests/unit/process/deepLink.test.ts `
  tests/unit/releasePackagingConfig.test.ts `
  tests/unit/assets/aioncoreReleaseLock.test.ts
npm run package
```

Expected: 命令退出码均为 0；Vite 生成 `out/main/index.js`、preload 和 renderer。

- [ ] **Step 5: 运行 Core 验证**

Run:

```powershell
cd E:\ZZY_PROJECT\AI_lianliao\LianLiaoAICore
cargo fmt --all -- --check
cargo clippy -p aionui-app --all-targets -- -D warnings
cargo test -p aionui-app cli
cargo run -p aionui-app -- --help
```

Expected: 格式、Clippy 和测试退出码为 0；帮助文本显示“链辽 AI Core 本地服务”，命令名仍为 `aioncore`。

- [ ] **Step 6: Windows 构建与人工升级验收**

在 lock 中 Windows SHA256 已填入并且对应 Release 资产存在后运行：

```powershell
cd E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
npm run build-win:x64
```

Expected:

- 构建只访问 `zzy1136660162/AI_lianliao/releases`；
- SHA256 校验通过；
- 安装包包含 `bundled-aioncore/win32-x64/aioncore.exe` 和 managed resources；
- 安装器名称使用链辽桌面平台品牌；
- 从旧版覆盖安装后不产生重复卸载项；
- Windows 通知来源显示“链上辽宁·产业云城 AI桌面平台”。
