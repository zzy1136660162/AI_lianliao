# Electron openid 模拟登录工具设计

## 目标

在不修改数据库、不依赖 Redis、不改变正式 Electron 登录协议的前提下，为开发与联调人员提供一个 Python 命令行工具，通过写入 Electron 已有的本地 openid 登录态，模拟已注册用户登录。

第一版仅支持已注册用户，不模拟未注册用户扫码注册流程。

## 当前登录机制

Electron 的企业工作台登录态由主进程管理：

1. 扫码成功后，cloud-api 返回 openid 和实时用户上下文。
2. Electron 仅将 `{ "version": 1, "openId": "..." }` 保存到 `enterprise-session.json`。
3. Electron 启动或恢复登录时，根据 openid 再次请求 `DesktopEnterpriseController/userContext`。
4. 用户、企业、会员等级和角色均以 cloud-api 的实时返回为准，不从本地登录态恢复。

因此，测试工具只需安全地写入同格式文件，无需伪造完整扫码会话。

## 方案选择

采用仓库外显、安装包内不包含的 Python CLI：

- 不在 Electron 中增加启动参数或隐藏按钮。
- 不在 cloud-api 中增加模拟扫码接口。
- 不直接读写 Redis 或 Oracle。
- dev 请求本地 cloud-api，正式版请求线上 cloud-api。

这样既覆盖两个运行环境，也不会让测试逻辑进入正式安装包。

## 文件与命令

新增工具：

```text
tools/auth/enterprise_openid_login.py
```

命令：

```powershell
python tools/auth/enterprise_openid_login.py login --env dev --openid "目标openid"
python tools/auth/enterprise_openid_login.py login --env prod --openid "目标openid"
python tools/auth/enterprise_openid_login.py status --env dev
python tools/auth/enterprise_openid_login.py status --env prod
python tools/auth/enterprise_openid_login.py logout --env dev
python tools/auth/enterprise_openid_login.py logout --env prod
```

第一版只允许 `dev` 和 `prod`，不接受任意 API 地址或任意文件路径，避免误写其他目录。

## 环境映射

| 参数 | cloud-api | Electron profile |
|---|---|---|
| `dev` | `http://127.0.0.1:12580/` | `LianLiaoAIPC-Dev` |
| `prod` | `https://cloud.lslnii.com/` | `LianLiaoAIPC` |

Windows 登录态文件分别是：

```text
%APPDATA%\LianLiaoAIPC-Dev\enterprise-session.json
%APPDATA%\LianLiaoAIPC\enterprise-session.json
```

工具应根据当前操作系统解析 Electron appData 根目录，同时保留上述稳定 profile 名称，以便后续在 macOS 和 Linux 上复用。

## 登录数据流

`login` 执行以下步骤：

1. 规范化并校验 openid：不能为空、最大 256 字符、不得包含控制字符。
2. POST 请求对应环境的：

   ```text
   cloud-api/DesktopEnterpriseController/userContext
   ```

   请求体：

   ```json
   { "openId": "目标openid" }
   ```

3. 校验 cloud-api 响应：
   - 请求成功且业务码为成功状态；
   - `registered` 必须为 `true`；
   - 返回 openid 必须与输入完全一致；
   - `userId` 和 `companyId` 必须是非零有符号整数；
   - 返回用户上下文必须是 JSON 对象。
4. 创建 profile 目录。
5. 在同目录写临时文件，刷新内容后使用原子替换生成 `enterprise-session.json`。
6. 输出已校验的用户名称、企业名称、用户 ID、企业 ID、角色 ID以及目标环境，但默认对 openid 做部分掩码。
7. 提示用户完全退出并重新启动对应 Electron 客户端。

本地文件内容与 Electron 当前契约一致：

```json
{
  "version": 1,
  "openId": "目标openid"
}
```

## 状态和退出

`status`：

- 只读取目标环境的 `enterprise-session.json`。
- 校验文件大小、JSON 结构、版本与 openid 格式。
- 默认显示掩码后的 openid。
- 不请求 cloud-api，确保状态查看快速且无副作用。

`logout`：

- 只删除目标环境的 `enterprise-session.json`。
- 文件不存在时仍视为成功。
- 不清理 Electron 的其他配置、Core 数据、日志或缓存。

## 运行中客户端处理

第一版不自动终止 Electron 进程。

工具在执行 `login` 或 `logout` 前检查目标 profile 是否可能正在被客户端使用；若检测到对应客户端仍在运行，则拒绝修改并提示用户先从托盘完全退出。无法可靠判断进程归属时，也不得强制结束进程。

原因是 Electron 主进程会缓存当前用户上下文，运行时直接改文件不会立即切换账号，还可能被随后的退出操作覆盖。

## 错误处理

不同失败使用非零退出码，并输出明确但不泄露完整 openid 的说明：

- 本地 cloud-api 未启动或线上网络不可达；
- HTTP 或业务返回失败；
- openid 未注册或缺少企业关联；
- 用户上下文结构不符合 Electron 契约；
- profile 目录不可写；
- 当前 Electron 客户端仍在运行；
- 登录态文件损坏或包含不受支持的版本。

失败时不得删除或覆盖原有有效登录态。临时文件必须尽力清理。

## 安全与兼容边界

- 工具仅供拥有本机和仓库访问权限的开发、联调人员使用，不随安装包发布。
- 不把 openid、数据库凭据、Token、模型密钥写入源码、日志或文档。
- 不写 Oracle、不写 Redis、不调用业务修改接口。
- 不伪造 userId、companyId、会员等级或 roleId。
- 每次 Electron 启动后仍由目标 cloud-api 实时确认用户上下文。
- 不修改现有扫码登录、注册二维码和会话持久化实现。

## 测试范围

新增标准库 `unittest` 测试，使用临时目录和本地假 HTTP 服务，不访问真实数据库：

1. dev/prod 环境映射正确。
2. 合法已注册用户校验后原子写入正确 JSON。
3. 未注册、openid 不一致、非法 ID 和异常响应均拒绝写入。
4. 网络失败不覆盖已有会话。
5. `status` 能识别有效、缺失、损坏和超大文件。
6. `logout` 只删除目标会话文件，重复执行仍成功。
7. dev 与 prod profile 完全隔离。
8. 输出默认不包含完整 openid。

完成后只运行该工具的聚焦测试和命令行帮助检查，不触碰当前工作区中的其他未提交修改。
