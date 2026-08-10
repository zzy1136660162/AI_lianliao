# AI_lianliao Repository Guide

本文件约束仓库级品牌、兼容和发布规则。子项目中的 `AGENTS.md` 继续约束各自代码风格、架构和测试要求；发生冲突时，距离被修改文件更近的规则优先，但不得破坏本文件的发布与数据兼容要求。

## 固定目录与品牌

- Electron 桌面端源码目录固定为 `LianLiaoAIPC`。
- Rust Core 源码目录固定为 `LianLiaoAICore`。
- 用户可见桌面应用名称固定为 `链上辽宁·产业云城 AI桌面平台`。
- AI 功能区可以使用简称 `链辽AI`。
- Electron App ID 与 Windows AUMID 固定为 `com.lianliao.app`。
- 修改 App ID 或安装器配置时，必须保留 NSIS GUID `f3bfde38-8429-545c-a4e9-a078d87dee6c`，除非用户明确接受无法覆盖升级。

## 兼容性红线

- 不得重命名 `aioncore.exe`。
- 不得仅为品牌目的批量重命名 `aionui-*` Rust crate、REST 路径、WebSocket 事件、MCP server ID、SQLite 文件或数据库对象。
- 不得删除现有 `AIONUI_*` 环境变量；新增 `LIANLIAO_*` 时应先提供兼容别名。
- 新协议使用 `lianliao://`，同时继续接收 `aionui://`。
- 用户数据迁移只能复制、校验和切换；不得自动删除 `AionUi`、`AionUi-Dev`、`AionUi-Dev-2`。
- 处理迁移失败时不得用空目录或部分复制覆盖旧数据。

## Core 供应链

- 正式桌面构建的 Core 只能来自 `zzy1136660162/AI_lianliao` Releases。
- 正式构建不得访问 `iOfficeAI/AionCore`、`latest` 或未固定的下载地址。
- 版本、Release tag、平台资产和 SHA256 由 `LianLiaoAIPC/aioncore-release-lock.json` 统一锁定。
- SHA256 缺失或不匹配必须使构建失败，不得降级为警告。
- 本地 Core 只能通过 `LIANLIAO_AICORE_LOCAL_BINARY` 显式启用；`LIANLIAO_RELEASE_BUILD=1` 时必须拒绝。
- Codex ACP、Codex CLI 和平台 npm 包的精确版本与 SHA-512 固定在 `LianLiaoAICore/managed-acp-lock.json`；不得恢复为 `^0.144.0` 等浮动根依赖，版本或完整性不匹配必须使 Core 准备失败。
- 本地 Core 更新可以复用已有托管资源，但必须先通过结构契约、Codex 依赖锁和完整资源树 SHA-256 校验，并在 staging 中再次校验后原子切换；正式 Release 不得复用本地托管资源。
- 根目录 `.github/workflows/lianliao-aicore-release.yml` 是当前仓库有效的 Core 发布工作流。
- GitHub Actions 必须统一放在仓库根目录 `.github/workflows`；不得在 `LianLiaoAICore` 或 `LianLiaoAIPC` 子目录维护看似可执行但实际无效的 workflow。

## 文件修改

- 工作区可能包含用户已有修改。不得执行 `git reset --hard`、`git checkout --` 或清理未跟踪文件。
- 本地文件修改使用 `apply_patch`；机械格式化或批量路径替换可以使用项目格式化工具。
- 新增注释要说明原因、兼容约束和失败行为，避免逐行翻译代码。
- 开发环境允许在 `LIANLIAO_DIAGNOSTIC_SENSITIVE=1` 时，将完整业务请求和模型响应写入仅存放于本机的滚动诊断日志；正式环境必须默认关闭该开关。GitHub Token、SSH 密码、数据库凭据和模型/API 密钥在任何环境仍不得写入代码、日志或文档。

## 验证与发布

- 用户要求先开发后测试时可以不采用 TDD，但完成声明前仍必须运行受影响模块的类型检查、单元测试和构建验证。
- Windows 发布前必须验证旧版本覆盖升级后不会产生第二个卸载项。
- Windows 通知必须显示完整桌面产品名称，不能显示 `electron.app.Electron`。
- 发布桌面安装包前核对本地和远端 SHA256；默认上传位置是 `10.2.202.23:/mnt/web/beiruan_ai/desktop_lianliao`。
- 正式桌面 Release 必须同时包含 Windows x64/ARM64、macOS x64/ARM64、Ubuntu x64 的七个安装包和 `SHA256SUMS.txt`。
- Windows ARM64 使用 `windows-11-arm` 原生 Runner 和锁定的 `win32-arm64` Core；不得用 x64 Core 冒充或回退。
- macOS Intel 使用 `macos-15-intel`，macOS ARM64 使用 `macos-15`；未配置 Apple 凭据时仅允许按 Release 说明发布 ad-hoc 签名测试包。
- 多平台安装包通过草稿 GitHub Release 中转；任一必需平台失败时不得公开 Release。
- Actions Artifact 只保留一个轻量发布报告，不重复保存正式安装包。
- 未经用户明确要求，不提交、不推送、不创建 GitHub Release，也不修改外部数据库。

## Cloud Service 服务部署

- Cloud Service 源码目录固定为 `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service`。
- 构建 `cloud-api` 后，生产部署包固定取 `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\target\cloud-api-1.0-SNAPSHOT.jar`。这是 Spring Boot 插件输出的可执行胖包；不得把 `cloud-api\target\cloud-api-1.0-SNAPSHOT.jar` 模块瘦包上传到服务器。部署前应确认 JAR 内存在 `BOOT-INF/` 和 Spring Boot Loader，并核对文件大小与 SHA256。
- 服务器 `10.2.202.23` 的部署目录为 `/mnt/web`，包含：
  - `cloud-admin-1.0-SNAPSHOT.jar`
  - `cloud-api-1.0-SNAPSHOT.jar`
  - `cloud-common-api-1.0-SNAPSHOT.jar`
  - `cloud-gateway-1.0-SNAPSHOT.jar`
  - `cloud-graph-1.0-SNAPSHOT.jar`
  - `cloud-log-service-1.0-SNAPSHOT.jar`
  - `cloud-lsln-cjrh-admin-1.0-SNAPSHOT.jar`
  - `cloud-oss-1.0-SNAPSHOT.jar`
  - `cloud-resource-1.0-SNAPSHOT.jar`
  - `cloud-solr-1.0-SNAPSHOT.jar`
- 服务器 `10.2.24.13` 的部署目录为 `/mnt/web/spring-cloud-jars`，包含：
  - `cloud-admin-1.0-SNAPSHOT.jar`
  - `cloud-api-1.0-SNAPSHOT.jar`
  - `cloud-gateway-1.0-SNAPSHOT.jar`
  - `cloud-log-service-1.0-SNAPSHOT.jar`
  - `cloud-lsln-cjrh-admin-1.0-SNAPSHOT.jar`
  - `cloud-oss-1.0-SNAPSHOT.jar`
- 两个目录均使用各自目录中的 `bootstrap.sh` 启动和停止服务。重启单个 API 服务使用 `./bootstrap.sh restart cloud-api`；不带服务名的 `./bootstrap.sh restart` 会重启目录内全部 JAR，部署单服务时不得误用。
- 部署前后必须核对本地与远端 JAR 的文件大小和 SHA256。替换 JAR 或脚本前保留带时间戳的备份，启动失败时恢复备份，不得删除其他服务或修改它们的启动参数。
