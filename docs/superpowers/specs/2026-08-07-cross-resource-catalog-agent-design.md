# 产业检索助手跨资源工具编排设计

## 文档状态

- 日期：2026-08-07
- 状态：交互与架构已确认，待书面规格审阅
- 适用范围：
  - Electron：`E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC`
  - 服务端：`E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api`
- 关联设计：`2026-07-30-catalog-ai-assistant-design.md`

## 背景

现有产业检索助手已经支持由模型在企业码、重点产品和在建项目中选择一种资源，随后由 Electron 调用对应资源适配器分页检索，再由模型从真实候选中排序。该流程能够处理“找沈阳精密机械加工企业”或“查沈北新区不锈钢加工产品”等单资源问题。

“沈阳做航空箱的企业有哪些”属于跨资源问题。企业名称、行业和企业简介不一定出现“航空箱”，但重点产品数据包含产品名称、所属企业名称和 `companyId`。可靠的检索方式应先查询航空箱相关产品，再根据产品返回的真实 `companyId` 批量查询企业档案，最终向用户展示企业及命中产品证据。

当前实现不能表达这种依赖关系：

- `CatalogAssistantPlan` 一次只能选择一个 `entityType`。
- `CatalogAssistantOrchestrator` 一次只取得一个资源适配器并执行。
- 资源适配器注册表按实体类型注册，没有工具输入输出关系。
- 当前结果作用域只能描述单一实体结果，不能保存企业与来源产品之间的证据关系。
- 产品响应已经包含 `companyId`，但缺少使用该 ID 集合批量补齐企业档案的桌面业务接口。
- 企业和产品业务表包含 `sort`，但 Electron 的公开数据契约没有完整保留该字段。

本设计在现有安全边界上增加结构化工具计划和有界执行器，不把任意接口、SQL 或业务事实交给模型。

## 目标

1. 让模型根据用户需求自主选择一个或多个已注册的只读产业工具。
2. 首版支持通过重点产品的真实 `companyId` 查找企业，即 `PRODUCT_SEARCH → COMPANY_BATCH_GET`。
3. 最终以企业码为主结果，每家企业最多展示三个命中产品作为推荐证据。
4. 支持“其中哪些在沈北新区”“换一批”等基于跨资源结果的连续追问。
5. 保证企业、产品和项目事实只来自可信业务接口，模型只负责规划、匹配等级和解释。
6. 将业务 `sort` 纳入确定性排序：同一语义匹配等级内，数值越大越靠前。
7. 对工具数量、翻页、候选、依赖关系、超时、取消和模型输出设置硬限制。
8. 单个模型或业务步骤失败时尽可能返回可信的部分结果或确定性降级结果。

## 非目标

- 不公开、保存或展示模型的原始内部思维文本。
- 不允许模型生成 SQL、表名、URL、Controller 路径或未注册工具。
- 不让模型直接读取数据库或修改企业、产品、项目和供需数据。
- 首版不开放任意资源之间的自由组合。
- 首版不通过企业名称等非唯一文本猜测跨资源关联关系。
- 首版不开放在建项目到企业或产品的跨资源关系；必须先确认可靠关联 ID 和业务语义。
- 不在模型上下文或结果卡片中增加联系人、电话和详细地址。
- 不把完整检索会话持久化到云端数据库。
- 本次不修改或发布 `LianLiaoAICore`。

## 已确认的产品决策

### 白名单跨资源关系

第一版只启用存在明确业务关联 ID 的调用链：

```text
PRODUCT_SEARCH.companyId → COMPANY_BATCH_GET.companyIds
```

以下关系保留扩展位，但第一版不启用：

```text
COMPANY_SEARCH.companyId → PRODUCT_SEARCH.companyId
PROJECT_SEARCH → COMPANY/PRODUCT
```

### 结果形态

跨资源问题的最终目标决定主卡片类型。“做航空箱的企业有哪些”的最终目标是企业，因此展示企业码卡片；命中的航空箱产品作为证据嵌入企业卡片，不将产品卡片与企业卡片混排。

### 排序原则

最终排序不直接采用模型返回数组顺序。模型只输出受限的语义匹配等级和推荐理由，Electron 使用可信业务字段完成确定性排序：

```text
语义匹配等级 DESC
→ 企业 sort DESC
→ 命中产品最大 sort DESC
→ 企业资料完整度 DESC
→ companyId 稳定排序
```

这样能够保证高 `sort` 数据优先，同时避免完全不相关但 `sort` 很大的企业排到相关企业之前。

### 会话范围

会话保留在当前 Electron 运行周期内，在工作台首页、企业码、重点产品和在建项目页面间切换时不清除。用户主动清空、退出登录或退出应用后清除，不写入长期聊天表。

## 总体架构

采用“cloud-api 结构化规划、Electron 白名单执行、cloud-api 候选排序、Electron 可信渲染”的分层方案。

```mermaid
flowchart LR
    U["用户自然语言"] --> P["cloud-api 生成结构化计划"]
    P --> V["Electron 计划校验器"]
    V --> E["白名单工具执行器"]
    E --> PS["重点产品分页查询"]
    PS --> X["提取并去重 companyId"]
    X --> CB["企业公开档案批量查询"]
    CB --> C["可信企业候选和产品证据"]
    C --> R["cloud-api 标注匹配等级和理由"]
    R --> S["Electron 确定性排序"]
    S --> UI["企业主卡片和匹配产品"]
```

### cloud-api 职责

- 识别用户最终目标实体。
- 提取关键词、行业、地区、项目品类、材料和绝对日期。
- 判断是否需要跨资源查询。
- 从已注册工具集合生成结构化执行计划。
- 对紧凑可信候选标注语义匹配等级和推荐理由。
- 对模型输入输出执行字段、长度、数量和候选子集校验。

跨资源协议使用新增操作 `catalogAssistant.workflowPlan` 和 `catalogAssistant.workflowRank`。现有 `catalogAssistant.plan` 与 `catalogAssistant.rank` 在兼容期内保持原响应结构，避免旧版 Electron 遇到新 cloud-api 时被严格 Schema 拒绝。

### Electron 职责

- 校验计划版本、步骤、工具、参数和依赖关系。
- 通过现有主进程企业桥调用允许列表中的业务操作。
- 控制翻页、候选数、总步骤、超时和取消。
- 从可信工具输出中提取关联 ID。
- 聚合企业与命中产品证据。
- 执行最终确定性排序。
- 保存当前结构化结果作用域。
- 将执行状态转换成用户可见的简短进度。

### 业务接口职责

- 执行真实企业、产品和项目查询。
- 执行数据库条件、删除状态、公开状态和权限规则。
- 返回经过标准化和脱敏的业务事实。
- 不接受模型生成的任意 SQL 或动态接口路径。

## 工具注册表

### 第一版注册工具

| 工具 | 输入 | 输出 | 第一版用途 |
|---|---|---|---|
| `COMPANY_SEARCH` | 关键词、行业、辽宁省内地区、分页 | 企业摘要页 | 单资源企业检索 |
| `PRODUCT_SEARCH` | 关键词、行业、辽宁省内地区、分页 | 产品摘要页，包含 `companyId` | 单资源产品检索和产品找企业 |
| `PROJECT_SEARCH` | 关键词、品类、材料、地区、时间、分页 | 项目摘要页 | 单资源在建项目检索 |
| `COMPANY_BATCH_GET` | 企业 ID 集合 | 企业公开档案集合 | 补齐产品关联企业 |
| `PRODUCT_BATCH_GET` | 产品 ID 集合 | 产品公开档案集合 | 仅预留契约，不在第一版规划提示词中开放 |

工具名称只存在于共享契约和注册表中。模型收到的是工具说明和 JSON Schema，不接触 REST 地址。注册表适配器内部继续使用 `EnterpriseClient`，渲染进程不直接发起网络请求。

### 工具描述

每个工具定义：

- 固定工具名和版本。
- 输入 Schema。
- 输出实体类型。
- 允许被引用的输出字段。
- 页大小和最大页数。
- 进度消息键。
- 搜索、标准化、可信候选转换和详情补齐函数。
- 可接受的上游工具和引用字段。

现有按 `CatalogEntityType` 注册的适配器应作为工具实现复用，不复制企业、产品和项目分页逻辑。

## 结构化执行计划

### 版本化规划操作

新增允许列表操作：

```text
catalogAssistant.workflowPlan
catalogAssistant.workflowRank
```

对应 cloud-api 路径建议为：

```text
POST /cloud-api/CatalogAiAssistantController/workflowPlan
POST /cloud-api/CatalogAiAssistantController/workflowRank
```

不直接改变现有 `/plan` 和 `/rank` 的返回结构。新 Electron 优先调用工作流接口；服务端明确返回不支持该操作时，退回旧单资源接口。网络错误或模型错误不能误判为“旧服务”，应按正常失败与重试规则处理。

### 计划示例

```json
{
  "version": 1,
  "mode": "NEW_SEARCH",
  "goal": {
    "finalEntityType": "COMPANY",
    "resultLimit": 6
  },
  "steps": [
    {
      "stepId": "products",
      "tool": "PRODUCT_SEARCH",
      "arguments": {
        "keyword": "航空箱",
        "province": "辽宁省",
        "city": "沈阳市"
      }
    },
    {
      "stepId": "companies",
      "tool": "COMPANY_BATCH_GET",
      "arguments": {
        "companyIds": {
          "sourceStepId": "products",
          "sourceField": "companyId",
          "distinct": true,
          "limit": 100
        }
      }
    }
  ],
  "summary": "先查询航空箱相关重点产品，再补充关联企业档案"
}
```

### 核心共享类型

```ts
type CatalogToolName =
  | 'COMPANY_SEARCH'
  | 'PRODUCT_SEARCH'
  | 'PROJECT_SEARCH'
  | 'COMPANY_BATCH_GET'
  | 'PRODUCT_BATCH_GET';

type CatalogToolOutputReference = {
  sourceStepId: string;
  sourceField: 'companyId' | 'productId';
  distinct: true;
  limit: number;
};

type CatalogWorkflowPlan = {
  version: 1;
  mode: CatalogConversationMode;
  baseScopeId?: string;
  goal: {
    finalEntityType: CatalogEntityType;
    resultLimit: number;
  };
  steps: CatalogWorkflowStep[];
  clarification?: string;
  summary: string;
};
```

不使用通用 JSONPath、表达式语言或可执行脚本作为步骤引用。`sourceField` 必须来自固定枚举，避免模型构造任意数据访问路径。

### 计划校验

Electron 执行前强制验证：

1. `version` 必须为受支持版本。
2. 步骤数量必须为 1 至 5。
3. `stepId` 唯一且符合短标识符格式。
4. 每个工具必须存在于本地注册表。
5. 参数必须通过对应严格 Schema，额外字段直接拒绝。
6. 步骤引用只能指向更早的步骤，禁止循环和前向引用。
7. 引用字段必须在上游工具的公开输出字段中。
8. 工具关系必须存在于白名单关系矩阵中。
9. 最终步骤的输出类型必须能够生成 `goal.finalEntityType`。
10. 企业和产品查询必须限制在辽宁省。
11. ID 必须作为字符串传递，支持非零有符号整数。
12. 单次引用最多提取 100 个去重 ID。
13. 计划包含 URL、SQL、表名、未知工具或未知字段时拒绝执行。

计划校验失败不尝试“尽量执行”非法步骤。对于语义明确的问题，可以退回本地保守规划器；否则向用户提出一个简短澄清问题。

## 执行状态机

### 阶段

在现有 `PLANNING / SEARCHING / RANKING` 基础上增加工具级状态：

```text
PLANNING
→ VALIDATING_PLAN
→ EXECUTING_TOOLS
→ LINKING_RESULTS
→ RANKING
→ SORTING
→ COMPLETED
```

每个工具步骤拥有：

```ts
type CatalogToolExecution = {
  stepId: string;
  tool: CatalogToolName;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  pagesRead: number;
  totalCandidates: number;
  durationMs: number;
  errorCode?: string;
};
```

### 有界执行

- 一个计划最多 5 个步骤。
- 单一分页工具最多读取 5 页。
- 每页继续沿用 20 条。
- 单轮原始候选最多 100 条。
- 关联 ID 去重后最多 100 条。
- 最终默认返回 6 条，最多 50 条。
- 整轮建议设置 60 秒总预算。
- 用户取消时通过现有 `AbortController` 停止后续分页、批量查询和排序。
- 不允许逐企业调用详情接口形成 N+1 请求。

## 企业批量公开档案接口

### Electron 操作

新增允许列表操作：

```text
company.batchGet
```

主进程固定映射到 cloud-api，不允许渲染进程传入 URL。

### cloud-api 路径

```text
POST /cloud-api/CompanyController/getQiYeMaCompanyBatch
```

### 请求

```json
{
  "companyIds": ["-8", "120", "360"]
}
```

登录用户的 `openId`、`userId` 和当前企业身份继续由 Electron 主进程会话统一附加，不从模型计划中读取。

### 响应字段

- `companyId`
- `name`
- `shortName`
- `logoUrl`
- `industry`
- `province`
- `city`
- `district`
- `businessSummary`
- `companyLevel`
- `sort`

接口不返回联系人、电话和详细地址。以后需要联系方式时仍必须走现有会员权限获取流程，不能通过 AI 批量接口绕过。

### 服务端约束

- `companyIds` 必填，去重后数量为 1 至 100。
- 每个 ID 必须符合非零有符号整数文本格式。
- SQL 使用 MyBatis 参数化 `foreach`。
- 仅查询 `DEL_SIGN='N'` 和正常企业类型。
- 不依赖数据库返回顺序；Electron 按最终比较器排序。
- 缺失或无权查看的企业不返回虚假占位对象。

## `sort` 字段与最终排序

### 数据来源

- 企业：`J_CY_COMPANY.SORT`。
- 产品：`J_NEW_PRODUCTS.SORT`。
- 在建项目：当前没有相同含义的业务 `sort`，继续使用发布日期和现有项目查询排序。

企业列表需要显式查询 `SORT`。产品 SQL 已通过产品表字段返回 `SORT`，但 Electron 原始 Schema、标准化器和公共类型需要保留它。

### 契约

```ts
type EnterpriseCompanySummary = {
  // existing fields
  sort?: number;
};

type EnterpriseProductSummary = {
  // existing fields
  sort?: number;
};
```

模型候选中不直接复用含混的字段名，使用：

```ts
type CatalogRankingCandidate = {
  id: string;
  businessSort: number;
  evidenceMaxBusinessSort?: number;
  // public compact fields
};
```

空值、非法值和非有限数字在标准化阶段按 `0` 处理。模型无法提交或覆盖 `businessSort`。

### 匹配等级

排序模型只允许返回：

```text
EXACT
STRONG
RELATED
```

Electron 映射为固定权重后执行：

```text
企业结果：matchLevel DESC
→ company.sort DESC
→ max(matchedProduct.sort) DESC
→ profileCompleteness DESC
→ companyId ASC

产品结果：matchLevel DESC
→ product.sort DESC
→ productId ASC

项目结果：matchLevel DESC
→ publishedAt DESC
→ hpInfoId ASC
```

`profileCompleteness` 只根据 Logo、行业、地区和企业简介等公开字段计算，不使用会员联系方式。`companyId` 使用能够稳定处理负数和超长整数文本的字符串比较器，禁止转换成 JavaScript `number`。

## 可信证据聚合

产品查询完成后按 `companyId` 分组：

```ts
type CompanyProductEvidence = {
  companyId: string;
  products: Array<{
    productId: string;
    name: string;
    imageUrl?: string;
    summary?: string;
    sort: number;
  }>;
  maxProductSort: number;
};
```

每家企业的证据产品先按当前用户需求的关键词命中程度排序，再按产品 `sort` 降序，最终最多保留三个用于卡片展示。完整证据集合可以在本轮运行内用于排序，但不得无限写入会话上下文。

模型返回的企业 ID 必须属于批量企业接口的可信候选集合；产品 ID 必须属于对应企业的真实产品证据集合。不存在于候选集合中的 ID 和事实全部丢弃。

## 多轮会话

### 结构化作用域

现有单实体 `currentScope` 升级为能够保存跨资源证据的作用域：

```ts
type CatalogWorkflowScope = {
  scopeId: string;
  finalEntityType: CatalogEntityType;
  planDigest: CatalogWorkflowPlanDigest;
  resultIds: string[];
  evidenceByResultId: Record<string, CatalogEvidenceDigest[]>;
  sourceCursors: CatalogSourceCursor[];
  excludedSourceIds: string[];
  excludedResultIds: string[];
  createdAt: number;
};
```

只保存公开摘要和 ID，不保存联系人、电话、详细地址或完整详情对象。

### 追问语义

- “其中哪些在沈北新区”：`REFINE_CURRENT`，只在当前企业结果中筛选。
- “其中哪家航空箱产品更多”：使用当前企业与产品证据重新排序。
- “换一批”：`NEXT_BATCH`，继续源产品分页，并排除已展示产品和企业。
- “改成找产品”：`CHANGE_ENTITY`，生成新的单资源或白名单计划。
- “这些企业还有什么产品”：第一版白名单未开放企业到产品的反向查询时，应明确说明当前支持范围，不得自行拼接未授权调用链。

UI 最多展示最近 10 轮，规划模型接收最近 3 轮的紧凑文字摘要和当前结构化作用域摘要。当前结果最多 50 个，证据及关联 ID 最多 100 个。

## 用户界面

### 覆盖范围

同一 `CatalogAssistantProvider` 和助手组件覆盖：

- 工作台首页
- 企业码
- 重点产品
- 在建项目

页面间切换保留当前会话。供需发布继续使用独立的供需 AI 助手；产业助手只在用户确认后携带初始描述跳转。

### 可见执行轨迹

用户看到结构化进度，不看到原始内部思维：

```text
已识别目标：查找企业
正在查询“航空箱”相关重点产品
已找到 18 个产品，关联 9 家企业
正在补充企业公开档案
已筛选出 6 家推荐企业
```

执行中的步骤显示 loading，完成步骤可以折叠查看结果数量和耗时。失败步骤显示可理解的业务提示与重试入口，不显示内部接口名、堆栈和 SQL。

### 企业结果卡片

企业主卡片展示：

- 企业 Logo、名称和会员等级。
- 行业、城市和区县。
- 企业简介摘要。
- AI 推荐理由。
- 最多三个命中产品及安全图片。
- “查看企业码”和对应产品的“查看重点产品”。

卡片不展示内部 `sort`。联系方式继续在企业详情页通过现有权限流程获取。

## 错误处理与降级

### 规划失败

明确包含“地区 + 产品关键词 + 企业/厂家”的请求可以由本地保守规划器生成 `PRODUCT_SEARCH → COMPANY_BATCH_GET`。条件不明确时提出一个澄清问题，不执行猜测性跨查。

### 产品查询失败

如果没有任何可信产品候选，则停止跨资源链路，保留用户输入并提供重试。不得让模型直接生成企业答案。

### 企业批量查询失败

- 部分成功：保留成功企业并继续排序，进度标记为部分完成。
- 全部失败：可以使用产品接口已经返回的 `companyId`、`companyName` 和公开企业字段生成简化企业摘要，明确标记档案补充失败并提供重试。
- 简化摘要不能包含模型补写字段，不能假装已经取得企业详情。

### 排序失败

使用本地确定性降级排序：

```text
关键词命中程度 DESC
→ company.sort DESC
→ max(product.sort) DESC
→ companyId ASC
```

### 取消与重试

- 取消立即中止当前请求并阻止后续步骤启动。
- 重试从最近失败的安全检查点继续，不重复已完成且仍有效的只读步骤。
- 计划版本、工具注册版本或登录身份变化时，不得复用旧检查点，必须重新规划。

## 诊断日志

通用本地诊断日志记录：

- `requestId`、计划版本和最终目标。
- 工具名、`stepId`、步骤状态和依赖来源。
- 请求条件摘要、页数、候选数、去重数和耗时。
- 降级原因、错误代码和最终结果数量。
- 企业结果 ID 数量与产品证据数量。

正式环境不记录联系人、电话、认证信息、模型密钥和完整模型原文。开发环境只有在现有 `LIANLIAO_DIAGNOSTIC_SENSITIVE=1` 开启时才允许记录完整业务请求和模型响应；密钥、Token 和数据库凭据在任何环境都不得记录。

## 兼容与迁移

- 现有 `catalogAssistant.plan`、`catalogAssistant.rank` 及其 `/plan`、`/rank` 响应结构在兼容期内保持不变。
- cloud-api 先发布新增的 `workflowPlan`、`workflowRank` 和企业批量接口，Electron 再启用跨资源计划，满足双机滚动部署期间的向后兼容。
- 新 Electron 只有在服务端明确返回“操作不存在”时才退回旧单资源接口，不把超时、鉴权失败或模型失败当作旧版本。
- 旧单资源计划在新 Electron 内包装成一个步骤的工作流计划，继续复用统一执行器。
- 旧 Electron 继续调用原有 `/plan` 和 `/rank`，不会接收到不兼容的工作流响应。
- 新 Electron 遇到旧 cloud-api 时继续使用现有单资源检索，不尝试跨资源执行。
- 原有 REST 路径、WebSocket 事件和 AionCore 契约不变。
- 所有业务 ID 继续使用字符串，不改变负数 ID 兼容规则。

## 关键测试与验收

### 主流程

输入“沈阳做航空箱的企业有哪些”：

1. 计划最终目标为 `COMPANY`。
2. 第一步调用 `PRODUCT_SEARCH`，条件包含“航空箱”和“沈阳市”。
3. 产品结果的 `companyId` 正确去重，负数 ID 不丢失。
4. 第二步只使用第一步返回的 ID 调用 `COMPANY_BATCH_GET`。
5. 最终企业卡片包含真实企业档案和最多三个匹配产品。
6. 点击企业和产品分别进入正确详情页。

### 排序

- 相同语义等级下，企业 `sort` 较大者在前。
- 企业 `sort` 相同时，命中产品最大 `sort` 较大者在前。
- 高 `sort` 但不相关的企业不能越过语义相关企业。
- 空和非法 `sort` 按 `0` 处理。

### 多轮

- “其中哪些在沈北新区”只筛选当前企业结果。
- “其中哪家产品更多”使用当前证据重新排序。
- “换一批”排除已显示产品和企业，并从后续源分页继续。
- 清空、退出登录和退出应用后作用域被清除。

### 安全与边界

- 未注册工具、未知字段、额外参数、循环依赖和前向引用被拒绝。
- 模型返回候选集合外的企业或产品 ID 不显示。
- 单步骤最多 5 页、单轮最多 100 个候选、最终最多 50 个结果。
- 批量接口拒绝空数组、超过 100 个 ID 和非法 ID。
- 模型上下文和诊断日志默认不包含受限联系方式。

### 故障

- 规划模型不可用时，高置信度请求使用本地保守计划。
- 排序模型不可用时仍按确定性规则返回可信结果。
- 企业批量接口部分失败时仍展示成功企业。
- 用户取消后不再发起后续工具调用。
- 旧 cloud-api 环境仍能完成原有单资源检索。

## 实施顺序建议

1. 补充企业、产品 `sort` 字段的 cloud-api 与 Electron 契约。
2. 新增企业批量公开档案接口和 `company.batchGet` 允许列表操作。
3. 将资源适配器注册表升级为带输入输出描述的工具注册表。
4. 新增工作流计划 Schema、计划校验器和旧计划兼容包装。
5. 将编排器升级为有界多步骤执行器。
6. 增加企业与产品证据聚合和确定性排序。
7. 升级结构化会话作用域和多轮追问处理。
8. 完善进度轨迹、企业证据卡片、错误提示和诊断日志。
9. 完成 cloud-api、Electron 单元测试、类型检查和关键流程联调。

## 完成标准

- 模型能够为明确的跨资源问题生成合法工具计划。
- Electron 只执行已注册、已校验的只读工具。
- “沈阳做航空箱的企业有哪些”能够通过产品关联企业并展示可信卡片。
- 企业卡片展示真实命中产品证据。
- `sort` 在同一语义等级内严格降序生效。
- 连续追问和换一批不会错误扩大或污染当前结果作用域。
- 模型、批量接口和排序任一部分失败时具有明确、可信的降级行为。
- 不新增 N+1 查询，不泄露联系方式，不破坏旧 cloud-api 和旧单资源检索兼容性。
