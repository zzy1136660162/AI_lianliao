# Enterprise Code Workflow and AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在企业码核心工作台上完成企业/产品/项目收藏、项目解锁、商机跟进、右侧上下文 AI 助手和用户确认式结构化业务动作，形成可验收的业务闭环。

**Architecture:** 收藏写入 `J_CY_INTEREST`，项目收藏固定 `TYPE=6`；跟进写入 `J_OPP_LEAD`，与收藏状态分离。renderer 只发白名单命令，主进程自动注入当前 openid。AI 复用 AionUi 现有 assistant/conversation/side-question 能力，模型必须返回完整 JSON envelope；Zod 校验、当前实体一致性检查和用户确认三关全部通过后，才调用业务命令。解析失败只展示文字，不从自然语言提取写操作。

**Tech Stack:** Electron、React、TypeScript、Arco Design、SWR、Zod、AionUi conversation API、Vitest、Testing Library、Playwright

---

## 0. 前置条件与不可变规则

工作目录：`E:\ZZY_PROJECT\AI_lianliao\AionUi`

开始前确认：

1. [后端契约计划](./2026-07-14-enterprise-code-backend.md) 已部署测试环境；
2. [桌面核心计划](./2026-07-14-enterprise-code-desktop-core.md) 已完成；
3. 登录用户上下文包含 `openId/userId/companyId`；
4. 企业、产品、项目详情能返回稳定 ID。

业务映射：

```ts
export const FAVORITE_TYPE = {
  COMPANY: '1',
  PRODUCT: '2',
  PROJECT: '6',
} as const;

export type FollowStatus = 'NONE' | 'TODO' | 'DOING' | 'DONE';
```

任何收藏、取消收藏、解锁、加入跟进或更新跟进状态都必须等待服务端成功响应后更新 UI；失败时保留原状态并展示可重试错误。

## Task 1: 扩展白名单命令契约与主进程路由

**Files:**

- Modify: `packages/desktop/src/common/enterprise/contracts.ts`
- Modify: `packages/desktop/src/common/enterprise/schemas.ts`
- Modify: `packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts`
- Modify: `packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`
- Test: `tests/unit/enterprise/enterpriseCommandContracts.test.ts`

- [ ] **Step 1: 写失败测试——命令联合类型和状态 schema**

覆盖收藏类型只允许 `1/2/6`，跟进状态只允许 `NONE/TODO/DOING/DONE`，项目解锁必须有 `hpInfoId`。未知命令在发网络请求前失败。

Run: `bun run test -- tests/unit/enterprise/enterpriseCommandContracts.test.ts`

Expected: FAIL。

- [ ] **Step 2: 扩展请求联合类型**

```ts
export type EnterpriseCommandRequest =
  | { operation: 'favorite.status'; payload: { items: FavoriteTarget[] } }
  | { operation: 'favorite.save'; payload: FavoriteTarget }
  | { operation: 'favorite.remove'; payload: FavoriteTarget }
  | { operation: 'favorite.list'; payload: FavoriteListQuery }
  | { operation: 'lead.list'; payload: LeadListQuery }
  | { operation: 'lead.detail'; payload: { leadId: string } }
  | { operation: 'lead.update'; payload: LeadUpdateCommand }
  | { operation: 'project.unlock'; payload: { hpInfoId: string } };
```

`FavoriteTarget`：

```ts
export type FavoriteTarget = {
  type: '1' | '2' | '6';
  infoId: string;
};
```

- [ ] **Step 3: 添加固定后端路径**

```ts
'favorite.status': 'cloud-api/DesktopEnterpriseController/favorite/status',
'favorite.save': 'cloud-api/DesktopEnterpriseController/favorite/save',
'favorite.remove': 'cloud-api/DesktopEnterpriseController/favorite/remove',
'favorite.list': 'cloud-api/DesktopEnterpriseController/favorite/list',
'lead.list': 'cloud-api/OpportunityController/getMyLeadList',
'lead.detail': 'cloud-api/OpportunityController/getLeadDetail',
'lead.update': 'cloud-api/OpportunityController/updateLeadFollowStatus',
'project.unlock': 'cloud-api/OpportunityController/unlockAiMaterialProjectDetail',
```

- [ ] **Step 4: 由主进程注入身份**

所有命令从 `EnterpriseSessionStore` 读取 openid 并重新取得当前用户上下文；renderer payload 中出现 `openId/userId/companyId` 时忽略这些字段。`project.unlock` 额外注入 `userName/phone/companyLevel`，沿用后端现有权益判断。

- [ ] **Step 5: 运行测试并提交**

Run:

```bash
bun run test -- tests/unit/enterprise/enterpriseCommandContracts.test.ts tests/unit/enterprise/enterpriseApiClient.test.ts
bun run package
```

Expected: PASS / build 成功。

```bash
git add packages/desktop/src/common/enterprise/contracts.ts packages/desktop/src/common/enterprise/schemas.ts packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts tests/unit/enterprise/enterpriseCommandContracts.test.ts
git commit -m "feat(enterprise): add workflow command contracts"
```

## Task 2: 实现统一收藏状态和收藏按钮

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/favorites/favoriteData.ts`
- Create: `packages/desktop/src/renderer/pages/enterprise/favorites/FavoriteButton.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyListPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyDetailPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/ProductListPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/ProductDetailPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectTable.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectDetailPage.tsx`
- Test: `tests/unit/enterprise/favoriteData.test.ts`
- Test: `tests/unit/enterprise/FavoriteButton.dom.test.tsx`

- [ ] **Step 1: 写失败测试——状态 key 和批量分片**

`favoriteData` 以 `${type}:${infoId}` 为 SWR key。列表批量状态每次最多 200 条；超过时分片请求并合并，不丢失 false 状态。

- [ ] **Step 2: 写失败测试——服务端确认后才改变图标**

覆盖：保存成功、取消成功、请求失败、重复点击、组件卸载后的响应。请求中按钮 disabled；失败时状态不变并显示 `Message.error`。

- [ ] **Step 3: 实现 FavoriteButton**

props：`target`、`initialFavorite?`、`size?`、`onChanged?`。按钮使用 Icon Park 星标图标和 Arco Tooltip；不允许父页面自己翻转状态。

- [ ] **Step 4: 接入六个业务视图**

映射必须固定：企业 `type=1` + `company.id`；产品 `type=2` + `product.id`；项目 `type=6` + `hpInfoId`。列表页用批量状态接口，详情页可以单项状态接口。

- [ ] **Step 5: 运行测试与提交**

Run:

```bash
bun run test -- tests/unit/enterprise/favoriteData.test.ts tests/unit/enterprise/FavoriteButton.dom.test.tsx
bun run package
```

Expected: PASS / build 成功。

```bash
git add packages/desktop/src/renderer/pages/enterprise/favorites packages/desktop/src/renderer/pages/enterprise/companies packages/desktop/src/renderer/pages/enterprise/products packages/desktop/src/renderer/pages/enterprise/projects tests/unit/enterprise/favoriteData.test.ts tests/unit/enterprise/FavoriteButton.dom.test.tsx
git commit -m "feat(enterprise): add server-confirmed favorite actions"
```

## Task 3: 实现“我的收藏”分页与对象跳转

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/favorites/FavoriteListPage.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/favorites/FavoriteCard.tsx`
- Modify: `packages/desktop/src/renderer/components/layout/Router.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/dashboard/DashboardPage.tsx`
- Test: `tests/unit/enterprise/FavoriteListPage.dom.test.tsx`

- [ ] **Step 1: 写失败测试——类型筛选和下线内容**

覆盖全部、企业、产品、项目筛选；`available=false` 时显示“内容已下线”，保留取消收藏按钮，禁用详情跳转。

- [ ] **Step 2: 实现收藏页**

使用 `Tabs + List/Card + Pagination`。详情路由映射：

```ts
const routeByFavoriteType = {
  '1': (id: string) => `/enterprise/companies/${id}`,
  '2': (id: string) => `/enterprise/products/${id}`,
  '6': (id: string) => `/enterprise/projects/${id}`,
} as const;
```

- [ ] **Step 3: 取消收藏后回填分页**

取消当前页最后一项后重新请求当前页；若页码超过新的总页数，退回上一页。不得只从本地数组删除而不重新获取服务端 total。

- [ ] **Step 4: 工作台显示真实收藏数量**

用 `favorite.list` 的 `total` 显示收藏总数；接口失败时卡片显示“加载失败”，不显示 0。

- [ ] **Step 5: 运行测试与提交**

Run:

```bash
bun run test -- tests/unit/enterprise/FavoriteListPage.dom.test.tsx
bun run package
```

Expected: PASS / build 成功。

```bash
git add packages/desktop/src/renderer/pages/enterprise/favorites packages/desktop/src/renderer/components/layout/Router.tsx packages/desktop/src/renderer/pages/enterprise/dashboard/DashboardPage.tsx tests/unit/enterprise/FavoriteListPage.dom.test.tsx
git commit -m "feat(enterprise): add favorite center"
```

## Task 4: 实现项目解锁确认和详情刷新

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectUnlockButton.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectDetailPage.tsx`
- Test: `tests/unit/enterprise/ProjectUnlockButton.dom.test.tsx`

- [ ] **Step 1: 写失败测试——未确认不发送写请求**

点击“解锁联系方式”先打开 Arco Modal；取消时调用次数为 0；确认后调用 `project.unlock`。服务端提示免费次数用尽时原样展示安全业务消息，不把详情标记为已解锁。

- [ ] **Step 2: 实现解锁按钮**

确认文案说明该操作可能消耗会员查看权益。提交期间禁用重复点击。成功响应必须包含 `isPurchased=true`。

- [ ] **Step 3: 成功后重新拉取详情**

调用详情 SWR `mutate()`，以重新获取的联系人/电话为准，不把 unlock 响应拼入详情对象。

- [ ] **Step 4: 运行测试与提交**

Run: `bun run test -- tests/unit/enterprise/ProjectUnlockButton.dom.test.tsx`

Expected: PASS。

```bash
git add packages/desktop/src/renderer/pages/enterprise/projects/ProjectUnlockButton.tsx packages/desktop/src/renderer/pages/enterprise/projects/ProjectDetailPage.tsx tests/unit/enterprise/ProjectUnlockButton.dom.test.tsx
git commit -m "feat(enterprise): add confirmed project unlock"
```

## Task 5: 实现商机跟进列表与状态流转

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/leads/leadData.ts`
- Create: `packages/desktop/src/renderer/pages/enterprise/leads/LeadListPage.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/leads/LeadDetailDrawer.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/leads/FollowStatusControl.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectDetailPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/dashboard/DashboardPage.tsx`
- Test: `tests/unit/enterprise/leadData.test.ts`
- Test: `tests/unit/enterprise/FollowStatusControl.dom.test.tsx`
- Test: `tests/unit/enterprise/LeadListPage.dom.test.tsx`

- [ ] **Step 1: 写失败测试——状态命令支持 leadId 和 hpInfoId**

已有 lead 从 `leadId` 更新；项目详情没有 leadId 时使用 `hpInfoId`，响应返回并缓存服务端创建的 `leadId`。非法跨级并非错误，允许 `NONE → DONE`，但必须确认。

- [ ] **Step 2: 实现状态控件**

状态展示：未跟进、待跟进、跟进中、已完成。状态变化打开确认 popover，可填写 `feedbackReason`；服务端成功后才刷新状态。

- [ ] **Step 3: 实现商机跟进页**

筛选：状态、匹配等级、地区、预算、关键词、分页。表格列：项目、匹配原因、优先级、预计金额、状态、最后跟进时间、操作。详情 drawer 展示 hits、推荐动作和反馈原因。

- [ ] **Step 4: 接入项目详情和工作台**

项目详情提供“加入待跟进”和状态控制。工作台跟进统计读取 `getMyOpportunityDashboard` 的真实 kpi/funnel；失败不回退假数值。

- [ ] **Step 5: 运行测试与提交**

Run:

```bash
bun run test -- tests/unit/enterprise/leadData.test.ts tests/unit/enterprise/FollowStatusControl.dom.test.tsx tests/unit/enterprise/LeadListPage.dom.test.tsx
bun run package
```

Expected: PASS / build 成功。

```bash
git add packages/desktop/src/renderer/pages/enterprise/leads packages/desktop/src/renderer/pages/enterprise/projects/ProjectDetailPage.tsx packages/desktop/src/renderer/pages/enterprise/dashboard/DashboardPage.tsx tests/unit/enterprise/leadData.test.ts tests/unit/enterprise/FollowStatusControl.dom.test.tsx tests/unit/enterprise/LeadListPage.dom.test.tsx
git commit -m "feat(enterprise): add opportunity follow-up workflow"
```

## Task 6: 建立页面选中对象和 AI 上下文白名单

**Files:**

- Create: `packages/desktop/src/renderer/hooks/context/EnterpriseSelectionContext.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/assistant/enterpriseAiContext.ts`
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyQuickView.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/ProductQuickView.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectQuickView.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/leads/LeadDetailDrawer.tsx`
- Test: `tests/unit/enterprise/enterpriseAiContext.test.ts`

- [ ] **Step 1: 写失败测试——上下文只含业务白名单字段**

构造包含 openId、userId、phone、内部权限字段的实体，断言 AI context 不含 openId、unionId、userId、当前登录手机号。项目已解锁的公开业务联系人可作为项目事实加入，但必须标注 `contactUnlocked=true`。

- [ ] **Step 2: 定义选中实体联合类型**

```ts
export type EnterpriseContextEntity =
  | { entityType: 'COMPANY'; id: string; data: EnterpriseCompanyDetail }
  | { entityType: 'PRODUCT'; id: string; data: EnterpriseProductDetail }
  | { entityType: 'PROJECT'; id: string; data: EnterpriseProjectDetail }
  | { entityType: 'LEAD'; id: string; data: EnterpriseLeadDetail };
```

context 只保存当前选中实体和最多 3 个显式勾选的比较实体；路由变化时清理不相关选中项。

- [ ] **Step 3: 实现 AI context builder**

输出固定结构：

```ts
export type EnterpriseAiContext = {
  current: { entityType: string; id: string; facts: Record<string, string | number | boolean | null> } | null;
  comparisons: Array<{ entityType: string; id: string; facts: Record<string, string | number | boolean | null> }>;
  viewerCompany: { companyId: string; companyName: string };
};
```

所有字段显式枚举，不使用 `{...rawData}`。

- [ ] **Step 4: 各 quick view 更新 selection**

单击列表行更新 current；比较按钮显式加入 comparisons；超过 3 个时阻止并提示。右侧 AI 折叠状态使用 `STORAGE_KEYS` 新键持久化。

- [ ] **Step 5: 运行测试与提交**

Run: `bun run test -- tests/unit/enterprise/enterpriseAiContext.test.ts`

Expected: PASS。

```bash
git add packages/desktop/src/renderer/hooks/context/EnterpriseSelectionContext.tsx packages/desktop/src/renderer/pages/enterprise/assistant/enterpriseAiContext.ts packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx packages/desktop/src/renderer/pages/enterprise/companies/CompanyQuickView.tsx packages/desktop/src/renderer/pages/enterprise/products/ProductQuickView.tsx packages/desktop/src/renderer/pages/enterprise/projects/ProjectQuickView.tsx packages/desktop/src/renderer/pages/enterprise/leads/LeadDetailDrawer.tsx packages/desktop/src/common/config/storageKeys.ts tests/unit/enterprise/enterpriseAiContext.test.ts
git commit -m "feat(enterprise): add selection and AI context"
```

## Task 7: 复用 AionUi AI 创建企业助手会话

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/assistant/enterpriseAiSession.ts`
- Create: `packages/desktop/src/renderer/pages/enterprise/assistant/enterpriseAiPrompt.ts`
- Test: `tests/unit/enterprise/enterpriseAiSession.test.ts`

- [ ] **Step 1: 写失败测试——选择可用 assistant**

从 `ipcBridge.assistants.list` 选择 `enabled=true`、`agent_status='online'`、非 `aionrs` 的 assistant，排序依次为 `last_used_at desc`、`sort_order asc`。没有可用 assistant 时返回 `unavailable`，UI 后续提供 `/guid` 和设置入口。

- [ ] **Step 2: 写失败测试——创建、预热和复用会话**

首次提问依次调用：

1. `conversation.create`，名称前缀 `[企业码助手]`，`assistant.id` 为已选择 assistant；
2. `conversation.warmup`；
3. `conversation.askSideQuestion`。

同一应用 session 后续复用 conversationId。`unsupported/toolsRequired/noAnswer` 转换为明确 UI 状态，不伪造回答。

- [ ] **Step 3: 定义严格系统指令**

提问由 `instruction + EnterpriseAiContext + userQuestion` 组成。指令要求只返回单个 JSON 对象，不使用 Markdown fence：

```json
{
  "version": 1,
  "answer": "面向用户的分析文字",
  "draft": null
}
```

允许的 draft 在 Task 8 定义。指令明确：未知事实写“未知”，不编造联系方式、价格或项目进度，不直接执行任何业务写操作。

- [ ] **Step 4: 实现 session service**

使用模块内受控状态或 hook ref 保存 conversationId，不写入企业 session 文件。创建/预热失败后允许用户重试；logout 时清理本地 conversationId，但不删除原 AionUi 会话历史。

- [ ] **Step 5: 运行测试与提交**

Run: `bun run test -- tests/unit/enterprise/enterpriseAiSession.test.ts`

Expected: PASS。

```bash
git add packages/desktop/src/renderer/pages/enterprise/assistant/enterpriseAiSession.ts packages/desktop/src/renderer/pages/enterprise/assistant/enterpriseAiPrompt.ts tests/unit/enterprise/enterpriseAiSession.test.ts
git commit -m "feat(enterprise): connect workbench to existing AI assistants"
```

## Task 8: 实现严格结构化 AI 动作草稿和确认卡

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/assistant/enterpriseActionSchema.ts`
- Create: `packages/desktop/src/renderer/pages/enterprise/assistant/EnterpriseActionCard.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/assistant/executeEnterpriseAction.ts`
- Test: `tests/unit/enterprise/enterpriseActionSchema.test.ts`
- Test: `tests/unit/enterprise/EnterpriseActionCard.dom.test.tsx`

- [ ] **Step 1: 写失败测试——只解析完整 JSON**

以下输入不得产生 draft：Markdown fence、JSON 前后夹杂文字、未知 action、额外字段、目标 ID 与当前实体不一致、项目动作指向企业。允许显示原始 answer，但写命令数必须为 0。

- [ ] **Step 2: 定义 strict schema**

```ts
export const enterpriseActionDraftSchema = z
  .object({
    action: z.enum(['FAVORITE', 'UNFAVORITE', 'ADD_LEAD', 'UPDATE_LEAD_STATUS']),
    entityType: z.enum(['COMPANY', 'PRODUCT', 'PROJECT', 'LEAD']),
    entityId: z.string().min(1),
    targetStatus: z.enum(['TODO', 'DOING', 'DONE']).optional(),
    reason: z.string().min(1).max(300),
  })
  .strict();

export const enterpriseAssistantEnvelopeSchema = z
  .object({
    version: z.literal(1),
    answer: z.string().min(1),
    draft: enterpriseActionDraftSchema.nullable(),
  })
  .strict();
```

解析只允许 `JSON.parse(response.answer)` 一次，不使用正则、repair、substring 或 fence 提取。

- [ ] **Step 3: 校验动作与当前上下文一致性**

规则：

- `FAVORITE/UNFAVORITE` 支持 COMPANY/PRODUCT/PROJECT；
- `ADD_LEAD` 仅支持 PROJECT，固定目标 TODO；
- `UPDATE_LEAD_STATUS` 支持 PROJECT/LEAD，必须有 targetStatus；
- `entityId` 必须等于 current.id；
- comparison entity 不能被 AI 动作修改。

- [ ] **Step 4: 实现确认卡**

卡片显示动作、对象名称、原因、目标状态和“确认执行/取消”。未点击确认前不得调用企业 API。执行成功后刷新 favorite/lead/dashboard SWR keys；失败保留卡片并允许重试。

- [ ] **Step 5: 映射到白名单命令**

```text
FAVORITE            -> favorite.save
UNFAVORITE          -> favorite.remove
ADD_LEAD            -> lead.update { hpInfoId, followStatus:'TODO' }
UPDATE_LEAD_STATUS  -> lead.update { leadId or hpInfoId, followStatus:targetStatus }
```

- [ ] **Step 6: 运行测试与提交**

Run:

```bash
bun run test -- tests/unit/enterprise/enterpriseActionSchema.test.ts tests/unit/enterprise/EnterpriseActionCard.dom.test.tsx
bun run package
```

Expected: PASS / build 成功。

```bash
git add packages/desktop/src/renderer/pages/enterprise/assistant/enterpriseActionSchema.ts packages/desktop/src/renderer/pages/enterprise/assistant/EnterpriseActionCard.tsx packages/desktop/src/renderer/pages/enterprise/assistant/executeEnterpriseAction.ts tests/unit/enterprise/enterpriseActionSchema.test.ts tests/unit/enterprise/EnterpriseActionCard.dom.test.tsx
git commit -m "feat(enterprise): add confirmed structured AI actions"
```

## Task 9: 实现右侧 AI 助手面板

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/assistant/EnterpriseAssistantPanel.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/assistant/EnterpriseAssistantMessages.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/assistant/EnterpriseAssistantComposer.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx`
- Test: `tests/unit/enterprise/EnterpriseAssistantPanel.dom.test.tsx`

- [ ] **Step 1: 写失败测试——上下文与空状态**

无 current 时显示可用的通用问题，但禁用会改变对象的快捷动作；选中实体后显示实体名称和类型。assistant 不可用时显示“打开 AI 工作区”和“配置助手”，不循环重试。

- [ ] **Step 2: 实现消息和提问**

提供摘要、比较、匹配分析、风险提示、跟进建议快捷问题。发送时冻结本次 context snapshot，响应回来后即使用户切换实体，也按原 snapshot 校验 draft；若当前实体已变化，动作卡自动失效并提示重新提问。

- [ ] **Step 3: 实现 JSON 响应降级**

完整 envelope 校验成功：显示 `answer` 和可选确认卡。校验失败：把 side-question 返回内容作为普通文本显示，记录不含业务数据的诊断错误，不显示动作卡。

- [ ] **Step 4: 实现折叠与尺寸**

桌面默认宽 360px，可折叠；小于 1100px 默认折叠并用 Drawer 展示。状态通过 `STORAGE_KEYS.ENTERPRISE_AI_COLLAPSED` 保存。面板不能挤压表格到小于 720px。

- [ ] **Step 5: 运行测试与提交**

Run:

```bash
bun run test -- tests/unit/enterprise/EnterpriseAssistantPanel.dom.test.tsx
bun run package
```

Expected: PASS / build 成功。

```bash
git add packages/desktop/src/renderer/pages/enterprise/assistant packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx tests/unit/enterprise/EnterpriseAssistantPanel.dom.test.tsx
git commit -m "feat(enterprise): add contextual AI assistant panel"
```

## Task 10: i18n、可访问性与安全回归

**Files:**

- Modify: `packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`
- Test: `tests/unit/enterprise/enterpriseAccessibility.dom.test.tsx`
- Test: `tests/unit/enterprise/enterpriseNoSensitiveLogs.test.ts`

- [ ] **Step 1: 补齐收藏、跟进、解锁和 AI 文案**

中文和英文完整翻译，其余 locale 使用英文 fallback 值但保持 key 一致。运行类型生成。

- [ ] **Step 2: 添加键盘与可访问性测试**

验证侧栏、收藏按钮、状态控件、解锁 modal、AI composer、确认卡可通过键盘操作；图标按钮有 aria-label；loading 和错误提示使用合适 role。

- [ ] **Step 3: 添加敏感日志测试**

spy `console.*`，模拟 auth、favorite、lead、AI 错误，断言日志不包含完整 openid、unionId、电话、AI context JSON。允许记录 operation、错误类型和实体类型，不记录实体详情。

- [ ] **Step 4: 运行检查并提交**

Run:

```bash
bun run i18n:types
bun run test -- tests/unit/enterprise/enterpriseAccessibility.dom.test.tsx tests/unit/enterprise/enterpriseNoSensitiveLogs.test.ts tests/unit/common/i18n.test.ts
bun run lint
bun run format:check
bun run package
```

Expected: 全部成功。

```bash
git add packages/desktop/src/renderer/services/i18n tests/unit/enterprise/enterpriseAccessibility.dom.test.tsx tests/unit/enterprise/enterpriseNoSensitiveLogs.test.ts
git commit -m "test(enterprise): cover workflow accessibility and privacy"
```

## Task 11: 业务闭环集成测试与 Windows 验收

**Files:**

- Create: `tests/integration/enterprise/enterpriseWorkflow.dom.test.tsx`
- Create: `tests/e2e/helpers/enterpriseFixtureServer.ts`
- Create: `tests/e2e/specs/enterprise-workflow.e2e.ts`
- Modify: `docs/specs/enterprise-code-desktop/design.md`

- [ ] **Step 1: 写 renderer 集成测试**

fake bridge 完成以下闭环：

1. 项目列表收藏 `TYPE=6`；
2. 收藏中心进入项目详情；
3. 确认解锁并刷新详情；
4. 加入 TODO；
5. 商机页改为 DOING，再改 DONE；
6. AI 返回合法 FAVORITE draft，未确认时无请求，确认后执行；
7. AI 返回带额外文字的 JSON，确认卡不存在。

- [ ] **Step 2: 写 Electron E2E 主路径**

测试 helper 启动一个只监听 `127.0.0.1` 随机端口的 HTTP fixture server，按真实 `CommonResult` 契约提供扫码、用户上下文、企业/产品/项目、收藏和跟进响应。启动 Electron 时用 `AIONUI_ENTERPRISE_CLOUD_BASE_URL=http://127.0.0.1:<port>/` 覆盖地址；现有开发环境 loopback 白名单允许该地址。这样 E2E 经过真实 preload、IPC 和主进程客户端，但不访问生产云端、不包含真实 openid，也不在生产代码中增加测试后门。覆盖扫码登录后的工作台、收藏、跟进、AI 确认卡和退出。

- [ ] **Step 3: 运行自动化测试**

Run:

```bash
bun run test -- tests/unit/enterprise tests/integration/enterprise
bun run test:e2e -- tests/e2e/specs/enterprise-workflow.e2e.ts
bun run package
```

Expected: 全部 PASS。

- [ ] **Step 4: 在测试环境做真实接口验收**

使用专用测试账号验证：

1. 企业、产品、项目收藏保存/取消/重启恢复；
2. 同一项目重复收藏没有多条有效记录；
3. 项目解锁权益限制与 H5 一致；
4. hpInfoId 首次加入跟进自动得到 leadId；
5. TODO/DOING/DONE 状态重启后仍正确；
6. AI 摘要、比较和跟进建议使用当前实体；
7. AI 动作必须确认，切换实体后旧动作失效；
8. 断网和 5xx 均显示错误，不显示 mock；
9. 原 AI `/guid` 与会话功能正常。

- [ ] **Step 5: Windows 打包验收**

Run: `bun run dist:win`

Expected: Windows 安装包成功生成。安装后验证 session 路径、扫码图片、外部网络、重启恢复、升级覆盖和卸载重装。

- [ ] **Step 6: 更新设计状态并提交**

把设计文档的收藏、跟进、AI、测试和交付验收项更新为实际结果；失败或未做项保持未完成，不提前标记。

```bash
git add tests/integration/enterprise/enterpriseWorkflow.dom.test.tsx tests/e2e/helpers/enterpriseFixtureServer.ts tests/e2e/specs/enterprise-workflow.e2e.ts docs/specs/enterprise-code-desktop/design.md
git commit -m "test(enterprise): verify workflow and AI delivery"
```

## 完成判定

- 企业、产品、项目收藏均由服务端最终状态驱动，项目使用 `J_CY_INTEREST.TYPE=6`。
- 收藏中心可分页、筛选、取消收藏并跳转真实对象。
- 项目解锁有明确确认并服从现有会员权益。
- 项目跟进基于 `J_OPP_LEAD`，TODO/DOING/DONE 可持久化和恢复。
- AI 复用 AionUi 现有 assistant 能力，能基于当前实体摘要、比较和建议。
- AI 写操作只接受完整、严格、上下文一致的 JSON draft，并经过用户确认。
- 自然语言、格式损坏 JSON、过期上下文和未知动作均无法触发业务写入。
- 无静默 mock、无敏感业务上下文日志，自动化测试和 Windows 打包通过。
