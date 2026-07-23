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
- 根目录 `.github/workflows/lianliao-aicore-release.yml` 是当前仓库有效的 Core 发布工作流；子目录中的上游 workflow 仅作参考。

## 文件修改

- 工作区可能包含用户已有修改。不得执行 `git reset --hard`、`git checkout --` 或清理未跟踪文件。
- 本地文件修改使用 `apply_patch`；机械格式化或批量路径替换可以使用项目格式化工具。
- 新增注释要说明原因、兼容约束和失败行为，避免逐行翻译代码。
- 不得把 GitHub Token、SSH 密码、数据库凭据、模型密钥或用户隐私数据写入代码、日志或文档。

## 验证与发布

- 用户要求先开发后测试时可以不采用 TDD，但完成声明前仍必须运行受影响模块的类型检查、单元测试和构建验证。
- Windows 发布前必须验证旧版本覆盖升级后不会产生第二个卸载项。
- Windows 通知必须显示完整桌面产品名称，不能显示 `electron.app.Electron`。
- 发布桌面安装包前核对本地和远端 SHA256；默认上传位置是 `10.2.202.23:/mnt/web/beiruan_ai/desktop_lianliao`。
- 未经用户明确要求，不提交、不推送、不创建 GitHub Release，也不修改外部数据库。
