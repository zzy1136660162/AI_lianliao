# AI_lianliao 仓库工具

## Windows 桌面端版本发布

Windows x64 本地发布使用按顺序编号的独立 PowerShell 脚本，覆盖安装包元数据、
直接上传、远端核对、版本码生成、后台登记和客户端查询验证。完整参数和操作顺序见：

- [`release/windows/README.md`](release/windows/README.md)

## Windows 桌面端本地构建

仓库根目录提供两个 PowerShell 入口，用于把本地编译的 `aioncore.exe` 注入 AIPC 并生成 Windows x64 安装包。

首次构建或 Core 已变化时执行完整构建：

```powershell
cd E:\ZZY_PROJECT\AI_lianliao
.\tools\build\windows\build_lianliao_aipc_windows.ps1
```

完整构建会重新准备 `resources\bundled-aioncore\win32-x64`、校验打包前后的 Core SHA256，并生成正常压缩的安装包。

确认 Core 没有变化时执行快速构建：

```powershell
cd E:\ZZY_PROJECT\AI_lianliao
.\tools\build\windows\build_lianliao_aipc_windows_fast.ps1
```

快速构建会先比较源码 Core 与已准备 Core 的 SHA256。两者不一致时脚本会拒绝继续，要求重新运行完整构建；一致时复用托管资源和 AIPC 增量构建缓存。快速模式使用低压缩安装包，只用于本地开发验证，不用于正式发布。无论成功或失败，脚本都会显示开始时间、结束时间和总耗时。

两个脚本默认使用 `http://127.0.0.1:7897`。代理未启动时会保留当前网络环境，也可以强制直连：

```powershell
.\tools\build\windows\build_lianliao_aipc_windows.ps1 -NoProxy
```

覆盖默认 Core 路径：

```powershell
.\tools\build\windows\build_lianliao_aipc_windows.ps1 -CorePath "D:\build\aioncore.exe"
```

脚本只负责本地构建，不会提交代码、上传安装包、创建 Release 或修改数据库。

构建开始前会检查 `LianLiaoAIPC` 所在磁盘，默认至少需要 8GB 可用空间。空间不足时脚本会在 Vite 编译前直接停止；如已确认自己的构建输出占用更小，可以通过 `-MinimumFreeSpaceGB` 调整阈值。

Rust 的 `LianLiaoAICore\target` 通常会占用十几 GB。如果 E 盘空间紧张，可以把该缓存迁移到其他磁盘，并在原路径保留 Windows 目录联接。当前开发机使用：

```text
E:\ZZY_PROJECT\AI_lianliao\LianLiaoAICore\target
  -> D:\LianLiaoBuildCache\aicore-target-workspace
```

目录联接不会改变脚本默认的 Core 路径，也不会影响 Cargo 后续增量构建。

## Oracle 只读查询工具

`database/oracle/oracle_readonly.py` 只用于核对链辽真人客服数据库对象是否已经完整初始化。

安全边界：

- 不接受任意 SQL 参数；
- 只查询 Oracle `USER_*` 数据字典视图；
- 查询前执行 `SET TRANSACTION READ ONLY`；
- 结束时只调用 `rollback` 和 `close`，不调用 `commit`；
- 密码不会写入源码、命令行参数或查询结果；
- 不提供新增、修改、删除、DDL、锁表或存储过程入口。

安装依赖：

```powershell
$env:HTTPS_PROXY='http://127.0.0.1:7897'
python -m pip install -r tools/database/oracle/requirements.txt
```

使用 `cloud-api` 当前 `application.yml`、客服 DDL 和项目自带 `ojdbc6` 进行检查：

```powershell
python tools/database/oracle/oracle_readonly.py
```

输出 JSON：

```powershell
python tools/database/oracle/oracle_readonly.py --json
```

如需临时覆盖连接信息，只使用当前进程环境变量：

```powershell
$env:ORACLE_JDBC_URL='jdbc:oracle:thin:@127.0.0.1:1521:TEST'
$env:ORACLE_USERNAME='readonly_user'
$env:ORACLE_PASSWORD='password-from-secure-source'
python tools/database/oracle/oracle_readonly.py
```

不要把真实连接信息写入仓库。

## 工具目录

```text
tools/
├── ai/                # AI 接口和模型联调工具
├── auth/              # Electron 身份与登录模拟工具
├── build/windows/     # Windows 桌面端完整/快速构建入口
├── database/oracle/   # Oracle 只读核验与受控数据导入
├── tests/             # 工具单元测试
├── README.md
└── .gitignore
```

## 紧急采购 Excel 导入

导入脚本固定读取紧急采购表头，并按以下规则写入 `J_COMMON_DEMAND`：

- 读取当前 `MAX(NO)`，连续分配 `MAX(NO)+1` 到 `MAX(NO)+7`，不使用序列；
- 如并发写入造成主键冲突，整批回滚、重新读取最大值并重试；
- `TYPE=22`、`IS_CHECK=1`、`DEL_SIGN=0`、`DEMAND_STATE=0`；
- `PARAM3` 为采购数量，`PARAM5` 为产品参数及要求，`PARAM6` 为照片附件；
- `INTRO` 保留“其他详细说明”原文，并将其中联系人、手机号分别写入 `CONTACT_PERSON`、`CONTACT_TEL`；无法解析则拒绝整批导入；
- 按类型、需求名称、企业名称检查未删除的重复数据；
- 所有行在一个事务中提交，任意失败则整体回滚。

默认只做只读预检，不写数据库：

```powershell
python tools/database/oracle/import_urgent_purchases.py --input "E:\ZZY_PROJECT\lianshang_liaoning\docs\附录文件\紧急采购需求字段1.xlsx"
```

确认预检通过后，显式传入 `--execute` 才会正式提交：

```powershell
python tools/database/oracle/import_urgent_purchases.py --input "E:\ZZY_PROJECT\lianshang_liaoning\docs\附录文件\紧急采购需求字段1.xlsx" --execute
```

脚本不接受任意 SQL，不提供更新、删除、DDL 或自动回滚已提交业务数据的能力。

## Electron openid 模拟登录

`auth/enterprise_openid_login.py` 用于将已注册用户的 openid 写入 Electron 现有登录态。脚本会先请求对应环境的真实 `DesktopEnterpriseController/userContext` 接口，确认用户、企业和角色信息有效后才写入本地文件。

本地开发版使用 `http://127.0.0.1:12580/` 和 `%APPDATA%\LianLiaoAIPC-Dev`：

```powershell
python tools/auth/enterprise_openid_login.py login --env dev --openid "otR7Lvw-OJxn1ubJfZCrcPybyoRM"
python tools/auth/enterprise_openid_login.py status --env dev
python tools/auth/enterprise_openid_login.py logout --env dev
```

正式版使用 `https://cloud.lslnii.com/` 和 `%APPDATA%\LianLiaoAIPC`：

```powershell
python tools/auth/enterprise_openid_login.py login --env prod --openid "otR7Lvw-OJxn1ubJfZCrcPybyoRM"
python tools/auth/enterprise_openid_login.py status --env prod
python tools/auth/enterprise_openid_login.py logout --env prod
```

使用约束：

- `login` 只接受已经完成企业注册、且关联有效企业的 openid；
- `login` 和 `logout` 前必须从系统托盘完全退出对应 Electron 客户端；
- 脚本不会自动结束 Electron 进程；检测到客户端仍在运行时会拒绝修改；
- 脚本只修改对应 profile 下的 `enterprise-session.json`，不修改数据库、Redis、Electron 配置、Core 数据或其他缓存；
- 写入后重新启动 Electron，客户端仍会请求对应环境的 cloud-api 获取实时用户上下文；
- `status` 默认只显示掩码后的 openid。

## 产业检索 AI 联调

`ai/catalog_ai_model_integration.py` 对运行中的 `cloud-api` 执行只读联调，覆盖检索计划生成、结果排序以及企业码/重点产品目录查询。脚本不会读取模型密钥、直连 Oracle 或调用业务写接口。

```powershell
python tools/ai/catalog_ai_model_integration.py --base-url http://127.0.0.1:12580/cloud-api --suite all
```

可通过 `--report` 将联调报告写入指定的本地文件；使用 `--help` 查看分组、超时和并发参数。
