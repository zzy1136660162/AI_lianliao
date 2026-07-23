# 链上辽宁·产业云城 AI桌面平台

本仓库是链上辽宁企业工作台、桌面通知与客服能力，以及链辽 AI 工作区和本地 AI Core 的统一代码仓库。

## 项目结构

```text
AI_lianliao/
├─ LianLiaoAIPC/       Electron + React 桌面端
├─ LianLiaoAICore/     Rust 本地 AI Core
├─ .github/workflows/  链辽 Core 多平台发布工作流
├─ docs/               跨项目设计与实施文档
└─ tools/              只读数据库查询及项目辅助工具
```

| 名称 | 固定值 |
| --- | --- |
| 用户可见应用名称 | `链上辽宁·产业云城 AI桌面平台` |
| 桌面端源码目录 | `LianLiaoAIPC` |
| Core 源码目录 | `LianLiaoAICore` |
| Electron App ID / Windows AUMID | `com.lianliao.app` |
| Windows Core 内部文件名 | `aioncore.exe` |
| 正式版数据目录 | `LianLiaoAIPC` |
| 开发版数据目录 | `LianLiaoAIPC-Dev` |
| 当前深链接协议 | `lianliao://` |
| 兼容深链接协议 | `aionui://` |

`链辽AI` 是客户端内部 AI 功能区的产品称谓；操作系统、安装器和系统通知使用完整桌面平台名称。

## 兼容边界

为了继续吸收 AionUi/AionCore 上游更新，以下内部标识暂不重命名：

- `aioncore.exe`；
- Rust workspace 中的 `aionui-*` crate；
- REST API、WebSocket 事件和 MCP server ID；
- SQLite 数据库文件、表结构和迁移序号；
- `AIONUI_*` 环境变量和历史存储键。

这些是内部兼容标识，不应重新出现在新增的用户可见标题中。

## 本地开发

桌面端：

```powershell
cd E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
npm install
npm run dev
```

Core：

```powershell
cd E:\ZZY_PROJECT\AI_lianliao\LianLiaoAICore
cargo build -p aionui-app
cargo run -p aionui-app -- --help
```

开发时需要让桌面打包脚本使用本地 Core，可以显式设置：

```powershell
$env:LIANLIAO_AICORE_LOCAL_BINARY='E:\path\to\aioncore.exe'
```

设置 `LIANLIAO_RELEASE_BUILD=1` 后，构建会拒绝本地 binary 和 Actions 临时 artifact，只接受 Release lock 中固定的正式资产。

## 用户数据迁移

新版本首次启动时按相同运行模式迁移：

```text
AionUi       -> LianLiaoAIPC
AionUi-Dev   -> LianLiaoAIPC-Dev
AionUi-Dev-2 -> LianLiaoAIPC-Dev-2
```

迁移只复制旧目录，在新目录完成文件大小与 SQLite 只读校验后才切换。旧目录不会自动删除。需要回退时，退出桌面端，将有问题的新目录改名，再恢复使用对应旧目录。

## LianLiaoAICore 发布

正式 Core 资产发布到：

[zzy1136660162/AI_lianliao Releases](https://github.com/zzy1136660162/AI_lianliao/releases)

发布流程：

1. 在 GitHub Actions 运行 `Release LianLiaoAICore`，输入不带 `v` 的版本号，例如 `0.1.47`；或推送 `aicore-v0.1.47` 标签。
2. 工作流生成 Windows x64、macOS x64/arm64、Linux x64 资产和 `SHA256SUMS`。
3. 将每个平台的真实 SHA256 写入 `LianLiaoAIPC/aioncore-release-lock.json`。
4. 运行 `node scripts/verifyAioncoreReleaseLock.js`。
5. 再构建桌面安装包。

正式桌面构建不使用 `latest`，也不回退到 `iOfficeAI/AionCore`。缺少资产或 SHA256 时会明确失败。

当前 `v0.1.47` lock 中的 SHA256 仍为空，这是发布前的安全状态：在本仓库 GitHub Release 生成四个平台的真实 Core 资产并回填校验值之前，正式安装器构建应当失败，不能用占位校验值绕过。

## 桌面安装包发布位置

链辽桌面安装包上传服务器：

```text
SSH 主机：10.2.202.23
上传目录：/mnt/web/beiruan_ai/desktop_lianliao
```

上传后必须核对远端文件大小与 SHA256，再把 HTTPS 安装链接写入桌面版本表。仓库文档只记录主机和目录，不记录 SSH 密码、Token、模型密钥或数据库凭据。

## 设计文档

- [品牌、目录及发布迁移设计](docs/superpowers/specs/2026-07-23-lianliao-desktop-core-brand-migration-design.md)
- [品牌迁移实施计划](docs/superpowers/plans/2026-07-23-lianliao-desktop-core-brand-migration.md)
