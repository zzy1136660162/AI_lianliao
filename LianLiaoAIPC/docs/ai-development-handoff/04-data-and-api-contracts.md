# 数据、身份与 API 契约

## 1. 环境地址

| 环境          | 企业与客服 REST 基础地址    | 客服 WebSocket                                         |
| ------------- | --------------------------- | ------------------------------------------------------ |
| Electron 开发 | `http://127.0.0.1:12580/`   | `ws://127.0.0.1:12580/cloud-api/customer-service/ws`   |
| Electron 生产 | `https://cloud.lslnii.com/` | `wss://cloud.lslnii.com/cloud-api/customer-service/ws` |

开发环境禁止在本地服务失败时回退线上。生产环境禁止通过 Renderer 或普通环境变量切换到任意主机。

## 2. 企业读取操作

Electron 公共操作与固定路径定义在：

```text
AionUi/packages/desktop/src/common/enterprise/contracts.ts
AionUi/packages/desktop/src/common/enterprise/rawSchemas.ts
AionUi/packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts
AionUi/packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts
```

当前允许列表：

| Operation           | cloud-api 路径                                               | 用途                                 |
| ------------------- | ------------------------------------------------------------ | ------------------------------------ |
| `company.list`      | `cloud-api/CompanyController/getQiYeMaCompanyList`           | 企业分页、行业、地区、会员筛选       |
| `company.detail`    | `cloud-api/CompanyController/getDetailcompany`               | 企业详情和联系方式                   |
| `product.list`      | `cloud-api/CompanyController/getFindProducts`                | 产品分页、企业、园区和地区筛选       |
| `product.detail`    | `cloud-api/CompanyController/FindProduct`                    | 产品详情                             |
| `project.dashboard` | `cloud-api/OpportunityController/getAiMaterialDashboard`     | 在建项目聚合指标和图表               |
| `project.drill`     | `cloud-api/OpportunityController/getAiMaterialDrillList`     | 分类、材料、地区和预算钻取           |
| `project.list`      | `cloud-api/OpportunityController/getAiMaterialProjectList`   | 在建项目分页筛选                     |
| `project.detail`    | `cloud-api/OpportunityController/getAiMaterialProjectDetail` | 项目详情和隐私边界                   |
| `demand.types`      | `cloud-api/DemandQueryController/types`                      | 仅返回存在审核通过公开数据的供需类型 |
| `demand.list`       | `cloud-api/DemandQueryController/list`                       | 公开供需筛选与分页                   |
| `demand.detail`     | `cloud-api/DemandQueryController/detail`                     | 按类型与业务 ID 查询公开详情         |

Renderer 只传业务筛选字段；主进程从当前企业会话注入身份。新增操作必须同时扩展：

1. TypeScript request/response contract；
2. Zod 严格输入 Schema；
3. 旧响应 raw Schema 和 normalizer；
4. 固定 route allowlist；
5. 主进程序列化和响应校验；
6. Preload/Renderer Client；
7. 后端 Controller/Service/Mapper 和契约测试。

### 2.1 供需只读边界

本期供需操作只有查询，没有发布、修改、删除、抢单、支付、收藏、询价或联系方式解锁：

- `demand.types` 的 payload 必须是空对象；
- `demand.list` 支持 `keyword/typeId/city/district/status/pageNum/pageSize`；
- `demand.detail` 使用 `{ demandId, typeId }`，两个字段共同定位记录；
- `typeId = 0` 固定读取 `J_DEMAND`，其他类型读取 `J_COMMON_DEMAND`；
- 类型名称来自 `DEMAND_TYPE`，详情扩展字段来自服务端字段映射，不允许客户端传列名；
- 列表与详情不返回 `OPEN_ID/USER_ID/UNION_ID/CONTACT_TEL/CONTACT_PERSON/SERVICE_FEE`；
- Renderer 不直接访问网络，仍经 Preload/IPC/主进程固定路径白名单；
- 供需业务 ID 使用非零有符号整数字符串，最长 31 位，不转换为 JavaScript `number`。

后端 DDL 文件：

```text
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/resources/db/demand_field_mapping.sql
```

截至 2026-07-20，该脚本只进入源码，**尚未执行到 Oracle**。执行 `CREATE TABLE`、约束和 `MERGE` 种子数据前，仍需用户明确确认目标环境和回滚方案。

### 2.2 2026-07-20 自动化验证记录

- Electron 供需聚焦测试：6 个文件、72 个用例通过；
- 企业测试 TypeScript 检查、i18n 类型生成和 i18n 结构检查通过；
- `oxlint` 以 0 error 退出（仓库仍有历史 warning）；
- Electron production package 通过；
- 本次相关的 21 个前端文件格式检查通过；仓库级格式检查仍被 6 个无关既有文档/随包资源阻断；
- cloud-api Controller、DDL contract、Mapper、Service 共 17 个测试通过；
- cloud-service reactor `-DskipTests` package 通过；
- 敏感字段、Renderer 直连网络和 MyBatis `${}` 动态插值扫描均为 0 命中。

剩余验收不是自动化代码门禁：需经用户批准执行映射 DDL 后，使用 Oracle 真实数据验证 `typeId=0` 及至少两个公共供需类型，并通过本地 `127.0.0.1:12580` 网关联调类型、列表和详情。

## 3. 扫码登录接口

| 路径                                                | 作用                                                   |
| --------------------------------------------------- | ------------------------------------------------------ |
| `cloud-api/CommonWxGZHQrCodeLogIn/desktop/create`   | 创建桌面扫码会话和二维码                               |
| `cloud-api/CommonWxGZHQrCodeLogIn/desktop/poll`     | 查询 `WAITING/AUTHENTICATED/REGISTER_REQUIRED/EXPIRED` |
| `cloud-api/DesktopEnterpriseController/userContext` | 根据 `openId` 查询用户、企业、会员和角色上下文         |

企业上下文标准结构：

```ts
type EnterpriseUserContext = {
  registered: boolean;
  openId: string;
  userId?: string;
  userName?: string;
  companyId?: string;
  companyName?: string;
  companyLevel?: number;
  roleId?: string;
};
```

`openId` 允许明文传递。它可作为现有查询业务标识，但对于收藏、解锁、积分、支付、发布等新写操作，后端不能只凭客户端提交的 `openId` 授权；必须建立并验证可过期、可撤销且绑定身份的桌面会话凭据。

## 4. ID 规则

### 4.1 统一格式

所有用户、企业、产品、项目、会话和消息等业务 ID 均使用：

```regex
^-?[1-9][0-9]*$
```

含义：

- 接受正数和负数；
- 拒绝 `0`、`-0`、小数、指数、空白和前导零；
- TypeScript/JSON 中使用字符串；
- 长度由具体领域 Schema 决定：客服 Oracle 主键当前最多 19 位；项目请求现有前端允许最多 31 位；不要擅自增加全局 19 位限制；
- Java 后端使用 `BigDecimal`/与真实列匹配的整数表示，不先经过可能缩窄范围的类型；
- 不使用 JavaScript `number` 比较、排序或计算业务 ID。

### 4.2 现有实现

- Electron 企业 ID：`common/enterprise/entityId.ts`，支持调用方传入领域最大位数；
- 客服 ID：`common/enterprise/customer-service/schemas.ts` 的 `signedBusinessIdSchema`，最多 19 位；
- 后端客服 ID：`SignedIdCodec`；
- H5 客服：`customerServiceTypes.ts` 中的字符串校验。

## 5. 会员等级展示

当前桌面只实现 H5 语义一致的 `companyLevel/comLevel` 展示：

| 数值         | 展示                             |
| ------------ | -------------------------------- |
| `1`          | 实名认证                         |
| `1.1`        | 普通会员                         |
| `1.2` 到 `3` | VIP 会员聚合展示                 |
| `4`          | 4 星会员                         |
| `5`          | 5 星会员                         |
| `6`          | 旗舰店                           |
| 其他         | 显示后端原始等级文本，不显示破图 |

权威实现：

```text
AionUi/packages/desktop/src/renderer/pages/enterprise/membership/companyMembership.ts
E:/ZZY_PROJECT/lianshang_liaoning/vip_store/src/page/qiyema/company
```

该映射只用于展示，不能据此推导价格、积分、发布额度或项目解锁权益。

## 6. 收藏数据

已确认 Oracle `J_CY_INTEREST` 是收藏表。已知类型：

| 对象     | `TYPE` |
| -------- | ------ |
| 企业     | `1`    |
| 产品     | `2`    |
| 在建项目 | `6`    |

待开发桌面接口建议稳定为：

```text
favorite/status
favorite/save
favorite/remove
favorite/list
```

实现前必须只读检查现有列、有效/删除标记、重复有效数据、旧 H5 写入和索引。数据库清理、唯一约束或 `MERGE` 修改必须再次获得用户确认。

供给和需求对应的收藏数字类型尚无已确认依据，禁止猜测。

## 7. 商机与项目

项目读取以 `hpInfoId` 为稳定外部标识。桌面商机闭环目标：

```text
NONE → TODO → DOING → DONE
```

收藏状态与跟进状态必须分离。后端已有 `J_OPP_LEAD` 和部分查询/更新能力，但桌面开发前仍需确认：

- `hpInfoId` 如何解析真实项目和 `leadId`；
- 同一用户/企业与项目的逻辑唯一键；
- 是否允许状态跳级、回退或从 `DONE` 恢复；
- 项目解锁消耗的真实权益代码和次数；
- 联系方式解锁的事务与幂等键。

## 8. 真人客服 REST

统一前缀：

```text
/cloud-api/CustomerServiceController
```

| 方法与路径                    | 身份     | 作用                             |
| ----------------------------- | -------- | -------------------------------- |
| `POST /customer/auth`         | `openId` | 客户短期令牌                     |
| `POST /staff/auth`            | `openId` | 客服短期令牌，后端校验角色和岗位 |
| `POST /conversation/open`     | CUSTOMER | 恢复或创建唯一未结束会话         |
| `POST /conversation/list`     | STAFF    | 当前客服会话分页                 |
| `POST /conversation/detail`   | 双方     | 有权限的会话详情                 |
| `POST /message/history`       | 双方     | 游标分页历史/断线补拉            |
| `POST /message/read`          | 双方     | 推进当前身份已读位置             |
| `POST /image/upload`          | 双方     | 上传受控客服图片                 |
| `POST /conversation/transfer` | 当前客服 | 指定转接                         |
| `POST /conversation/close`    | 双方     | 结束会话                         |
| `POST /staff/candidates`      | 当前客服 | 查询可转接客服                   |
| `POST /websocket/ticket`      | 双方     | 生成 60 秒一次性 ticket          |

访问令牌默认 2 小时，只保存在 Redis 摘要和客户端进程内存。Renderer 不可见。

## 9. 真人客服 WebSocket

路径：

```text
/cloud-api/customer-service/ws?ticket=<one-time-ticket>
```

客户端事件：

- `message.send`
- `message.read`
- `ping`

服务端事件：

- `connection.ready`
- `conversation.snapshot`
- `message.ack`
- `message.created`
- `read.updated`
- `conversation.assigned`
- `conversation.transferred`
- `conversation.closed`
- `presence.updated`
- `pong`
- `error`

消息发送使用客户端 UUID `clientMessageId` 实现幂等。只有 Oracle 事务成功后才能返回 `message.ack` 和“已送达”。Redis Pub/Sub 是实时通道，不是最终消息数据源。

## 10. 客服角色和分配

前端入口：

```text
roleId = 19
```

后端客服认证必须同时满足：

```text
J_USER_ROLE_RELATIVE.ROLE_ID = 19
AND LS_PUBLIC_USER.POST = '客服'
AND 用户/企业关系有效
```

分配复用：

```text
POST cloud-api/YlsbUser/getAllocationKeFuUserInfo
```

请求示例：

```json
{
  "user_name": "客户显示名称",
  "tel": "客户电话",
  "from_company_name": "客户企业名称"
}
```

典型返回字段包括 `userName`、`openId`、`source`、`tempPic`。返回客服仍需二次校验资格；分配失败时会话保持 `WAITING` 并由后台重试。

## 11. 微信推送

- 调用路径参考：`PushMessageServiceImpl.java`；
- 模板由 `weixinTemplateService.getById(5)` 读取 `WEIXIN_TEMPLATE.ID=5`；
- 初次分配和转接推送，普通聊天消息不推微信；
- 模板 URL 指向 H5 `/customer-service/reception?conversationId=<id>`；
- URL 只用于定位，不能授予权限。

## 12. 客服数据库对象

DDL：

```text
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/resources/db/customer_service.sql
```

已初始化并于 2026-07-20 用只读工具核验：

| 对象 | 数量 |
| ---- | ---: |
| 表   |    4 |
| 索引 |   10 |
| 序列 |    4 |
| 约束 |   27 |

表：

- `J_CY_CS_CONVERSATION`
- `J_CY_CS_MESSAGE`
- `J_CY_CS_ASSIGN_LOG`
- `J_CY_CS_PUSH_LOG`

只读复核命令：

```powershell
cd E:\ZZY_PROJECT\AI_lianliao
python tools\database\oracle\oracle_readonly.py --json
```

工具只查询 Oracle `USER_*` 元数据，执行只读事务并 `rollback`，不提供任意 SQL 和写入入口。

## 13. 数据库操作边界

AI 可直接进行：

- 读取配置；
- 查询表、列、索引、约束和序列元数据；
- 执行经过只读保护的 `SELECT`；
- 分析 Mapper、DDL 和已有数据结构。

AI 必须先获得用户明确确认才能进行：

- `INSERT/UPDATE/DELETE/MERGE`；
- `CREATE/ALTER/DROP/TRUNCATE`；
- 数据清理、去重、迁移和回填；
- 建索引、唯一约束、序列或触发器；
- 执行存储过程、锁表或提交事务。

提请确认时必须说明：目标库、对象、SQL 摘要、影响行/锁范围、回滚方案和验证方法。
