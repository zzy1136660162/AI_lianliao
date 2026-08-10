# Cross-Resource Catalog Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让链辽产业检索助手能够在企业码、重点产品、在建项目三个可信数据域间规划并执行检索，首版支持“先查产品、再按企业 ID 批量查企业”的跨资源推荐，并按匹配度和业务 `sort` 值稳定排序。

**Architecture:** `cloud-api` 只负责输出受限、可校验的结构化工作流与候选解释，Electron 通过资源适配器注册表执行白名单工具并保留事实数据控制权。首版关系边仅开放 `PRODUCT_SEARCH.companyId -> COMPANY_BATCH_GET.companyIds`，现有单资源检索保留为兼容回退。前端只展示结构化执行摘要，不展示模型内部思维链。

**Tech Stack:** React 19、TypeScript strict、Electron IPC、Ant Design、Spring Boot、MyBatis、Oracle、MiniMax OpenAI 兼容接口、Vitest、JUnit 5。

**Execution note:** 用户明确要求先开发后测试，不采用 TDD；因此 Tasks 1-5 先实现，Task 6 再集中执行关键流程和高风险项验证。未经用户明确要求，不创建提交、不推送、不发布、不修改外部数据库数据。

---

### Task 1: 扩展桌面端共享工作流契约和边界校验

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/catalog-assistant/contracts.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/catalog-assistant/schemas.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/contracts.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/rawSchemas.ts`
- Test: `LianLiaoAIPC/tests/unit/enterprise/enterpriseSchemas.test.ts`

- [ ] **Step 1: 定义版本化工作流契约**

新增 `CatalogWorkflowTool`、`CatalogWorkflowStep`、`CatalogWorkflowPlan`、`CatalogWorkflowCandidate`、`CatalogWorkflowRankResult`。工具仅允许四个枚举值：

```ts
export type CatalogWorkflowTool =
  | 'COMPANY_SEARCH'
  | 'PRODUCT_SEARCH'
  | 'PROJECT_SEARCH'
  | 'COMPANY_BATCH_GET'

export interface CatalogWorkflowStep {
  id: string
  tool: CatalogWorkflowTool
  dependsOn: string[]
  input: Record<string, unknown>
  binding?: {
    fromStepId: string
    sourceField: 'companyId'
    targetField: 'companyIds'
  }
}
```

计划最多 5 步、依赖只能指向前序步骤、批量企业 ID 最多 100 个。ID 统一为非零有符号整数字符串，继续接受负数。

- [ ] **Step 2: 增加聚合结果和排序字段**

在企业与产品公共摘要中保留服务端 `SORT` 对应的 `sort` 数值，并为企业结果增加最多 3 条产品证据：

```ts
export interface CatalogProductEvidence {
  id: string
  name: string
  imageUrl?: string
  industry?: string
  sort: number
  reason: string
}
```

- [ ] **Step 3: 用 Zod 校验所有模型输出和 IPC 输入**

新增严格 schema，拒绝未知工具、重复步骤 ID、未来依赖、非法绑定、超过上限的数组和不合法 ID。模型返回非法计划时不执行任何网络工具，并进入现有失败/澄清路径。

### Task 2: 为 cloud-api 增加公开企业批量查询和业务排序字段

**Files:**
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/controller/CompanyController.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/CompanyServcie.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/impl/CompanyServcieImpl.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/dao/CompanyDao.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/resources/mapper/CompanyDao.xml`
- Modify: relevant company/product VO classes under `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/vo`
- Test: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/controller/CompanyControllerTest.java`

- [ ] **Step 1: 新增批量公开企业查询接口**

新增 `POST /cloud-api/CompanyController/getQiYeMaCompanyBatch`，请求：

```json
{"companyIds":["-8","1807"]}
```

接口规则：最多 100 个 ID；去重但保持请求顺序；只返回企业卡片所需公开字段；不返回联系人、手机、电话等受限字段；不存在的 ID 直接忽略。

- [ ] **Step 2: 使用单条 MyBatis IN 查询避免 N+1**

DAO 接收解析后的 `List<Long>`，XML 使用 `<foreach>` 生成绑定参数，不拼接 SQL 字符串。查询结果包含 `ID`、名称、Logo、行业、地区、简介、会员等级和 `NVL(SORT, 0) AS SORT`。

- [ ] **Step 3: 补齐列表业务排序值**

企业码和重点产品的列表结果均显式返回 `sort`。SQL 继续以业务现有的 `SORT DESC` 为默认顺序，Electron 在跨资源候选合并后再次应用稳定排序。

### Task 3: 为 cloud-api 增加版本化工作流规划和解释接口

**Files:**
- Create: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/dto/catalogai/CatalogWorkflowPlanRequestDTO.java`
- Create: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/dto/catalogai/CatalogWorkflowRankRequestDTO.java`
- Create: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/vo/catalogai/CatalogWorkflowPlanVO.java`
- Create: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/vo/catalogai/CatalogWorkflowRankVO.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/controller/CatalogAiAssistantController.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/CatalogAiAssistantService.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/impl/CatalogAiAssistantServiceImpl.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/impl/catalogai/CatalogAiPromptFactory.java`
- Test: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/service/catalogai/CatalogWorkflowValidationTest.java`

- [ ] **Step 1: 增加 workflowPlan 与 workflowRank 路由**

保留现有 `/plan`、`/rank`；新增版本化路由供新客户端使用。规划接口返回 `version=1`、意图、目标实体、最多 5 个步骤和一条面向用户的简短执行摘要。

- [ ] **Step 2: 限制模型只能生成白名单拓扑**

Prompt 明确要求：

```text
可用工具：COMPANY_SEARCH、PRODUCT_SEARCH、PROJECT_SEARCH、COMPANY_BATCH_GET。
只允许一条跨资源边：PRODUCT_SEARCH.companyId -> COMPANY_BATCH_GET.companyIds。
不得输出 SQL、URL、接口名、联系方式或内部思维过程。
```

服务端对 JSON 做二次确定性校验；非法计划返回业务失败而不是执行。

- [ ] **Step 3: 实现候选匹配等级与解释**

`workflowRank` 只能为候选赋予 `EXACT`、`STRONG`、`RELATED`、`WEAK` 四档匹配等级和一条简短事实解释，不允许改写实体字段，也不负责最终 `sort` 排序。

### Task 4: 接入 Electron 主进程白名单操作和响应规范化

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/normalizers.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/schemas.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/bridge/enterpriseBridge.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/enterpriseClient.ts`
- Test: `LianLiaoAIPC/tests/unit/enterprise/enterpriseApiClient.test.ts`

- [ ] **Step 1: 注册新操作**

增加四个操作常量：

```ts
'catalogAssistant.workflowPlan'
'catalogAssistant.workflowRank'
'company.batchGet'
'catalogAssistant.workflowCapabilities'
```

所有调用继续经过现有企业服务 IPC 白名单，不允许渲染进程传入任意 URL。

- [ ] **Step 2: 串行化请求并解析响应**

为工作流请求、候选数组和企业 ID 数组提供专用 serializer；对响应进行严格 schema 校验。`company.batchGet` 只暴露公开字段，桥接层继续执行敏感字段删除兜底。

- [ ] **Step 3: 保留滚动升级兼容**

新接口仅在明确返回“不支持该操作/路由不存在”时回退旧 `plan/rank`；超时、鉴权失败、服务异常不能伪装成旧版能力，应显示可重试错误。

### Task 5: 实现跨资源执行器、稳定排序和企业产品证据卡片

**Files:**
- Create: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/workflow/catalogWorkflowValidator.ts`
- Create: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/workflow/catalogWorkflowExecutor.ts`
- Create: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/workflow/catalogWorkflowRanking.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/catalogAssistantOrchestrator.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/CatalogAssistantProvider.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/CatalogAiAssistant.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/CatalogAssistantResultCard.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/catalog-ai-assistant.module.css`
- Modify: all 10 locale files under `LianLiaoAIPC/packages/i18n/src/locales/*/enterprise.json`
- Test: `LianLiaoAIPC/tests/unit/enterprise/catalogAssistantOrchestrator.test.ts`
- Test: `LianLiaoAIPC/tests/unit/enterprise/CatalogAiAssistant.dom.test.tsx`

- [ ] **Step 1: 在资源适配器注册表上执行拓扑计划**

执行器逐步校验依赖并调用已注册适配器。`PRODUCT_SEARCH` 复用产品列表分页，提取唯一 `companyId` 后交给 `COMPANY_BATCH_GET`。单次搜索最多扫描 5 页、100 条候选，批量查询最多 100 家企业，用户取消时终止后续步骤。

- [ ] **Step 2: 生成企业聚合结果**

每家企业附加最多 3 个命中的重点产品作为证据，同一企业下产品按 `product.sort DESC` 排序。企业最终比较器固定为：

```ts
matchLevel DESC
company.sort DESC
maxEvidenceProductSort DESC
dataCompleteness DESC
companyId ASC
```

其中 `matchLevel` 映射为 `EXACT=4`、`STRONG=3`、`RELATED=2`、`WEAK=1`。任何模型输出顺序都不能覆盖这个比较器。

- [ ] **Step 3: 提供结构化执行进度和会话追问**

界面显示“正在理解需求 / 正在检索重点产品 / 正在关联企业 / 正在整理结果”等业务阶段，不显示内部 Prompt 或推理文本。Provider 保留最近 10 轮摘要与当前候选范围，使“其中哪些在于洪区”能够在当前结果集上继续筛选。

- [ ] **Step 4: 优化紧凑证据卡片**

企业卡片继续以企业为主，增加最多 3 条产品缩略证据，包含图片、产品名和匹配原因；点击企业进入企业码详情，点击产品进入重点产品详情。默认展示 6 家，用户明确要求更多时最多 50 家。

- [ ] **Step 5: 补齐全部语言资源**

新增工作流阶段、跨资源失败、结果证据、继续筛选等文案，并在 10 个 locale 的 `enterprise.json` 中保持键集合一致；中文界面不得出现裸英文工具名。

### Task 6: 集中验证关键流程和高风险项

**Files:**
- Modify only if validation finds defects in files from Tasks 1-5.

- [ ] **Step 1: 校验 cloud-api 编译与聚焦测试**

Run:

```powershell
cd E:\ZZY_PROJECT\lianshang_liaoning\cloud-service
mvn -pl cloud-api -am -DskipTests compile
mvn -pl cloud-api -am -Dtest=CatalogWorkflowValidationTest,CompanyControllerTest test
```

Expected: 编译成功；工作流白名单、非法依赖、负数 ID、批量上限和公开字段测试通过。

- [ ] **Step 2: 校验桌面端类型和聚焦测试**

Run:

```powershell
cd E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
bun run typecheck
bun run test -- tests/unit/enterprise/enterpriseSchemas.test.ts tests/unit/enterprise/enterpriseApiClient.test.ts tests/unit/enterprise/catalogAssistantOrchestrator.test.ts tests/unit/enterprise/CatalogAiAssistant.dom.test.tsx
```

Expected: TypeScript strict 无错误；单资源检索、产品转企业、重复企业去重、`sort` 降序、取消、旧服务回退和证据卡片测试通过。

- [ ] **Step 3: 做最小生产构建验证**

Run:

```powershell
cd E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
bun run build
```

Expected: Electron main/preload/renderer 构建完成，不触发正式安装包发布，也不下载或替换 Core。

- [ ] **Step 4: 手工冒烟三个代表性问题**

验证：

```text
沈阳做航空箱的企业有哪些
找沈阳近期采购机电设备的在建项目
其中哪些在于洪区
```

Expected: 第一个问题执行“重点产品→企业码”并展示企业与产品证据；第二个问题只查询在建项目；第三个问题在上一轮候选范围内继续筛选。单个数据域失败时展示对应失败说明，不伪造结果。

---

## Self-review

- Spec coverage: 覆盖三个资源域、首条产品到企业关系边、白名单、批量接口、证据卡片、会话追问、排序和滚动兼容。
- Security boundary: 模型不接触任意 URL/SQL，批量接口不返回联系方式，ID 保留非零有符号整数规则。
- Scope control: 首版没有加入企业反查产品、项目反查企业或通用图执行器；这些关系必须后续显式注册。
- Delivery boundary: 本计划不包含提交、推送、部署、数据库数据变更或安装包发布。
