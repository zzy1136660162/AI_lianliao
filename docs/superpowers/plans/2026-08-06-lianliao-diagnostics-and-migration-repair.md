# 链辽诊断上报与迁移兼容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task by task. This plan follows the user's implementation-first instruction: tests are executed after implementation, not as TDD.

**Goal:** 将桌面端显式问题反馈、截图、日志附件和启动失败诊断统一提交到链上辽宁 cloud-api，并安全兼容因 SQL 文件 CRLF/LF 差异导致的 Core migration 1 校验失败。

**Architecture:** Electron renderer 只组装反馈内容，main process 负责身份补全、文件限制、脱敏和 multipart 网络提交。cloud-api 先持久化诊断主记录，再通过既有文件上传服务保存附件，并逐项记录成功或失败。Core 只对已知 migration 1 换行差异执行一次受控 checksum 对齐，未知内容差异继续拒绝启动。

**Tech Stack:** Electron + React + TypeScript、Spring Boot + MyBatis + Oracle、Rust + sqlx + SQLite。

---

## Task 1: Cloud API 数据模型与建表脚本

**Files:**
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\resources\db\desktop_diagnostic.sql`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\desktopdiagnostic\model\DesktopDiagnosticReport.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\desktopdiagnostic\model\DesktopDiagnosticAttachment.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\desktopdiagnostic\model\DesktopDiagnosticSubmitResult.java`

- [ ] 定义 Oracle 主表、附件表、序列和唯一索引，全部标识符不超过 30 字符。
- [ ] 定义兼容 Java 8 的领域对象；诊断正文使用 CLOB，处理状态和附件状态使用稳定英文枚举值。
- [ ] 不执行脚本，只交付可重复检查对象是否存在的 SQL。

## Task 2: Cloud API 上传适配与持久化服务

**Files:**
- Create: `...\desktopdiagnostic\config\DesktopDiagnosticProperties.java`
- Create: `...\desktopdiagnostic\mapper\DesktopDiagnosticMapper.java`
- Create: `...\desktopdiagnostic\service\DesktopDiagnosticFileStorageClient.java`
- Create: `...\desktopdiagnostic\service\DesktopDiagnosticService.java`
- Create: `...\desktopdiagnostic\service\impl\RestDesktopDiagnosticFileStorageClient.java`
- Create: `...\desktopdiagnostic\service\impl\DesktopDiagnosticServiceImpl.java`
- Create: `...\resources\mapper\desktopdiagnostic\DesktopDiagnosticMapper.xml`
- Modify: `...\resources\application.yml`

- [ ] 先按 `clientReportId` 幂等创建主记录，再逐个调用既有 `newwebfileupload.action`。
- [ ] 上传响应兼容 `code/success/data`、`result/data` 和常见 `url/path` 形式。
- [ ] 校验附件数量、单文件和总大小；失败附件保留失败原因，整体返回 `PARTIAL`。
- [ ] 对服务端日志仅记录报告号、阶段、状态和耗时，不记录附件正文、密钥或完整业务内容。

## Task 3: Cloud API 提交入口

**Files:**
- Create: `...\controller\DesktopDiagnosticController.java`
- Create: `...\desktopdiagnostic\model\DesktopDiagnosticSubmitRequest.java`

- [ ] 实现 `POST /DesktopDiagnosticController/submit` multipart 接口，无登录时也能提交启动故障。
- [ ] 将来源 IP、服务端时间和客户端基本版本信息写入记录。
- [ ] 返回稳定的 `reportNo/status/attachment counts`，禁止把数据库或上传异常栈返回客户端。

## Task 4: Electron main-process 诊断网关

**Files:**
- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\common\feedback\contracts.ts`
- Create: `...\src\process\services\feedback\desktopDiagnosticClient.ts`
- Modify: `...\src\process\bridge\feedbackBridge.ts`
- Modify: `...\src\preload\main.ts`
- Modify: `...\src\common\types\platform\electron.ts`

- [ ] 新增 `feedback:submit-report` IPC，并只允许 sender 自身提交有限大小的附件。
- [ ] main process 使用当前企业 API 环境（开发 127.0.0.1:12580、正式 cloud.lslnii.com）发送 multipart。
- [ ] 补齐平台、应用/Core 版本和可选企业会话信息；发送前递归脱敏常见 token/password/key 字段。
- [ ] 返回结构化成功、部分成功或失败结果，杜绝“没有实际传输却提示成功”。

## Task 5: Electron renderer 从 Sentry 迁移

**Files:**
- Modify: `...\src\renderer\services\feedback\submitFeedbackReport.ts`
- Modify: `...\src\renderer\components\settings\SettingsModal\contents\FeedbackReportModal.tsx`
- Modify: `...\src\renderer\components\layout\InstallationIntegrityDialog.tsx`
- Modify: all locale `settings.json` files under `...\src\renderer\locales`

- [ ] 删除显式反馈路径中的 Sentry import/capture/flush，统一调用 preload submit API。
- [ ] 保留截图、用户选择附件和日志包；显示真实报告编号及部分附件失败提示。
- [ ] 启动完整性/迁移失败上报复用同一入口。
- [ ] 不改变后台自动崩溃捕获；仅迁移用户主动提交的报告。

## Task 6: Core migration 1 换行兼容

**Files:**
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAICore\crates\aionui-db\src\database.rs`
- Modify/Create: `E:\ZZY_PROJECT\AI_lianliao\.gitattributes`
- Modify: Core migration immutability verification scripts when present

- [ ] 仅处理 `VersionMismatch(1)`，要求数据库成功记录的旧 checksum 精确等于已知 CRLF hash，当前编译 migration 精确等于已知 LF hash。
- [ ] 在事务中只更新 migration 1 checksum，写入不含敏感数据的兼容日志，再重跑 migrator。
- [ ] 任一描述、成功状态、版本或 checksum 不匹配时拒绝修复。
- [ ] 固定 migration SQL 为 LF，并在校验脚本中验证关键 migration checksum。

## Task 7: 实现后验证

- [ ] Cloud API：运行新增服务/上传解析测试及模块编译；验证超限、重复 clientReportId、部分上传失败。
- [ ] Electron：运行反馈相关 Vitest、TypeScript 检查、i18n 类型和一致性检查。
- [ ] Core：运行 `cargo fmt --check`、`cargo test -p aionui-db` 和该 crate clippy；用临时 SQLite 复制 CRLF checksum 场景验证数据保留且迁移通过。
- [ ] 检查 git diff，确认不包含密钥、凭据、用户已有 `tools/build/windows/build_lianliao_aipc_windows.ps1` 修改或任何数据库实改。
