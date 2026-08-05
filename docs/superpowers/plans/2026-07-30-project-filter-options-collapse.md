# Project Filter Options and Collapsible Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build database-backed cascading project filters and make the project opportunity overview default to a compact collapsed state.

**Architecture:** cloud-api exposes one allowlisted dimension aggregation endpoint backed by the latest material-analysis run. Electron extends the shared enterprise contract and loads options through a page-private hook, while the dashboard uses an Ant Design collapse panel without persisting UI state.

**Tech Stack:** Java 8, Spring MVC, MyBatis XML, Oracle SQL, TypeScript, React, Ant Design React, Vitest, i18next.

---

### Task 1: Add focused contract and behavior tests

**Files:**
- Modify: `LianLiaoAIPC/tests/unit/enterprise/enterpriseApiClient.test.ts`
- Modify: `LianLiaoAIPC/tests/unit/enterprise/enterpriseSchemas.test.ts`
- Modify: `LianLiaoAIPC/tests/unit/enterprise/ProjectPage.dom.test.tsx`
- Modify: `lianshang_liaoning/cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/dao/OpportunityDaoMapperTest.java`

- [ ] Add an API-client case for `project.filterOptions` and assert the cloud route plus serialized `dimension`, parent filters and bounded `limit`.
- [ ] Add schema assertions that accept `{ value, label, projectCount }` and reject missing labels or unsupported dimensions.
- [ ] Add DOM cases proving the dashboard content is hidden initially, expands on click, and changing a parent select clears its children.
- [ ] Add a Mapper contract case proving every dimension is selected through bound/allowlisted SQL and no `${...}` substitution is present.
- [ ] Run the focused tests and confirm they fail because the new operation and UI do not exist.

### Task 2: Implement the cloud-api filter option endpoint

**Files:**
- Modify: `lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/controller/OpportunityController.java`
- Modify: `lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/OpportunityService.java`
- Modify: `lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/impl/OpportunityServiceImpl.java`
- Modify: `lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/dao/OpportunityDao.java`
- Modify: `lianshang_liaoning/cloud-service/cloud-api/src/main/resources/mapper/OpportunityDao.xml`

- [ ] Add `getAiMaterialFilterOptions(JSONObject bean)` to controller and service contracts.
- [ ] Validate `dimension` against a fixed six-value set, normalize `limit` into `1..1000`, and resolve the latest run with `resolveAiMaterialBean`.
- [ ] Add `selectAiMaterialFilterOptions` and a MyBatis `<choose>` expression per allowed dimension.
- [ ] Group by the selected expression, count distinct project IDs, exclude blank/placeholder values, sort deterministically, and cap with Oracle `rownum`.
- [ ] Return `{ list, runId, dimension }` through the existing `CommonResult.success` convention.
- [ ] Run `OpportunityDaoMapperTest` and cloud-api compile.

### Task 3: Extend the Electron enterprise protocol

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/contracts.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/rawSchemas.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/schemas.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/normalizers.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts`

- [ ] Define `EnterpriseProjectFilterDimension`, `ProjectFilterOptionsQuery`, and `EnterpriseProjectFilterOption`.
- [ ] Add `project.filterOptions` request/response union members and strict request schema.
- [ ] Parse the cloud envelope list into normalized option records.
- [ ] Serialize only the allowlisted filters and route the operation to `getAiMaterialFilterOptions`.
- [ ] Run the focused API/schema tests until green.

### Task 4: Implement cascading selects and non-blocking loading

**Files:**
- Create: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/projects/useProjectFilterOptions.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/projects/ProjectPage.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css`

- [ ] Implement a page-private hook that loads one dimension, retains only the latest response, and stores loading/error per dimension.
- [ ] Load province and category L1 on mount.
- [ ] Replace six text inputs with searchable `Select` controls.
- [ ] Apply the region and material cascade reset rules before each child load.
- [ ] Keep option failures local to the affected control so dashboard and list rendering are unchanged.
- [ ] Reset all option state and reload root dimensions on form reset.

### Task 5: Make the dashboard a default-collapsed accordion

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/projects/ProjectDashboard.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css`

- [ ] Wrap dashboard content in a controlled Ant Design `Collapse`.
- [ ] Initialize with no active panel and keep title/update time visible in the label.
- [ ] Render all existing metrics and charts inside the expandable body without changing their data contract.
- [ ] Run the focused DOM test until green.

### Task 6: Internationalize and verify the integrated feature

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`
- Generated: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`

- [ ] Add option loading/error/empty, expand and collapse keys to all languages listed in `i18n-config.json`.
- [ ] Run `bun run i18n:types` followed by `node scripts/check-i18n.js`.
- [ ] Run the focused enterprise Vitest files.
- [ ] Run `bunx tsc --noEmit`.
- [ ] Run the affected desktop production build and record any pre-existing unrelated failure separately.
- [ ] Review `git diff` to ensure no user changes were overwritten and no credential or generated runtime data was added.
