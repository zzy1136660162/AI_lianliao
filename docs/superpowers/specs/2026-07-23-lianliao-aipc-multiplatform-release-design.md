# LianLiaoAIPC 多平台发布与工作台助手默认收起设计

## 1. 背景

`LianLiaoAIPC` 已具备 Windows x64 的 GitHub Actions 构建与 GitHub Release 发布能力。下一阶段需要在同一个正式桌面版本中覆盖 Windows ARM64、macOS Intel、macOS Apple Silicon 和 Ubuntu x64，同时保持 LianLiaoAICore 版本锁定、发布完整性和现有 Windows 用户的升级兼容性。

企业工作台当前默认展开右侧 AI 助手面板，占用业务页面横向空间。本次同步将“链上辽宁·产业云城”企业工作台调整为每次进入时默认收起助手面板，仍允许用户在当前会话中手动展开。

## 2. 目标与非目标

### 2.1 目标

- 一个桌面版本同时发布以下安装包：
  - Windows x64；
  - Windows ARM64；
  - macOS Intel x64；
  - macOS Apple Silicon ARM64；
  - Ubuntu x64。
- 所有平台资产归属同一个 `desktop-v<version>` GitHub Release。
- 发布前验证资产名称、平台覆盖范围和 SHA256，缺少任意必需资产时不得公开 Release。
- Windows ARM64 使用本仓库正式发布且经过 SHA256 锁定的 LianLiaoAICore。
- macOS 首版采用 ad-hoc 签名，暂不要求 Apple Developer ID 公证。
- GitHub Actions Artifact 只保留一个轻量发布报告，不重复存储所有大型安装包。
- 企业工作台每次进入时默认收起助手面板，当前会话中可手动展开或再次收起。

### 2.2 非目标

- 不支持 Windows 32 位（ia32）。
- 不构建 Ubuntu ARM64。
- 本次不配置 Apple Developer ID 证书、公证或 Mac App Store 发布。
- 本次不增加助手面板状态的本地持久化。
- 不改变 `aioncore.exe` 内部文件名。
- 不从上游仓库或 `latest` 地址自动获取 Core。
- 不改变既有 Windows NSIS GUID。

## 3. 发布产物

以版本 `2.1.27` 为例，正式 Release 必须包含：

```text
LianLiaoAIPC-2.1.27-win-x64.exe
LianLiaoAIPC-2.1.27-win-arm64.exe
LianLiaoAIPC-2.1.27-mac-x64.dmg
LianLiaoAIPC-2.1.27-mac-x64.zip
LianLiaoAIPC-2.1.27-mac-arm64.dmg
LianLiaoAIPC-2.1.27-mac-arm64.zip
LianLiaoAIPC-2.1.27-linux-x64.deb
SHA256SUMS.txt
```

最终文件名以 `electron-builder.yml` 的 `artifactName` 规则为准。工作流必须使用精确文件名验证，不能通过模糊通配符把 unpacked 目录、日志、缓存或中间产物上传到 Release。

`SHA256SUMS.txt` 应为每个正式安装包记录小写 SHA256、两个空格和文件名，并按文件名稳定排序。

## 4. LianLiaoAICore 前置扩展

当前 Core Release 已覆盖 Windows x64、macOS x64、macOS ARM64 和 Linux x64，但缺少 Windows ARM64。桌面 Windows ARM64 构建前必须先完成 Core 扩展。

### 4.1 Core 构建矩阵

在 `.github/workflows/lianliao-aicore-release.yml` 中增加：

```text
Runner: windows-latest
Rust target: aarch64-pc-windows-msvc
Release asset: lianliao-aicore-v<core-version>-aarch64-pc-windows-msvc.zip
```

Core 工作流必须验证目标可执行文件、托管资源目录和压缩包 SHA256。Windows ARM64 Core 构建失败时，不得发布包含 Windows ARM64 声明的 Core Release。

### 4.2 Core 锁定

Core ARM64 资产正式发布后，在 `LianLiaoAIPC/aioncore-release-lock.json` 增加 `win32-arm64` 条目，记录：

- 当前仓库 Release tag；
- 精确资产名称；
- SHA256；
- GitHub 仓库标识。

`prepare-aioncore.js` 继续只读取 release lock，不增加上游仓库、`latest` 或本机临时二进制回退。

### 4.3 原生依赖验证

Windows ARM64 构建至少验证：

- Electron ARM64 运行时；
- Node ARM64 托管资源；
- ACP 工具的 `win32-arm64` 产物；
- Rust 或 Node 原生模块架构；
- `aioncore.exe` 能在 ARM64 包中被找到并启动；
- 打包目录中不存在误混入的 x64 Core。

## 5. AIPC GitHub Actions 架构

### 5.1 工作流入口

继续使用根目录：

```text
.github/workflows/lianliao-aipc-release.yml
```

工作流通过 `workflow_dispatch` 手动触发，输入不带 `v` 的三段式桌面版本号。正式发布只允许从 `master` 执行，并要求输入版本与 `LianLiaoAIPC/package.json` 完全一致。

### 5.2 阶段划分

工作流分为以下阶段：

1. `validate`：校验分支、版本、Tag、Core lock 和必需脚本。
2. `create-draft-release`：创建不可见的草稿 Release。
3. `build-windows-x64`：构建并上传 Windows x64 EXE。
4. `build-windows-arm64`：构建并上传 Windows ARM64 EXE。
5. `build-macos-x64`：构建并上传 Intel DMG、ZIP。
6. `build-macos-arm64`：构建并上传 Apple Silicon DMG、ZIP。
7. `build-linux-x64`：构建并上传 Ubuntu x64 DEB。
8. `verify-and-publish`：下载或查询草稿资产，校验精确资产集合和 SHA256，上传校验文件并公开 Release。
9. `upload-report`：上传唯一一个轻量 Actions Artifact，保存版本、Commit、资产清单、大小和 SHA256。

各平台构建并行执行。`verify-and-publish` 依赖所有平台成功；任意平台失败时，Release 保持草稿状态，不能向用户公开残缺版本。

### 5.3 Runner 与命令

| 平台 | Runner | 架构 | 构建命令 |
| --- | --- | --- | --- |
| Windows | `windows-latest` | x64 | `bun run build-win:x64` |
| Windows | `windows-latest` | ARM64 | `bun run build-win:arm64` |
| macOS | `macos-latest` | x64 | `bun run build-mac:x64` |
| macOS | `macos-latest` | ARM64 | `bun run build-mac:arm64` |
| Ubuntu | `ubuntu-22.04` | x64 | `bun run build-deb` |

所有平台统一使用锁定的 Node、Bun 版本和 `bun install --frozen-lockfile`。构建环境设置：

```text
GH_TOKEN=${{ github.token }}
LIANLIAO_RELEASE_BUILD=1
```

Linux 构建需显式安装 electron-builder 生成 DEB 所需的系统依赖，避免依赖 Runner 偶然预装的软件。

### 5.4 Release 作为中转

多平台安装包直接上传至草稿 Release，不使用多个大型 Actions Artifact 中转。这可以避免重复占用 Artifact 存储空间，并保留一个 Release 作为正式长期下载入口。

Actions Artifact 仅保留：

```text
LianLiaoAIPC-<version>-release-report
```

报告内容只包括清单、SHA256、构建元数据和必要日志摘要，不包含安装包，保留期可设置为 30 天。

### 5.5 失败与清理

- 版本 Tag 已存在时，在构建前失败，不覆盖历史 Release。
- 创建草稿后若构建失败，工作流摘要必须输出草稿 Release 地址和失败平台。
- 不自动删除已有正式 Release。
- 仅允许清理本次失败运行创建且仍为草稿的 Release；实现时应优先保留草稿用于诊断，并提供显式人工删除说明。
- GitHub Token、Apple 凭据、数据库凭据不得写入日志或报告。

## 6. macOS 首版签名策略

macOS Intel 和 Apple Silicon 首版均允许 ad-hoc 签名：

- 构建时执行现有 `afterSign.js`；
- 未配置 Apple 开发者凭据时使用 ad-hoc 签名；
- 不执行 Apple notarization；
- Release 说明明确提示用户首次打开可能遇到 Gatekeeper 安全提示；
- 保留 `appleId`、`appleIdPassword`、`teamId` 等环境变量接口，以便后续升级为正式 Developer ID 签名和公证。

ad-hoc 包属于测试和内部试用交付方式。后续正式大规模面向 macOS 用户发布前，应单独完成证书、公证和升级兼容验证。

## 7. 企业工作台助手面板

实现位置为企业工作台壳组件 `EnterpriseShell`。

### 7.1 状态规则

- 进入企业工作台时，`assistantOpen` 初始值为 `false`。
- 用户点击顶部控制按钮后，可在当前挂载周期内展开或收起。
- 离开企业工作台导致组件卸载，再次进入时重新回到收起状态。
- 不写入 localStorage、数据库或用户偏好接口。
- 客服接待、在线咨询等现有强制隐藏助手面板的路由继续优先隐藏。
- 收起状态不能造成主内容区横向溢出或保留空白栏。

### 7.2 无障碍与文案

- 切换按钮的 `aria-expanded` 必须与实际状态一致。
- 收起时保留可识别的“展开助手面板”入口。
- 展开后继续显示“链辽AI”品牌，不恢复 AionUi 用户可见文案。

## 8. 测试与验收

### 8.1 静态验证

- YAML 可被解析；
- package scripts 与工作流命令一致；
- release lock 覆盖五个桌面目标需要的 Core 平台；
- 资产文件名与 electron-builder 配置一致；
- 无个人 PAT、固定 Token 或上游 Core 下载地址；
- Windows NSIS GUID 未变化。

### 8.2 Core 验收

- Windows ARM64 Core 工作流成功；
- Core Release 出现 ARM64 ZIP；
- SHA256 与 lock 完全一致；
- Windows ARM64 AIPC 能通过 lock 下载并验证 Core；
- ARM64 安装包内 Core 架构正确。

### 8.3 AIPC 验收

- 五个平台构建任务全部成功；
- 一个 `desktop-v<version>` Release 包含规定的七个安装包和一个校验文件；
- `SHA256SUMS.txt` 中每项可复算通过；
- GitHub Actions 只保留一个轻量报告 Artifact；
- 任意平台模拟失败时，Release 不会被公开；
- Windows x64 仍可覆盖安装现有版本。

### 8.4 工作台验收

- 首次进入企业工作台时助手面板收起；
- `aria-expanded` 初始为 `false`；
- 点击后能够展开，再次点击能够收起；
- 离开并重新进入后恢复默认收起；
- 客服接待和在线咨询路由仍不显示助手面板；
- 主内容区域可以正常占用释放出的宽度并滚动。

## 9. 文档与运维

实施完成后同步更新：

- 根目录 `README.md`；
- 根目录 `AGENTS.md`；
- `LianLiaoAIPC/README.md`（如存在相关发布章节）；
- Release 工作流注释和运行摘要。

文档应说明：

- 支持的平台和架构；
- Windows ARM64 依赖的 Core Release lock；
- 手动触发参数；
- 草稿 Release 的故障处理方式；
- macOS 首版未公证提示；
- 安装包命名和 SHA256 校验方式；
- 后续接入 Apple Developer ID 的预留配置。

