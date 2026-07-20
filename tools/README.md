# Oracle 只读查询工具

`oracle_readonly.py` 只用于核对链辽真人客服数据库对象是否已经完整初始化。

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
python -m pip install -r tools/requirements-oracle-readonly.txt
```

使用 `cloud-api` 当前 `application.yml`、客服 DDL 和项目自带 `ojdbc6` 进行检查：

```powershell
python tools/oracle_readonly.py
```

输出 JSON：

```powershell
python tools/oracle_readonly.py --json
```

如需临时覆盖连接信息，只使用当前进程环境变量：

```powershell
$env:ORACLE_JDBC_URL='jdbc:oracle:thin:@127.0.0.1:1521:TEST'
$env:ORACLE_USERNAME='readonly_user'
$env:ORACLE_PASSWORD='password-from-secure-source'
python tools/oracle_readonly.py
```

不要把真实连接信息写入仓库。
