# Enterprise Code Backend Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为企业码桌面端补齐明文 `openid` 用户上下文、5 分钟扫码登录、幂等收藏、收藏列表和项目跟进解析接口，同时保持现有 H5 接口兼容。

**Architecture:** 企业数据接口放在 `cloud-api` 的 `DesktopEnterpriseController` 下，扫码会话扩展现有 `CommonWxGZHQrCodeLogIn`，继续复用 `CompanyService` 和 `OpportunityService`。收藏以 `J_CY_INTEREST` 为唯一事实来源，项目收藏使用 `TYPE=6`；项目跟进以 `J_OPP_LEAD` 为唯一事实来源。数据库写入采用软删除、幂等恢复和有效记录唯一索引，避免桌面端与 H5 并发写入产生重复有效收藏。

**Tech Stack:** Java 8、Spring Boot、MyBatis、Oracle、Redis、JUnit 5、Mockito、Maven

---

## 0. 执行边界与接口契约

工作目录：`E:\ZZY_PROJECT\lianshang_liaoning\cloud-service`

当前 `E:\ZZY_PROJECT\lianshang_liaoning` 工作树已有与报名模块有关的用户改动。执行本计划时只修改本计划列出的文件，不得清理、还原或格式化无关文件；每次提交前使用 `git diff -- <本任务文件>` 核对范围。

桌面端新增接口：

| Method | Path | Request | `data` |
| --- | --- | --- | --- |
| POST | `cloud-api/CommonWxGZHQrCodeLogIn/desktop/create` | `{}` | `{ loginKey, qrPath, expiresAt, pollIntervalMs }` |
| POST | `cloud-api/CommonWxGZHQrCodeLogIn/desktop/poll` | `{ loginKey }` | `{ status, openId?, unionId?, userContext? }` |
| POST | `cloud-api/DesktopEnterpriseController/userContext` | `{ openId }` | `DesktopUserContext`；未注册时返回成功且 `registered=false` |
| POST | `cloud-api/DesktopEnterpriseController/favorite/status` | `{ openId, items: [{ type, infoId }] }` | `{ "1:100": true, "6:90001": false }` |
| POST | `cloud-api/DesktopEnterpriseController/favorite/save` | `{ openId, type, infoId }` | `{ favorite: true }` |
| POST | `cloud-api/DesktopEnterpriseController/favorite/remove` | `{ openId, type, infoId }` | `{ favorite: false }` |
| POST | `cloud-api/DesktopEnterpriseController/favorite/list` | `{ openId, type?, pageNum, pageSize }` | PageInfo，含对象摘要 |
| POST | `cloud-api/OpportunityController/updateLeadFollowStatus` | 兼容原参数，并接受 `projectId` 或 `hpInfoId` | `{ leadId, followStatus, interestStatus }` |

扫码状态只允许以下值：

```java
public enum DesktopLoginStatus {
    WAITING,
    AUTHENTICATED,
    REGISTER_REQUIRED,
    EXPIRED
}
```

收藏类型只允许 `1`（企业）、`2`（产品）、`6`（在建项目）。项目跟进状态只允许 `NONE`、`TODO`、`DOING`、`DONE`。

## Task 1: 建立收藏数据约束并兼容现有 H5 写入

**Files:**

- Create: `document/sql/20260714_desktop_enterprise_interest.sql`
- Modify: `cloud-admin/src/main/resources/mapper/oracle/CompanyMapper.xml:1244`

- [ ] **Step 1: 先写数据库迁移脚本的重复数据检查查询**

在新 SQL 文件开头加入以下只读检查，发布前先单独执行并保存结果：

```sql
select TYPE, USER_ID, INFO_ID, count(*) as ACTIVE_COUNT
from J_CY_INTEREST
where DEL_SIGN = 'N'
group by TYPE, USER_ID, INFO_ID
having count(*) > 1;
```

- [ ] **Step 2: 写重复有效记录清理和函数索引**

脚本主体使用下面的确定性规则：保留 `INPUT_TIME` 最新、`ID` 最大的一条有效记录，其余改为软删除；随后只约束有效记录。

```sql
merge into J_CY_INTEREST target
using (
    select rid
    from (
        select rowid as rid,
               row_number() over (
                   partition by TYPE, USER_ID, INFO_ID
                   order by INPUT_TIME desc nulls last, ID desc
               ) as rn
        from J_CY_INTEREST
        where DEL_SIGN = 'N'
    )
    where rn > 1
) duplicate_rows
on (target.rowid = duplicate_rows.rid)
when matched then update set target.DEL_SIGN = 'Y';

create unique index UK_J_CY_INTEREST_ACTIVE
on J_CY_INTEREST (
    case when DEL_SIGN = 'N' then TYPE end,
    case when DEL_SIGN = 'N' then USER_ID end,
    case when DEL_SIGN = 'N' then INFO_ID end
);
```

在脚本末尾再次执行重复检查。上线执行数据库脚本需要单独记录，不与应用启动自动绑定。

- [ ] **Step 3: 将 H5 现有 `addCollect` SQL 改为幂等 MERGE**

替换 `CompanyMapper.xml` 的 `addCollect`：

```xml
<insert id="addCollect">
    merge into J_CY_INTEREST target
    using (
        select #{id} as ID, #{type} as TYPE, #{userId} as USER_ID, #{infoId} as INFO_ID
        from dual
    ) source
    on (
        target.TYPE = source.TYPE
        and target.USER_ID = source.USER_ID
        and target.INFO_ID = source.INFO_ID
        and target.DEL_SIGN = 'N'
    )
    when not matched then insert (ID, TYPE, USER_ID, INFO_ID, DEL_SIGN, INPUT_TIME)
    values (source.ID, source.TYPE, source.USER_ID, source.INFO_ID, 'N', sysdate)
</insert>
```

- [ ] **Step 4: 编译验证 MyBatis XML**

Run: `mvn -pl cloud-admin -am -DskipTests package`

Expected: `BUILD SUCCESS`，且 mapper XML 无解析错误。

- [ ] **Step 5: 提交本任务**

```bash
git add document/sql/20260714_desktop_enterprise_interest.sql cloud-admin/src/main/resources/mapper/oracle/CompanyMapper.xml
git commit -m "fix(favorites): make active collection writes idempotent"
```

## Task 2: 为扫码登录增加桌面会话和 5 分钟 TTL

**Files:**

- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/service/CommonQrCodeService.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/service/impl/CommonQrCodeServiceImpl.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/controller/CommonWxGZHQrCodeLogIn.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/service/impl/CommonQrCodeServiceImplDesktopSessionTest.java`

- [ ] **Step 1: 写失败测试——创建会话时所有 Redis key 都是 300 秒**

测试 mock `RedisService`，调用 `createDesktopLoginSession()`，断言：

- 返回 `loginKey` 以 `enterprise_desktop_` 开头；
- `loginKey`、`redirect_uri_*`、`target_uri_*`、`front_sign_*` 均调用 `set(key, value, 300)`；
- `qrPath` 为 `/cloud-api/CommonWxGZHQrCodeLogIn/ln1433/getNewJJGCLoginQRCode_ln1433?ratio=8&front_sign=<URL编码后的loginKey>`；
- `pollIntervalMs=3000`。

Run:

```bash
mvn -pl cloud-api -am -Dtest=CommonQrCodeServiceImplDesktopSessionTest -Dsurefire.failIfNoSpecifiedTests=false test
```

Expected: FAIL，因为接口方法尚不存在。

- [ ] **Step 2: 增加服务接口**

在 `CommonQrCodeService` 增加：

```java
CommonResult createDesktopLoginSession();

CommonResult pollDesktopLoginSession(String loginKey);
```

- [ ] **Step 3: 实现桌面会话创建**

在实现类中增加常量：

```java
private static final long DESKTOP_LOGIN_TTL_SECONDS = 300L;
private static final long DESKTOP_LOGIN_POLL_INTERVAL_MS = 3000L;
private static final String DESKTOP_LOGIN_SUBJECT = "enterprise_desktop";
```

创建逻辑沿用现有 key 约定，但必须对四个初始 key 使用带 TTL 的 `redisService.set`。`target_uri` 和 `redirect_uri` 存空字符串，桌面端不依赖浏览器回调地址。

- [ ] **Step 4: 写失败测试——轮询区分等待、过期、已注册和未注册**

覆盖四种状态：

1. `loginKey` 不存在：`EXPIRED`；
2. 会话存在但 `open_id_*` 不存在：`WAITING`；
3. 有 openid 且 `CompanyService.getUserDetail` 返回用户：`AUTHENTICATED`；
4. 有 openid 但用户数据为空：`REGISTER_REQUIRED`，仍返回该 `openId`。

Run 同 Step 1，Expected: FAIL，直到轮询实现完成。

- [ ] **Step 5: 实现轮询与扫码结果剩余 TTL 继承**

公众号 OAuth 回调写 `open_id_*`、`union_id_*` 时，从 `front_sign_<loginCode>` 取出 `loginKey`，再以 `redisService.getExpire(loginKey)` 的剩余秒数写入结果 key。剩余时间小于等于 0 时不再写入。旧的非桌面扫码流程继续沿用原无 TTL 行为。

桌面轮询通过 `CompanyService.getUserDetail({openId})` 判断是否注册。不要在轮询成功时删除 key；由 TTL 自动清理，避免同一次渲染重试得到不同结果。

- [ ] **Step 6: 修正空 `target_uri` 的兼容处理**

OAuth 回调仅在 `target_uri` 非空且不是字符串 `"null"` 时调用 `HttpUtil.get`。桌面流程为空时直接跳转现有 H5 首页，Redis 中的 openid 已可供 Electron 轮询。

- [ ] **Step 7: 暴露控制器接口并验证**

控制器使用 `@PostMapping` 和 `@RequestBody(required = false) JSONObject`：

```java
@PostMapping("/desktop/create")
public CommonResult createDesktopLoginSession() {
    return commonQrCodeService.createDesktopLoginSession();
}

@PostMapping("/desktop/poll")
public CommonResult pollDesktopLoginSession(@RequestBody(required = false) JSONObject body) {
    String loginKey = body == null ? null : body.getString("loginKey");
    return commonQrCodeService.pollDesktopLoginSession(loginKey);
}
```

Run: `mvn -pl cloud-api -am -Dtest=CommonQrCodeServiceImplDesktopSessionTest -Dsurefire.failIfNoSpecifiedTests=false test`

Expected: PASS。

- [ ] **Step 8: 提交本任务**

```bash
git add cloud-api/src/main/java/com/zzy/cloud/api/service/CommonQrCodeService.java cloud-api/src/main/java/com/zzy/cloud/api/service/impl/CommonQrCodeServiceImpl.java cloud-api/src/main/java/com/zzy/cloud/api/controller/CommonWxGZHQrCodeLogIn.java cloud-api/src/test/java/com/zzy/cloud/api/service/impl/CommonQrCodeServiceImplDesktopSessionTest.java
git commit -m "feat(auth): add expiring desktop QR login sessions"
```

## Task 3: 增加明文 openid 用户上下文接口

**Files:**

- Create: `cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopEnterpriseController.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/DesktopEnterpriseService.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImpl.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImplTest.java`

- [ ] **Step 1: 写失败测试——已注册用户返回桌面上下文**

mock `CompanyService.getUserDetail` 返回包含 `id`、`userName`、`companyId`、`companyName`、`comLevel`、`roleId` 的 JSONObject。断言返回对象：

```json
{
  "registered": true,
  "openId": "o-demo",
  "userId": "1001",
  "userName": "张三",
  "companyId": "2001",
  "companyName": "辽宁示例企业",
  "companyLevel": 3,
  "roleId": "7"
}
```

再写未注册用例，断言 `registered=false` 且保留明文 `openId`。

Run:

```bash
mvn -pl cloud-api -am -Dtest=DesktopEnterpriseServiceImplTest -Dsurefire.failIfNoSpecifiedTests=false test
```

Expected: FAIL。

- [ ] **Step 2: 实现用户上下文服务**

服务方法签名：

```java
CommonResult getUserContext(String openId);
```

规则：

- `openId` 为空返回 `CommonResult.validateFailed("openId不能为空")`；
- 调用现有 `CompanyService.getUserDetail`，不调用 `EncryptUtil`；
- 用户为空时返回 `CommonResult.success({registered:false, openId})`；
- 用户存在时只投影桌面端需要的白名单字段，不把整张用户记录透传；
- 字段统一为 lower camel case。

- [ ] **Step 3: 建立控制器基础路径**

```java
@RestController
@RequestMapping("DesktopEnterpriseController")
public class DesktopEnterpriseController {
    @Autowired
    private DesktopEnterpriseService desktopEnterpriseService;

    @PostMapping("userContext")
    public CommonResult getUserContext(@RequestBody(required = false) JSONObject body) {
        return desktopEnterpriseService.getUserContext(body == null ? null : body.getString("openId"));
    }
}
```

- [ ] **Step 4: 运行测试和模块编译**

Run:

```bash
mvn -pl cloud-api -am -Dtest=DesktopEnterpriseServiceImplTest -Dsurefire.failIfNoSpecifiedTests=false test
mvn -pl cloud-api -am -DskipTests package
```

Expected: 两条命令均 `BUILD SUCCESS`。

- [ ] **Step 5: 提交本任务**

```bash
git add cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopEnterpriseController.java cloud-api/src/main/java/com/zzy/cloud/api/service/DesktopEnterpriseService.java cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImpl.java cloud-api/src/test/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImplTest.java
git commit -m "feat(enterprise): expose desktop user context by openid"
```

## Task 4: 实现幂等收藏保存、取消和批量状态

**Files:**

- Create: `cloud-api/src/main/java/com/zzy/cloud/api/dao/DesktopEnterpriseDao.java`
- Create: `cloud-api/src/main/resources/mapper/DesktopEnterpriseDao.xml`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/service/DesktopEnterpriseService.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImpl.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopEnterpriseController.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseFavoriteServiceTest.java`

- [ ] **Step 1: 写失败测试——输入验证和用户解析**

覆盖：空 openid、非法类型 `3`、空 infoId、未注册 openid。所有写操作必须由 openid 在后端解析 `userId`，不得接受客户端传入的 `userId`。

- [ ] **Step 2: 写失败测试——三种保存分支**

覆盖：

1. 有有效记录：不 insert，直接返回 `favorite=true`；
2. 只有已删除记录：执行 `restoreFavorite`；
3. 没有任何记录：使用 `SqlSequenceService.getSequence()` 插入。

服务方法添加 `@Transactional`。并发首次插入触发 `UK_J_CY_INTEREST_ACTIVE` 唯一冲突时，重新查询有效状态；若已存在则按成功返回，其他数据库异常继续抛出。

Run:

```bash
mvn -pl cloud-api -am -Dtest=DesktopEnterpriseFavoriteServiceTest -Dsurefire.failIfNoSpecifiedTests=false test
```

Expected: FAIL。

- [ ] **Step 3: 定义 DAO 与核心 SQL**

DAO 至少包含：

```java
JSONObject selectUserContext(@Param("openId") String openId);
JSONObject selectActiveFavorite(@Param("userId") String userId, @Param("type") String type, @Param("infoId") String infoId);
JSONObject selectLatestDeletedFavorite(@Param("userId") String userId, @Param("type") String type, @Param("infoId") String infoId);
int restoreFavorite(@Param("id") String id);
int insertFavorite(@Param("id") Long id, @Param("userId") String userId, @Param("type") String type, @Param("infoId") String infoId);
int removeFavorite(@Param("userId") String userId, @Param("type") String type, @Param("infoId") String infoId);
List<JSONObject> selectFavoriteStatus(@Param("userId") String userId, @Param("items") List<JSONObject> items);
```

恢复 SQL 必须同时更新时间：

```xml
<update id="restoreFavorite">
    update J_CY_INTEREST
    set DEL_SIGN = 'N', INPUT_TIME = sysdate
    where ID = #{id} and DEL_SIGN = 'Y'
</update>
```

- [ ] **Step 4: 实现批量状态返回 key**

服务把有效记录组装为 `${type}:${infoId}` 的布尔 map。请求最多 200 项，超过时返回参数校验失败，避免动态 SQL 过大。

- [ ] **Step 5: 添加控制器方法并运行测试**

控制器方法统一接收 JSON body：`favorite/status`、`favorite/save`、`favorite/remove`。状态与写入响应必须返回服务端最终状态，前端不得依赖乐观翻转。

Run:

```bash
mvn -pl cloud-api -am -Dtest=DesktopEnterpriseFavoriteServiceTest -Dsurefire.failIfNoSpecifiedTests=false test
mvn -pl cloud-api -am -DskipTests package
```

Expected: PASS / `BUILD SUCCESS`。

- [ ] **Step 6: 提交本任务**

```bash
git add cloud-api/src/main/java/com/zzy/cloud/api/dao/DesktopEnterpriseDao.java cloud-api/src/main/resources/mapper/DesktopEnterpriseDao.xml cloud-api/src/main/java/com/zzy/cloud/api/service/DesktopEnterpriseService.java cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImpl.java cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopEnterpriseController.java cloud-api/src/test/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseFavoriteServiceTest.java
git commit -m "feat(favorites): add desktop favorite commands and status"
```

## Task 5: 实现收藏分页列表和对象摘要

**Files:**

- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/dao/DesktopEnterpriseDao.java`
- Modify: `cloud-api/src/main/resources/mapper/DesktopEnterpriseDao.xml`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/service/DesktopEnterpriseService.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImpl.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopEnterpriseController.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseFavoriteListTest.java`

- [ ] **Step 1: 写失败测试——分页、类型筛选和空对象保留**

断言默认 `pageNum=1`、`pageSize=20`、最大 `pageSize=100`。引用对象被删除时仍返回收藏记录，摘要名称为 `"内容已下线"`，便于用户取消收藏。

- [ ] **Step 2: 添加摘要查询**

查询以 `J_CY_INTEREST` 为主表，按类型左连接：

- `TYPE=1` → `J_CY_COMPANY`；
- `TYPE=2` → `J_NEW_PRODUCTS`；
- `TYPE=6` → `J_HP_INFO`。

统一输出字段：`favoriteId`、`type`、`infoId`、`title`、`subtitle`、`imageUrl`、`inputTime`、`available`。只查 `J_CY_INTEREST.DEL_SIGN='N'`，按 `INPUT_TIME desc, ID desc` 排序。

- [ ] **Step 3: 使用 PageHelper 返回 camelCase PageInfo**

实现调用 `PageHelper.startPage(pageNum, pageSize)` 和 `PageUtil.toCamelCase`，不要手写 `total`。

- [ ] **Step 4: 暴露 `favorite/list` 并验证**

Run:

```bash
mvn -pl cloud-api -am -Dtest=DesktopEnterpriseFavoriteListTest -Dsurefire.failIfNoSpecifiedTests=false test
mvn -pl cloud-api -am -DskipTests package
```

Expected: PASS / `BUILD SUCCESS`。

- [ ] **Step 5: 提交本任务**

```bash
git add cloud-api/src/main/java/com/zzy/cloud/api/dao/DesktopEnterpriseDao.java cloud-api/src/main/resources/mapper/DesktopEnterpriseDao.xml cloud-api/src/main/java/com/zzy/cloud/api/service/DesktopEnterpriseService.java cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImpl.java cloud-api/src/main/java/com/zzy/cloud/api/controller/DesktopEnterpriseController.java cloud-api/src/test/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseFavoriteListTest.java
git commit -m "feat(favorites): add desktop collection list"
```

## Task 6: 让项目跟进支持 hpInfoId 自动解析或创建 lead

**Files:**

- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/dao/OpportunityDao.java`
- Modify: `cloud-api/src/main/resources/mapper/OpportunityDao.xml`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/service/impl/OpportunityServiceImpl.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/service/impl/OpportunityServiceImplFollowStatusTest.java`

- [ ] **Step 1: 写失败测试——现有 lead 继续按 leadId 更新**

断言旧请求 `{openId, companyId, leadId, followStatus}` 行为不变，并校验 DAO 更新行数为 1。

- [ ] **Step 2: 写失败测试——仅 hpInfoId 时创建 lead**

请求 `{openId, hpInfoId:90001, followStatus:"TODO"}`：

1. `resolveCompanyBean` 得到 companyId；
2. `selectLeadByCompanyProject` 初次为空；
3. 使用新序列 ID 执行 `mergeDesktopLead`；
4. 重新查询得到 leadId；
5. 更新状态并返回该 leadId。

另测项目不存在、非法状态、DAO 更新 0 行三种失败。

Run:

```bash
mvn -pl cloud-api -am -Dtest=OpportunityServiceImplFollowStatusTest -Dsurefire.failIfNoSpecifiedTests=false test
```

Expected: FAIL。

- [ ] **Step 3: 新增最小 lead MERGE**

`mergeDesktopLead` 从 `J_HP_INFO` 和 `J_CY_COMPANY` 读取名称、地区、地址、来源 URL，并设置：

```text
LEAD_STATUS='ACTIVE'
VIEW_STATUS='UNREAD'
INTEREST_STATUS='NONE'
FOLLOW_STATUS='NONE'
MATCH_SCORE=0
MATCH_LEVEL='PENDING'
PRIORITY_SCORE=0
PRIORITY_LEVEL='NORMAL'
DEL_SIGN='N'
```

唯一匹配条件为 `(COMPANY_ID, PROJECT_ID)`。`projectId` 和 `hpInfoId` 在此桌面路径中都表示 `J_HP_INFO.ID`。

- [ ] **Step 4: 收紧状态更新服务**

服务规则：

- `followStatus` 非空时必须属于 `NONE/TODO/DOING/DONE`；
- `interestStatus` 非空时必须属于 `NONE/INTERESTED/FAVORITED`；
- `leadId` 缺失时使用 `projectId`，再回退 `hpInfoId`；
- 创建/解析 lead 与状态更新放在同一事务；
- 返回 `{leadId, followStatus, interestStatus}`，而不是空成功。

- [ ] **Step 5: 运行测试和编译**

Run:

```bash
mvn -pl cloud-api -am -Dtest=OpportunityServiceImplFollowStatusTest -Dsurefire.failIfNoSpecifiedTests=false test
mvn -pl cloud-api -am -DskipTests package
```

Expected: PASS / `BUILD SUCCESS`。

- [ ] **Step 6: 提交本任务**

```bash
git add cloud-api/src/main/java/com/zzy/cloud/api/dao/OpportunityDao.java cloud-api/src/main/resources/mapper/OpportunityDao.xml cloud-api/src/main/java/com/zzy/cloud/api/service/impl/OpportunityServiceImpl.java cloud-api/src/test/java/com/zzy/cloud/api/service/impl/OpportunityServiceImplFollowStatusTest.java
git commit -m "feat(opportunity): resolve project leads for desktop follow-up"
```

## Task 7: 后端契约回归与手工冒烟

**Files:**

- Create: `cloud-api/src/test/java/com/zzy/cloud/api/controller/DesktopEnterpriseControllerTest.java`
- Create: `cloud-api/src/test/resources/contracts/desktop-enterprise-contract.json`

- [ ] **Step 1: 添加控制器契约测试**

用 MockMvc 或直接 controller 单元测试固定字段名，至少覆盖：用户上下文、扫码四状态、收藏 save/remove/status/list、跟进响应。契约 fixture 不放真实 openid，使用 `o-test-openid`。

- [ ] **Step 2: 运行 cloud-api 全部测试**

Run: `mvn -pl cloud-api -am test`

Expected: `BUILD SUCCESS`。

- [ ] **Step 3: 运行 cloud-admin 编译回归**

Run: `mvn -pl cloud-admin -am -DskipTests package`

Expected: `BUILD SUCCESS`。

- [ ] **Step 4: 在测试环境执行数据库迁移并做接口冒烟**

按顺序验证：

1. 创建扫码会话，检查 Redis TTL 在 295–300 秒；
2. 微信扫码后轮询得到 `AUTHENTICATED` 或 `REGISTER_REQUIRED`；
3. 用同一 openid 连续保存同一企业两次，数据库有效记录数为 1；
4. 取消再保存，最终只有一条有效记录；
5. 项目 `TYPE=6` 收藏可在列表显示；
6. 只传 `hpInfoId` 可更新 TODO → DOING → DONE，并始终返回同一 leadId；
7. 原 H5 企业、产品收藏接口仍可正常使用。

- [ ] **Step 5: 检查没有敏感日志**

`openid` 按用户确认可以明文传输和持久化，但服务日志不得打印完整 openid、unionId、手机号。日志仅保留 loginKey 后 6 位和状态。

- [ ] **Step 6: 提交契约测试**

```bash
git add cloud-api/src/test/java/com/zzy/cloud/api/controller/DesktopEnterpriseControllerTest.java cloud-api/src/test/resources/contracts/desktop-enterprise-contract.json
git commit -m "test(enterprise): cover desktop backend contracts"
```

## 完成判定

- 所有新增响应字段为 lower camel case，Electron 无需兼容 Oracle 大写字段。
- 明文 openid 接口不改变现有 `getScysUserDetail` 的加解密契约。
- 扫码会话最长 5 分钟，桌面轮询间隔 3 秒，过期状态可识别。
- `J_CY_INTEREST` 的企业、产品、项目收藏均可幂等保存、取消、恢复和分页查询。
- `TYPE=6` 明确对应 `J_HP_INFO.ID`。
- `J_OPP_LEAD` 的项目跟进可由 `leadId` 或 `hpInfoId` 驱动。
- `cloud-api` 测试通过，`cloud-api` 与 `cloud-admin` 均可编译。
