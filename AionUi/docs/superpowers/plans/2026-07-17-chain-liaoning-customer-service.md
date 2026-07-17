# 链辽真人客服系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `cloud-api`、`vip_store` 和 `AionUi` 中交付一套自建的真人客服系统，使 H5 客户、H5 客服和 Electron 客服能够在统一权限、会话、消息与通知模型下可靠沟通。

**Architecture:** `cloud-api` 是唯一可信边界，Oracle 保存会话、消息、分配与推送任务，Redis 保存短期令牌、一次性 WebSocket 票据、在线状态、分布式锁和跨实例事件。H5 使用浏览器 WebSocket；Electron 由主进程持有 `openId`、访问令牌和 `ws` 连接，渲染进程只通过严格校验的 IPC 读取数据和发送命令。

**Tech Stack:** Java 8、Spring Boot 2.6.1、Spring WebSocket、MyBatis/MyBatis-Plus、Oracle、Redis、JUnit 5、Mockito、Vue 3、TypeScript、Vant、Axios、React 19、Electron 37、Ant Design React、`ws`、Zod、Vitest、Testing Library。

---

## 实施约束

- 三个 Git 仓库均在 `master` 上实施，不创建工作树，不清理、不暂存、不覆盖用户已有改动。
- `E:/ZZY_PROJECT/AI_lianliao`、`E:/ZZY_PROJECT/lianshang_liaoning/vip_store`、`E:/ZZY_PROJECT/lianshang_liaoning` 分别独立提交，提交消息使用中文。
- 每次修改已有文件前先运行 `git diff -- <file>`；发现与客服功能相交的用户改动时停止该文件并核对差异。
- 所有公共 ID 在网络层使用字符串；后端接受任意非零、最多 19 位的有符号十进制整数，不能使用 JavaScript `number` 承载业务 ID。
- 只编写数据库脚本。执行建表、序列、索引、约束或修改测试/生产数据库之前，必须再次获得用户明确确认。
- 日志不记录访问令牌、WebSocket 票据、完整 `openId`、完整手机号和完整消息正文。
- 每个任务遵循红灯测试、最小实现、绿灯测试、局部提交的顺序。

## 文件地图

### `cloud-api` 后端

**修改：**

- `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/pom.xml`
- `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/resources/application.yml`

**新增配置与协议：**

- `cloud-api/src/main/java/com/zzy/cloud/api/customer/config/CustomerServiceProperties.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/config/CustomerServiceWebSocketConfig.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/config/CustomerServiceRedisConfig.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/domain/CustomerServiceEnums.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/domain/CustomerServiceCustomerIdentity.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/domain/CustomerServiceStaffIdentity.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/domain/CustomerServicePrincipal.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/domain/CustomerServiceProtocol.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/util/SignedIdCodec.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/util/CustomerServicePrivacy.java`

**新增持久化：**

- `cloud-api/src/main/java/com/zzy/cloud/api/customer/model/CustomerServiceConversation.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/model/CustomerServiceMessage.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/model/CustomerServiceAssignmentLog.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/model/CustomerServicePushLog.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/mapper/customer/CustomerServiceConversationMapper.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/mapper/customer/CustomerServiceMessageMapper.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/mapper/customer/CustomerServiceAssignmentMapper.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/mapper/customer/CustomerServicePushMapper.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/mapper/customer/CustomerServiceIdentityMapper.java`
- `cloud-api/src/main/resources/mapper/customer/CustomerServiceConversationMapper.xml`
- `cloud-api/src/main/resources/mapper/customer/CustomerServiceMessageMapper.xml`
- `cloud-api/src/main/resources/mapper/customer/CustomerServiceAssignmentMapper.xml`
- `cloud-api/src/main/resources/mapper/customer/CustomerServicePushMapper.xml`
- `cloud-api/src/main/resources/mapper/customer/CustomerServiceIdentityMapper.xml`
- `cloud-api/src/main/resources/db/customer_service.sql`

**新增服务与入口：**

- `cloud-api/src/main/java/com/zzy/cloud/api/customer/dto/CustomerServiceRequests.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/dto/CustomerServiceResponses.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/CustomerServiceAuthService.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/CustomerServiceTokenStore.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/CustomerServiceAssignmentAdapter.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/CustomerServiceConversationService.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/CustomerServiceMessageService.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/CustomerServiceEventPublisher.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/CustomerServicePresenceService.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/CustomerServiceNotificationService.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/CustomerServiceUploadService.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/CustomerServiceFileStorageClient.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/impl/RedisCustomerServiceTokenStore.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/impl/CustomerServiceAuthServiceImpl.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/impl/CustomerServiceAssignmentAdapterImpl.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/impl/CustomerServiceConversationServiceImpl.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/impl/CustomerServiceMessageServiceImpl.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/impl/CustomerServicePresenceServiceImpl.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/impl/CustomerServiceNotificationServiceImpl.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/impl/CustomerServiceUploadServiceImpl.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/impl/RestCustomerServiceFileStorageClient.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/websocket/CustomerServiceHandshakeInterceptor.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/websocket/CustomerServiceSessionRegistry.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/websocket/RedisCustomerServiceEventPublisher.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/websocket/CustomerServiceWebSocketHandler.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/controller/CustomerServiceController.java`
- `cloud-api/src/main/java/com/zzy/cloud/api/customer/scheduler/CustomerServiceScheduler.java`
- `cloud-api/src/main/resources/deploy/customer-service-nginx.conf`

**新增测试：**

- `cloud-api/src/test/java/com/zzy/cloud/api/customer/util/SignedIdCodecTest.java`
- `cloud-api/src/test/java/com/zzy/cloud/api/customer/db/CustomerServiceSchemaContractTest.java`
- `cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceAuthServiceImplTest.java`
- `cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceConversationServiceImplTest.java`
- `cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceMessageServiceImplTest.java`
- `cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceLifecycleTest.java`
- `cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceNotificationServiceImplTest.java`
- `cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceUploadServiceImplTest.java`
- `cloud-api/src/test/java/com/zzy/cloud/api/customer/websocket/CustomerServiceWebSocketHandlerTest.java`
- `cloud-api/src/test/java/com/zzy/cloud/api/customer/controller/CustomerServiceControllerTest.java`

### `vip_store` H5

**修改：**

- `E:/ZZY_PROJECT/lianshang_liaoning/vip_store/package.json`
- `E:/ZZY_PROJECT/lianshang_liaoning/vip_store/src/router/routes.ts`

**新增：**

- `src/api/customerService.ts`
- `src/router/modules/customer_service.ts`
- `src/page/customer-service/model/customerServiceTypes.ts`
- `src/page/customer-service/model/customerServiceState.ts`
- `src/page/customer-service/model/customerServiceScroll.ts`
- `src/page/customer-service/model/customerServiceRole.ts`
- `src/page/customer-service/composables/useCustomerServiceIdentity.ts`
- `src/page/customer-service/composables/useCustomerServiceSocket.ts`
- `src/page/customer-service/composables/useMessageTimeline.ts`
- `src/page/customer-service/components/CustomerServiceMessageList.vue`
- `src/page/customer-service/components/CustomerServiceComposer.vue`
- `src/page/customer-service/components/CustomerServiceConversationList.vue`
- `src/page/customer-service/components/CustomerServiceCustomerSummary.vue`
- `src/page/customer-service/CustomerChatPage.vue`
- `src/page/customer-service/StaffReceptionPage.vue`
- `src/page/customer-service/customer-service.scss`
- `src/page/customer-service/__tests__/customerServiceContract.test.ts`
- `src/page/customer-service/__tests__/customerServiceState.test.ts`
- `src/page/customer-service/__tests__/customerServiceRoleGuard.test.ts`
- `src/page/customer-service/__tests__/customerServiceScroll.test.ts`

### `AionUi` Electron

**修改：**

- `AionUi/packages/desktop/src/process/bridge/index.ts`
- `AionUi/packages/desktop/src/process/bridge/enterpriseBridge.ts`
- `AionUi/packages/desktop/src/preload/main.ts`
- `AionUi/packages/desktop/src/common/types/platform/electron.ts`
- `AionUi/packages/desktop/src/common/platform/IPlatformServices.ts`
- `AionUi/packages/desktop/src/common/platform/ElectronPlatformServices.ts`
- `AionUi/packages/desktop/src/common/platform/NodePlatformServices.ts`
- `AionUi/packages/desktop/src/common/platform/index.ts`
- `AionUi/packages/desktop/src/process/bridge/notificationBridge.ts`
- `AionUi/packages/desktop/src/process/utils/tray.ts`
- `AionUi/packages/desktop/src/renderer/components/layout/Router.tsx`
- `AionUi/packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseSider.tsx`
- `AionUi/packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx`
- `AionUi/packages/desktop/src/renderer/services/i18n/locales/zh-CN/enterprise.json`
- `AionUi/packages/desktop/src/renderer/services/i18n/locales/en-US/enterprise.json`
- `AionUi/packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`
- `AionUi/tsconfig.enterprise-tests.json`

**新增：**

- `AionUi/packages/desktop/src/common/customerService/contracts.ts`
- `AionUi/packages/desktop/src/common/customerService/constants.ts`
- `AionUi/packages/desktop/src/common/customerService/schemas.ts`
- `AionUi/packages/desktop/src/process/services/customerService/customerServiceApiClient.ts`
- `AionUi/packages/desktop/src/process/services/customerService/customerServiceSocketClient.ts`
- `AionUi/packages/desktop/src/process/services/customerService/customerServiceGateway.ts`
- `AionUi/packages/desktop/src/process/services/enterprise/enterpriseSessionEvents.ts`
- `AionUi/packages/desktop/src/process/bridge/customerServiceBridge.ts`
- `AionUi/packages/desktop/src/renderer/services/customerService/customerServiceClient.ts`
- `AionUi/packages/desktop/src/renderer/pages/enterprise/customerService/customerServiceReducer.ts`
- `AionUi/packages/desktop/src/renderer/pages/enterprise/customerService/useCustomerServiceWorkbench.ts`
- `AionUi/packages/desktop/src/renderer/pages/enterprise/customerService/CustomerServiceWorkbenchPage.tsx`
- `AionUi/packages/desktop/src/renderer/pages/enterprise/customerService/ConversationQueue.tsx`
- `AionUi/packages/desktop/src/renderer/pages/enterprise/customerService/MessageTimeline.tsx`
- `AionUi/packages/desktop/src/renderer/pages/enterprise/customerService/MessageComposer.tsx`
- `AionUi/packages/desktop/src/renderer/pages/enterprise/customerService/CustomerProfilePanel.tsx`
- `AionUi/packages/desktop/src/renderer/pages/enterprise/customerService/customer-service-workbench.module.css`
- `AionUi/tests/unit/customerService/customerServiceSchemas.test.ts`
- `AionUi/tests/unit/customerService/customerServiceApiClient.test.ts`
- `AionUi/tests/unit/customerService/customerServiceSocketClient.test.ts`
- `AionUi/tests/unit/customerService/customerServiceBridge.test.ts`
- `AionUi/tests/unit/customerService/customerServiceReducer.test.ts`
- `AionUi/tests/unit/customerService/customerServiceNotification.test.ts`
- `AionUi/tests/integration/enterprise/customerServiceWorkbench.dom.test.tsx`

## Task 1: 固化仓库基线和跨端协议样例

**Files:**

- Read: 三个仓库的 `git status --short`
- Read: `AionUi/docs/superpowers/specs/2026-07-17-chain-liaoning-customer-service-design.md`

- [ ] **Step 1: 记录三个仓库当前分支与改动**

Run:

```powershell
git -C E:/ZZY_PROJECT/AI_lianliao branch --show-current
git -C E:/ZZY_PROJECT/AI_lianliao status --short
git -C E:/ZZY_PROJECT/lianshang_liaoning/vip_store branch --show-current
git -C E:/ZZY_PROJECT/lianshang_liaoning/vip_store status --short
git -C E:/ZZY_PROJECT/lianshang_liaoning branch --show-current
git -C E:/ZZY_PROJECT/lianshang_liaoning status --short
```

Expected: 三处均为 `master`；只记录已有改动，不运行 `stash`、`reset` 或清理命令。

- [ ] **Step 2: 在每次编辑已有文件前检查重叠**

Run the relevant form before editing:

```powershell
git diff -- cloud-api/pom.xml cloud-api/src/main/resources/application.yml
git diff -- package.json src/router/routes.ts
git -C E:/ZZY_PROJECT/AI_lianliao diff -- AionUi/packages/desktop/src/process/bridge/index.ts AionUi/packages/desktop/src/preload/main.ts
```

Expected: 若文件已有用户改动，只围绕现有差异增量修改；无法安全合并时先向用户说明具体冲突。

- [ ] **Step 3: 固化协议示例供三端测试复用**

在三个测试目录分别使用同一组值：会话 ID `"-8"`、消息 ID `"9223372036854775808"`、客服 ID `"-19"`、`clientMessageId` `"11111111-1111-4111-8111-111111111111"`。协议断言必须证明 ID 始终保持字符串且负数不会被拒绝。

## Task 2: 建立 Oracle 脚本、领域枚举和 ID 边界

**Files:**

- Create: `cloud-api/src/main/resources/db/customer_service.sql`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/customer/domain/CustomerServiceEnums.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/customer/util/SignedIdCodec.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/customer/util/SignedIdCodecTest.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/customer/db/CustomerServiceSchemaContractTest.java`

- [ ] **Step 1: 先写 ID 红灯测试**

```java
@Test
void acceptsNegativeAndNineteenDigitNonZeroIds() {
    assertEquals(new BigDecimal("-19"), SignedIdCodec.parse("-19"));
    assertEquals(new BigDecimal("9223372036854775808"), SignedIdCodec.parse("9223372036854775808"));
}

@ParameterizedTest
@ValueSource(strings = {"0", "+1", "1.0", " 1", "10000000000000000000"})
void rejectsInvalidIds(String value) {
    assertThrows(IllegalArgumentException.class, () -> SignedIdCodec.parse(value));
}
```

Run from `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service`:

```powershell
mvn -pl cloud-api -am "-Dtest=SignedIdCodecTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: FAIL because `SignedIdCodec` does not exist.

- [ ] **Step 2: 实现单一 ID 转换器和业务枚举**

`SignedIdCodec.parse` 只接受 `-?[1-9][0-9]*`，再校验绝对值不超过 19 位，返回 `BigDecimal`；`format` 使用 `toBigIntegerExact().toString()`。`CustomerServiceEnums` 集中定义：

```java
public enum ConversationStatus { WAITING, ACTIVE, CLOSED }
public enum SenderType { CUSTOMER, STAFF, SYSTEM }
public enum MessageType { TEXT, IMAGE, SYSTEM }
public enum PushType { NEW_ASSIGNMENT, TRANSFER }
public enum PushStatus { PENDING, SENDING, SENT, FAILED }
```

- [ ] **Step 3: 编写完整 Oracle DDL 和脚本契约测试**

脚本必须创建四张表、四个序列、主键、消息幂等唯一约束、推送幂等唯一约束、会话状态检查约束，以及基于 `CUSTOMER_OPEN_ID` 的未结束会话函数唯一索引。会话表必须包含 `STAFF_FIRST_REPLY_AT`，初次分配和转接时为空，当前客服首次回复时写入，用于准确派生“待接待”。序列名称固定为：

```sql
SEQ_J_CY_CS_CONVERSATION
SEQ_J_CY_CS_MESSAGE
SEQ_J_CY_CS_ASSIGN_LOG
SEQ_J_CY_CS_PUSH_LOG
```

`CustomerServiceSchemaContractTest` 读取类路径脚本并断言所有对象名、`WAITING/ACTIVE/CLOSED`、`CLIENT_MESSAGE_ID` 和函数唯一索引均存在。

- [ ] **Step 4: 运行测试并提交脚本，不执行脚本**

```powershell
mvn -pl cloud-api -am "-Dtest=SignedIdCodecTest,CustomerServiceSchemaContractTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
git add cloud-api/src/main/resources/db/customer_service.sql cloud-api/src/main/java/com/zzy/cloud/api/customer/domain/CustomerServiceEnums.java cloud-api/src/main/java/com/zzy/cloud/api/customer/util/SignedIdCodec.java cloud-api/src/test/java/com/zzy/cloud/api/customer
git commit -m "客服：新增数据模型脚本与ID规则"
```

Expected: tests PASS；提交只包含脚本、ID 工具、枚举和对应测试。

## Task 3: 实现客户/客服身份、双条件权限和短期令牌

**Files:**

- Create: `cloud-api/src/main/java/com/zzy/cloud/api/customer/domain/CustomerServicePrincipal.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/mapper/customer/CustomerServiceIdentityMapper.java`
- Create: `cloud-api/src/main/resources/mapper/customer/CustomerServiceIdentityMapper.xml`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/CustomerServiceAuthService.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/CustomerServiceTokenStore.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/impl/RedisCustomerServiceTokenStore.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/customer/service/impl/CustomerServiceAuthServiceImpl.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/customer/util/CustomerServicePrivacy.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/customer/config/CustomerServiceProperties.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceAuthServiceImplTest.java`

- [ ] **Step 1: 写双条件权限红灯测试**

覆盖四种组合：`roleId=19/post=客服` 成功；角色不符、岗位不符、关联失效均返回固定 `FORBIDDEN_STAFF`；客户即使没有企业关联也能获得客户令牌。另测令牌 2 小时 TTL、票据 60 秒 TTL、同一票据只能消费一次。

```java
@Test
void staffRequiresRoleNineteenAndCustomerServicePost() {
    CustomerServiceStaffIdentity identity = new CustomerServiceStaffIdentity(
        "-19", "openid", "郭磊_2", "19", "客服", true);
    when(identityMapper.findStaffByOpenId("openid")).thenReturn(identity);
    assertEquals("-19", service.authenticateStaff("openid").getPrincipal().getUserId());
}
```

Run:

```powershell
mvn -pl cloud-api -am "-Dtest=CustomerServiceAuthServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: FAIL because auth services do not exist.

- [ ] **Step 2: 实现身份查询**

`CustomerServiceIdentityMapper.xml` 从 `USERCENTER.SYS_USERS_AUTHENTICATION`、`USERCENTER.SYS_USER_ENTERPRISE_RELEVANCE`、`J_USER_ROLE_RELATIVE`、`LS_PUBLIC_USER` 和 `J_CY_COMPANY` 读取 `CustomerServiceCustomerIdentity` / `CustomerServiceStaffIdentity` 快照。客服查询必须在 SQL 和 Java 服务层同时核验 `ROLE_ID=19`、`POST='客服'` 和有效关联，防止映射错误放宽权限。

- [ ] **Step 3: 实现摘要令牌与一次性票据**

生成 32 字节强随机值并以 Base64 URL 无填充编码；Redis key 只保存 SHA-256 摘要：

```text
cs:access:<sha256>     TTL 7200 秒
cs:ws:ticket:<sha256> TTL 60 秒
```

票据消费使用 Lua 原子执行 `GET` 和 `DEL`。Redis value 只保存必要的身份类型、字符串 ID、`openId` 和显示名；错误日志调用 `CustomerServicePrivacy.maskOpenId` 与 `maskPhone`。

- [ ] **Step 4: 运行测试并提交**

```powershell
mvn -pl cloud-api -am "-Dtest=CustomerServiceAuthServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
git add cloud-api/src/main/java/com/zzy/cloud/api/customer cloud-api/src/main/java/com/zzy/cloud/api/mapper/customer/CustomerServiceIdentityMapper.java cloud-api/src/main/resources/mapper/customer/CustomerServiceIdentityMapper.xml cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceAuthServiceImplTest.java
git commit -m "客服：实现身份校验与短期令牌"
```

Expected: PASS；令牌明文只返回客户端，不进入数据库或日志。

## Task 4: 实现会话持久化、恢复和现有分配逻辑适配

**Files:**

- Create: 四个 `customer/model` 实体
- Create: 五个 `api/mapper/customer` 接口及对应 XML
- Create: `CustomerServiceAssignmentAdapter.java`
- Create: `CustomerServiceAssignmentAdapterImpl.java`
- Create: `CustomerServiceConversationService.java`
- Create: `CustomerServiceConversationServiceImpl.java`
- Test: `CustomerServiceConversationServiceImplTest.java`

- [ ] **Step 1: 写创建/恢复/分配红灯测试**

测试必须覆盖：已有 `ACTIVE` 或 `WAITING` 会话直接恢复且分配器调用次数为 0；新会话只调用一次 `YlsbUserService.getAllocationKeFuUserInfo(JSONObject)`；返回示例中 `id=null` 时仍用 `openId` 重新查有效客服；无效客服生成 `WAITING`；成功分配在同一事务写会话、分配日志和推送任务。

```java
verify(ylsbUserService, times(1)).getAllocationKeFuUserInfo(argThat(json ->
    "(￣▽￣)".equals(json.getString("user_name"))
        && "13898842587".equals(json.getString("tel"))
        && "沈阳航燃科技有限公司".equals(json.getString("from_company_name"))));
```

Run:

```powershell
mvn -pl cloud-api -am "-Dtest=CustomerServiceConversationServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: FAIL because conversation services and mappers do not exist.

- [ ] **Step 2: 实现会话与日志映射**

所有 Oracle `NUMBER(19)` 字段在实体中使用 `BigDecimal`，Controller DTO 才调用 `SignedIdCodec.format` 转为字符串。Mapper 提供：按客户查未结束会话、插入、乐观锁更新、客服列表游标查询、参与历史查询、待重分配查询、进行中工作量统计。

- [ ] **Step 3: 适配现有客服分配服务**

适配器只负责构造现有 JSON、调用一次现有服务、按返回 `openId` 查询客服资格并转换快照；不复制 `YlsbUserServcieImpl` 中推广登记、推广用户、历史回访、企业确认、担保和顺序分配规则。

- [ ] **Step 4: 实现事务化 open-or-resume**

先获取 `cs:conversation:create:<openId摘要>` 短锁，再查未结束会话；恢复路径不分配、不推送。创建路径使用 `SqlSequenceService.getSeqNextValByName` 获取固定序列，成功分配为 `ACTIVE`，失败为 `WAITING`。Oracle 唯一约束冲突时重新查询并返回已经创建的会话。

- [ ] **Step 5: 运行测试并提交**

```powershell
mvn -pl cloud-api -am "-Dtest=CustomerServiceConversationServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
git add cloud-api/src/main/java/com/zzy/cloud/api/customer cloud-api/src/main/java/com/zzy/cloud/api/mapper/customer cloud-api/src/main/resources/mapper/customer cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceConversationServiceImplTest.java
git commit -m "客服：实现会话恢复与客服分配"
```

## Task 5: 实现消息幂等、历史补拉、已读和限流

**Files:**

- Create: `CustomerServiceMessageService.java`
- Create: `CustomerServiceMessageServiceImpl.java`
- Create: `CustomerServiceEventPublisher.java`
- Complete: `CustomerServiceMessageMapper.java`
- Complete: `CustomerServiceMessageMapper.xml`
- Complete: `CustomerServiceConversationMapper.xml`
- Test: `CustomerServiceMessageServiceImplTest.java`

- [ ] **Step 1: 写消息状态红灯测试**

覆盖：文本最多 2000 Unicode 字符；只接收纯文本；图片 URL 必须来自受信任域；客户只能写自己的未结束会话；客服只能写当前分配给自己的 `ACTIVE` 会话；转出客服只读；重复 `clientMessageId` 返回原消息；数据库提交失败不发布事件；每分钟 30 条、图片 10 条限制；已读 ID 只能单调增加。

- [ ] **Step 2: 实现先提交后广播的事务边界**

`send` 返回持久化消息，但实时事件必须通过事务提交后的回调发布：

```java
TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronizationAdapter() {
    @Override
    public void afterCommit() {
        eventPublisher.publishMessageCreated(savedMessage);
    }
});
```

唯一约束冲突时按三元组查询原记录并返回相同服务端消息 ID，不重复更新最后消息或未读数。当前客服在某个 `ASSIGNMENT_VERSION` 下首次回复时，以条件更新写入 `STAFF_FIRST_REPLY_AT`；重复消息不能重复改变该时间。

- [ ] **Step 3: 实现游标历史和已读进度**

历史接口使用字符串 `beforeMessageId`/`afterMessageId`，每页最多 50 条；补拉按服务端消息 ID 升序。已读更新通过条件 SQL 保证只前进不回退，并广播 `read.updated`。

- [ ] **Step 4: 运行测试并提交**

```powershell
mvn -pl cloud-api -am "-Dtest=CustomerServiceMessageServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
git add cloud-api/src/main/java/com/zzy/cloud/api/customer cloud-api/src/main/java/com/zzy/cloud/api/mapper/customer cloud-api/src/main/resources/mapper/customer cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceMessageServiceImplTest.java
git commit -m "客服：实现可靠消息与已读进度"
```

## Task 6: 实现转接、结束、等待重分配和 24 小时关闭

**Files:**

- Complete: `CustomerServiceConversationServiceImpl.java`
- Create: `CustomerServiceScheduler.java`
- Test: `CustomerServiceLifecycleTest.java`

- [ ] **Step 1: 写生命周期红灯测试**

覆盖指定转接、离线候选可选、目标必须满足双条件权限、过期 `assignmentVersion` 被拒绝、原客服转出后只读、重复结束幂等、客户结束、客服结束、24 小时无消息自动关闭、`WAITING` 每 5 分钟重试、多个实例只由一个任务持锁执行。

- [ ] **Step 2: 实现转接事务**

事务按当前 `VERSION` 与 `ASSIGNMENT_VERSION` 更新会话，把 `STAFF_FIRST_REPLY_AT` 重置为空，写 `TRANSFER` 分配日志、系统消息和新客服推送任务。成功后广播 `conversation.transferred`；目标离线只影响界面警告，不影响合法转接。

- [ ] **Step 3: 实现关闭与调度**

关闭写入 `CLOSED_BY_TYPE`、`CLOSED_BY_ID`、`CLOSED_REASON`、`CLOSED_AT` 并生成一次系统消息。调度器每 5 分钟分别尝试 `WAITING` 重分配和超时关闭，使用 `cs:scheduler:allocation-retry` 与 `cs:scheduler:auto-close` 有 TTL 的 Redis 锁。

- [ ] **Step 4: 运行测试并提交**

```powershell
mvn -pl cloud-api -am "-Dtest=CustomerServiceLifecycleTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
git add cloud-api/src/main/java/com/zzy/cloud/api/customer cloud-api/src/main/java/com/zzy/cloud/api/mapper/customer cloud-api/src/main/resources/mapper/customer cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceLifecycleTest.java
git commit -m "客服：实现转接与会话生命周期"
```

## Task 7: 实现微信模板 5 推送任务和有限重试

**Files:**

- Create: `CustomerServiceNotificationService.java`
- Create: `CustomerServiceNotificationServiceImpl.java`
- Complete: `CustomerServicePushMapper.java`
- Complete: `CustomerServicePushMapper.xml`
- Complete: `CustomerServiceScheduler.java`
- Test: `CustomerServiceNotificationServiceImplTest.java`

- [ ] **Step 1: 写推送红灯测试**

覆盖：数据库模板固定为 `WEIXIN_TEMPLATE.ID = 5`，通过 `weixinTemplateService.getById(5)` 读取；把实体真实 `templateId` 传给 `PushMessageService.PushWXMessage(JSONObject)`；字段为 `thing1=链辽真人客服`、`thing5` 企业名优先、`time8` 分配时间；URL 为 H5 接待路由并带字符串会话 ID；普通消息不建任务；同一会话/分配版本/客服/类型只推一次；失败后 1、5、15 分钟重试，总尝试次数最多 4。

- [ ] **Step 2: 实现 outbox 状态机**

使用条件更新从 `PENDING/FAILED` 抢占到 `SENDING`；成功变 `SENT`，失败保存截断后的非敏感摘要并计算下一次时间。幂等键格式固定为：

```text
<conversationId>:<assignmentVersion>:<staffUserId>:<NEW_ASSIGNMENT|TRANSFER>
```

- [ ] **Step 3: 运行测试并提交**

```powershell
mvn -pl cloud-api -am "-Dtest=CustomerServiceNotificationServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
git add cloud-api/src/main/java/com/zzy/cloud/api/customer cloud-api/src/main/java/com/zzy/cloud/api/mapper/customer/CustomerServicePushMapper.java cloud-api/src/main/resources/mapper/customer/CustomerServicePushMapper.xml cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceNotificationServiceImplTest.java
git commit -m "客服：实现微信工单提醒与重试"
```

## Task 8: 实现受控图片上传代理

**Files:**

- Create: `CustomerServiceUploadService.java`
- Create: `CustomerServiceFileStorageClient.java`
- Create: `CustomerServiceUploadServiceImpl.java`
- Create: `RestCustomerServiceFileStorageClient.java`
- Test: `CustomerServiceUploadServiceImplTest.java`

- [ ] **Step 1: 写上传安全红灯测试**

覆盖 JPG、PNG、WebP、GIF 魔数；扩展名、声明 MIME、真实 MIME 三者一致；最大 10 MB；随机文件名；存储返回 URL 必须是配置的 HTTPS 域；HTML/SVG/双扩展名/超限/伪造 MIME 均拒绝；失败不创建消息。

- [ ] **Step 2: 实现存储适配边界**

定义内部 `CustomerServiceFileStorageClient`，实现类使用现有 `RestTemplate` 以 multipart 调用 `cloud-file-upload/NoCrossOriginUpload/newwebfileupload.action`。Controller 不暴露存储接口细节，只返回 URL、宽高、字节数和 MIME。使用 Apache Tika 与图片头解析二次校验，不信任客户端文件名。

- [ ] **Step 3: 运行测试并提交**

```powershell
mvn -pl cloud-api -am "-Dtest=CustomerServiceUploadServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
git add cloud-api/src/main/java/com/zzy/cloud/api/customer cloud-api/src/test/java/com/zzy/cloud/api/customer/service/CustomerServiceUploadServiceImplTest.java
git commit -m "客服：新增安全图片上传接口"
```

## Task 9: 实现 WebSocket、心跳、在线状态和跨实例广播

**Files:**

- Modify: `cloud-api/pom.xml`
- Create: `CustomerServiceProtocol.java`
- Create: `CustomerServiceWebSocketConfig.java`
- Create: `CustomerServiceRedisConfig.java`
- Create: `CustomerServiceHandshakeInterceptor.java`
- Create: `CustomerServiceSessionRegistry.java`
- Create: `RedisCustomerServiceEventPublisher.java`
- Create: `CustomerServicePresenceService.java`
- Create: `CustomerServicePresenceServiceImpl.java`
- Create: `CustomerServiceWebSocketHandler.java`
- Test: `CustomerServiceWebSocketHandlerTest.java`

- [ ] **Step 1: 加入 WebSocket 依赖并写协议红灯测试**

在 `pom.xml` 增加 `spring-boot-starter-websocket`。测试一次性票据握手、`message.send`、`message.read`、`ping/pong`、未知事件、错误信封、无权限会话、重复广播去重和提交后 `ack`。

服务端事件必须限定为：`connection.ready`、`conversation.snapshot`、`message.ack`、`message.created`、`read.updated`、`conversation.assigned`、`conversation.transferred`、`conversation.closed`、`presence.updated`、`pong`、`error`。

- [ ] **Step 2: 实现握手和本机连接注册**

握手拦截器原子消费票据，将 `CustomerServicePrincipal` 放入 WebSocket attributes。Session registry 按 `connectionId`、身份和会话索引连接；Handler 只解析与路由协议，不直接访问 Mapper。

- [ ] **Step 3: 实现 Redis 在线状态和广播**

心跳每 25 秒，60 秒失活；在线 key 随心跳续期。跨实例使用 `cs:pubsub:events`，事件包含唯一 `eventId` 和目标身份；本实例收到自己发布的事件时按 `eventId` 去重。Redis 广播失败不能回滚已提交 Oracle 消息。

- [ ] **Step 4: 运行测试并提交**

```powershell
mvn -pl cloud-api -am "-Dtest=CustomerServiceWebSocketHandlerTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
git add cloud-api/pom.xml cloud-api/src/main/java/com/zzy/cloud/api/customer cloud-api/src/test/java/com/zzy/cloud/api/customer/websocket/CustomerServiceWebSocketHandlerTest.java
git commit -m "客服：实现WebSocket实时通信"
```

## Task 10: 暴露 REST 接口、配置功能开关并完成后端回归

**Files:**

- Create: `CustomerServiceRequests.java`
- Create: `CustomerServiceResponses.java`
- Create: `CustomerServiceController.java`
- Complete: `CustomerServiceProperties.java`
- Modify: `cloud-api/src/main/resources/application.yml`
- Test: `CustomerServiceControllerTest.java`

- [ ] **Step 1: 写 Controller 红灯测试**

逐个验证设计中的 12 个 POST 路径、`CommonResult` 包装、Bearer token、字符串 ID、负数 ID、缺失/过期令牌、跨客户访问、转出客服写入、0 ID 和非法 JSON。上传接口使用 multipart，其余使用 JSON。

- [ ] **Step 2: 实现严格 DTO 和统一错误映射**

入口固定为 `/CustomerServiceController`，WebSocket 固定为 `/customer-service/ws`。Controller 只做 DTO 校验、principal 解析和服务调用；所有业务异常映射成稳定错误码，不返回堆栈。响应中的 Oracle ID 必须经过 `SignedIdCodec.format`。

- [ ] **Step 3: 增加环境配置**

`application.yml` 增加带环境变量覆盖的 `customer-service` 节点：功能开关、TTL、心跳、限流、受信任上传域、H5 接待 URL、允许 WebSocket Origin；同时增加 `classpath:mapper/customer/*.xml`，确保新 Mapper XML 被现有 MyBatis 配置加载。生产默认关闭，开发联调通过 `CUSTOMER_SERVICE_ENABLED=true` 启用。

- [ ] **Step 4: 运行后端模块回归**

```powershell
mvn -pl cloud-api -am "-Dsurefire.failIfNoSpecifiedTests=false" test
mvn -pl cloud-api -am -DskipTests package
```

Expected: all customer-service tests PASS；`cloud-api` package succeeds。

- [ ] **Step 5: 提交 REST 与配置**

```powershell
git add cloud-api/src/main/java/com/zzy/cloud/api/customer cloud-api/src/main/resources/application.yml cloud-api/src/test/java/com/zzy/cloud/api/customer/controller/CustomerServiceControllerTest.java
git commit -m "客服：完成接口编排与运行配置"
```

## Task 11: 封装 H5 API、协议状态和自动重连

**Files:**

- Modify: `vip_store/package.json`
- Create: `src/api/customerService.ts`
- Create: `src/page/customer-service/model/customerServiceTypes.ts`
- Create: `src/page/customer-service/model/customerServiceState.ts`
- Create: `src/page/customer-service/model/customerServiceScroll.ts`
- Create: `src/page/customer-service/model/customerServiceRole.ts`
- Create: `src/page/customer-service/composables/useCustomerServiceIdentity.ts`
- Create: `src/page/customer-service/composables/useCustomerServiceSocket.ts`
- Create: `src/page/customer-service/composables/useMessageTimeline.ts`
- Test: four files under `src/page/customer-service/__tests__`

- [ ] **Step 1: 写 H5 纯逻辑红灯测试和测试脚本**

在 `package.json` 新增 `test:customer-service`，用 `esno` 顺序执行四个测试。测试 ID 字符串、负数、事件 reducer、同 ID 去重、发送中/已送达/失败、重连退避 `1/2/5/10/30` 秒、接近底部判断、滚动位置保持和 `roleId` 兼容字符串/数字 19。

Run from `E:/ZZY_PROJECT/lianshang_liaoning/vip_store`:

```powershell
npm run test:customer-service
```

Expected: FAIL because customer-service modules do not exist.

- [ ] **Step 2: 实现独立 Axios 客户端**

复用 `VITE_CLOUD_URL`/`VITE_CLOUD_URL_N` 选择规则，但使用客服专属 Axios instance。除认证外统一写 `Authorization: Bearer <token>`；令牌仅保存在内存，页面刷新后用 `GLOBAL_OPEN_ID()` 重新认证。CommonResult 失败转为结构化 `CustomerServiceApiError`。

- [ ] **Step 3: 实现浏览器 WebSocket composable**

每次连接前请求新 ticket；连接 URL 将 HTTP/HTTPS base 转为 WS/WSS。25 秒 ping、60 秒超时，退避上限 30 秒。重连成功后以 `lastServerMessageId` 调历史接口补拉；组件卸载时取消计时器、关闭连接并阻止继续重连。

- [ ] **Step 4: 运行逻辑测试并提交**

```powershell
npm run test:customer-service
git add package.json src/api/customerService.ts src/page/customer-service/model src/page/customer-service/composables src/page/customer-service/__tests__
git commit -m "客服：封装H5协议与实时连接"
```

## Task 12: 开发 H5 客户聊天页

**Files:**

- Create: `CustomerServiceMessageList.vue`
- Create: `CustomerServiceComposer.vue`
- Create: `CustomerChatPage.vue`
- Create: `customer-service.scss`

- [ ] **Step 1: 为页面行为补充红灯契约**

在现有 H5 测试中增加源级和纯状态断言：页面打开调用客户认证与 `conversation/open`；恢复会话不清空历史；文本消息使用 UUID；上传成功后才发送图片消息；结束后输入区只读；滚动上拉加载历史；查看旧消息时新消息只显示“有新消息”按钮。

- [ ] **Step 2: 实现客户页结构和独立滚动**

页面使用固定高度容器：顶部客服状态，中部唯一可滚动消息区，底部安全区输入。字体 `Microsoft YaHei, PingFang SC, sans-serif`，白底、品牌蓝、15px 圆角和轻阴影。文本用插值渲染，禁止 `v-html`。

- [ ] **Step 3: 实现图片压缩和失败重试**

JPG/PNG/WebP 大图使用 `compressorjs` 压缩，GIF 原样上传；本地只保留短期预览 URL。上传或发送失败显示重试，且重试复用同一 `clientMessageId`。

- [ ] **Step 4: 运行测试、类型检查和构建**

```powershell
npm run test:customer-service
npm run vue-tsc
npm run vite-build
```

Expected: tests PASS；typecheck/build succeed。

- [ ] **Step 5: 提交客户页**

```powershell
git add src/page/customer-service
git commit -m "客服：开发H5客户聊天页面"
```

## Task 13: 开发 H5 客服移动接待页与角色门禁

**Files:**

- Create: `CustomerServiceConversationList.vue`
- Create: `CustomerServiceCustomerSummary.vue`
- Create: `StaffReceptionPage.vue`
- Create: `src/router/modules/customer_service.ts`
- Modify: `src/router/routes.ts`
- Test: `customerServiceRoleGuard.test.ts`

- [ ] **Step 1: 写路由和列表红灯测试**

断言存在直接客户路由 `/customer-service/chat` 与客服路由 `/customer-service/reception`；客户路由无入口按钮依赖；客服守卫动态调用 `store.dispatch('getScysUserData')`；只有 `String(roleId)==='19'` 进入，其他情况显示无权限页；`conversationId=-8` 能定位会话。

- [ ] **Step 2: 实现路由模块**

`customer_service.ts` 同时声明两条子路由。客服 `beforeEnter` 使用动态 import 获取现有 Store，避免循环依赖；前端门禁只控制页面，所有数据仍依赖后端 staff token。

- [ ] **Step 3: 实现移动两级接待界面**

列表分类为派生的“待接待”“进行中”“已结束”，支持客户/企业搜索、未读数和最后消息。详情支持文本、图片、已读、候选客服、离线警告、指定转接、结束和客户企业摘要。模板链接携带的会话 ID 只负责选中，不授予权限。

- [ ] **Step 4: 运行 H5 全量验证**

```powershell
npm run test:customer-service
npm run vue-tsc
npm run vite-build
```

- [ ] **Step 5: 提交 H5 客服页与路由**

```powershell
git add src/router/routes.ts src/router/modules/customer_service.ts src/page/customer-service package.json
git commit -m "客服：开发H5移动接待工作台"
```

## Task 14: 建立 Electron 主进程客服网关和严格 IPC

**Files:**

- Create: `common/customerService/contracts.ts`
- Create: `common/customerService/constants.ts`
- Create: `common/customerService/schemas.ts`
- Create: `process/services/customerService/customerServiceApiClient.ts`
- Create: `process/services/customerService/customerServiceSocketClient.ts`
- Create: `process/services/customerService/customerServiceGateway.ts`
- Create: `process/services/enterprise/enterpriseSessionEvents.ts`
- Create: `process/bridge/customerServiceBridge.ts`
- Modify: `process/bridge/index.ts`
- Modify: `process/bridge/enterpriseBridge.ts`
- Modify: `preload/main.ts`
- Modify: `common/types/platform/electron.ts`
- Create: `renderer/services/customerService/customerServiceClient.ts`
- Test: four Node tests under `AionUi/tests/unit/customerService`

- [ ] **Step 1: 写 schema、API、socket、bridge 红灯测试**

覆盖所有 ID 为字符串、拒绝 0/小数/额外危险键、CommonResult 解析、开发地址固定 `http://127.0.0.1:12580/`、生产地址固定 `https://cloud.lslnii.com/`、Bearer header、请求超时、WS ticket 不复用、心跳重连、事件只允许安全 plain clone、非可信 sender 被拒绝。

Run from `E:/ZZY_PROJECT/AI_lianliao/AionUi`:

```powershell
npx vitest run tests/unit/customerService/customerServiceSchemas.test.ts tests/unit/customerService/customerServiceApiClient.test.ts tests/unit/customerService/customerServiceSocketClient.test.ts tests/unit/customerService/customerServiceBridge.test.ts
```

Expected: FAIL because customer-service Electron modules do not exist.

- [ ] **Step 2: 实现主进程 REST 与 WebSocket 客户端**

Gateway 每次认证从现有 `EnterpriseSessionStore(app.getPath('userData'))` 读取 `openId`，不向 renderer 暴露。staff/auth 成功后访问令牌只驻留主进程内存；401/令牌到期时重新认证一次。`ws` 连接每次先取 ticket，使用与 H5 相同协议和重连策略。`enterpriseBridge` 仅在企业会话成功清除后通过 `enterpriseSessionEvents` 发出事件，Gateway 收到后立即断开 WebSocket、清空访问令牌和未读状态，防止退出登录后连接继续存活。

- [ ] **Step 3: 实现固定 IPC 面**

IPC 命令固定为：`connect`、`disconnect`、`listConversations`、`getConversation`、`getHistory`、`sendMessage`、`markRead`、`uploadImage`、`listCandidates`、`transferConversation`、`closeConversation`。主进程向 renderer 只发送验证后的 `CustomerServiceEvent`；preload 为每个参数和结果运行 Zod schema，并提供 unsubscribe。

- [ ] **Step 4: 注册 bridge 并运行测试**

```powershell
npx vitest run tests/unit/customerService/customerServiceSchemas.test.ts tests/unit/customerService/customerServiceApiClient.test.ts tests/unit/customerService/customerServiceSocketClient.test.ts tests/unit/customerService/customerServiceBridge.test.ts
```

- [ ] **Step 5: 提交主进程网关**

```powershell
git add packages/desktop/src/common/customerService packages/desktop/src/process/services/customerService packages/desktop/src/process/services/enterprise/enterpriseSessionEvents.ts packages/desktop/src/process/bridge packages/desktop/src/preload/main.ts packages/desktop/src/common/types/platform/electron.ts packages/desktop/src/renderer/services/customerService tests/unit/customerService
git commit -m "客服：实现桌面端安全通信网关"
```

## Task 15: 开发 Electron 三栏客服工作台

**Files:**

- Create: all files under `renderer/pages/enterprise/customerService`
- Modify: `renderer/components/layout/Router.tsx`
- Modify: `renderer/pages/enterprise/layout/EnterpriseSider.tsx`
- Modify: `renderer/pages/enterprise/layout/EnterpriseShell.tsx`
- Modify: `renderer/services/i18n/locales/zh-CN/enterprise.json`
- Modify: `renderer/services/i18n/locales/en-US/enterprise.json`
- Modify: `renderer/services/i18n/i18n-keys.d.ts`
- Modify: `tsconfig.enterprise-tests.json`
- Test: `customerServiceReducer.test.ts`
- Test: `customerServiceWorkbench.dom.test.tsx`

- [ ] **Step 1: 写 reducer 和 DOM 红灯测试**

覆盖：三类队列、搜索、字符串负数 ID、消息去重排序、发送状态、未读累计、转接后只读、结束后禁用输入、深链选中、左右栏和消息区独立滚动、旧消息位置保持、新消息按钮、客服路由隐藏 AI 侧栏后获得完整宽度、窗口窄时右栏可收起但聊天仍可用。

Run:

```powershell
npx vitest run tests/unit/customerService/customerServiceReducer.test.ts tests/integration/enterprise/customerServiceWorkbench.dom.test.tsx
```

Expected: FAIL because workbench components do not exist.

- [ ] **Step 2: 实现纯 reducer 与工作台 hook**

所有 socket/API 事件先进入纯 reducer；hook 管理初次加载、选中会话、草稿、分页、重连和命令状态。UI 组件不直接访问 `window.electronAPI`，只依赖 `customerServiceClient`。

- [ ] **Step 3: 实现三栏界面和企业工作台路由**

新增 `/enterprise/customer-service`；左栏会话队列，中栏消息和输入，右栏客户/企业资料。复用 `enterprise-theme.css` 的字体、颜色、15px 圆角和阴影变量。三个区域使用 `min-height: 0` 与自己的 `overflow: auto`，不能拉长 `EnterpriseShell`。进入客服路由时 `EnterpriseShell` 自动收起 AI 助手并切换为零外边距、内部滚动的全宽工作区；离开后仍保留现有助手切换能力。

- [ ] **Step 4: 增加侧栏入口和双语兜底文案**

在业务协同分组增加“真人客服”入口和图标，只有当前企业上下文 `String(user.roleId)==='19'` 时显示；直接访问路由仍必须通过后端 staff/auth。只新增 `zh-CN` 与 `en-US` 键，其他语言通过现有 `mergeWithFallback` 获得英文兜底。运行 i18n 类型生成。

```powershell
npm run i18n:types
```

- [ ] **Step 5: 运行 UI 测试和桌面构建**

```powershell
npx vitest run tests/unit/customerService/customerServiceReducer.test.ts tests/integration/enterprise/customerServiceWorkbench.dom.test.tsx
npm run typecheck:enterprise-tests
npm run package
```

- [ ] **Step 6: 提交工作台**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/customerService packages/desktop/src/renderer/components/layout/Router.tsx packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseSider.tsx packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx packages/desktop/src/renderer/services/i18n tsconfig.enterprise-tests.json tests/unit/customerService/customerServiceReducer.test.ts tests/integration/enterprise/customerServiceWorkbench.dom.test.tsx
git commit -m "客服：开发桌面三栏接待工作台"
```

## Task 16: 接入桌面通知、托盘未读和点击定位

**Files:**

- Modify: `common/platform/IPlatformServices.ts`
- Modify: `common/platform/ElectronPlatformServices.ts`
- Modify: `common/platform/NodePlatformServices.ts`
- Modify: `common/platform/index.ts`
- Modify: `process/bridge/notificationBridge.ts`
- Modify: `preload/main.ts`
- Modify: `process/utils/tray.ts`
- Complete: `process/services/customerService/customerServiceGateway.ts`
- Modify: `renderer/pages/enterprise/layout/EnterpriseShell.tsx`
- Test: `tests/unit/customerService/customerServiceNotification.test.ts`

- [ ] **Step 1: 写通知红灯测试**

覆盖：只有客户新消息且窗口不聚焦或最小化时通知；同一服务端消息 ID 只通知一次；点击通知恢复、显示并聚焦主窗口，然后发送 `/enterprise/customer-service?conversationId=<id>` 导航事件；托盘未读为所有当前客服未读总数；选中并已读后回落；普通 AI 会话通知不受影响。

- [ ] **Step 2: 给平台通知增加可选点击回调**

`INotificationService.send` 增加可选 `onClick`，Electron 实现监听原生 Notification 的 `click`；Node 实现保持 no-op。`showNotification` 保留既有 `conversation_id` 行为，并新增客服会话目标字段，避免破坏现有 AI 通知。点击客服通知时 preload 派发固定 DOM 事件，`EnterpriseShell.tsx` 在全局工作台层监听后导航到 `/enterprise/customer-service?conversationId=<id>`，因此用户当前不在客服页时也能准确定位。

- [ ] **Step 3: 扩展托盘未读能力**

`tray.ts` 新增 `setCustomerServiceUnreadCount(count)`，Windows/Linux 更新 tooltip 与菜单只读项，macOS 同时使用 `tray.setTitle`。计数更新只刷新现有 tray，不重复创建实例。

- [ ] **Step 4: 运行通知和现有相关回归**

```powershell
npx vitest run tests/unit/customerService/customerServiceNotification.test.ts tests/unit --testNamePattern="notification|tray"
npm run package
```

- [ ] **Step 5: 提交通知集成**

```powershell
git add packages/desktop/src/common/platform packages/desktop/src/process/bridge/notificationBridge.ts packages/desktop/src/preload/main.ts packages/desktop/src/process/utils/tray.ts packages/desktop/src/process/services/customerService packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx tests/unit/customerService/customerServiceNotification.test.ts
git commit -m "客服：接入桌面提醒与托盘未读"
```

## Task 17: 联调、部署说明、数据库批准检查点与最终验收

**Files:**

- Create: `cloud-api/src/main/resources/deploy/customer-service-nginx.conf`
- Update: 三端客服模块测试和必要注释
- Read only until approved: `cloud-api/src/main/resources/db/customer_service.sql`

- [ ] **Step 1: 编写 Nginx 配置示例**

示例必须代理 `/cloud-api/customer-service/ws`，设置 `proxy_http_version 1.1`、`Upgrade`、`Connection`、读写超时，并保留 REST `/cloud-api/CustomerServiceController/` 路由。生产仅使用 WSS；WebSocket access log 使用不含 query string 的 `$uri`，避免 60 秒票据进入 Nginx 日志。

- [ ] **Step 2: 在执行数据库脚本前停止并请求确认**

向用户展示脚本路径、四张表、四个序列、索引和约束摘要，明确目标数据库环境。只有用户明确同意后，才由用户指定的数据库工具和连接执行；没有批准时继续做静态测试，但不进行数据库集成测试。

- [ ] **Step 3: 数据库获批后执行冒烟验证**

验证：同一客户只存在一个未结束会话；负数客户/客服/企业 ID 可保存；重复 `clientMessageId` 被唯一约束阻止；推送幂等键唯一；乐观锁并发转接只成功一次。所有验证使用测试数据并记录回滚/清理语句，清理范围只包含本次测试 ID。

- [ ] **Step 4: 启动本地后端并完成三端路径联调**

后端设置 `CUSTOMER_SERVICE_ENABLED=true`，Electron 开发版继续请求 `http://127.0.0.1:12580/`。联调顺序：客户认证与开会话、初次分配与一次微信任务、H5 客服回复、Electron 同客服同步、图片、已读、断线补拉、转接、双方关闭、超时关闭。

- [ ] **Step 5: 运行三个仓库最终验证**

Backend:

```powershell
cd E:/ZZY_PROJECT/lianshang_liaoning/cloud-service
mvn -pl cloud-api -am "-Dsurefire.failIfNoSpecifiedTests=false" test
mvn -pl cloud-api -am -DskipTests package
```

H5:

```powershell
cd E:/ZZY_PROJECT/lianshang_liaoning/vip_store
npm run test:customer-service
npm run vue-tsc
npm run vite-build
```

Electron:

```powershell
cd E:/ZZY_PROJECT/AI_lianliao/AionUi
npx vitest run tests/unit/customerService tests/integration/enterprise/customerServiceWorkbench.dom.test.tsx
npm run typecheck:enterprise-tests
npm run package
```

Expected: 所有命令成功；无客服页面整体高度溢出；重连无重复消息；普通消息不触发微信；通知点击定位正确。

- [ ] **Step 6: 检查改动边界和敏感信息**

```powershell
git -C E:/ZZY_PROJECT/lianshang_liaoning diff --check
git -C E:/ZZY_PROJECT/lianshang_liaoning/vip_store diff --check
git -C E:/ZZY_PROJECT/AI_lianliao diff --check
rg -n "accessToken|wsTicket|openId|messageText" E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/customer E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/process/services/customerService
```

逐条审阅日志调用，确认只输出固定错误码、摘要 ID 和脱敏信息；确认三个仓库的 `git status` 中用户原有改动仍然存在且未进入客服提交。

- [ ] **Step 7: 提交部署示例与最终修整**

```powershell
git -C E:/ZZY_PROJECT/lianshang_liaoning add cloud-service/cloud-api/src/main/resources/deploy/customer-service-nginx.conf
git -C E:/ZZY_PROJECT/lianshang_liaoning commit -m "客服：补充WebSocket部署配置"
```

若最终修整涉及其他仓库，分别只暂存客服相关文件并使用中文提交；不得用 `git add .`。

## 完成定义

- 后端双条件权限、会话状态机、消息幂等、推送 outbox、图片安全和 WebSocket 均有自动化测试。
- H5 客户路由和 H5 客服路由可直接访问，未在其他 H5 页面增加入口按钮。
- H5 前端 `roleId=19` 只负责界面门禁；后端仍验证 `ROLE_ID=19 AND POST='客服'`。
- Electron 访问令牌和 WebSocket 留在主进程，渲染进程不能读取 `openId` 或 token。
- 三端 ID 均为字符串并接受负数非零值。
- 新分配和转接分别只生成一次模板 5 微信任务，普通消息不推微信。
- 会话和消息区域独立滚动，翻历史时不会被新消息强制拉到底部。
- 数据库脚本未获得明确批准前没有被执行。
- 三个仓库最终测试、类型检查/构建和 `git diff --check` 全部通过。
