# LianLiaoAICore

`LianLiaoAICore` 是“链上辽宁·产业云城 AI桌面平台”的本地 Rust Core，负责 AI 会话、Agent、MCP、技能、文件、Shell、定时任务、团队协作、托管 Node 运行时和本地 SQLite 数据。

## 兼容命名

源码项目目录已经迁移为 `LianLiaoAICore`，但以下内部名称继续保留：

- 可执行文件：`aioncore` / `aioncore.exe`；
- Cargo workspace crate：`aionui-*`；
- REST、WebSocket、MCP 与数据库契约；
- `AIONUI_*` 环境变量。

这些名称与现有 Electron、数据库和技能生态存在契约关系，不能仅为品牌统一而直接修改。

## 本地构建

```powershell
cd E:\ZZY_PROJECT\AI_lianliao\LianLiaoAICore
cargo build -p aionui-app
cargo run -p aionui-app -- --help
```

帮助信息应显示“链辽 AI Core 本地服务”，binary 名称仍为 `aioncore`。

## Release

当前仓库有效发布工作流位于：

```text
.github/workflows/lianliao-aicore-release.yml
```

GitHub 只执行仓库根目录中的工作流。Core 与桌面端的 CI/Release 均应统一维护在根目录 `.github/workflows`；`LianLiaoAICore` 和 `LianLiaoAIPC` 子目录不单独创建 `.github/workflows`。

未明确要求多平台时，发布范围默认是 Windows x64，只生成 Windows x64 Core 和 `SHA256SUMS`。只有明确要求多平台时才在工作流中选择 `all`。

Windows x64 正式发布资产：

```text
lianliao-aicore-v{version}-x86_64-pc-windows-msvc.zip
SHA256SUMS
```

发布到 [zzy1136660162/AI_lianliao Releases](https://github.com/zzy1136660162/AI_lianliao/releases)。发布完成后，必须把真实 SHA256 写入 `LianLiaoAIPC/aioncore-release-lock.json`，桌面端才允许执行正式构建。

## 吸收上游更新

上游更新必须经过：

```text
拉取与评审
-> SQLite 迁移评估
-> REST / WebSocket 契约验证
-> 多平台构建
-> 链辽 GitHub Release
-> 更新桌面端 Release lock
-> 发布桌面端
```

不得让链辽正式客户端直接下载或追踪上游 `latest`。
