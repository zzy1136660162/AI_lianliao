# 企业码与重点产品 AI 检索助手实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Electron 企业码与重点产品页面交付一个可复用的 AI 检索助手，能够识别实体类型、有限翻页、模型排序并输出可跳转的可信业务卡片。

**Architecture:** cloud-api 提供 `plan` 与 `rank` 两个模型能力接口；Electron 通过现有主进程白名单访问它们，并在渲染进程执行 `plan → search → rank → render` 有界编排。模型只决定计划、候选 ID 和理由，企业及产品事实字段始终来自现有列表接口。

**Tech Stack:** Java 8、Spring Boot、MyBatis、Fastjson、Oracle、React 19、TypeScript strict、Ant Design React、Zod、Electron IPC、Vitest、JUnit 5、Mockito。

**执行约束:** 用户明确要求先开发后测试，不使用 TDD。本计划先完成 Task 1–7 的实现，再执行 Task 8–10 的功能完整性与风险测试。未经用户明确要求不提交、不推送、不执行数据库脚本。

---

## 文件职责图

### cloud-api 新增文件

- `src/main/java/com/zzy/cloud/api/dto/catalogai/CatalogAssistantContextDTO.java`
  - 接收有限的多轮上下文，不接收完整聊天记录。
- `src/main/java/com/zzy/cloud/api/dto/catalogai/CatalogAssistantPlanRequestDTO.java`
  - `plan` 请求。
- `src/main/java/com/zzy/cloud/api/dto/catalogai/CatalogAssistantRankRequestDTO.java`
  - `rank` 请求及紧凑候选。
- `src/main/java/com/zzy/cloud/api/vo/catalogai/CatalogAssistantPlanVO.java`
  - 受支持的实体类型、筛选条件和澄清问题。
- `src/main/java/com/zzy/cloud/api/vo/catalogai/CatalogAssistantRankVO.java`
  - 候选 ID 子集、理由和摘要。
- `src/main/java/com/zzy/cloud/api/service/catalogai/CatalogAiPromptFactory.java`
  - 生成严格 JSON 契约提示词。
- `src/main/java/com/zzy/cloud/api/service/catalogai/CatalogAiModelGateway.java`
  - 调用 `CATALOG_ASSISTANT` 模型配置并返回 JSON。
- `src/main/java/com/zzy/cloud/api/service/catalogai/CatalogAiModelGatewayImpl.java`
  - 复用现有模型配置 Mapper、HTTP transport、代理和诊断日志。
- `src/main/java/com/zzy/cloud/api/service/catalogai/CatalogAiAssistantService.java`
  - 对外服务边界。
- `src/main/java/com/zzy/cloud/api/service/catalogai/CatalogAiAssistantServiceImpl.java`
  - 输入归一、模型结果校验、候选子集过滤。
- `src/main/java/com/zzy/cloud/api/controller/CatalogAiAssistantController.java`
  - `/plan` 与 `/rank` Controller。
- `src/main/resources/db/catalog_ai_assistant_model.sql`
  - 从现有 `DEMAND_PARSE` 模型配置复制到 `CATALOG_ASSISTANT`，不包含明文密钥。

### Electron 新增文件

- `packages/desktop/src/common/enterprise/catalog-assistant/contracts.ts`
  - IPC 请求、响应、计划、候选和结果类型。
- `packages/desktop/src/common/enterprise/catalog-assistant/schemas.ts`
  - Zod 请求和响应校验。
- `packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/catalogAssistantOrchestrator.ts`
  - 有界分页、候选压缩、排序降级、取消和旧请求隔离。
- `packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/CatalogAssistantProvider.tsx`
  - 运行周期内的结构化会话状态。
- `packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/CatalogAiAssistant.tsx`
  - 通用助手 UI。
- `packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/CatalogAssistantResultCard.tsx`
  - 企业与产品结果卡片。
- `packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/catalog-ai-assistant.module.css`
  - 助手内部布局和窄窗口抽屉样式。

### Electron 修改文件

- `packages/desktop/src/common/enterprise/contracts.ts`
  - 把两项新操作加入现有请求/响应联合类型。
- `packages/desktop/src/common/enterprise/rawSchemas.ts`
  - 将新请求加入严格 IPC 输入校验。
- `packages/desktop/src/common/enterprise/schemas.ts`
  - 解析 cloud-api 的规划和排序响应。
- `packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts`
  - 增加两条固定 cloud-api 白名单。
- `packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`
  - 注入注册用户身份并序列化新请求。
- `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx`
  - 在企业码、重点产品路由挂载 Provider 和通用助手。
- `packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css`
  - 展开宽度改为约 360px，并兼容窄窗口覆盖。
- `packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`
  - 增加全部 10 个语言包的助手文案。
- `packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`
  - 由生成脚本更新。

---

### Task 1：建立 cloud-api 规划与排序契约

**Files:**

- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\dto\catalogai\CatalogAssistantContextDTO.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\dto\catalogai\CatalogAssistantPlanRequestDTO.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\dto\catalogai\CatalogAssistantRankRequestDTO.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\vo\catalogai\CatalogAssistantPlanVO.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\vo\catalogai\CatalogAssistantRankVO.java`

- [ ] **Step 1：定义有限会话上下文**

使用字符串 ID 兼容现有负数 ID；上下文只保留最近结构化条件：

```java
@Data
public class CatalogAssistantContextDTO {
    private String lastEntityType;
    private Map<String, String> lastFilters;
    private Integer lastResultCount;
    private String lastUserMessage;
    private String lastSummary;
    private List<String> excludedIds;
}
```

服务实现中把 `lastFilters` 限定为 `keyword`、`industry`、`city`、`district`，把 `excludedIds` 限定为最多 6 个非空字符串。

- [ ] **Step 2：定义 plan 请求**

```java
@Data
public class CatalogAssistantPlanRequestDTO {
    private String message;
    private CatalogAssistantContextDTO context;
}
```

`message` 在 Service 中 `trim` 后校验 2–1000 字符。

- [ ] **Step 3：定义 rank 请求与紧凑候选**

```java
@Data
public class CatalogAssistantRankRequestDTO {
    private String message;
    private CatalogAssistantPlanVO plan;
    private List<Candidate> candidates;

    @Data
    public static class Candidate {
        private String id;
        private String name;
        private String companyName;
        private String industry;
        private String region;
        private String summary;
    }
}
```

Service 强制候选数量为 1–100，单字段按以下上限截断：

```java
private static final int NAME_MAX = 200;
private static final int INDUSTRY_MAX = 100;
private static final int REGION_MAX = 100;
private static final int SUMMARY_MAX = 500;
```

- [ ] **Step 4：定义 plan 返回对象**

```java
@Data
@Builder
public class CatalogAssistantPlanVO {
    private String entityType;
    private Filters filters;
    private Integer resultLimit;
    private String clarification;
    private String summary;

    @Data
    @Builder
    public static class Filters {
        private String keyword;
        private String industry;
        private String city;
        private String district;
    }
}
```

`entityType` 仅允许 `COMPANY`、`PRODUCT` 或澄清态 `null`；`resultLimit` 归一到 3–6。

- [ ] **Step 5：定义 rank 返回对象**

```java
@Data
@Builder
public class CatalogAssistantRankVO {
    private String summary;
    private List<Item> items;

    @Data
    @Builder
    public static class Item {
        private String id;
        private String reason;
    }
}
```

`reason` 截断到 120 字符，`summary` 截断到 300 字符。

---

### Task 2：实现 cloud-api 模型规划、排序和故障转移

**Files:**

- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\service\catalogai\CatalogAiPromptFactory.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\service\catalogai\CatalogAiModelGateway.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\service\catalogai\CatalogAiModelGatewayImpl.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\service\catalogai\CatalogAiAssistantService.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\service\catalogai\CatalogAiAssistantServiceImpl.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\controller\CatalogAiAssistantController.java`

- [ ] **Step 1：建立严格提示词工厂**

`CatalogAiPromptFactory` 提供：

```java
String planPrompt(CatalogAssistantPlanRequestDTO request);
String rankPrompt(CatalogAssistantRankRequestDTO request);
```

`plan` 的系统约束必须明确：

```text
只返回 JSON。
entityType 只能是 COMPANY、PRODUCT 或 null。
filters 只能含 keyword、industry、city、district。
province 固定为辽宁省，禁止输出 SQL、接口名、URL 或联系方式。
需求太宽泛或实体不明确时，clarification 必须是一个简短问题。
resultLimit 必须在 3 到 6 之间。
```

`rank` 提示词必须明确：

```text
只能从 candidates 中选择 ID。
items 最多 6 条且 ID 不重复。
只输出 summary、items[].id、items[].reason。
不得补写企业或产品事实，不得输出联系方式。
```

请求对象用 Fastjson 序列化，避免手工拼接用户文本破坏 JSON 边界。

- [ ] **Step 2：定义模型网关**

```java
public interface CatalogAiModelGateway {
    JSONObject invoke(String stage, String userPrompt);
}
```

- [ ] **Step 3：实现模型配置选择和 OpenAI 兼容调用**

`CatalogAiModelGatewayImpl` 使用：

```java
private static final String BUSINESS_CODE = "CATALOG_ASSISTANT";
```

依赖：

```java
private final DemandPublishMapper mapper;
private final DemandAiHttpTransport transport;
private final DemandAiConversationProperties properties;
private final BusinessDiagnosticLogger diagnosticLogger;
```

执行顺序：

1. `mapper.selectAiModelConfigs(BUSINESS_CODE)`。
2. 按 `priority` 升序分组。
3. 同一优先级先按 `weight` 加权选择一个，其余按权重降序。
4. 每个配置最多执行 `retryCount + 1` 次。
5. 只接受 `OPENAI_CHAT_COMPLETIONS`。
6. 请求 `temperature=0.1`，`max_tokens` 取数据库配置。
7. 提取 `choices[0].message.content`，删除 `<think>...</think>`，只解析首尾 JSON 对象。
8. 成功调用 `markModelSuccess`，完全失败调用 `markModelFailure` 并切换下一个配置。
9. 所有配置失败时抛出 `DemandAiProvidersUnavailableException`。

系统消息固定为：

```text
你是链上辽宁·产业云城产业目录检索助手。必须只返回符合用户契约的 JSON 对象；
不得输出 Markdown、思维过程、联系方式、身份推断、SQL、脚本或接口地址。
```

诊断日志 channel 使用 `catalog-ai`，stage 使用 `PLAN` 或 `RANK`。完整 prompt/response 交给现有 `BusinessDiagnosticLogger`，由 `LIANLIAO_DIAGNOSTIC_SENSITIVE=1` 控制；日志字段只能记录模型配置 ID，不能记录 API key。

- [ ] **Step 4：实现 plan 结果校验和归一**

`CatalogAiAssistantServiceImpl.plan`：

```java
public CatalogAssistantPlanVO plan(CatalogAssistantPlanRequestDTO request) {
    String message = requireMessage(request);
    JSONObject root = gateway.invoke("PLAN", promptFactory.planPrompt(normalizeContext(request, message)));
    return normalizePlan(root);
}
```

`normalizePlan` 规则：

- `entityType` 非 `COMPANY`/`PRODUCT` 时置空。
- 过滤器只从四个白名单键读取，空白变 `null`，单值最多 100 字符。
- `resultLimit = Math.max(3, Math.min(6, suppliedOrThree))`。
- `clarification` 最多 200 字符。
- 如果 `entityType == null`，必须有 `clarification`，否则使用“您想查找相关企业，还是重点产品？”。
- 如果实体明确但四个条件全空，返回澄清问题并把实体置空，不启动宽泛查询。
- `summary` 最多 300 字符。

- [ ] **Step 5：实现 rank 候选子集校验**

`CatalogAiAssistantServiceImpl.rank`：

```java
public CatalogAssistantRankVO rank(CatalogAssistantRankRequestDTO request) {
    CatalogAssistantRankRequestDTO normalized = validateAndNormalizeRankInput(request);
    Set<String> candidateIds = normalized.getCandidates().stream()
            .map(CatalogAssistantRankRequestDTO.Candidate::getId)
            .collect(Collectors.toCollection(LinkedHashSet::new));
    JSONObject root = gateway.invoke("RANK", promptFactory.rankPrompt(normalized));
    return normalizeRank(root, candidateIds, normalized.getPlan().getResultLimit());
}
```

`normalizeRank` 使用 `LinkedHashSet<String>`：

- 只保留候选集合内 ID。
- 丢弃重复、空白和未知 ID。
- 最多保留计划的 `resultLimit`，且绝不超过 6。
- 理由为空时使用“符合当前检索条件”。
- 结果为空视为模型排序失败，由 Controller 返回失败，Electron 走确定性降级。

- [ ] **Step 6：实现 Controller**

```java
@RestController
@RequestMapping("/CatalogAiAssistantController")
public class CatalogAiAssistantController {
    private final CatalogAiAssistantService service;

    @PostMapping("/plan")
    public CommonResult<CatalogAssistantPlanVO> plan(
            @RequestBody(required = false) CatalogAssistantPlanRequestDTO request) {
        try {
            return CommonResult.success(service.plan(request));
        } catch (IllegalArgumentException exception) {
            return CommonResult.validateFailed(exception.getMessage());
        } catch (Exception exception) {
            return CommonResult.failed("产业检索助手暂时不可用，请稍后重试");
        }
    }

    @PostMapping("/rank")
    public CommonResult<CatalogAssistantRankVO> rank(
            @RequestBody(required = false) CatalogAssistantRankRequestDTO request) {
        try {
            return CommonResult.success(service.rank(request));
        } catch (IllegalArgumentException exception) {
            return CommonResult.validateFailed(exception.getMessage());
        } catch (Exception exception) {
            return CommonResult.failed("暂时无法完成候选排序");
        }
    }
}
```

Controller 不接收或返回模型密钥、数据库配置和联系方式。

---

### Task 3：增加模型业务配置脚本

**Files:**

- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\resources\db\catalog_ai_assistant_model.sql`

- [ ] **Step 1：编写幂等 MERGE**

脚本从已启用的 `DEMAND_PARSE` 配置复制供应商、模型、URL、协议和 API key，不在源码出现明文密钥：

```sql
MERGE INTO J_CY_AI_MODEL_CFG target
USING (
    SELECT 'CATALOG_ASSISTANT' AS BUSINESS_CODE,
           source.PROVIDER_CODE,
           source.MODEL_NAME,
           source.BASE_URL,
           source.PROTOCOL_TYPE,
           source.API_KEY,
           source.PRIORITY,
           source.WEIGHT,
           source.TIMEOUT_MS,
           source.MAX_TOKENS
    FROM J_CY_AI_MODEL_CFG source
    WHERE source.BUSINESS_CODE = 'DEMAND_PARSE'
      AND source.ENABLED = 'Y'
) source
ON (
    target.BUSINESS_CODE = source.BUSINESS_CODE
    AND target.PROVIDER_CODE = source.PROVIDER_CODE
    AND target.MODEL_NAME = source.MODEL_NAME
)
WHEN MATCHED THEN UPDATE SET
    target.BASE_URL = source.BASE_URL,
    target.PROTOCOL_TYPE = source.PROTOCOL_TYPE,
    target.API_KEY = source.API_KEY,
    target.PRIORITY = source.PRIORITY,
    target.WEIGHT = source.WEIGHT,
    target.TIMEOUT_MS = source.TIMEOUT_MS,
    target.MAX_TOKENS = source.MAX_TOKENS,
    target.ENABLED = 'Y',
    target.UPDATE_TIME = TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS')
WHEN NOT MATCHED THEN INSERT (
    ID, BUSINESS_CODE, PROVIDER_CODE, MODEL_NAME, BASE_URL, PROTOCOL_TYPE,
    API_KEY, PRIORITY, WEIGHT, TIMEOUT_MS, MAX_TOKENS, ENABLED
) VALUES (
    SEQ_CY_AI_MODEL_CFG.NEXTVAL, source.BUSINESS_CODE, source.PROVIDER_CODE,
    source.MODEL_NAME, source.BASE_URL, source.PROTOCOL_TYPE, source.API_KEY,
    source.PRIORITY, source.WEIGHT, source.TIMEOUT_MS, source.MAX_TOKENS, 'Y'
);

COMMIT;
```

该脚本只随代码交付；本轮不连接数据库、不执行脚本。

---

### Task 4：扩展 Electron 严格跨进程契约

**Files:**

- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\common\enterprise\catalog-assistant\contracts.ts`
- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\common\enterprise\catalog-assistant\schemas.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\common\enterprise\contracts.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\common\enterprise\rawSchemas.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\common\enterprise\schemas.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\process\services\enterprise\enterpriseApiRoutes.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\process\services\enterprise\enterpriseApiClient.ts`

- [ ] **Step 1：定义共享类型**

```ts
export const CATALOG_ENTITY_TYPES = ['COMPANY', 'PRODUCT'] as const;
export type CatalogEntityType = (typeof CATALOG_ENTITY_TYPES)[number];

export type CatalogAssistantFilters = {
  keyword?: string;
  industry?: string;
  city?: string;
  district?: string;
};

export type CatalogAssistantContext = {
  lastEntityType?: CatalogEntityType;
  lastFilters?: CatalogAssistantFilters;
  lastResultCount?: number;
  lastUserMessage?: string;
  lastSummary?: string;
  excludedIds?: string[];
};

export type CatalogAssistantPlan = {
  entityType?: CatalogEntityType;
  filters: CatalogAssistantFilters;
  resultLimit: number;
  clarification?: string;
  summary: string;
};

export type CatalogAssistantCandidate = {
  id: string;
  name: string;
  companyName?: string;
  industry?: string;
  region?: string;
  summary?: string;
};

export type CatalogAssistantRankResult = {
  summary: string;
  items: Array<{ id: string; reason: string }>;
};
```

- [ ] **Step 2：定义严格 Zod schema**

请求 schema：

```ts
export const catalogPlanPayloadSchema = z
  .object({
    message: z.string().trim().min(2).max(1000),
    context: catalogContextSchema.optional(),
  })
  .strict();

export const catalogRankPayloadSchema = z
  .object({
    message: z.string().trim().min(2).max(1000),
    plan: catalogPlanResponseSchema,
    candidates: z.array(catalogCandidateSchema).min(1).max(100),
  })
  .strict();
```

响应 schema：

```ts
export const catalogPlanResponseSchema = z
  .object({
    entityType: z.enum(CATALOG_ENTITY_TYPES).nullish(),
    filters: catalogFiltersSchema,
    resultLimit: z.number().int().min(3).max(6),
    clarification: z.string().trim().min(1).max(200).nullish(),
    summary: z.string().trim().min(1).max(300),
  })
  .strict()
  .transform(({ entityType, clarification, ...rest }) => ({
    ...rest,
    ...(entityType ? { entityType } : {}),
    ...(clarification ? { clarification } : {}),
  }));
```

排序结果 `items` 为 1–6 条，ID 使用 `z.string().trim().min(1).max(100)`，理由最长 120。

- [ ] **Step 3：加入 EnterpriseRequest/EnterpriseResponse**

请求联合类型增加：

```ts
| {
    operation: 'catalogAssistant.plan';
    payload: { message: string; context?: CatalogAssistantContext };
  }
| {
    operation: 'catalogAssistant.rank';
    payload: {
      message: string;
      plan: CatalogAssistantPlan;
      candidates: CatalogAssistantCandidate[];
    };
  }
```

响应联合类型增加：

```ts
| { operation: 'catalogAssistant.plan'; data: CatalogAssistantPlan }
| { operation: 'catalogAssistant.rank'; data: CatalogAssistantRankResult }
```

- [ ] **Step 4：把请求加入 IPC 判别联合**

在 `rawSchemas.ts` 中加入：

```ts
z.object({ operation: z.literal('catalogAssistant.plan'), payload: catalogPlanPayloadSchema }).strict(),
z.object({ operation: z.literal('catalogAssistant.rank'), payload: catalogRankPayloadSchema }).strict(),
```

禁止 `__proto__`、`constructor` 和未声明字段的现有 guarded-object 行为继续生效。

- [ ] **Step 5：解析服务响应**

在 `parseEnterpriseResponse` 增加：

```ts
case 'catalogAssistant.plan':
  return { operation, data: catalogPlanResponseSchema.parse(input) };
case 'catalogAssistant.rank':
  return { operation, data: catalogRankResponseSchema.parse(input) };
```

- [ ] **Step 6：增加固定白名单路由**

```ts
'catalogAssistant.plan': 'cloud-api/CatalogAiAssistantController/plan',
'catalogAssistant.rank': 'cloud-api/CatalogAiAssistantController/rank',
```

- [ ] **Step 7：序列化请求并注入身份**

增加：

```ts
const serializeCatalogAssistantRequest = (
  request: Extract<EnterpriseRequest, { operation: `catalogAssistant.${string}` }>,
  context: EnterpriseUserContext
): EnterpriseRequestBody => {
  requireRegisteredIdentity(context);
  return { ...request.payload };
};
```

在 `serializeRequest` switch 中处理两个新操作。请求体不发送 openId、userId 或 companyId 给模型接口，因为该功能只检索公开目录；主进程仍要求已注册会话，阻止匿名滥用。

---

### Task 5：实现 Electron 有界检索编排器

**Files:**

- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\catalogAssistantOrchestrator.ts`

- [ ] **Step 1：定义状态、进度和可信结果类型**

```ts
export type CatalogAssistantStage =
  | 'IDLE'
  | 'PLANNING'
  | 'CLARIFYING'
  | 'SEARCHING'
  | 'RANKING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type CatalogAssistantTrustedResult =
  | {
      entityType: 'COMPANY';
      reason: string;
      item: EnterpriseCompanySummary;
    }
  | {
      entityType: 'PRODUCT';
      reason: string;
      item: EnterpriseProductSummary;
    };

export type CatalogAssistantProgress = {
  stage: CatalogAssistantStage;
  page?: number;
  maxPages?: number;
  candidateCount?: number;
  messageKey: string;
};

export type CatalogAssistantRunResult = {
  plan: CatalogAssistantPlan;
  summary: string;
  clarification?: string;
  results: CatalogAssistantTrustedResult[];
  fallback: boolean;
};

export class CatalogAssistantCancelledError extends Error {
  constructor() {
    super('catalog assistant request cancelled');
    this.name = 'CatalogAssistantCancelledError';
  }
}
```

- [ ] **Step 2：实现候选压缩**

```ts
const companyCandidate = (item: EnterpriseCompanySummary): CatalogAssistantCandidate => ({
  id: item.companyId,
  name: item.name,
  industry: item.industry,
  region: [item.city, item.district].filter(Boolean).join(' / ') || undefined,
  summary: item.businessSummary?.slice(0, 500),
});

const productCandidate = (item: EnterpriseProductSummary): CatalogAssistantCandidate => ({
  id: item.productId,
  name: item.name,
  companyName: item.companyName,
  industry: item.industry ?? item.companyIndustry,
  region: [item.city, item.district].filter(Boolean).join(' / ') || undefined,
  summary: item.summary?.slice(0, 500),
});
```

候选 ID 用 `Map<string, T>` 去重，不转换成数字。

- [ ] **Step 3：实现固定上限分页**

常量：

```ts
const PAGE_SIZE = 20;
const MAX_PAGES = 5;
const MAX_CANDIDATES = 100;
const FALLBACK_RESULTS = 3;
```

分页循环：

```ts
for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum += 1) {
  assertActive(requestId, signal, isCurrent);
  emit({
    stage: 'SEARCHING',
    page: pageNum,
    maxPages: MAX_PAGES,
    candidateCount: byId.size,
    messageKey: 'enterprise.catalogAssistant.searchingPage',
  });
  const response =
    plan.entityType === 'COMPANY'
      ? await client.request({ operation: 'company.list', payload: companyQuery(plan, pageNum) })
      : await client.request({ operation: 'product.list', payload: productQuery(plan, pageNum) });
  appendUnique(byId, response.data.list, MAX_CANDIDATES);
  if (response.data.list.length === 0 || pageNum >= response.data.pages || byId.size >= MAX_CANDIDATES) break;
}
```

查询始终设置 `province: '辽宁省'`，并只映射计划允许的四个字段。

- [ ] **Step 4：实现排序与可信合并**

```ts
const rank = await client.request({
  operation: 'catalogAssistant.rank',
  payload: { message, plan, candidates: compactCandidates },
});

const trusted = rank.data.items.flatMap((ranked) => {
  const item = byId.get(ranked.id);
  return item ? [{ entityType: plan.entityType, item, reason: ranked.reason }] : [];
});
```

渲染前再次限制数量为 `plan.resultLimit`。未知、重复 ID 即使逃过服务端校验也不能显示。

- [ ] **Step 5：实现排序失败降级**

`rank` 抛错但候选非空时：

```ts
const trusted = [...byId.values()].slice(0, Math.min(FALLBACK_RESULTS, plan.resultLimit)).map((item) => ({
  entityType: plan.entityType,
  item,
  reason: '符合当前检索条件',
}));
```

摘要使用固定 i18n 状态标识 `enterprise.catalogAssistant.fallbackSummary`，不把错误伪装成 AI 排序。

- [ ] **Step 6：实现取消和旧请求隔离**

编排器接受：

```ts
run(input: {
  requestId: string;
  message: string;
  context?: CatalogAssistantContext;
  signal: AbortSignal;
  onProgress: (progress: CatalogAssistantProgress) => void;
  isCurrent: (requestId: string) => boolean;
}): Promise<CatalogAssistantRunResult>
```

每次状态提交调用：

```ts
const assertActive = (
  requestId: string,
  signal: AbortSignal,
  isCurrent: (requestId: string) => boolean
): void => {
  if (signal.aborted || !isCurrent(requestId)) throw new CatalogAssistantCancelledError();
};
```

当前页失败只允许 UI 重试一次；重试时复用有效 `plan` 和已成功候选，不重复调用 `plan`。

---

### Task 6：实现复用 Provider、助手 UI 和结果卡片

**Files:**

- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\CatalogAssistantProvider.tsx`
- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\CatalogAiAssistant.tsx`
- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\CatalogAssistantResultCard.tsx`
- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\catalog-ai-assistant.module.css`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\EnterpriseShell.tsx`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\enterprise-shell.css`

- [ ] **Step 1：实现运行周期 Provider**

Provider 状态：

```ts
type CatalogAssistantSessionState = {
  message: string;
  context?: CatalogAssistantContext;
  progress: CatalogAssistantProgress;
  summary?: string;
  clarification?: string;
  results: CatalogAssistantTrustedResult[];
  lastSuccessfulPlan?: CatalogAssistantPlan;
};
```

Provider 暴露：

```ts
type CatalogAssistantContextValue = CatalogAssistantSessionState & {
  submit: (message: string) => Promise<void>;
  stop: () => void;
  retry: () => Promise<void>;
  clear: () => void;
};
```

`submit` 创建 `crypto.randomUUID()` 请求 ID 和新的 `AbortController`。`clear` 先取消当前任务，再恢复初始状态。Provider 不使用 localStorage、SQLite 或云端会话表。

- [ ] **Step 2：实现多轮结构化上下文更新**

完成后写入：

```ts
{
  lastEntityType: plan.entityType,
  lastFilters: plan.filters,
  lastResultCount: results.length,
  lastUserMessage: message,
  lastSummary: summary,
  excludedIds: results.map(result =>
    result.entityType === 'COMPANY' ? result.item.companyId : result.item.productId
  ).slice(0, 6),
}
```

澄清态保留旧上下文，只更新 `lastUserMessage`；下一次提交时由 cloud-api 合并语义。

- [ ] **Step 3：实现结果卡片**

企业卡片显示：

```tsx
<img src={safeLogo} alt='' />
<strong>{item.name}</strong>
<span>{item.industry ?? t('enterprise.common.notProvided')}</span>
<span>{formatRegion(item.city, item.district)}</span>
<p className={styles.reason}>{reason}</p>
<Button onClick={() => navigate(`/enterprise/companies/${item.companyId}`)}>
  {t('enterprise.catalogAssistant.viewCompany')}
</Button>
```

产品卡片对应 `/enterprise/products/${item.productId}`。图片继续使用现有安全图片解析函数，不使用模型 URL。卡片不展示电话、联系人或详细地址。

- [ ] **Step 4：实现助手主体**

使用 Ant Design `Input.TextArea`、`Button`、`Progress`、`Empty`、`Alert`：

- 首屏标题“产业检索助手”和 3 个示例按钮。
- 最近一轮用户消息最多显示 2 行。
- 进度区只显示真实阶段、页码和候选数。
- 澄清问题显示为独立提示。
- 结果最多 6 张纵向卡片。
- `停止检索` 仅在 `PLANNING`、`SEARCHING`、`RANKING` 显示。
- `重试` 仅在 `FAILED` 显示。
- `清空会话` 在存在消息、澄清或结果时显示。
- 输入区固定在底部，Enter 提交、Shift+Enter 换行。

- [ ] **Step 5：接入 EnterpriseShell**

路由判断：

```ts
const isCatalogAssistantRoute =
  location.pathname.startsWith('/enterprise/companies') ||
  location.pathname.startsWith('/enterprise/products');
```

`EnterpriseShell` 在 `EnterpriseAntdProvider` 内、路由内容之上挂载一次 `CatalogAssistantProvider`。`aside` 内容：

```tsx
{isCatalogAssistantRoute ? (
  <CatalogAiAssistant />
) : (
  <EnterpriseAssistantPlaceholder />
)}
```

把当前静态占位内容提取为 `EnterpriseAssistantPlaceholder` 本地小组件，避免复制。

- [ ] **Step 6：修正展开宽度与滚动**

`enterprise-shell.css`：

```css
:root {
  --enterprise-assistant-width: 360px;
}

.enterprise-assistant {
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

@media (max-width: 1180px) {
  .enterprise-assistant {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    width: min(360px, calc(100vw - var(--enterprise-sider-width)));
    z-index: 20;
    box-shadow: -12px 0 32px rgb(15 46 87 / 14%);
  }
}
```

模块 CSS 使用三段网格：

```css
.assistant {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
}

.content {
  min-height: 0;
  overflow-y: auto;
}

.reason {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
```

---

### Task 7：补全 10 个语言包和类型

**Files:**

- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\locales\zh-CN\enterprise.json`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\locales\zh-TW\enterprise.json`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\locales\en-US\enterprise.json`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\locales\de-DE\enterprise.json`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\locales\ja-JP\enterprise.json`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\locales\ko-KR\enterprise.json`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\locales\pt-BR\enterprise.json`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\locales\ru-RU\enterprise.json`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\locales\tr-TR\enterprise.json`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\locales\uk-UA\enterprise.json`
- Modify generated: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\i18n-keys.d.ts`

- [ ] **Step 1：加入完整键集合**

所有语言包具有相同结构：

```json
{
  "catalogAssistant": {
    "title": "产业检索助手",
    "capability": "可查询企业码和重点产品",
    "placeholder": "描述您想查找的企业或产品",
    "submit": "开始检索",
    "stop": "停止检索",
    "retry": "重试",
    "clear": "清空会话",
    "viewCompany": "查看企业码",
    "viewProduct": "查看重点产品",
    "planning": "正在理解需求",
    "recognizedCompany": "已识别为企业码",
    "recognizedProduct": "已识别为重点产品",
    "searchingPage": "正在检索第 {{page}}/{{maxPages}} 页",
    "candidateCount": "已收集 {{count}} 条候选",
    "ranking": "正在筛选最匹配结果",
    "fallbackSummary": "已按检索条件返回结果",
    "fallbackReason": "符合当前检索条件",
    "noResults": "暂未找到符合条件的结果",
    "broadenHint": "可以尝试减少地区或关键词限制",
    "planFailed": "暂时无法理解检索需求，请重试",
    "searchFailed": "目录服务暂时不可用，请稍后重试",
    "cancelled": "已停止本次检索",
    "examples": {
      "company": "找沈阳做精密机械加工的企业",
      "product": "查沈北新区的不锈钢加工产品",
      "service": "找能够提供包装印刷服务的企业"
    }
  }
}
```

其他九种语言使用对应本地化译文，不能复制中文占位。

- [ ] **Step 2：重新生成类型**

Run:

```powershell
bun run i18n:types
node scripts/check-i18n.js
```

Expected:

- `i18n-keys.d.ts` 包含 `enterprise.catalogAssistant.*`。
- 10 个语言包结构检查通过，没有缺失键。

该步骤属于代码生成和结构检查，不执行功能测试。

---

### Task 8：开发完成后补充 cloud-api 功能完整性与风险测试

**Files:**

- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\test\java\com\zzy\cloud\api\service\catalogai\CatalogAiAssistantServiceImplTest.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\test\java\com\zzy\cloud\api\service\catalogai\CatalogAiModelGatewayImplTest.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\test\java\com\zzy\cloud\api\controller\CatalogAiAssistantControllerTest.java`

- [ ] **Step 1：编写 Service 功能完整性测试**

覆盖：

```java
@Test void planRecognizesCompanyAndNormalizesLimit()
@Test void planRecognizesProduct()
@Test void planReturnsClarificationForBroadRequest()
@Test void rankKeepsOnlyCandidateIdsAndOrder()
```

断言企业/产品识别、3–6 数量、筛选字段和排序顺序。

- [ ] **Step 2：编写 Service 风险测试**

覆盖：

```java
@Test void planRejectsBlankAndOversizedMessage()
@Test void planDropsUnknownFilters()
@Test void rankAcceptsNegativeStringIds()
@Test void rankDropsDuplicateUnknownAndEmptyIds()
@Test void rankRejectsMoreThanOneHundredCandidates()
```

- [ ] **Step 3：编写模型网关风险测试**

使用 mock `DemandAiHttpTransport` 和 `DemandPublishMapper`：

```java
@Test void usesCatalogAssistantBusinessCode()
@Test void retriesThenFallsBackToNextProvider()
@Test void marksSuccessfulAndFailedModels()
@Test void rejectsUnsupportedProtocol()
@Test void rejectsNonJsonAssistantContent()
```

测试不发真实外网请求、不读取真实 API key。

- [ ] **Step 4：编写 Controller 契约测试**

MockMvc 验证：

- `POST /CatalogAiAssistantController/plan`
- `POST /CatalogAiAssistantController/rank`
- 校验错误返回 `validateFailed`。
- 模型异常返回固定失败文案。
- 响应中不包含 `apiKey`、`openId`、`phone`。

- [ ] **Step 5：运行目标测试**

Run:

```powershell
mvn -pl cloud-api -Dtest=CatalogAiAssistantServiceImplTest,CatalogAiModelGatewayImplTest,CatalogAiAssistantControllerTest test
```

Expected: BUILD SUCCESS，三个测试类全部通过。

---

### Task 9：开发完成后补充 Electron 功能完整性与风险测试

**Files:**

- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\tests\unit\enterprise\catalogAssistantOrchestrator.test.ts`
- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\tests\unit\enterprise\CatalogAiAssistant.dom.test.tsx`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\tests\unit\enterprise\enterpriseSchemas.test.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\tests\unit\enterprise\enterpriseApiClient.test.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\tests\unit\enterprise\EnterpriseRouter.dom.test.tsx`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\tests\unit\enterprise\enterpriseResponsiveShell.test.ts`

- [ ] **Step 1：编写编排器功能完整性测试**

覆盖：

```ts
it('uses company.list for a company plan and returns trusted company cards')
it('uses product.list for a product plan and returns trusted product cards')
it('passes structured context for city and entity follow-ups')
it('uses deterministic candidates when rank fails')
```

Mock `EnterpriseClient.request`，不请求真实 cloud-api。

- [ ] **Step 2：编写编排器风险测试**

覆盖：

```ts
it('stops after five pages and one hundred unique candidates')
it('deduplicates ids without converting negative ids to unsigned values')
it('drops rank ids that were not present in candidates')
it('does not publish stale results after a newer request starts')
it('does not publish progress after abort')
it('does not search when plan asks for clarification')
```

- [ ] **Step 3：编写助手 DOM 功能测试**

使用 Testing Library 覆盖：

- 示例按钮能填入并提交。
- 真实阶段、页码和候选数可见。
- 企业与产品结果卡片显示正确字段。
- 点击卡片进入正确详情路径。
- Enter 提交、Shift+Enter 换行。
- 停止、重试、清空按钮在正确状态出现。
- 详情跳转不会销毁 Provider 会话。

- [ ] **Step 4：扩充契约与路由风险测试**

断言：

- 两个新 IPC 请求拒绝额外字段和超过 100 个候选。
- 规划响应拒绝非法实体类型、非法数量。
- 排序响应拒绝空 ID、超过 6 项。
- 白名单地址不可被运行时篡改。
- 主进程要求已注册身份但不向模型接口发送 openId/userId/companyId。
- 企业码和重点产品路由显示 AI 助手，其他页面显示现有占位内容。

- [ ] **Step 5：运行目标测试**

Run:

```powershell
bunx vitest run `
  tests/unit/enterprise/catalogAssistantOrchestrator.test.ts `
  tests/unit/enterprise/CatalogAiAssistant.dom.test.tsx `
  tests/unit/enterprise/enterpriseSchemas.test.ts `
  tests/unit/enterprise/enterpriseApiClient.test.ts `
  tests/unit/enterprise/EnterpriseRouter.dom.test.tsx `
  tests/unit/enterprise/enterpriseResponsiveShell.test.ts
```

Expected: 目标测试全部 PASS，无未处理 Promise、React act 警告或控制台异常。

---

### Task 10：执行集成冒烟和最终风险验证

**Files:**

- Modify only if a verified defect is found: files already listed in Tasks 1–9

- [ ] **Step 1：编译 cloud-api**

Run from `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service`:

```powershell
mvn -pl cloud-api -am -DskipTests package
```

Expected: BUILD SUCCESS，生成 `cloud-api\target\cloud-api-1.0-SNAPSHOT.jar`。

- [ ] **Step 2：运行 Electron 类型与格式检查**

Run from `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC`:

```powershell
bun run typecheck:enterprise-tests
bun run lint
bun run format:check
node scripts/check-i18n.js
```

Expected: 全部退出码 0；如果仓库已有与本功能无关的格式问题，只记录基线并对本次文件执行定向 `oxfmt --check`，不得批量重写用户修改。

- [ ] **Step 3：构建 Electron**

Run:

```powershell
bun run package
```

Expected: Electron Vite build 成功，`out/main/index.js`、preload 和 renderer 产物完整。

- [ ] **Step 4：本地集成冒烟**

启动本地 cloud-api 和 Electron dev 后依次验证：

1. “找沈阳做精密机械加工的企业”返回企业卡片并可进入企业码详情。
2. “查沈北新区的不锈钢加工产品”返回产品卡片并可进入重点产品详情。
3. 追问“只看沈阳的”保留原实体和关键词、覆盖城市。
4. 追问“换成重点产品”切换实体类型。
5. 宽泛输入“帮我找一下”只显示澄清问题，不调用列表分页。
6. 模拟 rank 失败仍返回前三条候选，并显示固定降级摘要。
7. 快速连续提交或点击停止后，旧请求不覆盖当前 UI。
8. 在窄窗口展开助手时，助手以抽屉覆盖，企业/产品列表仍可滚动。

- [ ] **Step 5：检查敏感信息和变更范围**

Run:

```powershell
rg -n "sk-|Bearer\\s+[A-Za-z0-9_-]{20,}|API_KEY\\s*=|apiKey" `
  E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC `
  E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main
git -C E:\ZZY_PROJECT\AI_lianliao diff --check
git -C E:\ZZY_PROJECT\lianshang_liaoning\cloud-service diff --check
```

Expected:

- 没有新增明文模型密钥、Token、SSH 或数据库凭据。
- `apiKey` 只出现在已有服务端配置对象和安全检查中，不进入响应 DTO。
- 两个仓库 `diff --check` 通过。
- 不执行 `catalog_ai_assistant_model.sql`，不提交、不推送。

---

## 完成定义

- cloud-api `plan`、`rank` 可用，且模型故障转移、输出结构和候选子集约束生效。
- Electron 在企业码和重点产品页面复用同一个助手组件。
- 单轮最多 5 页、100 候选、6 条结果。
- 企业和产品负数 ID 完整保留。
- 多轮追问、取消、重试、旧请求隔离和排序降级可用。
- 结果卡片事实字段完全来自现有业务接口。
- 10 个语言包、类型、目标测试、编译和构建验证通过。
- 没有执行外部数据库修改，也没有提交或推送代码。

---

### Task 11：修复产品复合关键词零召回

**Files:**

- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\catalogAssistantOrchestrator.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\tests\unit\enterprise\catalogAssistantOrchestrator.test.ts`

- [x] **Step 1：先编写复合关键词回退测试**

新增用例，模拟严格查询为空、核心词查询命中：

```ts
it('retries a product capability phrase with its core product keyword without dropping location', async () => {
  const productQueries: Array<Extract<EnterpriseRequest, { operation: 'product.list' }>['payload']> = [];
  const request = vi.fn(async (input: EnterpriseRequest): Promise<EnterpriseResponse> => {
    if (input.operation === 'catalogAssistant.plan') {
      return {
        operation: input.operation,
        data: {
          entityType: 'PRODUCT',
          filters: {
            keyword: '不锈钢加工产品',
            city: '沈阳',
            district: '沈北新区',
          },
          resultLimit: 3,
          summary: '查询沈北新区不锈钢加工产品',
        },
      };
    }
    if (input.operation === 'product.list') {
      productQueries.push(input.payload);
      const list = input.payload.keyword === '不锈钢' ? [product('-22')] : [];
      return {
        operation: input.operation,
        data: { list, pageNum: 1, pageSize: 20, pages: 1, total: list.length },
      };
    }
    if (input.operation === 'catalogAssistant.rank') {
      return {
        operation: input.operation,
        data: {
          summary: '已找到匹配产品',
          items: [{ id: '-22', reason: '材质、加工能力和地区匹配' }],
        },
      };
    }
    throw new Error(`unexpected operation ${input.operation}`);
  });

  const result = await run(createClient(request));

  expect(productQueries.map((query) => query.keyword)).toEqual(['不锈钢加工产品', '不锈钢']);
  expect(productQueries[1]).toMatchObject({
    province: '辽宁省',
    city: '沈阳市',
    district: '沈北新区',
  });
  expect(result.results[0]?.item).toMatchObject({ productId: '-22' });
});
```

- [x] **Step 2：运行测试并确认缺陷**

Run:

```powershell
bunx vitest run tests/unit/enterprise/catalogAssistantOrchestrator.test.ts
```

Expected: 新用例 FAIL，第二次 `product.list` 尚未发生。

- [x] **Step 3：实现有界核心词回退**

在编排器中加入产品后缀常量和纯函数：

```ts
const PRODUCT_KEYWORD_SUFFIXES = ['加工产品', '加工服务', '加工件', '加工', '产品', '服务'] as const;

const productKeywordFallbacks = (keyword: string | undefined): string[] => {
  const normalized = optionalText(keyword);
  if (!normalized) return [];
  const fallbacks: string[] = [];
  for (const suffix of PRODUCT_KEYWORD_SUFFIXES) {
    if (!normalized.endsWith(suffix)) continue;
    const core = optionalText(normalized.slice(0, -suffix.length));
    if (core && core.length >= 2 && core !== normalized) fallbacks.push(core);
  }
  return [...new Set(fallbacks)];
};
```

`buildSearchPlans` 在原有严格计划之后，仅为 `PRODUCT` 计划追加核心词策略。追加计划保留 `province` 以外由编排器固定的全部城市、区县和有效行业条件；计划使用稳定键去重。

- [x] **Step 4：运行回归测试**

Run:

```powershell
bunx vitest run tests/unit/enterprise/catalogAssistantOrchestrator.test.ts
```

Expected: 目标测试文件全部 PASS，已有行业回退顺序保持不变。

- [x] **Step 5：执行定向静态验证**

Run:

```powershell
bun run typecheck:enterprise-tests
bunx oxfmt --check packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/catalogAssistantOrchestrator.ts tests/unit/enterprise/catalogAssistantOrchestrator.test.ts
git diff --check
```

Expected: 全部退出码为 0；不修改 cloud-api、不执行数据库操作、不提交或推送。
