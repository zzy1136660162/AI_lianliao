# 链上辽宁·产业云城 AI桌面平台

本仓库是链上辽宁企业工作台、桌面通知与客服能力，以及链辽 AI 工作区和本地 AI Core 的统一代码仓库。

## 项目结构

```text
AI_lianliao/
├─ LianLiaoAIPC/       Electron + React 桌面端
├─ LianLiaoAICore/     Rust 本地 AI Core
├─ .github/workflows/  链辽 Core 与桌面端发布工作流
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

1. 在 GitHub Actions 运行 `Release LianLiaoAICore`，输入不带 `v` 的版本号，例如 `0.1.48`；或推送 `aicore-v0.1.48` 标签。
2. 未明确要求多平台时，`release_scope` 默认使用 `windows-x64`，只生成 Windows x64 资产和 `SHA256SUMS`；明确需要全平台时才选择 `all`。
3. 将本次发布平台的真实 SHA256 写入 `LianLiaoAIPC/aioncore-release-lock.json`。
4. 运行 `node scripts/verifyAioncoreReleaseLock.js`。
5. 再构建桌面安装包。

正式桌面构建不使用 `latest`，也不回退到 `iOfficeAI/AionCore`。缺少资产或 SHA256 时会明确失败。

`v0.1.48` 是桌面端五平台发布使用的 Core 版本，新增 Windows ARM64 正式资产。`LianLiaoAIPC/aioncore-release-lock.json` 必须回填 GitHub Release 中五个资产的真实 SHA256；版本、文件名或 SHA256 任一不匹配时都会立即失败。

仓库公开后可以匿名下载 Release 资产；为避免 GitHub API 速率限制，本地连续构建时仍推荐执行 `gh auth login`。CI 或临时 PowerShell 会话也可以设置 `GH_TOKEN` / `GITHUB_TOKEN`。构建脚本只从进程环境读取令牌，不会把令牌写入仓库、清单或日志。已经暴露在聊天、截图或终端记录中的令牌必须立即撤销，不能继续使用。

当前开发网络需要本地代理时，先在同一个 PowerShell 会话设置 `$env:HTTPS_PROXY='http://127.0.0.1:7897'` 和 `$env:HTTP_PROXY='http://127.0.0.1:7897'`，再执行 GitHub 登录与桌面构建。

### GitHub Actions 目录约定

GitHub 只执行仓库根目录 `.github/workflows` 中的工作流。本仓库是单仓库多项目结构，因此：

- Core、桌面端及后续服务的 CI/Release 工作流统一维护在根目录 `.github/workflows`。
- `LianLiaoAICore` 和 `LianLiaoAIPC` 子目录不再各自保存 `.github/workflows`，避免维护无效或重复配置。
- 工作流通过 `working-directory` 和 `paths` 指向对应子项目。

## LianLiaoAIPC GitHub Actions 发布

1. 确认 `LianLiaoAIPC/package.json` 中的版本已经提交到 `master`。
2. 打开 GitHub 仓库的 `Actions` 页面。
3. 选择 `Release LianLiaoAIPC`。
4. 点击 `Run workflow`，分支选择 `master`，输入不带 `v` 的版本号，例如 `2.1.32`；`release_scope` 默认使用 `windows-x64`。
5. 未明确要求多平台时保持 `windows-x64`；只有明确要求时才选择 `all` 并行构建 Windows x64/ARM64、macOS Intel/Apple Silicon 和 Ubuntu x64。
6. 在 Releases 页面下载长期保留的 `desktop-v2.1.30` 正式安装包和 `SHA256SUMS.txt`。
7. Actions 页面只保留一个轻量发布报告 Artifact，其中包含版本、Commit、文件大小和 SHA256，不重复保存安装包。

安装包先上传到草稿 GitHub Release，所选发布范围的资产集合和 SHA256 全部验证通过后才转为公开发布。常规正式版本默认使用 `windows-x64`；只有用户明确要求多平台时才使用 `all`。macOS 首版使用 ad-hoc 签名且未经过 Apple 公证，首次启动可能出现 Gatekeeper 提示。Release Tag 已存在时工作流会停止，禁止覆盖正式版本。

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
- [桌面端多平台发布设计](docs/superpowers/specs/2026-07-23-lianliao-aipc-multiplatform-release-design.md)
- [桌面端多平台发布实施计划](docs/superpowers/plans/2026-07-23-lianliao-aipc-multiplatform-release.md)

## Cloud Service 部署位置

Cloud Service 源码位于：

```text
E:\ZZY_PROJECT\lianshang_liaoning\cloud-service
```

构建 `cloud-api` 时，在 Cloud Service 根目录执行：

```powershell
mvn.cmd -pl cloud-api -DskipTests package
```

生产部署必须使用 Spring Boot 插件输出的可执行胖包：

```text
E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\target\cloud-api-1.0-SNAPSHOT.jar
```

不要使用 `cloud-api\target\cloud-api-1.0-SNAPSHOT.jar`；该文件是模块瘦包，不包含完整运行依赖。上传前应检查部署包内含 `BOOT-INF/` 和 Spring Boot Loader，并核对本地、临时上传文件及最终远端文件的大小和 SHA256。

部署清单：

| 服务器 | 目录 | 服务 |
| --- | --- | --- |
| `10.2.202.23` | `/mnt/web` | `cloud-admin`、`cloud-api`、`cloud-common-api`、`cloud-gateway`、`cloud-graph`、`cloud-log-service`、`cloud-lsln-cjrh-admin`、`cloud-oss`、`cloud-resource`、`cloud-solr` |
| `10.2.24.13` | `/mnt/web/spring-cloud-jars` | `cloud-admin`、`cloud-api`、`cloud-gateway`、`cloud-log-service`、`cloud-lsln-cjrh-admin`、`cloud-oss` |

两个部署目录都使用目录内的 `bootstrap.sh` 管理服务。只重启 API：

```bash
./bootstrap.sh restart cloud-api
```

不带服务名的 `./bootstrap.sh restart` 会重启目录内全部 JAR。部署时应先上传临时文件、核对文件大小和 SHA256、备份原文件，再替换并执行单服务重启。
