# 产业检索助手供需查询工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为产业检索助手增加受控的 `DEMAND_SEARCH` 逻辑工具，查询现有供需对接公开数据并展示可进入详情页的可信结果。

**Architecture:** 扩展现有 `DEMAND` 实体、提示词和工作流白名单；桌面端新增供需资源适配器，将模型生成的类型名称和状态枚举转换成现有 `demand.types`/`demand.list` 请求。模型只规划和评分，实际数据、分页、类型解析、降级和详情导航继续由受控代码完成。

**Tech Stack:** Java 8、Spring Boot、Fastjson、JUnit 5、TypeScript、React、Zod、Vitest 4、i18next、Electron IPC。

**Execution constraints:** 用户明确要求先开发后测试，不采用 TDD；仓库规则禁止未经明确要求提交，因此本计划不包含 commit、push 或数据库变更。

---

### Task 1: 扩展 cloud-api 产业检索契约和提示词

**Files:**
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/vo/catalogai/CatalogAssistantPlanVO.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/catalogai/CatalogAiPromptFactory.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/enterpriseai/EnterpriseAiPromptFactory.java`

- [ ] **Step 1: 扩展计划过滤字段**

在 `CatalogAssistantPlanVO.Filters` 增加：

```java
private String demandType;
private String demandStatus;
```

- [ ] **Step 2: 扩展普通计划提示词**

将 `entityType` 白名单扩展为 `COMPANY|PRODUCT|PROJECT|DEMAND|null`，并在 filters JSON 中增加：

```json
{"demandType":"","demandStatus":""}
```

加入明确规则：

```text
DEMAND 查询公开供需数据，只使用 keyword、city、district、demandType、demandStatus；
demandStatus 只能是 OPEN、CLOSED、EXPIRED；
“查找采购需求、看看供需、有哪些外包需求”属于 DEMAND；
“我要采购、我要加工、发布需求、找供应商报价”属于供需发布，不得规划为 DEMAND。
```

- [ ] **Step 3: 扩展工作流提示词**

将目标实体增加 `DEMAND`，工具白名单增加 `DEMAND_SEARCH`，并明确最终工具与目标实体对应：

```text
直接查询公开供需信息使用 DEMAND_SEARCH；DEMAND_SEARCH 不允许 binding；
模型只输出需求类型名称，不得输出数据库 typeId。
```

- [ ] **Step 4: 扩展候选排序提示词**

说明供需候选只允许使用真实需求 ID，禁止输出联系方式、发布草稿、抢单或投递信息。

- [ ] **Step 5: 扩展企业意图路由提示词**

在 `EnterpriseAiPromptFactory` 中区分：

```text
“查、找、看看、有哪些”与“需求、供需、订单、外包、闲置资源、岗位”的组合属于 CATALOG_SEARCH；
第一人称采购、加工、发布或报价办理表达属于 DEMAND_PUBLISH；
方向不明确时返回 CLARIFY。
```

### Task 2: 扩展 cloud-api 工作流白名单和服务端校验

**Files:**
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/catalogai/CatalogAiAssistantServiceImpl.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/enterpriseai/EnterpriseAiAssistantServiceImpl.java`

- [ ] **Step 1: 注册实体、工具和过滤键**

加入常量和白名单：

```java
static final String DEMAND = "DEMAND";

Arrays.asList(
    "COMPANY_SEARCH",
    "PRODUCT_SEARCH",
    "PROJECT_SEARCH",
    "COMPANY_BATCH_GET",
    "DEMAND_SEARCH"
)
```

将 `demandType`、`demandStatus` 加入 `FILTER_KEYS`。

- [ ] **Step 2: 规范供需过滤值**

在 `filtersFromJson`、`normalizePlan`、`normalizeFilters`、`mergeScopedFilters` 和 `isEmpty` 中加入两个字段。状态通过固定方法收敛：

```java
private String normalizeDemandStatus(String value) {
    String normalized = StringUtils.upperCase(StringUtils.trimToNull(value));
    return "OPEN".equals(normalized)
            || "CLOSED".equals(normalized)
            || "EXPIRED".equals(normalized)
            ? normalized
            : null;
}
```

- [ ] **Step 3: 扩展目标实体校验**

`normalizeEntityType` 接受 `DEMAND`；`validateWorkflowTarget` 增加：

```java
|| (DEMAND.equals(targetEntityType) && "DEMAND_SEARCH".equals(finalTool))
```

保持 `DEMAND_SEARCH` 无 binding，且公司/产品辽宁省限制不应用于供需查询。

- [ ] **Step 4: 增加查询与发布的确定性意图区分**

在 `EnterpriseAiAssistantServiceImpl` 中增加供需查询识别，并确保判断顺序不会把发布表达识别成查询：

```java
private boolean containsDemandLookup(String message) {
    boolean lookup = message.contains("查")
            || message.contains("找")
            || message.contains("看看")
            || message.contains("哪些")
            || message.contains("有没有");
    boolean demand = message.contains("需求")
            || message.contains("供需")
            || message.contains("订单")
            || message.contains("外包")
            || message.contains("闲置资源")
            || message.contains("岗位");
    return lookup && demand;
}
```

先识别明确发布表达，再识别明确供需查询；现有企业、产品查询规则保持不变。

### Task 3: 扩展桌面端公共契约和严格 Schema

**Files:**
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/common/enterprise/catalog-assistant/contracts.ts`
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/common/enterprise/catalog-assistant/schemas.ts`

- [ ] **Step 1: 扩展实体、过滤条件和工具**

采用以下契约：

```ts
export const CATALOG_ENTITY_TYPES = ['COMPANY', 'PRODUCT', 'PROJECT', 'DEMAND'] as const;

export type CatalogAssistantFilters = {
  keyword?: string;
  industry?: string;
  province?: string;
  city?: string;
  district?: string;
  categoryL1?: string;
  categoryL2?: string;
  materialShortName?: string;
  materialName?: string;
  budgetRange?: string;
  constructionNature?: string;
  investmentType?: string;
  publishedFrom?: string;
  publishedTo?: string;
  minInvestment?: string;
  maxInvestment?: string;
  demandType?: string;
  demandStatus?: 'OPEN' | 'CLOSED' | 'EXPIRED';
};

export const CATALOG_WORKFLOW_TOOLS = [
  'COMPANY_SEARCH',
  'PRODUCT_SEARCH',
  'PROJECT_SEARCH',
  'COMPANY_BATCH_GET',
  'DEMAND_SEARCH',
] as const;
```

- [ ] **Step 2: 扩展可信结果联合类型**

导入 `EnterpriseDemandSummary` 并增加：

```ts
| {
    entityType: 'DEMAND';
    reason: string;
    item: EnterpriseDemandSummary;
  }
```

- [ ] **Step 3: 扩展 Zod 过滤 Schema**

在严格对象中增加：

```ts
demandType: nullishShortText(100),
demandStatus: z.enum(['OPEN', 'CLOSED', 'EXPIRED']).nullish(),
```

保留 `.strict()`、最多 5 个步骤和现有拓扑校验，使 `DEMAND_SEARCH` 无 binding 时通过，有 binding 时失败。

### Task 4: 新增供需资源适配器

**Files:**
- Create: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/adapters/demandCatalogAdapter.ts`
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/adapters/types.ts`
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/adapters/catalogAdapterRegistry.ts`
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/adapters/shared.ts`

- [ ] **Step 1: 扩展业务项联合类型**

```ts
export type CatalogBusinessItem =
  | EnterpriseCompanySummary
  | EnterpriseProductSummary
  | EnterpriseProjectSummary
  | EnterpriseDemandSummary;
```

- [ ] **Step 2: 实现动态类型解析**

在新适配器内实现纯函数：

```ts
const normalizeDemandType = (value: string): string =>
  value.trim().toLocaleLowerCase().replaceAll(/\s+/gu, '');

const resolveDemandTypeId = (
  value: string | undefined,
  options: EnterpriseDemandTypeOption[]
): number | undefined => {
  if (!value?.trim()) return undefined;
  const target = normalizeDemandType(value);
  const exact = options.filter((option) => normalizeDemandType(option.typeName) === target);
  if (exact.length === 1) return exact[0].typeId;
  const related = options.filter((option) => {
    const name = normalizeDemandType(option.typeName);
    return name.includes(target) || target.includes(name);
  });
  return related.length === 1 ? related[0].typeId : undefined;
};
```

- [ ] **Step 3: 实现查询计划和状态映射**

`buildSearchPlans` 在存在 `demandType` 时调用 `demand.types`；失败时返回不含 `typeId` 的搜索计划。状态固定映射：

```ts
const DEMAND_STATUS = { OPEN: 0, CLOSED: 1, EXPIRED: 2 } as const;
```

内部搜索计划需要安全携带解析后的 `typeId`；通过适配器私有的 `WeakMap<CatalogAssistantPlan, number>` 或复制计划并使用模块私有映射，不能把未声明字段塞入公共过滤契约。

- [ ] **Step 4: 调用真实供需列表接口**

```ts
const response = await client.request({
  operation: 'demand.list',
  payload: {
    keyword: plan.filters.keyword,
    typeId: resolvedTypeIds.get(plan),
    city: plan.filters.city,
    district: plan.filters.district,
    status: plan.filters.demandStatus ? DEMAND_STATUS[plan.filters.demandStatus] : undefined,
    pageNum,
    pageSize: 20,
  },
});
```

校验响应 operation 后返回现有分页对象。

- [ ] **Step 5: 实现候选、可信结果和 scope digest**

将公开字段映射为现有排序候选：

```ts
{
  id: demand.demandId,
  name: demand.title,
  industry: demand.typeName,
  region: formatRegion(demand.city, demand.district),
  nature: demand.status === 0 ? 'OPEN' : demand.status === 1 ? 'CLOSED' : 'EXPIRED',
  publishedAt: demand.publishedAt,
  summary: [demand.budget, demand.summary, ...demand.primaryTags].filter(Boolean).join(' '),
}
```

`hydrateSelected` 原样返回，`getId` 使用字符串 `demandId`。

- [ ] **Step 6: 注册适配器并支持当前结果筛选**

在 registry 增加 `DEMAND`；在 `trustedResultText` 和 `matchesCommonCurrentResult` 中显式处理供需项，按关键词、地区、类型和状态筛选，避免访问供需项不存在的 `province` 字段。

### Task 5: 接入工作流执行、排序和编排

**Files:**
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/workflow/catalogWorkflowExecutor.ts`
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/workflow/catalogWorkflowRanking.ts`
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/catalogAssistantOrchestrator.ts`

- [ ] **Step 1: 扩展工具与实体映射**

```ts
if (tool === 'DEMAND_SEARCH') return 'DEMAND';
```

`itemId` 使用 `demandId`；候选转换复用适配器；供需业务排序使用可解析的 `publishedAt` 时间戳。

- [ ] **Step 2: 扩展最终可信结果构造**

在企业、产品、项目分支之外增加供需分支：

```ts
const demand = item as EnterpriseDemandSummary;
const publishedAt = demand.publishedAt ? Date.parse(demand.publishedAt) : Number.NaN;
businessSort = Number.isFinite(publishedAt) ? publishedAt : 0;
result = { entityType: 'DEMAND', item: demand, reason: rank.reason };
```

- [ ] **Step 3: 扩展稳定结果 ID 排序**

`catalogWorkflowRanking.resultId` 对 `DEMAND` 返回 `result.item.demandId`，保持 BigInt/字符串稳定比较。

- [ ] **Step 4: 识别明确供需查询并调用工作流**

新增：

```ts
const needsDemandWorkflow = (message: string): boolean =>
  /查|找|看看|哪些|有没有/u.test(message) && /需求|供需|订单|外包|闲置资源|岗位/u.test(message);
```

将工作流条件改为：

```ts
if (!input.resume && (needsCrossResourceWorkflow(input.message) || needsDemandWorkflow(input.message))) {
```

如果工作流端点失败，继续走支持 `DEMAND` 的现有单资源兼容路径。

### Task 6: 增加供需结果卡片和多语言文案

**Files:**
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/CatalogAssistantResultCard.tsx`
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/CatalogAiAssistant.tsx`
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`
- Generate: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`

- [ ] **Step 1: 实现供需结果卡片**

在项目兜底分支之前增加 `DEMAND` 分支，使用 Ant Design `Button` 和 `@icon-park/react` 图标。详情路径必须编码：

```ts
const detailPath = `/enterprise/supply-demand/${encodeURIComponent(String(item.typeId))}/${encodeURIComponent(
  item.demandId
)}`;
```

展示标题、类型、地区、预算、摘要、公开标签、状态和匹配原因，不展示联系方式。

- [ ] **Step 2: 增加供需示例和进度文本**

助手示例增加 `examples.demand`，UI examples 数组引用该 key。新增或更新以下键：

```json
{
  "viewDemand": "查看供需详情",
  "searchingDemandPage": "正在检索供需信息，第 {{page}}/{{maxPages}} 页",
  "examples": { "demand": "查找沈阳近期机械加工需求" }
}
```

同时将 capability 和 placeholder 更新为包含供需信息。

- [ ] **Step 3: 同步全部语言**

根据 `i18n-config.json`，同步 `zh-CN`、`en-US`、`ja-JP`、`zh-TW`、`ko-KR`、`tr-TR`、`ru-RU`、`uk-UA`、`pt-BR`、`de-DE` 的 `enterprise.json`，不得遗漏键。

- [ ] **Step 4: 生成并校验 i18n 类型**

Run:

```powershell
bun run i18n:types
node scripts/check-i18n.js
```

Expected: 两条命令退出码均为 0，无缺失 locale key。

### Task 7: 开发完成后补充 cloud-api 风险与功能测试

**Files:**
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/service/catalogai/CatalogAiAssistantServiceImplTest.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/service/enterpriseai/EnterpriseAiAssistantServiceImplTest.java`
- Modify if needed: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/controller/CatalogAiAssistantControllerTest.java`

- [ ] **Step 1: 测试合法供需工作流**

模型桩返回 `targetEntityType=DEMAND`、`tool=DEMAND_SEARCH`、`demandType=采购需求`、`demandStatus=OPEN`；断言计划保留合法字段且结果上限仍由代码决定。

- [ ] **Step 2: 测试非法输出收敛**

覆盖非法 `demandStatus` 被清空、`DEMAND_SEARCH` 带 binding 被拒绝、最终工具与 `DEMAND` 不匹配被拒绝、工作流排序返回非候选 ID 被拒绝。

- [ ] **Step 3: 测试查询与发布路由**

覆盖：

```text
查找沈阳机械加工需求 -> CATALOG_SEARCH
看看近期闲置资源 -> CATALOG_SEARCH
我要发布机械加工需求 -> DEMAND_PUBLISH
我要采购机电设备 -> DEMAND_PUBLISH
我有一个机械加工需求 -> CLARIFY 或模型受控结果
```

- [ ] **Step 4: 运行 cloud-api 聚焦测试**

Run:

```powershell
mvn -pl cloud-api -Dtest=CatalogAiAssistantServiceImplTest,EnterpriseAiAssistantServiceImplTest,CatalogAiAssistantControllerTest test
```

Expected: `BUILD SUCCESS`，目标测试全部通过。

### Task 8: 开发完成后补充桌面端风险与功能测试

**Files:**
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/tests/unit/enterprise/catalogAssistantOrchestrator.test.ts`
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/tests/unit/enterprise/CatalogAiAssistant.dom.test.tsx`
- Modify: `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/tests/unit/enterprise/enterpriseSchemas.test.ts`

- [ ] **Step 1: 测试严格契约**

验证 `DEMAND`、`DEMAND_SEARCH` 和合法状态可解析；未知状态、额外字段、供需 binding、错误依赖被拒绝。

- [ ] **Step 2: 测试供需适配器**

覆盖唯一类型解析、类型歧义、类型接口失败、状态映射、负数需求 ID、分页响应和候选隐私字段。

- [ ] **Step 3: 测试完整编排链路**

输入“查找沈阳近期机械加工需求”，断言调用顺序包含：

```text
enterpriseAssistant.plan
catalogAssistant.workflowPlan
demand.types
demand.list
catalogAssistant.workflowRank
```

并验证排序失败时仍返回真实 `demand.list` 候选。

- [ ] **Step 4: 测试结果卡片**

渲染供需可信结果，断言标题、类型和“查看供需详情”存在，点击后导航到编码后的现有详情路由，DOM 中不存在联系人或电话字段。

- [ ] **Step 5: 运行桌面端聚焦测试**

Run:

```powershell
bun run test -- tests/unit/enterprise/catalogAssistantOrchestrator.test.ts tests/unit/enterprise/CatalogAiAssistant.dom.test.tsx tests/unit/enterprise/enterpriseSchemas.test.ts
```

Expected: 目标测试文件全部通过。

### Task 9: 完整静态检查和构建验证

**Files:**
- Verify only: all changed files

- [ ] **Step 1: 格式化当前修改**

使用项目格式化工具处理受影响 TypeScript/JSON 文件；不得格式化或覆盖用户无关修改。

- [ ] **Step 2: 运行桌面端类型检查**

Run:

```powershell
bunx tsc --noEmit
bun run typecheck:enterprise-tests
```

Expected: 两条命令退出码均为 0。

- [ ] **Step 3: 运行 i18n 完整性检查**

Run:

```powershell
bun run i18n:types
node scripts/check-i18n.js
```

Expected: 无缺失键，退出码为 0。

- [ ] **Step 4: 运行 cloud-api 编译**

Run:

```powershell
mvn -pl cloud-api -am -DskipTests compile
```

Expected: `BUILD SUCCESS`。

- [ ] **Step 5: 检查变更边界**

确认没有数据库写入、没有新增任意 URL、没有联系方式进入模型候选、没有修改既有供需发布和联系方式权限流程，并保留用户工作区已有修改。
