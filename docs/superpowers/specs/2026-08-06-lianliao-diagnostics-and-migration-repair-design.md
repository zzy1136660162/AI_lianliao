# 链辽桌面诊断上报与 Core 迁移兼容修复设计

## 1. 背景与结论

链上辽宁·产业云城 AI 桌面平台当前有两类相互独立但同时暴露的问题：

1. 标题栏问题反馈、截图、日志附件和启动失败诊断通过 Sentry 提交。未配置有效 DSN 时，前端仍可能得到事件已被本地客户端接收的结果并显示“诊断报告已发送”，但报告没有进入链辽可管理的数据系统。
2. Windows 本地构建曾把 `001_initial_schema.sql` 重写为 CRLF 并附加额外尾换行，而 GitHub Core 构建使用 Git 中的 LF 原文。SQLx 将迁移文件原始字节纳入 SHA-384 校验，因此已有数据库记录的迁移 1 校验值 `D4DD4415...B7879740E` 与当前正式 Core 编译值 `E18A4394...C2512C54` 不一致，Core 在 `database.migration` 阶段按安全策略停止。

Logo 品牌调整不应修改历史迁移。现有 `025_rebrand_internal_aionrs_agent.sql` 继续负责把内部智能体图标更新为 `ai.svg`。

## 2. 目标

- 将所有用户主动提交的桌面诊断和问题反馈迁移到链辽 Cloud API。
- 覆盖标题栏通用反馈、截图、用户附件、`logs.gz`、安装完整性诊断、数据库迁移诊断和本地数据修复诊断。
- 复用 `cloud-file-upload/NoCrossOriginUpload/newwebfileupload.action` 保存文件，Oracle 仅保存报告数据和文件索引。
- 未登录、AionCore 未启动或本地数据库不可用时仍可提交启动诊断。
- 只有 Cloud API 返回有效报告编号后，客户端才显示提交成功。
- 安全兼容已知 CRLF 迁移 1 校验值，保留现有对话、模型、技能和用户配置。
- 未知迁移校验值继续阻止启动，不提供无条件跳过或重建数据库的降级路径。

## 3. 非目标

- 本期不开发后台诊断管理 JSP；数据库结构预留处理状态和处理意见，后续可直接增加管理页面。
- 本期不迁移 Sentry 的非用户触发崩溃事件；仅移除显式反馈和启动日志报告对 Sentry 的依赖。
- 不删除、覆盖或清空 `LianLiaoAIPC`、`AionUi` 等用户数据目录。
- 不把截图、日志或普通附件以 BLOB 形式写入 Oracle。
- 不对未知迁移校验值自动改写 `_sqlx_migrations`。

## 4. 总体架构

```text
Renderer
  FeedbackReportModal / InstallationIntegrityDialog
                  |
                  | 安全 IPC：feedback:submit-report
                  v
Electron Main Process
  收集运行信息、压缩日志、规范化附件、生成 clientReportId
                  |
                  | multipart/form-data
                  v
Cloud API
  DesktopDiagnosticController
                  |
                  +--> 诊断主表先落库
                  |
                  +--> cloud-file-upload 保存 logs.gz / png / 用户附件
                  |
                  +--> 附件索引表保存 URL、SHA256、大小和上传状态
                  v
  返回 reportNo、status、uploadedCount、failedCount
```

显式反馈不再调用 `@sentry/electron/renderer`。Electron 主进程负责网络调用，渲染进程不直接访问 Node.js、文件系统或服务端地址。

## 5. Oracle 数据模型

所有物理名称控制在 Oracle 30 字符限制内。ID 使用 `NUMBER(19,0)`；业务用户和企业 ID 接受非零有符号整数，允许负数。

### 5.1 `J_CY_DESKTOP_DIAG_REPORT`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ID` | `NUMBER(19,0)` | 主键 |
| `REPORT_NO` | `VARCHAR2(64 CHAR)` | 面向用户和后台的唯一报告编号 |
| `CLIENT_REPORT_ID` | `VARCHAR2(64 CHAR)` | 客户端 UUID，唯一幂等键 |
| `REPORT_TYPE` | `VARCHAR2(32 CHAR)` | `GENERAL_FEEDBACK`、`STARTUP_FAILURE`、`DATA_MIGRATION`、`LOCAL_DATA_REPAIR` |
| `MODULE_CODE` | `VARCHAR2(64 CHAR)` | 稳定模块编码 |
| `MODULE_LABEL` | `VARCHAR2(128 CHAR)` | 提交时模块显示名快照 |
| `DESCRIPTION` | `CLOB` | 用户描述或启动故障说明 |
| `DIAGNOSTIC_JSON` | `CLOB` | 结构化诊断、标签和扩展信息 |
| `OPEN_ID` | `VARCHAR2(256 CHAR)` | 可空，登录身份快照 |
| `USER_ID` | `NUMBER(19,0)` | 可空，允许负数但不允许 0 |
| `COMPANY_ID` | `NUMBER(19,0)` | 可空，允许负数但不允许 0 |
| `APP_VERSION` | `VARCHAR2(64 CHAR)` | PC 版本 |
| `CORE_VERSION` | `VARCHAR2(64 CHAR)` | Core 版本，启动失败时可空 |
| `PLATFORM` | `VARCHAR2(16 CHAR)` | `WINDOWS`、`MACOS`、`LINUX` |
| `ARCHITECTURE` | `VARCHAR2(16 CHAR)` | `X64`、`ARM64` 等 |
| `OS_VERSION` | `VARCHAR2(128 CHAR)` | 系统版本 |
| `FAILURE_REASON` | `VARCHAR2(128 CHAR)` | 稳定失败原因编码 |
| `BOUNDARY_CODE` | `VARCHAR2(128 CHAR)` | Core 启动边界错误码 |
| `BOUNDARY_STAGE` | `VARCHAR2(128 CHAR)` | 失败阶段，例如 `database.migration` |
| `CLIENT_IP` | `VARCHAR2(64 CHAR)` | 网关传入的客户端 IP |
| `STATUS` | `VARCHAR2(16 CHAR)` | `UPLOADING`、`SUBMITTED`、`PARTIAL`、`PROCESSING`、`RESOLVED`、`IGNORED` |
| `ATTACHMENT_COUNT` | `NUMBER(10,0)` | 预期附件数 |
| `UPLOAD_SUCCESS_COUNT` | `NUMBER(10,0)` | 成功上传数 |
| `UPLOAD_FAILED_COUNT` | `NUMBER(10,0)` | 失败上传数 |
| `HANDLED_BY` | `VARCHAR2(128 CHAR)` | 可空，后续后台使用 |
| `HANDLED_AT` | `TIMESTAMP(6)` | 可空 |
| `HANDLE_NOTE` | `CLOB` | 可空 |
| `CREATE_TIME` | `TIMESTAMP(6)` | 创建时间 |
| `UPDATE_TIME` | `TIMESTAMP(6)` | 更新时间 |

约束与索引：

- `REPORT_NO` 和 `CLIENT_REPORT_ID` 唯一。
- `USER_ID`、`COMPANY_ID` 为 `NULL` 或非零。
- 按 `STATUS, CREATE_TIME` 和 `OPEN_ID, CREATE_TIME` 建索引。
- 使用 `SEQ_J_CY_DESKTOP_DIAG_RPT` 生成主键。

### 5.2 `J_CY_DESKTOP_DIAG_FILE`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ID` | `NUMBER(19,0)` | 主键 |
| `REPORT_ID` | `NUMBER(19,0)` | 关联诊断报告 |
| `FILE_KIND` | `VARCHAR2(24 CHAR)` | `LOG`、`SCREENSHOT`、`ATTACHMENT` |
| `ORIGINAL_NAME` | `VARCHAR2(512 CHAR)` | 原始文件名 |
| `CONTENT_TYPE` | `VARCHAR2(128 CHAR)` | MIME 类型 |
| `SIZE_BYTES` | `NUMBER(19,0)` | 文件大小 |
| `SHA256` | `VARCHAR2(64 CHAR)` | 上传前内容摘要 |
| `STORAGE_PATH` | `VARCHAR2(1000 CHAR)` | 文件服务返回路径 |
| `FILE_URL` | `VARCHAR2(1000 CHAR)` | 规范化完整访问地址 |
| `UPLOAD_STATUS` | `VARCHAR2(16 CHAR)` | `SUCCESS`、`FAILED` |
| `FAILURE_REASON` | `VARCHAR2(1000 CHAR)` | 失败摘要，不保存凭据 |
| `CREATE_TIME` | `TIMESTAMP(6)` | 创建时间 |

使用 `SEQ_J_CY_DESKTOP_DIAG_FILE` 生成主键，并对 `REPORT_ID` 建索引和外键。

## 6. Cloud API 契约

### 6.1 提交接口

```http
POST /cloud-api/DesktopDiagnosticController/submit
Content-Type: multipart/form-data
```

表单字段：

- `metadata`：UTF-8 JSON，包含 `clientReportId`、报告类型、描述、身份快照、版本与诊断详情。
- `files`：零到多个文件；每个文件同时携带顺序一致的文件类型元数据。

成功响应：

```json
{
  "code": 2000,
  "message": "操作成功",
  "data": {
    "reportNo": "DR202608060001",
    "status": "SUBMITTED",
    "uploadedCount": 2,
    "failedCount": 0
  },
  "success": true
}
```

部分附件失败时仍返回 `code=2000` 和有效 `reportNo`，`status=PARTIAL`，并给出失败数量。报告主数据不能因文件服务暂时异常而丢失。

重复 `clientReportId` 返回已有报告快照，不重复创建主表记录或重复保存已成功附件。

### 6.2 文件服务适配

Cloud API 使用可配置地址：

```yaml
desktop-diagnostic:
  file-storage-endpoint: http://cloud.lslnii.com/cloud-file-upload/NoCrossOriginUpload/newwebfileupload.action
  file-public-base-url: https://www.lslnii.com/
```

适配器按现有接口使用字段名 `file` 上传，并兼容以下既有返回形态：

- `data` 为数组，取第一项；
- `data` 为字符串；
- 顶层 `path`；
- 顶层 `url`；
- 响应包含 `code` 时要求 `code=2000`；包含 `success` 时要求为 `true`；包含 `result` 时要求为 `success`。

相对路径通过配置的公开基地址规范化，绝不把内部上传地址直接作为对外 URL。

### 6.3 限制与容错

- 默认最多 6 个附件。
- 单文件默认不超过 8 MiB，总大小默认不超过 20 MiB，均通过 YAML 可调。
- 文件名只保存安全 basename；拒绝路径穿越和空文件名。
- 日志仅接受 `application/gzip`，截图接受 PNG/JPEG，普通附件采用允许列表。
- 外部文件服务调用设置连接和读取超时。
- 主表先以 `UPLOADING` 保存；附件逐个处理；最后更新为 `SUBMITTED` 或 `PARTIAL`。
- 数据库写入失败直接返回失败；文件服务失败不回滚已存在的诊断主记录。

## 7. Electron 实现

### 7.1 IPC 与主进程

新增受信 IPC `feedback:submit-report`：

- 渲染进程只提交结构化描述、是否收集日志及用户选择的附件字节。
- 主进程补充应用版本、Core 版本、平台、架构和启动故障信息。
- 主进程调用链辽 Cloud API，不允许渲染进程直接持有服务地址。
- 网络调用复用手动 HTTP 代理工厂和 Electron 网络实现；环回开发地址继续直连。
- IPC 对对象形状、字符串长度、附件数量和字节长度做严格校验。

现有 `feedback:collect-logs` 和 `feedback:capture-screenshot` 可继续服务预览，但最终提交由主进程统一完成。日志尽量在主进程收集，避免大字节数组在 IPC 中往返两次。

### 7.2 渲染层

`submitFeedbackReport` 保留现有调用接口，内部改为链辽诊断桥接器，使标题栏反馈和启动诊断无需重复改造 UI。

- 移除显式反馈对 `@sentry/electron/renderer` 的动态导入和 `flush` 判断。
- Cloud API 返回 `reportNo` 后才 resolve。
- `PARTIAL` 视为报告已接收，但 UI 额外提示部分附件未上传，允许再次提交缺失附件。
- 请求失败时保留表单、截图和附件，不清空用户输入。
- 启动诊断不依赖企业登录上下文；若本地保存过 OpenID，则作为可选快照上报。

### 7.3 日志安全

用户主动点击发送视为本次附件上传授权，但在压缩前仍必须清理 GitHub Token、SSH 密码、数据库凭据、代理认证信息和模型/API 密钥。正式环境不自动上传完整日志；只有用户主动提交才收集。

## 8. Core 迁移兼容修复

### 8.1 已知校验值

- Windows CRLF 加额外尾换行的历史校验：`D4DD44158A52EA3A140189B5A778AA85728F009455CA5F764BC7E6BF8E9682DEAE285AB2B2A2F15B6136FF0B7879740E`
- LF 标准校验：`E18A4394627489C083778138A695AAF94DF3A8754F34CA0AAB079B4EC92779DD70A81FCF67472C53E18FC8BEC2512C54`

二者对应相同 SQL 内容，仅换行符不同。

### 8.2 修复算法

当 SQLx 返回 `VersionMismatch(1)` 时：

1. 从 `_sqlx_migrations` 读取迁移 1 的 `checksum`、`success` 和描述。
2. 从编译期 migrator 读取当前迁移 1 的标准校验值。
3. 仅当数据库值等于已知 CRLF 校验、当前值等于已知 LF 校验、`success=1` 且描述为 `initial schema` 时进入兼容路径。
4. 在事务内把迁移 1 校验值更新为当前 LF 校验值。
5. 提交事务并重新执行完整 migrator。
6. 任一前置条件不满足时返回原始 `VersionMismatch`，不改变数据库。

这个修复只对一个已知字节级等价转换生效，不对 Logo 修改版、未知内容或其他迁移编号生效。

### 8.3 构建防线

- 根目录 `.gitattributes` 对 `LianLiaoAICore/crates/aionui-db/migrations/*.sql` 强制 `text eol=lf`。
- 迁移检查脚本验证工作区文件不含 CRLF，并继续禁止修改、删除已发布迁移。
- Logo 更新保留在迁移 25；今后任何品牌或种子数据变化必须新增迁移。
- Windows 本地构建脚本在编译 Core 前运行迁移不可变和换行符检查。

## 9. 测试与验收

### 9.1 Core

- 使用包含 CRLF 迁移 1 校验值且已执行后续迁移的数据库夹具，确认启动成功、数据不丢失、校验值更新为 LF。
- 未知迁移 1 校验值必须继续失败且数据库不变。
- 其他迁移版本不匹配必须继续失败。
- 新建数据库正常执行全部迁移。
- 迁移 SQL 出现 CRLF 时构建检查失败。

### 9.2 Cloud API

- 无登录身份也能保存启动报告。
- 负数 `userId`、`companyId` 可保存，0 被拒绝。
- 文件服务成功、部分失败、全部失败和超时路径均能得到稳定状态。
- 重复 `clientReportId` 不创建重复记录。
- 文件路径返回格式兼容现有文件服务。
- 超限附件、危险文件名和非法 MIME 被拒绝。

### 9.3 Electron

- 标题栏反馈、截图和日志附件不再调用 Sentry。
- 启动迁移失败时，即使 Core 未运行也可提交报告。
- 没有 Cloud 报告编号时绝不显示“已发送”。
- `PARTIAL`、网络失败和重试状态显示正确。
- 开发版请求 `http://127.0.0.1:12580/`，正式版请求 `https://cloud.lslnii.com/`。

## 10. 发布与兼容说明

- 修复迁移不一致需要发布新的 LianLiaoAICore，并更新 `aioncore-release-lock.json`。
- PC 安装包必须重新构建，才能包含新 Core 和链辽诊断 IPC/客户端。
- Cloud API 和 Oracle 建表脚本必须先于新 PC 版本部署。
- 发布顺序：Oracle 表结构 → Cloud API → 文件上传联调 → Core Release → 更新锁文件 → PC 构建。
- 本设计不直接修改生产数据库、不部署服务、不发布 Release；这些操作仍需用户单独明确授权。
