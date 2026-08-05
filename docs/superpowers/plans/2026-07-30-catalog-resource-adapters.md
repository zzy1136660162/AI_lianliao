# 产业检索助手资源适配器实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把产业检索助手重构为资源适配器注册表，并让企业码、重点产品、在建项目共享完整的 AI 检索推荐流程。

**Architecture:** Electron 编排器只控制工作流，资源差异由 `CatalogResourceAdapter` 注册表封装；cloud-api 扩展现有计划契约支持 `PROJECT` 和项目专属筛选字段。所有模型排序 ID 必须回填到业务接口候选，项目选项通过现有数据库选项接口解析。

**Tech Stack:** Electron、React、TypeScript、Zod、Vitest、Spring Boot、Java、Fastjson、JUnit/Mockito。

---

### Task 1：扩展公共契约

**Files:**

- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\common\enterprise\catalog-assistant\contracts.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\common\enterprise\catalog-assistant\schemas.ts`

- [ ] 将 `PROJECT` 加入 `CATALOG_ENTITY_TYPES`。
- [ ] 给筛选契约加入省份、项目品类、材料、投资、日期字段。
- [ ] 给候选和可信结果加入项目字段与 `EnterpriseProjectSummary`。
- [ ] 保持默认 6 条、上限 50 条以及严格对象校验。

### Task 2：实现资源适配器注册表

**Files:**

- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\adapters\types.ts`
- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\adapters\shared.ts`
- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\adapters\companyCatalogAdapter.ts`
- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\adapters\productCatalogAdapter.ts`
- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\adapters\projectCatalogAdapter.ts`
- Create: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\adapters\catalogAdapterRegistry.ts`

- [ ] 定义统一适配器方法：策略生成、分页、ID、候选、当前结果筛选、可信结果、补充详情和摘要。
- [ ] 迁移企业、产品现有查询与回退逻辑，保持原行为。
- [ ] 项目适配器调用 `project.filterOptions` 解析数据库选项，再调用 `project.list`。
- [ ] 项目选项失败时保留关键词并继续检索；禁止生成不存在的精确值。

### Task 3：重构编排器和会话

**Files:**

- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\catalogAssistantOrchestrator.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\CatalogAssistantProvider.tsx`

- [ ] 编排器按 `entityType` 从注册表取得适配器。
- [ ] 所有分页、候选、排序、降级和补充详情通过适配器执行。
- [ ] Provider 使用注册表生成项目 ID 和会话摘要。
- [ ] 保持取消、旧请求隔离、失败续跑和当前结果追问逻辑。

### Task 4：补齐项目卡片和国际化

**Files:**

- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\CatalogAssistantResultCard.tsx`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\layout\catalog\assistant\CatalogAiAssistant.tsx`
- Modify: all `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\locales\*\enterprise.json`
- Regenerate: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\i18n-keys.d.ts`

- [ ] 新增项目示例、进度文案和“查看项目详情”。
- [ ] 项目卡片显示可信项目摘要并进入 `/enterprise/projects/{hpInfoId}`。
- [ ] 更新全部受支持语言并运行 i18n 类型生成与结构检查。

### Task 5：扩展 cloud-api 模型契约

**Files:**

- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\service\catalogai\CatalogAiAssistantServiceImpl.java`
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\service\catalogai\CatalogAiPromptFactory.java`
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\vo\catalogai\CatalogAssistantPlanVO.java`
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\controller\CatalogAiAssistantController.java`

- [ ] 白名单接受 `PROJECT` 和项目筛选字段。
- [ ] 企业/产品继续限制辽宁省，项目允许全国。
- [ ] 提示词说明项目字段、相对时间绝对化和禁止联系方式。
- [ ] 保持候选子集、长度、数量和负数 ID 约束。

### Task 6：集中执行核心测试与风险验证

**Files:**

- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\tests\unit\enterprise\catalogAssistantOrchestrator.test.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\tests\unit\enterprise\CatalogAiAssistant.dom.test.tsx`
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\test\java\com\zzy\cloud\api\service\catalogai\CatalogAiAssistantServiceImplTest.java`

- [ ] 覆盖项目规划、数据库选项解析、分页、排序、降级、卡片跳转和多轮追问。
- [ ] 回归企业/产品、5 页/100 候选、6/50 结果、取消和非法模型 ID。
- [ ] 运行 Electron 目标测试、类型检查、i18n 检查和 `bun run package`。
- [ ] 运行 cloud-api 目标测试与 `mvn -pl cloud-api -am -DskipTests package`。
- [ ] 运行两个仓库的 `git diff --check`，确认没有新增密钥、数据库修改、部署、提交或推送。
