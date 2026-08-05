# Oracle 只读查询工具

`oracle/oracle_readonly.py` 只用于核对链辽真人客服数据库对象是否已经完整初始化。

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
python -m pip install -r tools/oracle/requirements.txt
```

使用 `cloud-api` 当前 `application.yml`、客服 DDL 和项目自带 `ojdbc6` 进行检查：

```powershell
python tools/oracle/oracle_readonly.py
```

输出 JSON：

```powershell
python tools/oracle/oracle_readonly.py --json
```

如需临时覆盖连接信息，只使用当前进程环境变量：

```powershell
$env:ORACLE_JDBC_URL='jdbc:oracle:thin:@127.0.0.1:1521:TEST'
$env:ORACLE_USERNAME='readonly_user'
$env:ORACLE_PASSWORD='password-from-secure-source'
python tools/oracle/oracle_readonly.py
```

不要把真实连接信息写入仓库。

## 工具目录

```text
tools/
├── oracle/  # Oracle 只读核验与受控数据导入
├── tests/   # 工具单元测试
├── enterprise_openid_login.py  # Electron openid 模拟登录
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
python tools/oracle/import_urgent_purchases.py --input "E:\ZZY_PROJECT\lianshang_liaoning\docs\附录文件\紧急采购需求字段1.xlsx"
```

确认预检通过后，显式传入 `--execute` 才会正式提交：

```powershell
python tools/oracle/import_urgent_purchases.py --input "E:\ZZY_PROJECT\lianshang_liaoning\docs\附录文件\紧急采购需求字段1.xlsx" --execute
```

脚本不接受任意 SQL，不提供更新、删除、DDL 或自动回滚已提交业务数据的能力。

## Electron openid 模拟登录

`enterprise_openid_login.py` 用于将已注册用户的 openid 写入 Electron 现有登录态。脚本会先请求对应环境的真实 `DesktopEnterpriseController/userContext` 接口，确认用户、企业和角色信息有效后才写入本地文件。

本地开发版使用 `http://127.0.0.1:12580/` 和 `%APPDATA%\LianLiaoAIPC-Dev`：

```powershell
python tools/enterprise_openid_login.py login --env dev --openid "otR7Lvw-OJxn1ubJfZCrcPybyoRM"
python tools/enterprise_openid_login.py status --env dev
python tools/enterprise_openid_login.py logout --env dev
```

正式版使用 `https://cloud.lslnii.com/` 和 `%APPDATA%\LianLiaoAIPC`：

```powershell
python tools/enterprise_openid_login.py login --env prod --openid "otR7Lvw-OJxn1ubJfZCrcPybyoRM"
python tools/enterprise_openid_login.py status --env prod
python tools/enterprise_openid_login.py logout --env prod
```

使用约束：

- `login` 只接受已经完成企业注册、且关联有效企业的 openid；
- `login` 和 `logout` 前必须从系统托盘完全退出对应 Electron 客户端；
- 脚本不会自动结束 Electron 进程；检测到客户端仍在运行时会拒绝修改；
- 脚本只修改对应 profile 下的 `enterprise-session.json`，不修改数据库、Redis、Electron 配置、Core 数据或其他缓存；
- 写入后重新启动 Electron，客户端仍会请求对应环境的 cloud-api 获取实时用户上下文；
- `status` 默认只显示掩码后的 openid。
