# 企业登录历史负数 userId 兼容设计

## 背景

企业桌面端通过微信扫码取得 `openid`，后端据此查询用户、企业关联、企业和角色。现场账号已经存在完整关联，但其历史用户主键为 `-60`。当前后端与 Electron 都把 `userId` 限制为正整数字符串，因此该账号被误判为未注册并进入注册引导。

## 目标

仅调整企业身份上下文中的 `userId` 规则：接受非零有符号十进制整数字符串。`companyId`、`roleId` 及其他业务对象 ID 继续要求正整数。

明确契约如下：

- `userId`：匹配 `^-?[1-9][0-9]*$`；例如 `60`、`-60` 有效。
- `userId`：`0`、`-0`、`+60`、小数、空白和非数字无效。
- `companyId`、`roleId`：继续匹配 `^[1-9][0-9]*$`。
- 不修改数据库主键，不迁移历史关联，不改变 `openid` 查询方式。

## 方案比较

### 方案 A：全链路只放宽 userId（采用）

后端用户上下文、扫码轮询响应、Electron API 客户端和 Electron IPC 桥使用同一条 `userId` 契约。优点是与真实数据库兼容，而且所有信任边界保持一致；缺点是需要同时修改两个仓库的四个校验点。

### 方案 B：只修改后端

后端能够返回 `AUTHENTICATED`，但 Electron 主进程仍会拒绝 `-60`，登录最终仍失败。因此不采用。

### 方案 C：迁移数据库负数主键

需要同步更新用户、企业关联、角色及其他潜在外键，影响面和数据风险远高于兼容读取。因此不采用。

## 组件改动

### cloud-service

1. `DesktopEnterpriseServiceImpl`
   - 为 `userId` 使用独立的非零有符号整数规范化逻辑。
   - `companyId` 与 `roleId` 继续使用现有正整数规范化逻辑。
   - 返回的 ID 仍统一为规范化十进制字符串。

2. `CommonQrCodeServiceImpl`
   - 注册身份判定允许非零有符号 `userId`。
   - `companyId` 和可选 `roleId` 仍要求正整数。
   - 白名单响应结构保持不变。

### AionUi

1. `EnterpriseApiClient`
   - 解析 `AUTHENTICATED` 轮询结果时允许非零有符号 `userId`。
   - `companyId` 继续要求正整数。

2. `enterpriseBridge`
   - 把用户标识和正整数业务标识拆成两个校验函数。
   - 保存会话前允许非零有符号 `userId`，仍拒绝非正数 `companyId`。

公共 `EnterpriseUserContext` 类型仍使用字符串，不需要修改 IPC 消息结构或渲染层。

## 数据流

1. 微信回调把本次扫码的 `openid` 写入 Redis。
2. 桌面轮询接口读取 `openid` 并查询企业用户上下文。
3. 后端把历史主键 `-60` 规范化为字符串 `"-60"`，确认企业 ID 有效后返回 `AUTHENTICATED`。
4. Electron API 客户端验证返回结构，IPC 桥再次验证并保存 openid 会话。
5. 渲染层进入企业工作台；后续请求继续把 `userId` 作为字符串传给现有接口。

## 错误处理与安全边界

- `userId=0` 或格式异常时继续按无效身份处理。
- 负数 `companyId`、负数 `roleId` 仍不可信。
- 不放宽 openid、登录会话、二维码、IPC 发送方或响应白名单校验。
- 不把 openid 或数据库凭据写入日志和测试快照。

## 测试策略

按测试驱动依次覆盖：

1. 后端用户上下文：`userId=-60` 且 `companyId>0` 时返回 `registered:true`。
2. 后端扫码轮询：相同上下文返回 `AUTHENTICATED`，并保持响应白名单。
3. 后端边界：`userId=0`、负数 `companyId` 仍不通过。
4. Electron API 客户端：接受 `userId="-60"`，继续拒绝 `userId="0"` 和负数 `companyId`。
5. Electron IPC 桥：允许负数用户 ID 建立会话，继续拒绝无效公司 ID。
6. 运行 cloud-service 定向 Maven 测试、AionUi 企业定向 Vitest 测试和 AionUi 打包检查。

## 非目标

- 不修改企业注册 H5。
- 不新增接口或数据库字段。
- 不改变数据库历史数据。
- 不放宽收藏、项目、产品或企业对象 ID 的既有正整数规则。
