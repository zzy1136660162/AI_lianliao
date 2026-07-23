# LianLiaoAIPC GitHub Actions Windows 发布设计

## 1. 背景与目标

当前仓库已经通过 `.github/workflows/lianliao-aicore-release.yml` 发布 LianLiaoAICore，但还没有位于仓库根目录、能够实际运行的 Electron 桌面端发布工作流。

本设计为 `LianLiaoAIPC` 增加一个手动触发的 Windows x64 发布流程。每次成功运行同时生成：

1. GitHub Actions Artifact，供开发测试和短期下载；
2. GitHub Release，供正式版本长期下载。

第一版只构建 Windows x64。macOS、Linux、Windows arm64 不属于本次范围。

## 2. 工作流入口

新增根目录工作流：

```text
.github/workflows/lianliao-aipc-release.yml
```

工作流显示名称为 `Release LianLiaoAIPC Windows`，仅提供 `workflow_dispatch` 手动入口。

运行者必须输入不带 `v` 的桌面版本号，例如：

```text
2.1.27
```

工作流只允许从 `master` 分支正式发布。版本号必须同时满足：

- 格式为三个非负整数，例如 `2.1.27`；
- 与 `LianLiaoAIPC/package.json` 的 `version` 完全一致；
- 对应的正式 Tag `desktop-v2.1.27` 尚不存在。

任一条件不满足时，工作流在安装依赖和构建之前失败。

## 3. 权限与并发控制

工作流只申请发布所需权限：

```yaml
permissions:
  contents: write
```

使用版本级并发锁：

```text
lianliao-aipc-release-2.1.27
```

同一版本同时只能运行一个发布任务，后发任务不取消正在执行的发布任务。

Core 私有 Release 下载和桌面 Release 发布都使用 GitHub Actions 自动生成的短期 `github.token`。工作流不得读取或保存个人 PAT。

## 4. 构建环境

构建 Job 使用：

- Runner：`windows-latest`
- 工作目录：`LianLiaoAIPC`
- Node.js：24
- Bun：1.3.14
- 依赖安装：`bun install --frozen-lockfile`

构建命令：

```powershell
bun run build-win:x64
```

构建环境必须设置：

```text
GH_TOKEN=${{ github.token }}
LIANLIAO_RELEASE_BUILD=1
```

`LIANLIAO_RELEASE_BUILD=1` 保证正式桌面构建只能使用 `aioncore-release-lock.json` 锁定的 LianLiaoAICore Release 资产，拒绝本地二进制和临时 Actions Core。

## 5. Core 与托管资源

桌面构建继续调用现有 `prepare-aioncore.js`，通过 GitHub API 下载私有 Release 中的 Windows x64 Core：

```text
lianliao-aicore-v0.1.47-x86_64-pc-windows-msvc.zip
```

下载后必须通过 `aioncore-release-lock.json` 中的 SHA256 校验。随后由 Core 执行 `prepare-managed-resources`，生成 Node 和内置 ACP 等离线托管资源。

以下任一情况必须使构建失败：

- Release 或资产不存在；
- GitHub API 鉴权失败；
- SHA256 不匹配；
- Core 二进制缺失；
- 托管资源准备失败；
- Electron 安装包构建失败。

失败时不得创建或发布桌面 Release。

## 6. 构建产物

版本 `2.1.27` 的预期 Windows 安装包为：

```text
LianLiaoAIPC-2.1.27-win-x64.exe
```

工作流必须精确检查该文件存在，并生成：

```text
SHA256SUMS
```

`SHA256SUMS` 使用标准的小写 SHA256、两个空格和文件名格式，例如：

```text
<64位SHA256>  LianLiaoAIPC-2.1.27-win-x64.exe
```

工作流必须核对最终待上传文件只有安装包和校验文件，避免把 `win-unpacked`、缓存、日志或中间文件作为正式资产上传。

## 7. GitHub Actions Artifact

成功构建后上传 Actions Artifact：

```text
LianLiaoAIPC-2.1.27-windows-x64
```

Artifact 内容：

- `LianLiaoAIPC-2.1.27-win-x64.exe`
- `SHA256SUMS`

保留时间为 30 天。Artifact 用于测试、验证和学习 Actions 下载流程，不作为数据库或正式更新接口的长期下载地址。

## 8. GitHub Release

Artifact 上传成功后创建正式 GitHub Release：

```text
Tag: desktop-v2.1.27
标题: 链上辽宁·产业云城 AI桌面平台 v2.1.27
```

Release 内容：

- `LianLiaoAIPC-2.1.27-win-x64.exe`
- `SHA256SUMS`

Release 说明至少包含：

- 发布版本；
- 支持平台为 Windows x64；
- Core 版本来自当前 Release lock；
- SHA256 校验提示；
- 当前安装包未配置 Windows 代码签名证书，可能出现 SmartScreen 提示。

Release 创建采用先草稿、上传并验证资产、最后转正式发布的顺序。这样上传失败时不会向用户展示不完整的正式版本。

若 `desktop-v2.1.27` 已存在，工作流必须失败，不覆盖、不删除、不修改既有正式 Release。

## 9. 可观察性与学习体验

Actions 页面中的步骤名称使用清晰的英文动作和链辽业务名，使运行者可以按顺序学习：

1. Validate release input
2. Checkout source
3. Set up Node and Bun
4. Install dependencies
5. Verify Core release lock
6. Build Windows x64 installer
7. Verify installer and generate SHA256
8. Upload Actions artifact
9. Create draft GitHub Release
10. Upload and verify Release assets
11. Publish GitHub Release

关键步骤通过 `$GITHUB_STEP_SUMMARY` 输出版本、Commit、安装包文件名、大小、SHA256、Artifact 名称和 Release Tag。摘要不得输出 Token、Cookie、数据库凭据或其他密钥。

## 10. 验证标准

工作流代码提交前必须完成：

- YAML 语法检查；
- 版本校验脚本或内联逻辑的正常与异常输入验证；
- `aioncore-release-lock.json` 完整性验证；
- 工作流路径位于仓库根目录 `.github/workflows`；
- 检查没有个人 Token、固定凭据或上游 Core 下载地址。

首次真实运行以 `2.1.27` 为目标，验收条件为：

- Windows Job 成功；
- Actions 运行页面出现可下载 Artifact；
- Releases 页面出现 `desktop-v2.1.27`；
- Artifact 和 Release 中的 EXE SHA256 完全一致；
- Release 中只有安装包和 `SHA256SUMS`；
- 工作流摘要展示版本、Commit、文件大小和校验值。

## 11. 后续扩展

第一版跑通后，可以在独立设计中扩展：

- Windows arm64；
- macOS x64/arm64 及签名、公证；
- Linux x64；
- 将正式安装包同步到 `10.2.202.23:/mnt/web/beiruan_ai/desktop_lianliao`；
- 将 HTTPS 安装地址写入桌面版本数据库；
- Windows 代码签名与 SmartScreen 信任链。

这些扩展不改变第一版 Windows x64 工作流的发布 Tag 规则。
