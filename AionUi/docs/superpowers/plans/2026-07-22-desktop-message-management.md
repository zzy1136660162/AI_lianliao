# 桌面消息管理与全员推送 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有“桌面通知审计”升级为支持草稿、立即全员推送、定时推送、撤销、失败重试和逐账号投递查询的后台“桌面消息中心”。

**Architecture:** 新增 `J_CY_DESKTOP_MSG_TASK` 管理人工消息生命周期，正式发布时复用现有 `DesktopNotificationService` 生成不可变通知快照和 N 条接收人记录。后台 JSP 直接请求 Cloud API；Cloud API 负责状态机、幂等、定时抢占与审计分页；Electron 只扩展系统公告详情和客户端结果上报，不引入第二套通知链路。

**Tech Stack:** Oracle 11g、Java 8、Spring Boot 2.6.1、MyBatis、JUnit 5、Mockito、Vue 2、Element UI 2、Axios、Node.js 静态验证、TypeScript、React 19、Ant Design、Zod、Electron、Vitest、Testing Library。

---

## 执行约束

- 设计规格：`AionUi/docs/superpowers/specs/2026-07-22-desktop-message-management-design.md`。
- 用户要求直接在 `master` 开发，不创建功能分支。
- 三个工作区均存在用户未提交改动。每次提交只能 `git add` 当前任务列出的文件，禁止批量暂存、还原、删除或格式化无关文件。
- 后台管理接口按用户确认不使用 Token、签名或后台代理；不能擅自加入认证。
- 数据库修改必须先产出评审脚本并通过静态契约测试。只有用户再次明确确认目标库和执行时机后才能执行 DDL。
- `E:/ZZY_PROJECT/AI_lianliao/tools` 中的 Oracle 工具保持只读，不得加入更新、DDL 或提交事务能力。
- 所有业务 ID 在 JavaScript 中保持非零有符号十进制字符串，接受负数和 19 位 ID。
- 每个行为严格走 RED → GREEN → REFACTOR；没有看到预期失败前不能写生产实现。

命令工作目录固定如下：Maven 命令从 `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service` 运行；后台 Node 命令从 `E:/ZZY_PROJECT/lianshang_liaoning/SjBang_BackStageV1.0` 运行；Electron 命令从 `E:/ZZY_PROJECT/AI_lianliao/AionUi` 运行；Git 提交前先用 `git rev-parse --show-toplevel` 确认仓库根目录，并只暂存当前任务文件。

## 固定契约

```java
public enum Type {
    VERSION_UPDATE, SUPPLY_DEMAND_MATCH, PROJECT_OPPORTUNITY,
    ENTERPRISE_CODE_REVIEW, MEMBERSHIP_POINTS, CUSTOMER_SERVICE,
    SYSTEM_ANNOUNCEMENT
}

public enum Action {
    OPEN_SUPPLY_DEMAND, OPEN_PROJECT, OPEN_COMPANY, OPEN_PRODUCT,
    OPEN_MEMBERSHIP, OPEN_CUSTOMER_SERVICE, OPEN_VERSION_UPDATE,
    OPEN_NOTIFICATION_DETAIL
}

public enum DeliveryStatus { PENDING, DELIVERED, FAILED, CANCELLED }
public enum ContentType { TEXT, RICH_TEXT, IMAGE_TEXT }
public enum TaskStatus {
    DRAFT, SCHEDULED, PUBLISHING, PUBLISHED,
    CANCELLED, FAILED, REVOKED, EXPIRED
}
```

第一版管理端只允许 `ContentType.TEXT`。Electron schema 可以识别未来内容类型名称，但只能渲染 `TEXT`；其他类型必须上报 `UNSUPPORTED_CONTENT`，不能用 HTML 降级渲染。

## 文件结构

| 路径 | 职责 |
| --- | --- |
| `cloud-api/src/main/resources/db/desktop_notification.sql` | 新装环境完整结构契约。 |
| `cloud-api/src/main/resources/db/desktop_message_management_migration.sql` | 已有环境增量迁移，执行前必须再次确认。 |
| `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/**` | 人工消息任务模型、状态机、发布协调和调度器。 |
| `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/**` | 现有通知快照、接收状态、回执和实时事件扩展。 |
| `cloud-api/src/main/resources/mapper/desktopnotification/*.xml` | Oracle 任务、通知审计和接收人分页 SQL。 |
| `cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopMessageAdminController.java` | 人工消息管理 Ajax API。 |
| `cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopNotificationAdminController.java` | 推送记录和投递审计 API。 |
| `SjBang_BackStageV1.0/WebRoot/backstage/desktop_notification/**` | Element UI 消息中心页面、样式和 Vue 逻辑。 |
| `AionUi/packages/desktop/src/common/enterprise/desktop-notification/**` | 系统公告、内容类型、失败上报和点击详情协议。 |
| `AionUi/packages/desktop/src/process/services/enterprise/desktop-notification/**` | 主进程 API、Gateway 和状态上报。 |
| `AionUi/packages/desktop/src/renderer/pages/enterprise/notifications/**` | 纯文本通知详情与通知中心交互。 |
| `AI_lianliao/tools/verify_desktop_message_schema.py` | 固定查询的只读 Oracle 结构验证。 |

### Task 1: 用失败的 Oracle 契约测试锁定任务表与增量迁移

**Files:**
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/resources/db/desktop_notification.sql`
- Create: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/resources/db/desktop_message_management_migration.sql`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/db/DesktopNotificationSchemaContractTest.java`

- [ ] **Step 1: 写任务表和扩展约束的失败测试**

在 `DesktopNotificationSchemaContractTest` 增加独立读取增量脚本的方法和以下测试：

```java
@Test
void schemaAddsMessageTasksAndExtensibleAnnouncementContract() {
    assertContains("CREATE TABLE J_CY_DESKTOP_MSG_TASK");
    assertContains("CONTENT_TYPE");
    assertContains("EXTENSION_JSON");
    assertContains("SYSTEM_ANNOUNCEMENT");
    assertContains("OPEN_NOTIFICATION_DETAIL");
    assertContains("DELIVERY_STATUS IN ('PENDING', 'DELIVERED', 'FAILED', 'CANCELLED')");
}

@Test
void migrationIsReviewableAndNeverDropsBusinessData() throws Exception {
    String migration = readResource("/db/desktop_message_management_migration.sql");
    assertTrue(migration.contains("-- EXECUTE ONLY AFTER EXPLICIT DATABASE APPROVAL"));
    assertTrue(migration.contains("CREATE TABLE J_CY_DESKTOP_MSG_TASK"));
    assertFalse(migration.contains("DROP TABLE"));
    assertFalse(migration.contains("DELETE FROM"));
    assertFalse(migration.contains("TRUNCATE"));
}
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
mvn -pl cloud-api '-Dtest=DesktopNotificationSchemaContractTest' test
```

Expected: FAIL，缺少 `J_CY_DESKTOP_MSG_TASK` 或增量迁移资源。

- [ ] **Step 3: 写最小完整 DDL**

把以下任务表结构同时纳入完整结构脚本和增量迁移脚本；增量脚本另外使用 `ALTER TABLE` 增加通知扩展字段并重建三个检查约束：

```sql
-- EXECUTE ONLY AFTER EXPLICIT DATABASE APPROVAL.
CREATE TABLE J_CY_DESKTOP_MSG_TASK (
    ID               NUMBER(19, 0)       NOT NULL,
    TITLE            VARCHAR2(300 CHAR)  NOT NULL,
    CONTENT          VARCHAR2(2000 CHAR) NOT NULL,
    CONTENT_TYPE     VARCHAR2(24 CHAR)   DEFAULT 'TEXT' NOT NULL,
    EXTENSION_JSON   CLOB,
    PRIORITY         VARCHAR2(16 CHAR)   DEFAULT 'NORMAL' NOT NULL,
    STATUS           VARCHAR2(16 CHAR)   DEFAULT 'DRAFT' NOT NULL,
    SCHEDULED_AT     TIMESTAMP(6),
    EXPIRES_AT       TIMESTAMP(6),
    PUBLISHED_AT     TIMESTAMP(6),
    REVOKED_AT       TIMESTAMP(6),
    NOTIFICATION_ID  NUMBER(19, 0),
    CREATED_BY       VARCHAR2(128 CHAR),
    UPDATED_BY       VARCHAR2(128 CHAR),
    FAILURE_REASON   VARCHAR2(1000 CHAR),
    RETRY_COUNT      NUMBER(10, 0) DEFAULT 0 NOT NULL,
    NEXT_RETRY_AT    TIMESTAMP(6),
    VERSION_NO       NUMBER(10, 0) DEFAULT 0 NOT NULL,
    CREATE_TIME      TIMESTAMP(6) DEFAULT SYSTIMESTAMP NOT NULL,
    UPDATE_TIME      TIMESTAMP(6) DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_J_CY_DESKTOP_MSG_TASK PRIMARY KEY (ID),
    CONSTRAINT FK_J_CY_DMT_NOTIFICATION FOREIGN KEY (NOTIFICATION_ID)
        REFERENCES J_CY_DESKTOP_NOTIFICATION (ID),
    CONSTRAINT CK_J_CY_DMT_CONTENT CHECK (CONTENT_TYPE IN ('TEXT', 'RICH_TEXT', 'IMAGE_TEXT')),
    CONSTRAINT CK_J_CY_DMT_PRIORITY CHECK (PRIORITY IN ('NORMAL', 'HIGH', 'URGENT')),
    CONSTRAINT CK_J_CY_DMT_STATUS CHECK (
        STATUS IN ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED',
                   'CANCELLED', 'FAILED', 'REVOKED', 'EXPIRED')
    ),
    CONSTRAINT CK_J_CY_DMT_RETRY CHECK (RETRY_COUNT >= 0),
    CONSTRAINT CK_J_CY_DMT_VERSION CHECK (VERSION_NO >= 0)
);

CREATE SEQUENCE SEQ_J_CY_DESKTOP_MSG_TASK START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE INDEX IDX_J_CY_DMT_SCHEDULE ON J_CY_DESKTOP_MSG_TASK (STATUS, SCHEDULED_AT, NEXT_RETRY_AT);
CREATE INDEX IDX_J_CY_DMT_CREATED ON J_CY_DESKTOP_MSG_TASK (CREATE_TIME);
CREATE INDEX IDX_J_CY_DMT_NOTIFICATION ON J_CY_DESKTOP_MSG_TASK (NOTIFICATION_ID);
```

通知表增加 `CONTENT_TYPE VARCHAR2(24 CHAR) DEFAULT 'TEXT' NOT NULL` 和 `EXTENSION_JSON CLOB`。新的类型、动作和接收状态约束必须与“固定契约”完全一致。约束和对象名全部保持 30 个 ASCII 字节以内。

- [ ] **Step 4: 运行 Schema 测试并确认 GREEN**

Run: `mvn -pl cloud-api '-Dtest=DesktopNotificationSchemaContractTest' test`

Expected: PASS，且 Oracle 标识符长度测试无失败。

- [ ] **Step 5: 提交本任务**

```powershell
git add -- cloud-api/src/main/resources/db/desktop_notification.sql cloud-api/src/main/resources/db/desktop_message_management_migration.sql cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/db/DesktopNotificationSchemaContractTest.java
git commit -m "数据库：定义桌面消息任务结构"
```

### Task 2: 扩展通知快照、取消状态和客户端结果上报

**Files:**
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/domain/DesktopNotificationEnums.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/domain/DesktopNotificationCommand.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/model/DesktopNotification.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/service/DesktopNotificationService.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/service/impl/DesktopNotificationServiceImpl.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/mapper/desktopnotification/DesktopNotificationMapper.java`
- Modify: `cloud-api/src/main/resources/mapper/desktopnotification/DesktopNotificationMapper.xml`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopNotificationController.java`
- Modify: `cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/service/DesktopNotificationServiceImplTest.java`
- Modify: `cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/controller/DesktopNotificationControllerTest.java`
- Modify: `cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/mapper/DesktopNotificationMapperContractTest.java`
- Create: `cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/service/DesktopNotificationAdminServiceImplTest.java`

- [ ] **Step 1: 写取消过滤、桌面提醒回执和失败上报的测试**

```java
@Test
void failedDeliveryIsScopedToTheCurrentOpenIdAndUsesControlledReason() {
    when(mapper.markFailed(new BigDecimal("101"), "open-a", "不支持的消息格式"))
            .thenReturn(1);

    assertTrue(service.reportDeliveryFailure("101", "open-a", "UNSUPPORTED_CONTENT"));

    verify(mapper).markFailed(new BigDecimal("101"), "open-a", "不支持的消息格式");
    verify(mapper, never()).markFailed(any(), eq("open-b"), any());
}

@Test
void desktopNotifiedEndpointUsesTheAuthenticatedRequestOpenId() throws Exception {
    when(service.isActiveRecipient("open-a")).thenReturn(true);
    mockMvc.perform(post("/DesktopNotificationController/desktopNotified")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"openId\":\"open-a\",\"notificationId\":\"101\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    verify(service).markDesktopNotified("101", "open-a");
}
```

Mapper 契约测试再断言用户列表和未读统计排除 `CANCELLED`。

- [ ] **Step 2: 运行相关测试并确认 RED**

Run:

```powershell
mvn -pl cloud-api '-Dtest=DesktopNotificationServiceImplTest,DesktopNotificationControllerTest,DesktopNotificationMapperContractTest' test
```

Expected: FAIL，缺少新枚举、`reportDeliveryFailure` 或新 Controller 端点。

- [ ] **Step 3: 实现固定服务端契约**

在枚举中增加：

```java
public enum ContentType { TEXT, RICH_TEXT, IMAGE_TEXT }
public enum DeliveryFailureCode { UNSUPPORTED_CONTENT, INVALID_CONTENT, DETAIL_RENDER_FAILED }
```

`DesktopNotification`、`DesktopNotificationCommand` 增加 `contentType` 和 `extensionJson`；`toNotification` 默认 `ContentType.TEXT`。

`DesktopNotificationController.toItem` 同步返回 `contentType` 和 `extensionJson`；历史数据依靠数据库默认值返回 `TEXT`，不能让 Electron 猜测内容类型。

服务接口增加：

```java
boolean reportDeliveryFailure(String notificationId, String openId, String failureCode);
```

服务实现只允许固定原因映射：

```java
private static String failureReason(String code) {
    DeliveryFailureCode parsed = DeliveryFailureCode.valueOf(code);
    switch (parsed) {
        case UNSUPPORTED_CONTENT: return "不支持的消息格式";
        case INVALID_CONTENT: return "消息内容格式无效";
        case DETAIL_RENDER_FAILED: return "消息详情展示失败";
        default: throw new IllegalArgumentException("unsupported failure code");
    }
}
```

Mapper 增加：

```java
int markFailed(@Param("notificationId") BigDecimal notificationId,
               @Param("openId") String openId,
               @Param("failedReason") String failedReason);
```

```xml
<update id="markFailed">
  UPDATE J_CY_DESKTOP_NTF_RECIPIENT
  SET DELIVERY_STATUS = 'FAILED',
      LAST_ATTEMPT_AT = SYSTIMESTAMP,
      ATTEMPT_COUNT = ATTEMPT_COUNT + 1,
      FAILED_REASON = #{failedReason}
  WHERE NOTIFICATION_ID = #{notificationId}
    AND RECIPIENT_OPEN_ID = #{openId}
    AND DELIVERY_STATUS = 'PENDING'
</update>
```

`selectRecipientPage` 和 `countUnread` 增加 `DELIVERY_STATUS != 'CANCELLED'`。Controller 增加 `desktopNotified` 和 `deliveryFailed` 两个 POST 接口，并复用现有 `activeOpenId`，不能信任其他账号身份。

- [ ] **Step 4: 运行相关测试并确认 GREEN**

Run: `mvn -pl cloud-api '-Dtest=DesktopNotificationServiceImplTest,DesktopNotificationControllerTest,DesktopNotificationMapperContractTest' test`

Expected: PASS。

- [ ] **Step 5: 提交本任务**

```powershell
git add -- cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopNotificationController.java cloud-api/src/main/java/com/zzy/cloud/api/mapper/desktopnotification cloud-api/src/main/resources/mapper/desktopnotification cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification
git commit -m "通知：扩展系统公告与投递结果"
```

### Task 3: 建立人工消息任务模型和 Oracle Mapper

**Files:**
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/domain/DesktopMessageTaskEnums.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/domain/DesktopMessageTaskCommand.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/model/DesktopMessageTask.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/model/DesktopMessageTaskPageQuery.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/mapper/desktopnotification/DesktopMessageTaskMapper.java`
- Create: `cloud-api/src/main/resources/mapper/desktopnotification/DesktopMessageTaskMapper.xml`
- Create: `cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/mapper/DesktopMessageTaskMapperContractTest.java`

- [ ] **Step 1: 写任务 Mapper 的失败契约测试**

```java
@Test
void mapperUsesOptimisticStateTransitionsAndOracleRowNumberPaging() throws Exception {
    String mapper = load("mapper/desktopnotification/DesktopMessageTaskMapper.xml").toUpperCase();
    assertTrue(mapper.contains("ROW_NUMBER() OVER (ORDER BY T.ID DESC)"));
    assertTrue(mapper.contains("VERSION_NO = VERSION_NO + 1"));
    assertTrue(mapper.contains("STATUS = 'PUBLISHING'"));
    assertTrue(mapper.contains("STATUS IN ('DRAFT', 'SCHEDULED', 'FAILED')"));
    assertTrue(mapper.contains("SEQ_J_CY_DESKTOP_MSG_TASK"));
}
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `mvn -pl cloud-api '-Dtest=DesktopMessageTaskMapperContractTest' test`

Expected: FAIL，Mapper 资源不存在。

- [ ] **Step 3: 写模型和 Mapper 接口**

`DesktopMessageTaskCommand` 使用 Lombok `@Data`，字段固定为：

```java
private String title;
private String content;
private Priority priority;
private Date scheduledAt;
private Date expiresAt;
private String operatorName;
```

`DesktopMessageTask` 对应设计规格全部字段；ID 为 `BigDecimal`，时间为 `Date`，状态和内容类型为枚举。

Mapper 接口至少定义：

```java
int insertTask(DesktopMessageTask task);
DesktopMessageTask selectById(@Param("id") BigDecimal id);
List<DesktopMessageTask> selectPage(DesktopMessageTaskPageQuery query);
long countPage(DesktopMessageTaskPageQuery query);
int updateDraft(@Param("task") DesktopMessageTask task, @Param("expectedVersion") int expectedVersion);
int markScheduled(@Param("task") DesktopMessageTask task, @Param("expectedVersion") int expectedVersion);
int claimForPublishing(@Param("id") BigDecimal id, @Param("expectedVersion") int expectedVersion,
                       @Param("claimedAt") Date claimedAt);
int markPublished(@Param("id") BigDecimal id, @Param("notificationId") BigDecimal notificationId,
                  @Param("publishedAt") Date publishedAt);
int markCancelled(@Param("id") BigDecimal id, @Param("expectedVersion") int expectedVersion,
                  @Param("operatorName") String operatorName);
int markRevoked(@Param("id") BigDecimal id, @Param("expectedVersion") int expectedVersion,
                @Param("revokedAt") Date revokedAt, @Param("operatorName") String operatorName);
int markExpiredPublishedTasks(@Param("now") Date now);
List<BigDecimal> selectDueIds(@Param("now") Date now, @Param("limit") int limit);
List<BigDecimal> selectStalePublishingIds(@Param("cutoff") Date cutoff, @Param("limit") int limit);
long countActiveRecipients();
```

分页 SQL 使用双层 `ROW_NUMBER()`，计算 `startRow=(pageNum-1)*pageSize+1`、`endRow=pageNum*pageSize`。所有可选筛选使用绑定参数，禁止 `${}` 拼接。

- [ ] **Step 4: 运行 Mapper 契约测试并确认 GREEN**

Run: `mvn -pl cloud-api '-Dtest=DesktopMessageTaskMapperContractTest' test`

Expected: PASS。

- [ ] **Step 5: 提交本任务**

```powershell
git add -- cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message cloud-api/src/main/java/com/zzy/cloud/api/mapper/desktopnotification/DesktopMessageTaskMapper.java cloud-api/src/main/resources/mapper/desktopnotification/DesktopMessageTaskMapper.xml cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/mapper/DesktopMessageTaskMapperContractTest.java
git commit -m "消息：建立人工消息任务模型"
```

### Task 4: 用状态机实现草稿、定时和取消

**Files:**
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/service/DesktopMessageTaskService.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/service/impl/DesktopMessageTaskServiceImpl.java`
- Create: `cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/message/DesktopMessageTaskServiceImplTest.java`

- [ ] **Step 1: 写草稿、定时和乐观锁失败测试**

```java
@Test
void scheduleRequiresFutureTimeAndPreservesAValidExpiry() {
    Date scheduledAt = Date.from(clock.instant().plusSeconds(3600));
    Date expiresAt = Date.from(clock.instant().plusSeconds(7200));
    when(mapper.markScheduled(any(), eq(3))).thenReturn(1);

    DesktopMessageTask saved = service.schedule("41", 3,
            command("系统维护", "今晚维护", scheduledAt, expiresAt));

    assertEquals(TaskStatus.SCHEDULED, saved.getStatus());
    verify(mapper).markScheduled(any(), eq(3));
}

@Test
void staleVersionCannotOverwriteAChangedTask() {
    when(mapper.updateDraft(any(), eq(2))).thenReturn(0);
    assertThrows(DesktopMessageStateException.class,
            () -> service.saveDraft("41", 2, command("标题", "正文", null, null)));
}
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `mvn -pl cloud-api '-Dtest=DesktopMessageTaskServiceImplTest' test`

Expected: FAIL，服务和状态异常尚不存在。

- [ ] **Step 3: 实现最小任务服务**

服务接口固定为：

```java
DesktopMessageTask saveDraft(String messageId, Integer versionNo, DesktopMessageTaskCommand command);
DesktopMessageTask schedule(String messageId, int versionNo, DesktopMessageTaskCommand command);
DesktopMessageTask detail(String messageId);
List<DesktopMessageTask> page(DesktopMessageTaskPageQuery query);
long count(DesktopMessageTaskPageQuery query);
boolean cancel(String messageId, int versionNo, String operatorName);
long recipientCount();
```

校验函数必须完整覆盖：标题去空后 1–100、正文 1–2000、操作人 0–128、仅 `TEXT`、定时时间晚于 `Clock.instant()`、有效期晚于计划时间或当前时间。新草稿通过 `SqlSequenceService.getSeqNextValByName("SEQ_J_CY_DESKTOP_MSG_TASK")` 生成 ID。更新只允许 `DRAFT` 或 `SCHEDULED`，取消只允许 `DRAFT` 或 `SCHEDULED`。

```java
private static void ensureOneRow(int changed) {
    if (changed != 1) {
        throw new DesktopMessageStateException("消息状态已更新，请刷新后重试");
    }
}
```

- [ ] **Step 4: 运行服务测试并确认 GREEN**

Run: `mvn -pl cloud-api '-Dtest=DesktopMessageTaskServiceImplTest' test`

Expected: PASS。

- [ ] **Step 5: 提交本任务**

```powershell
git add -- cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/service cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/message/DesktopMessageTaskServiceImplTest.java
git commit -m "消息：实现草稿与定时状态机"
```

### Task 5: 实现幂等发布、撤销和通知事务

**Files:**
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/service/DesktopMessagePublishService.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/service/impl/DesktopMessagePublishServiceImpl.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/mapper/desktopnotification/DesktopNotificationMapper.java`
- Modify: `cloud-api/src/main/resources/mapper/desktopnotification/DesktopNotificationMapper.xml`
- Create: `cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/message/DesktopMessagePublishServiceImplTest.java`

- [ ] **Step 1: 写发布、禁用开关和撤销测试**

```java
@Test
void publishCreatesOneBroadcastFactAndLinksItToTheTask() {
    when(properties.isEnabled()).thenReturn(true);
    when(mapper.claimForPublishing(new BigDecimal("41"), 3, now)).thenReturn(1);
    when(mapper.selectById(new BigDecimal("41"))).thenReturn(publishingTask());
    DesktopNotification notification = notification("91");
    when(notificationService.publish(any())).thenReturn(notification);
    when(mapper.markPublished(new BigDecimal("41"), new BigDecimal("91"), now)).thenReturn(1);

    DesktopMessageTask result = service.publishNow("41", 3, "管理员");

    ArgumentCaptor<DesktopNotificationCommand> command = ArgumentCaptor.forClass(DesktopNotificationCommand.class);
    verify(notificationService).publish(command.capture());
    assertEquals(Type.SYSTEM_ANNOUNCEMENT, command.getValue().getType());
    assertEquals(Action.OPEN_NOTIFICATION_DETAIL, command.getValue().getAction());
    assertEquals("MANUAL_MESSAGE:41", command.getValue().getDedupKey());
    assertNull(command.getValue().getRecipientOpenIds());
    assertEquals(TaskStatus.PUBLISHED, result.getStatus());
}

@Test
void revokeCancelsOnlyUndeliveredOrFailedRecipientsWithoutAVisibleOutcome() {
    when(mapper.markRevoked(any(), eq(4), any(), eq("管理员"))).thenReturn(1);
    service.revoke("41", 4, "管理员");
    verify(notificationMapper).cancelUndeliveredRecipients(new BigDecimal("91"));
}
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `mvn -pl cloud-api '-Dtest=DesktopMessagePublishServiceImplTest' test`

Expected: FAIL，发布服务或取消接收人 Mapper 不存在。

- [ ] **Step 3: 实现同事务发布和撤销**

接口固定为：

```java
DesktopMessageTask publishNow(String messageId, int versionNo, String operatorName);
DesktopMessageTask publishScheduled(String messageId, int versionNo);
boolean revoke(String messageId, int versionNo, String operatorName);
```

`publishNow` 和 `publishScheduled` 使用 `@Transactional`，先检查 `DesktopNotificationProperties.isEnabled()`，再原子抢占任务。构造命令：

```java
DesktopNotificationCommand command = DesktopNotificationCommand.builder()
        .type(Type.SYSTEM_ANNOUNCEMENT)
        .priority(task.getPriority())
        .title(task.getTitle())
        .content(task.getContent())
        .contentType(ContentType.TEXT)
        .action(Action.OPEN_NOTIFICATION_DETAIL)
        .businessId(task.getId().toPlainString())
        .dedupKey("MANUAL_MESSAGE:" + task.getId().toPlainString())
        .sourceType("J_CY_DESKTOP_MSG_TASK")
        .sourceId(task.getId().toPlainString())
        .expiresAt(task.getExpiresAt())
        .build();
```

必须直接调用会抛错的 `DesktopNotificationService.publish`，不能使用会吞掉异常的可选业务领域 Publisher。通知插入、接收人快照和任务 `PUBLISHED` 更新加入同一 Spring 事务。

撤销 Mapper SQL 固定为：

```xml
<update id="cancelUndeliveredRecipients">
  UPDATE J_CY_DESKTOP_NTF_RECIPIENT
  SET DELIVERY_STATUS = 'CANCELLED', FAILED_REASON = NULL
  WHERE NOTIFICATION_ID = #{notificationId}
    AND DELIVERY_STATUS IN ('PENDING', 'FAILED')
    AND DESKTOP_NOTIFIED_AT IS NULL
    AND READ_AT IS NULL
</update>
```

- [ ] **Step 4: 运行发布测试并确认 GREEN**

Run: `mvn -pl cloud-api '-Dtest=DesktopMessagePublishServiceImplTest,DesktopNotificationServiceImplTest' test`

Expected: PASS。

- [ ] **Step 5: 提交本任务**

```powershell
git add -- cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/service cloud-api/src/main/java/com/zzy/cloud/api/mapper/desktopnotification/DesktopNotificationMapper.java cloud-api/src/main/resources/mapper/desktopnotification/DesktopNotificationMapper.xml cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/message/DesktopMessagePublishServiceImplTest.java
git commit -m "消息：实现幂等发布与撤销"
```

### Task 6: 实现定时抢占、自动重试和停滞恢复

**Files:**
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/service/DesktopMessageRetryPolicy.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/service/DesktopMessageFailureRecorder.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/service/impl/DesktopMessageFailureRecorderImpl.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/config/DesktopMessageTimeConfig.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message/scheduler/DesktopMessageScheduler.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/config/DesktopNotificationProperties.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/mapper/desktopnotification/DesktopMessageTaskMapper.java`
- Modify: `cloud-api/src/main/resources/mapper/desktopnotification/DesktopMessageTaskMapper.xml`
- Modify: `cloud-api/src/main/resources/application.yml`
- Create: `cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/message/DesktopMessageSchedulerTest.java`

- [ ] **Step 1: 写退避、单实例抢占和停滞恢复测试**

```java
@Test
void retryPolicyUsesOneFiveFifteenMinutesAndStopsAfterThreeFailures() {
    assertEquals(Duration.ofMinutes(1), policy.delayAfterFailure(1).get());
    assertEquals(Duration.ofMinutes(5), policy.delayAfterFailure(2).get());
    assertEquals(Duration.ofMinutes(15), policy.delayAfterFailure(3).get());
    assertFalse(policy.delayAfterFailure(4).isPresent());
}

@Test
void schedulerPublishesOnlyIdsClaimedByTheTransactionalService() {
    when(mapper.selectDueIds(now, 50)).thenReturn(Arrays.asList(new BigDecimal("41")));
    when(mapper.selectById(new BigDecimal("41"))).thenReturn(scheduledTask(7));
    scheduler.publishDueMessages();
    verify(publishService).publishScheduled("41", 7);
}

@Test
void schedulerMarksPublishedTasksExpiredBeforeScanningDueWork() {
    scheduler.publishDueMessages();
    verify(mapper).markExpiredPublishedTasks(now);
}
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `mvn -pl cloud-api '-Dtest=DesktopMessageSchedulerTest' test`

Expected: FAIL，重试策略和调度器不存在。

- [ ] **Step 3: 实现调度与独立失败记录事务**

配置加入：

```yaml
desktop-notification:
  message-scheduler-delay-ms: ${DESKTOP_NOTIFICATION_MESSAGE_SCHEDULER_DELAY_MS:30000}
  message-scheduler-batch-size: ${DESKTOP_NOTIFICATION_MESSAGE_SCHEDULER_BATCH_SIZE:50}
  message-publishing-timeout: ${DESKTOP_NOTIFICATION_MESSAGE_PUBLISHING_TIMEOUT:PT10M}
```

时间 Bean 固定上海时区并允许测试替换：

```java
@Configuration
public class DesktopMessageTimeConfig {
    @Bean
    public Clock desktopMessageClock() {
        return Clock.system(ZoneId.of("Asia/Shanghai"));
    }
}
```

调度方法：

```java
@Scheduled(fixedDelayString = "${desktop-notification.message-scheduler-delay-ms:30000}")
public void publishDueMessages() {
    Date now = Date.from(clock.instant());
    mapper.markExpiredPublishedTasks(now);
    for (BigDecimal id : mapper.selectDueIds(now, properties.getMessageSchedulerBatchSize())) {
        DesktopMessageTask task = mapper.selectById(id);
        try {
            publishService.publishScheduled(id.toPlainString(), task.getVersionNo());
        } catch (RuntimeException error) {
            failureRecorder.record(task, safeReason(error), now);
        }
    }
}
```

`DesktopMessageFailureRecorderImpl.record` 使用 `@Transactional(propagation = Propagation.REQUIRES_NEW)`：初次失败后安排 1 分钟重试，第一次重试失败后安排 5 分钟，第二次重试失败后安排 15 分钟；第三次自动重试仍失败才进入 `FAILED`。`recoverStalePublishing` 先按 10 分钟截止时间找任务：如果去重通知已存在就关联并标记 `PUBLISHED`，否则恢复为待重试。安全错误摘要最长 1000 字符，不能包含 SQL、连接串或堆栈。

- [ ] **Step 4: 运行调度测试并确认 GREEN**

Run: `mvn -pl cloud-api '-Dtest=DesktopMessageSchedulerTest,DesktopMessagePublishServiceImplTest' test`

Expected: PASS。

- [ ] **Step 5: 提交本任务**

```powershell
git add -- cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/message cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/config/DesktopNotificationProperties.java cloud-api/src/main/java/com/zzy/cloud/api/mapper/desktopnotification/DesktopMessageTaskMapper.java cloud-api/src/main/resources/mapper/desktopnotification/DesktopMessageTaskMapper.xml cloud-api/src/main/resources/application.yml cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/message/DesktopMessageSchedulerTest.java
git commit -m "消息：实现定时调度与失败恢复"
```

### Task 7: 提供无需 Token 的人工消息管理接口

**Files:**
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopMessageAdminController.java`
- Create: `cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/controller/DesktopMessageAdminControllerTest.java`

- [ ] **Step 1: 写直接 Ajax 和状态错误测试**

```java
@Test
void publishAllowsDirectBrowserAjaxWithoutToken() throws Exception {
    when(publishService.publishNow("41", 3, "张子扬")).thenReturn(publishedTask());
    mockMvc.perform(post("/DesktopMessageAdminController/publishNow")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"messageId\":\"41\",\"versionNo\":3,\"operatorName\":\"张子扬\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
}

@Test
void staleStateReturnsRefreshableChineseMessage() throws Exception {
    when(publishService.publishNow(any(), anyInt(), any()))
            .thenThrow(new DesktopMessageStateException("消息状态已更新，请刷新后重试"));
    mockMvc.perform(post("/DesktopMessageAdminController/publishNow")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"messageId\":\"41\",\"versionNo\":2}"))
            .andExpect(jsonPath("$.message").value("消息状态已更新，请刷新后重试"));
}
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `mvn -pl cloud-api '-Dtest=DesktopMessageAdminControllerTest' test`

Expected: FAIL，Controller 不存在。

- [ ] **Step 3: 实现九个固定 POST 端点**

Controller 路径固定为 `DesktopMessageAdminController`，实现 `page`、`detail`、`saveDraft`、`schedule`、`publishNow`、`cancel`、`revoke`、`retry`、`recipientCount`。请求继续使用项目现有 FastJSON `JSONObject`，但解析集中在私有方法中。

响应约定：

```json
{
  "success": true,
  "code": 2000,
  "message": "操作成功",
  "data": {
    "items": [],
    "total": 0,
    "pageNum": 1,
    "pageSize": 20
  }
}
```

页数范围 1 以上，页大小只允许 20、50、100。服务端固定 `CONTENT_TYPE=TEXT`，忽略并拒绝浏览器传入的 `dedupKey`、`sourceType`、`recipientOpenIds`、`extensionJson`。接口不读取 `X-Lianliao-Backstage-Token`，测试必须证明缺少该请求头仍成功。

- [ ] **Step 4: 运行 Controller 测试并确认 GREEN**

Run: `mvn -pl cloud-api '-Dtest=DesktopMessageAdminControllerTest' test`

Expected: PASS。

- [ ] **Step 5: 提交本任务**

```powershell
git add -- cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopMessageAdminController.java cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/controller/DesktopMessageAdminControllerTest.java
git commit -m "接口：增加桌面消息管理端点"
```

### Task 8: 把通知审计升级为汇总、标准分页和失败重试

**Files:**
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/model/DesktopNotificationAuditRow.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/model/DesktopNotificationAuditSummary.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/model/DesktopNotificationRecipientAuditRow.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/model/DesktopNotificationAdminQuery.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/service/DesktopNotificationAdminService.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/service/impl/DesktopNotificationAdminServiceImpl.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/mapper/desktopnotification/DesktopNotificationMapper.java`
- Modify: `cloud-api/src/main/resources/mapper/desktopnotification/DesktopNotificationMapper.xml`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopNotificationAdminController.java`
- Modify: `cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/controller/DesktopNotificationControllerTest.java`
- Modify: `cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification/mapper/DesktopNotificationMapperContractTest.java`

- [ ] **Step 1: 写分页、统计和失败重试测试**

```java
@Test
void adminListSupportsPageFiltersAndReturnsDeliveryMetrics() throws Exception {
    mockMvc.perform(post("/DesktopNotificationAdminController/list")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"pageNum\":1,\"pageSize\":20,\"sourceCategory\":\"MANUAL\",\"title\":\"升级\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.pageNum").value(1))
            .andExpect(jsonPath("$.data.pageSize").value(20));
}

@Test
void retryFailedRecipientsReusesTheSameNotification() throws Exception {
    when(mapper.resetFailedRecipients(new BigDecimal("91"))).thenReturn(2);
    int changed = adminService.retryFailedRecipients("91");
    assertEquals(2, changed);
    verify(eventPublisher).publishAfterCommit(new BigDecimal("91"));
    verify(mapper, never()).insertNotification(any());
}

@Test
void adminControllerReturnsTheRetryCountFromTheService() throws Exception {
    when(adminService.retryFailedRecipients("91")).thenReturn(2);
    mockMvc.perform(post("/DesktopNotificationAdminController/retryFailedRecipients")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"notificationId\":\"91\"}"))
            .andExpect(jsonPath("$.data.changedCount").value(2));
}
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `mvn -pl cloud-api '-Dtest=DesktopNotificationControllerTest,DesktopNotificationMapperContractTest' test`

Expected: FAIL，缺少页码响应、汇总、接收明细分页或重试接口。

- [ ] **Step 3: 实现聚合查询和兼容接口**

通知列表模型增加：人工/业务来源、任务状态、内容类型、过期时间、取消数、桌面提醒数和统计比例所需原始计数。SQL 用一次接收人聚合子查询：

```sql
LEFT JOIN (
  SELECT NOTIFICATION_ID,
         COUNT(1) AS TOTAL_RECIPIENTS,
         SUM(CASE WHEN DELIVERY_STATUS = 'DELIVERED' THEN 1 ELSE 0 END) AS DELIVERED_COUNT,
         SUM(CASE WHEN DESKTOP_NOTIFIED_AT IS NOT NULL THEN 1 ELSE 0 END) AS DESKTOP_NOTIFIED_COUNT,
         SUM(CASE WHEN READ_AT IS NOT NULL THEN 1 ELSE 0 END) AS READ_COUNT,
         SUM(CASE WHEN DELIVERY_STATUS = 'FAILED' THEN 1 ELSE 0 END) AS FAILED_COUNT,
         SUM(CASE WHEN DELIVERY_STATUS = 'CANCELLED' THEN 1 ELSE 0 END) AS CANCELLED_COUNT
  FROM J_CY_DESKTOP_NTF_RECIPIENT
  GROUP BY NOTIFICATION_ID
) S ON S.NOTIFICATION_ID = N.ID
```

接收明细分页按 OpenID 左连接 `LS_PUBLIC_USER` 获取 `USER_NAME`，企业关系使用左连接；任何身份关联缺失都必须保留接收行。OpenID 搜索绑定参数，不能拼接 SQL。保留旧 `recipientList` 兼容，但新 JSP 只调用 `recipientPage`。

Controller 不再直接编排写操作。`DesktopNotificationAdminService` 负责汇总、分页和 `retryFailedRecipients`；后者必须先确认关联人工任务不是 `REVOKED/EXPIRED`，事务内把 `FAILED` 改回 `PENDING`，并通过 `TransactionSynchronizationManager` 在提交后复用相同通知 ID 发布事件。Controller 只解析 JSON、调用服务并转换安全响应。

- [ ] **Step 4: 运行审计测试并确认 GREEN**

Run: `mvn -pl cloud-api '-Dtest=DesktopNotificationControllerTest,DesktopNotificationMapperContractTest' test`

Expected: PASS。

- [ ] **Step 5: 提交本任务**

```powershell
git add -- cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/model cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/service/DesktopNotificationAdminService.java cloud-api/src/main/java/com/zzy/cloud/api/desktopnotification/service/impl/DesktopNotificationAdminServiceImpl.java cloud-api/src/main/java/com/zzy/cloud/api/mapper/desktopnotification/DesktopNotificationMapper.java cloud-api/src/main/resources/mapper/desktopnotification/DesktopNotificationMapper.xml cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopNotificationAdminController.java cloud-api/src/test/java/com/zzy/cloud/api/desktopnotification
git commit -m "审计：升级推送统计与投递分页"
```

### Task 9: 先封装后台直接 Cloud API 请求并锁定静态契约

**Files:**
- Create: `E:/ZZY_PROJECT/lianshang_liaoning/SjBang_BackStageV1.0/WebRoot/backstage/desktop_notification/js/desktop_notification_api.js`
- Create: `E:/ZZY_PROJECT/lianshang_liaoning/SjBang_BackStageV1.0/WebRoot/backstage/desktop_notification/css/desktop_notification_center.css`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/SjBang_BackStageV1.0/scripts/verify-desktop-notification-cloud-api.js`

- [ ] **Step 1: 扩展静态验证脚本并确认失败**

验证脚本读取 API JS，断言以下完整 endpoint 均存在且不存在 `/backstage/desktopNotification/`：

```javascript
const requiredEndpoints = [
  'DesktopMessageAdminController/page',
  'DesktopMessageAdminController/saveDraft',
  'DesktopMessageAdminController/schedule',
  'DesktopMessageAdminController/publishNow',
  'DesktopMessageAdminController/cancel',
  'DesktopMessageAdminController/revoke',
  'DesktopMessageAdminController/retry',
  'DesktopMessageAdminController/recipientCount',
  'DesktopNotificationAdminController/summary',
  'DesktopNotificationAdminController/list',
  'DesktopNotificationAdminController/recipientPage',
  'DesktopNotificationAdminController/retryFailedRecipients',
];
```

Run: `node scripts/verify-desktop-notification-cloud-api.js`

Expected: FAIL，API JS 或新 endpoint 尚不存在。

- [ ] **Step 2: 写统一 API 包装器**

```javascript
(function (global) {
  function post(controller, action, payload) {
    return axios
      .post(CLOUD_URL + 'cloud-api/' + controller + '/' + action, payload || {})
      .then(function (response) {
        var body = response.data || {};
        if (!body.success) throw new Error(body.message || '请求失败');
        return body.data || {};
      });
  }

  global.DesktopMessageApi = Object.freeze({
    messagePage: function (payload) { return post('DesktopMessageAdminController', 'page', payload); },
    messageDetail: function (payload) { return post('DesktopMessageAdminController', 'detail', payload); },
    saveDraft: function (payload) { return post('DesktopMessageAdminController', 'saveDraft', payload); },
    schedule: function (payload) { return post('DesktopMessageAdminController', 'schedule', payload); },
    publishNow: function (payload) { return post('DesktopMessageAdminController', 'publishNow', payload); },
    cancel: function (payload) { return post('DesktopMessageAdminController', 'cancel', payload); },
    revoke: function (payload) { return post('DesktopMessageAdminController', 'revoke', payload); },
    retry: function (payload) { return post('DesktopMessageAdminController', 'retry', payload); },
    recipientCount: function () { return post('DesktopMessageAdminController', 'recipientCount', {}); },
    notificationSummary: function (payload) { return post('DesktopNotificationAdminController', 'summary', payload); },
    notificationPage: function (payload) { return post('DesktopNotificationAdminController', 'list', payload); },
    recipientPage: function (payload) { return post('DesktopNotificationAdminController', 'recipientPage', payload); },
    retryFailedRecipients: function (payload) { return post('DesktopNotificationAdminController', 'retryFailedRecipients', payload); }
  });
})(window);
```

CSS 定义 `message-center-shell`、`metric-grid`、`message-toolbar`、`message-status-tag`、`delivery-drawer` 和 15px 圆角/轻阴影变量；不得把业务逻辑写入 CSS 或 JSP 内联样式。

- [ ] **Step 3: 运行 JS 语法和静态 endpoint 验证**

```powershell
node --check WebRoot/backstage/desktop_notification/js/desktop_notification_api.js
node scripts/verify-desktop-notification-cloud-api.js
```

Expected: PASS。

- [ ] **Step 4: 提交本任务**

```powershell
git add -- SjBang_BackStageV1.0/WebRoot/backstage/desktop_notification/js/desktop_notification_api.js SjBang_BackStageV1.0/WebRoot/backstage/desktop_notification/css/desktop_notification_center.css SjBang_BackStageV1.0/scripts/verify-desktop-notification-cloud-api.js
git commit -m "后台：封装桌面消息云接口"
```

### Task 10: 开发消息中心 JSP、发布表单和投递抽屉

**Files:**
- Modify: `SjBang_BackStageV1.0/WebRoot/backstage/desktop_notification/desktop_notification_list.jsp`
- Modify: `SjBang_BackStageV1.0/WebRoot/backstage/desktop_notification/desktop_notification_detail.jsp`
- Create: `SjBang_BackStageV1.0/WebRoot/backstage/desktop_notification/js/desktop_notification_center.js`
- Modify: `SjBang_BackStageV1.0/scripts/verify-desktop-notification-cloud-api.js`

- [ ] **Step 1: 给静态脚本增加页面状态和分页失败断言**

```javascript
for (const marker of [
  '桌面消息中心', '消息管理', '推送记录', '投递明细', '发布消息',
  '<el-pagination', 'scrollToTableHead', 'publishNow', 'retryFailedRecipients'
]) {
  if (!combinedSource.includes(marker)) throw new Error(`Missing message-center marker: ${marker}`);
}
```

Run: `node scripts/verify-desktop-notification-cloud-api.js`

Expected: FAIL，旧 JSP 仍是“桌面通知审计”和加载更多。

- [ ] **Step 2: 写 JSP 页面壳**

JSP 只保留后台公共 header/menu/footer、Element UI、Vue、Axios、Day.js、CSS 和两个 JS。通过安全 HTML 属性传入操作人显示名：

```jsp
<div id="desktop-message-center">
  <!-- 概览、三个 el-tab-pane、发布 dialog 和投递 drawer -->
</div>
```

操作人显示名不拼入脚本或 HTML 属性。Vue 初始化时只读取公共 header 已经展示的文本：

```javascript
function readOperatorName() {
  var node = document.querySelector('.welcome-message');
  return node ? String(node.textContent || '').trim().slice(0, 128) : '';
}
```

- [ ] **Step 3: 写 Vue 状态和操作矩阵**

`desktop_notification_center.js` 必须定义：

```javascript
function allowedActions(status) {
  return {
    edit: status === 'DRAFT' || status === 'SCHEDULED',
    publish: status === 'DRAFT' || status === 'SCHEDULED' || status === 'FAILED',
    cancel: status === 'DRAFT' || status === 'SCHEDULED',
    revoke: status === 'PUBLISHED',
    copy: status === 'PUBLISHED' || status === 'REVOKED' || status === 'EXPIRED',
    retry: status === 'FAILED'
  };
}
```

页面实现：

- 四张统计卡片。
- 消息任务筛选和 20/50/100 标准分页。
- 人工与业务通知统一列表、统计比例和筛选。
- 接收明细抽屉、用户名/企业/OpenID 搜索和标准分页。
- 标题 100、正文 2000 字计数，优先级、有效期、立即/定时/草稿。
- 发布前调用 `recipientCount`，显示“预计接收 N 人”二次确认。
- 异步按钮独立 Loading，失败保留表单，状态冲突刷新当前页。
- `scrollToTableHead(refName)` 在页码或页大小变化后 `$nextTick` 执行。

旧 `desktop_notification_detail.jsp` 读取 `notificationId` 后重定向：

```javascript
window.location.replace(
  '/backstage/desktop_notification/desktop_notification_list.jsp?notificationId=' +
  encodeURIComponent(notificationId)
);
```

- [ ] **Step 4: 运行静态验证并确认 GREEN**

```powershell
node --check WebRoot/backstage/desktop_notification/js/desktop_notification_center.js
node scripts/verify-desktop-notification-cloud-api.js
```

Expected: PASS。

- [ ] **Step 5: 在本地后台做浏览器验证**

启动现有 Tomcat `127.0.0.1:8189` 和本地 Cloud API `127.0.0.1:12580`，打开：

`http://127.0.0.1:8189/backstage/desktop_notification/desktop_notification_list.jsp`

验证三个标签、发布 dialog、Loading、分页滚动、旧详情跳转和 Network 中所有接口均以 `CLOUD_URL + cloud-api` 请求。数据库迁移未获确认时只验证静态页面和失败提示，不能尝试写入消息任务。

- [ ] **Step 6: 提交本任务**

```powershell
git add -- SjBang_BackStageV1.0/WebRoot/backstage/desktop_notification SjBang_BackStageV1.0/scripts/verify-desktop-notification-cloud-api.js
git commit -m "后台：开发桌面消息中心"
```

### Task 11: 扩展 Electron 系统公告、内容类型和状态 API

**Files:**
- Modify: `AionUi/packages/desktop/src/common/enterprise/desktop-notification/contracts.ts`
- Modify: `AionUi/packages/desktop/src/common/enterprise/desktop-notification/schemas.ts`
- Modify: `AionUi/packages/desktop/src/common/enterprise/desktop-notification/constants.ts`
- Modify: `AionUi/packages/desktop/src/process/services/enterprise/desktop-notification/desktopNotificationApiClient.ts`
- Modify: `AionUi/tests/unit/enterprise/desktopNotificationClient.test.ts`
- Modify: `AionUi/tests/unit/process/services/desktop-notification/desktopNotificationGateway.test.ts`

- [ ] **Step 1: 写系统公告解析和主进程状态接口失败测试**

```ts
it('accepts a text system announcement and keeps its notification id as a string', () => {
  const parsed = desktopNotificationInboxItemSchema.parse({
    recipientId: '201', notificationId: '-101', type: 'SYSTEM_ANNOUNCEMENT',
    priority: 'NORMAL', title: '系统维护', content: '今晚维护\n请提前保存。',
    contentType: 'TEXT', extensionJson: null,
    action: 'OPEN_NOTIFICATION_DETAIL', businessId: '41',
    createTime: 1_700_000_000_000, readAt: null, deliveryStatus: 'PENDING'
  });
  expect(parsed.notificationId).toBe('-101');
});

it('posts reminder and controlled failure outcomes with the persisted openId', async () => {
  await client.markDesktopNotified('persisted-open-id', '101');
  await client.reportDeliveryFailure('persisted-open-id', '101', 'UNSUPPORTED_CONTENT');
  expect(transport).toHaveBeenCalledWith(expect.stringContaining('/desktopNotified'), expect.anything());
  expect(transport).toHaveBeenCalledWith(expect.stringContaining('/deliveryFailed'), expect.anything());
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/desktopNotificationClient.test.ts tests/unit/process/services/desktop-notification/desktopNotificationGateway.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL，缺少新类型或 API 方法。

- [ ] **Step 3: 实现共享协议和主进程 API 方法**

共享类型增加：

```ts
export type DesktopNotificationContentType = 'TEXT' | 'RICH_TEXT' | 'IMAGE_TEXT';
export type DesktopNotificationFailureCode =
  | 'UNSUPPORTED_CONTENT'
  | 'INVALID_CONTENT'
  | 'DETAIL_RENDER_FAILED';
```

`DesktopNotificationInboxItem` 增加 `contentType` 和 `extensionJson`。类型、动作和接收状态联合类型加入固定契约值。Zod schema 保持 `.strict()`，`extensionJson` 第一版只允许 `string().max(20_000).nullable()`，不能解析为可执行 HTML。

API Client 增加：

```ts
markDesktopNotified(openId: string, notificationId: string): Promise<DesktopNotificationChangedResult> {
  return this.postJson('desktopNotified', { openId: parseOpenId(openId), notificationId }, desktopNotificationChangedResultSchema);
}

reportDeliveryFailure(openId: string, notificationId: string, failureCode: DesktopNotificationFailureCode) {
  return this.postJson('deliveryFailed',
    { openId: parseOpenId(openId), notificationId, failureCode },
    desktopNotificationChangedResultSchema);
}
```

这些方法只在主进程 Gateway 使用，不新增 Renderer IPC 命令。

- [ ] **Step 4: 运行协议与 API 测试并确认 GREEN**

Run: `npx --no-install vitest run tests/unit/enterprise/desktopNotificationClient.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: PASS。

- [ ] **Step 5: 提交本任务**

```powershell
git add -- AionUi/packages/desktop/src/common/enterprise/desktop-notification AionUi/packages/desktop/src/process/services/enterprise/desktop-notification/desktopNotificationApiClient.ts AionUi/tests/unit/enterprise/desktopNotificationClient.test.ts
git commit -m "Electron：扩展系统公告协议"
```

### Task 12: 在 Gateway 和通知中心实现纯文本详情与受控点击

**Files:**
- Modify: `AionUi/packages/desktop/src/process/services/enterprise/desktop-notification/desktopNotificationGateway.ts`
- Modify: `AionUi/packages/desktop/src/process/bridge/notificationBridge.ts`
- Modify: `AionUi/packages/desktop/src/process/utils/tray.ts`
- Modify: `AionUi/packages/desktop/src/common/enterprise/desktop-notification/schemas.ts`
- Modify: `AionUi/packages/desktop/src/renderer/pages/enterprise/notifications/DesktopNotificationCenterPage.tsx`
- Modify: `AionUi/packages/desktop/src/renderer/pages/enterprise/notifications/desktop-notification-center.module.css`
- Modify: `AionUi/packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`
- Modify: `AionUi/packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`
- Modify: `AionUi/tests/unit/process/services/desktop-notification/desktopNotificationGateway.test.ts`
- Modify: `AionUi/tests/unit/enterprise/DesktopNotificationCenterPage.dom.test.tsx`
- Modify: `AionUi/tests/unit/process/services/desktop-notification/desktopNotificationBridge.test.ts`

- [ ] **Step 1: 写未知内容失败、提醒回执和详情测试**

```ts
it('reports unsupported content without acknowledging or emitting it', async () => {
  emit(notificationCreated({ ...notification, type: 'SYSTEM_ANNOUNCEMENT', contentType: 'RICH_TEXT' }));
  await vi.waitFor(() =>
    expect(apiClient.reportDeliveryFailure).toHaveBeenCalledWith('persisted-open-id', '101', 'UNSUPPORTED_CONTENT'));
  expect(apiClient.acknowledgeDelivery).not.toHaveBeenCalled();
  expect(observed).toHaveLength(0);
});

it('opens a text announcement in the local detail view and preserves line breaks', async () => {
  renderPage(textAnnouncement('维护通知', '第一行\n第二行'));
  await userEvent.click(await screen.findByRole('button', { name: 'enterprise.notifications.actions.open' }));
  expect(screen.getByRole('dialog', { name: '维护通知' })).toHaveTextContent('第一行');
  expect(screen.getByTestId('notification-detail-body')).toHaveClass(expect.stringContaining('plainTextBody'));
});
```

- [ ] **Step 2: 运行测试并确认 RED**

```powershell
npx --no-install vitest run tests/unit/process/services/desktop-notification/desktopNotificationGateway.test.ts tests/unit/process/services/desktop-notification/desktopNotificationBridge.test.ts tests/unit/enterprise/DesktopNotificationCenterPage.dom.test.tsx --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL，Gateway 未判断内容类型，页面没有详情 dialog。

- [ ] **Step 3: 实现 Gateway 顺序和桌面提醒结果**

新通知事件固定顺序：

```ts
if (notification.contentType !== 'TEXT') {
  await apiClient.reportDeliveryFailure(openId, notification.notificationId, 'UNSUPPORTED_CONTENT');
  return;
}
await apiClient.acknowledgeDelivery(openId, notification.notificationId);
emitToRenderer(event);
const shown = desktopIntegration?.shouldNotify()
  ? await desktopIntegration.showNotification({ notification })
  : false;
if (shown === true) {
  await apiClient.markDesktopNotified(openId, notification.notificationId);
}
```

`showNotification` 和 `DesktopNotificationGatewayDesktopIntegration.showNotification` 改为返回 `Promise<boolean>`：系统通知关闭或平台调用失败返回 `false`。原生提醒失败不把已经进入通知中心的消息改成 `FAILED`，只是不写 `DESKTOP_NOTIFIED_AT`。

原生点击目标增加受控 `notificationId`；`OPEN_NOTIFICATION_DETAIL` 只生成：

```text
/enterprise/notifications?notificationId={signed-id}
```

不接受任意服务器 URL。

- [ ] **Step 4: 实现纯文本详情**

`DesktopNotificationCenterPage` 对系统公告的“查看”操作先标记已读，再打开 Ant Design `Modal` 或 `Drawer`。正文使用普通 React 文本节点：

```tsx
<div className={styles.plainTextBody} data-testid='notification-detail-body'>
  {selectedNotification.content ?? ''}
</div>
```

CSS：

```css
.plainTextBody {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.75;
}
```

路由带合法 `notificationId` 时，在已加载列表中定位并打开；当前页没有该项时调用现有列表分页直到找到或显示“消息已过期或已撤销”，最多自动请求 5 页，避免无限查询。

所有现有语言包新增相同 key 结构：`enterprise.notifications.types.system_announcement`、`enterprise.notifications.detail.title`、`enterprise.notifications.detail.unavailable`。`zh-CN` 和 `zh-TW` 使用对应中文，其余语言先使用准确英文文案，保证类型生成和打包校验不缺 key。

- [ ] **Step 5: 运行 Electron 测试并确认 GREEN**

```powershell
npx --no-install vitest run tests/unit/process/services/desktop-notification tests/unit/enterprise/desktopNotificationClient.test.ts tests/unit/enterprise/DesktopNotificationCenterPage.dom.test.tsx --maxWorkers=1 --no-file-parallelism
npm run i18n:types
npm run typecheck:enterprise-tests
```

Expected: PASS。

- [ ] **Step 6: 提交本任务**

```powershell
git add -- AionUi/packages/desktop/src/process/services/enterprise/desktop-notification AionUi/packages/desktop/src/process/bridge/notificationBridge.ts AionUi/packages/desktop/src/process/utils/tray.ts AionUi/packages/desktop/src/common/enterprise/desktop-notification AionUi/packages/desktop/src/renderer/pages/enterprise/notifications AionUi/packages/desktop/src/renderer/services/i18n/locales AionUi/packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts AionUi/tests/unit/process/services/desktop-notification AionUi/tests/unit/enterprise/desktopNotificationClient.test.ts AionUi/tests/unit/enterprise/DesktopNotificationCenterPage.dom.test.tsx
git commit -m "Electron：实现系统公告详情与状态上报"
```

### Task 13: 添加只读数据库验证、全量回归和执行门禁

**Files:**
- Create: `E:/ZZY_PROJECT/AI_lianliao/tools/verify_desktop_message_schema.py`
- Create: `E:/ZZY_PROJECT/AI_lianliao/tools/tests/test_verify_desktop_message_schema.py`
- Modify: `AionUi/docs/superpowers/specs/2026-07-22-desktop-message-management-design.md`

- [ ] **Step 1: 写只读工具的失败测试**

```python
class DesktopMessageSchemaVerifierTest(unittest.TestCase):
    def test_validator_rejects_write_sql(self):
        with self.assertRaises(ValueError):
            validate_readonly_query("UPDATE J_CY_DESKTOP_MSG_TASK SET STATUS='PUBLISHED'")

    def test_expected_contract_contains_all_three_tables(self):
        self.assertEqual(EXPECTED_TABLES, {
            "J_CY_DESKTOP_MSG_TASK",
            "J_CY_DESKTOP_NOTIFICATION",
            "J_CY_DESKTOP_NTF_RECIPIENT",
        })
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `python -m unittest discover -s tools/tests -p test_verify_desktop_message_schema.py -v`

Expected: FAIL，工具不存在。

- [ ] **Step 3: 实现固定结构报告**

复用 `tools/oracle_readonly.py` 的连接设置和 `_connect`，但新工具不接收任意 SQL。它固定查询 `USER_TABLES`、`USER_TAB_COLUMNS`、`USER_INDEXES`、`USER_CONSTRAINTS`、`USER_SEQUENCES`，第一条事务命令为 `SET TRANSACTION READ ONLY`，最终始终 `rollback()`，永不调用 `commit()`。

输出只包含：对象存在性、缺失字段、约束有效性、索引唯一性和迁移完成布尔值；禁止打印 JDBC URL、用户名、密码或业务数据。

- [ ] **Step 4: 运行工具单元测试并确认 GREEN**

Run: `python -m unittest discover -s tools/tests -p test_verify_desktop_message_schema.py -v`

Expected: PASS。

- [ ] **Step 5: 运行所有不需要真实数据库的回归**

Cloud API：

```powershell
mvn -pl cloud-api '-Dtest=DesktopNotificationSchemaContractTest,DesktopNotificationMapperContractTest,DesktopNotificationServiceImplTest,DesktopNotificationControllerTest,DesktopMessageTaskMapperContractTest,DesktopMessageTaskServiceImplTest,DesktopMessagePublishServiceImplTest,DesktopMessageSchedulerTest,DesktopMessageAdminControllerTest' test
```

Expected: PASS，0 failures，0 errors。

后台：

```powershell
node --check WebRoot/backstage/desktop_notification/js/desktop_notification_api.js
node --check WebRoot/backstage/desktop_notification/js/desktop_notification_center.js
node scripts/verify-desktop-notification-cloud-api.js
```

Expected: 全部 PASS。

Electron：

```powershell
npx --no-install vitest run tests/unit/process/services/desktop-notification tests/unit/enterprise/desktopNotificationClient.test.ts tests/unit/enterprise/DesktopNotificationCenterPage.dom.test.tsx --maxWorkers=1 --no-file-parallelism
npm run typecheck:enterprise-tests
npm run package
```

Expected: 测试、类型检查和 Electron Vite 构建全部通过。`npm run package` 不等于安装包发布，不上传服务器、不写版本数据库。

- [ ] **Step 6: 停止并请求数据库执行确认**

向用户展示：

- 增量迁移文件完整路径。
- 目标 Oracle 连接别名或环境，不展示密码。
- 将创建/修改的表、字段、约束、序列和索引摘要。
- 静态契约测试结果。

没有本轮明确确认时到此停止。不得执行迁移，不得写测试消息。

- [ ] **Step 7: 获得确认后执行迁移并只读验证**

使用用户批准的 SQL 客户端执行 `desktop_message_management_migration.sql`。执行成功后运行：

```powershell
python tools/verify_desktop_message_schema.py --json
```

Expected: `complete: true`，三个表、序列、索引、字段和约束均存在且有效。验证工具不能修改数据库。

- [ ] **Step 8: 做本地真实链路验收**

1. 启动 Cloud API：`http://127.0.0.1:12580/`。
2. 设置 `DESKTOP_NOTIFICATION_ENABLED=true`。
3. 启动后台 Tomcat：`http://127.0.0.1:8189/`。
4. 启动 Electron 开发版并保持 F12 可用。
5. 保存草稿，确认通知表和接收表无新增。
6. 立即推送一条测试公告，确认任务、通知和 N 条接收人同时生成。
7. 定时推送一条消息，确认只执行一次。
8. 撤销消息，确认未送达/失败且未提醒未读的接收人变为取消。
9. Electron 收到公告、弹系统提醒、打开纯文本详情并上报送达/提醒/已读。
10. 断开 Electron 后发布，重新登录确认从通知中心补拉。

- [ ] **Step 9: 更新实施记录并提交本任务**

在设计规格末尾增加实际实现文件、测试命令、数据库是否执行和真实联调结果；不得把未执行的联调写成通过。

```powershell
git add -- tools/verify_desktop_message_schema.py tools/tests/test_verify_desktop_message_schema.py AionUi/docs/superpowers/specs/2026-07-22-desktop-message-management-design.md
git commit -m "验证：补齐桌面消息发布验收"
```

## 最终验收清单

- [ ] 草稿不生成通知快照或接收人记录。
- [ ] 立即发布和定时发布均只生成一个去重通知事实。
- [ ] 全部有效 OpenID 获得独立接收记录。
- [ ] 定时任务多实例抢占不会重复发布。
- [ ] 1、5、15 分钟自动重试和耗尽失败状态正确。
- [ ] 撤销不会删除历史，只取消未成功送达且没有提醒/阅读结果的记录。
- [ ] 离线保持待送达，只有受控客户端失败码进入失败。
- [ ] 原生提醒失败只缺少提醒时间，不把已经送达的通知改成失败。
- [ ] 后台三类列表均标准分页，翻页回到表头。
- [ ] 后台所有请求都使用 `CLOUD_URL + cloud-api` 且不要求 Token。
- [ ] Electron 系统公告只显示纯文本，点击只进入本地通知详情。
- [ ] Oracle 验证工具保持固定查询、只读事务和回滚。
- [ ] 所有目标测试、类型检查和 Electron Vite 构建通过。
