# 链辽桌面端数据库唯一更新通道实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 关闭旧 AionUi 更新入口，将 2.1.28 五个运行目标安装包上传链辽服务器并通过数据库正式发布。

**Architecture:** 企业工作台继续使用现有 DesktopVersion 网关完成版本检查、下载、完整性校验和打开安装包。主进程与 AI 设置页移除旧更新触发入口，所有检查入口统一导航到企业版本中心。安装包先在服务器临时目录校验，再发布数据库元数据。

**Tech Stack:** Electron、React、TypeScript、Vitest、SSH、Oracle、Spring Cloud API

---

### Task 1: 关闭旧更新入口

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/index.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/components/layout/Layout.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/updateFeed.ts`

- [ ] 删除主进程启动时初始化和延迟检查 `electron-updater` 的代码。
- [ ] 将托盘检查更新事件导航到 `/enterprise/version-update`。
- [ ] 将设置页检查更新按钮导航到 `/enterprise/version-update`，移除预发布版本开关。
- [ ] 停止挂载旧更新卡片。
- [ ] 将遗留 feed 常量改成链辽自有下载域名。

### Task 2: 更新自动化检查

**Files:**
- Create: `LianLiaoAIPC/tests/unit/enterprise/databaseOnlyUpdateChannel.test.ts`
- Modify: existing tests only when legacy expectations conflict with the approved product behavior.

- [ ] 静态验证启动代码不再引用 `checkForUpdatesAndNotify`。
- [ ] 验证托盘和设置页的目标路由均为 `/enterprise/version-update`。
- [ ] 验证更新 feed 不包含 `static.aionui.com`。
- [ ] 运行相关 Vitest、TypeScript 检查和构建检查。

### Task 3: 提交发布代码

- [ ] 检查差异只包含本次更新通道与文档。
- [ ] 使用中文提交消息提交。
- [ ] 推送当前提交到远端 `master`。

### Task 4: 上传五个平台包

- [ ] 检查服务器空间和正式目录现状。
- [ ] 在临时目录下载 2.1.28 五个安装包。
- [ ] 比对每个文件的字节数和 SHA256。
- [ ] 全部通过后移动到 `/mnt/web/beiruan_ai/desktop_lianliao`。
- [ ] 使用公网 URL 复核 HTTP 状态和 Content-Length。

### Task 5: 发布并验证数据库版本

- [ ] 使用版本代码 `2026072401` 和版本名 `2.1.28` 调用发布接口。
- [ ] `forceUpdate` 设置为 `false`。
- [ ] 一次提交五个包的 URL、平台、架构、大小和 SHA256。
- [ ] 查询管理详情与 Oracle 数据库，确认一个版本头和五个包。
- [ ] 分别请求五个运行目标的 `getLatest`，确认包选择正确。

