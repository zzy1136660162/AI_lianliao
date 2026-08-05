# Enterprise Catalog Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved dense enterprise profile list with company identity facts and three featured products per row.

**Architecture:** Add a desktop-only cloud-api aggregation endpoint that enriches the existing paged company query with one batch product query. Extend the Electron cross-process contract and normalizers to retain these fields, then replace the Ant Design table with an accessible dense record list while preserving filters, pagination, selection, and navigation.

**Tech Stack:** Java 8, Spring MVC, MyBatis, Oracle SQL, TypeScript, React, Ant Design React, CSS Modules, Vitest.

---

### Task 1: Add the desktop company catalog aggregation endpoint

**Files:**
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/controller/CompanyController.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/CompanyService.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/impl/CompanyServcieImpl.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/dao/CompanyDao.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/resources/mapper/CompanyDao.xml`

- [ ] Add `getQiYeMaCompanyCatalogList` to the controller and service contract.
- [ ] Page with the existing `getQiYeMaCompanyList` query so filtering and ordering remain H5-compatible.
- [ ] Extract current-page company IDs and execute one `ROW_NUMBER() OVER (PARTITION BY COMPANY_ID ...)` query.
- [ ] Return `featuredProducts` and `featuredProductCount` on each company item without changing the H5 endpoint.
- [ ] Compile `cloud-api` with dependencies using Maven and inspect the mapper XML parse result.

### Task 2: Extend the Electron enterprise contract

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/contracts.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/rawSchemas.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/normalizers.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/companies/companyData.ts`
- Test: `LianLiaoAIPC/tests/unit/enterprise/enterpriseApiClient.test.ts`

- [ ] Add `logoUrl`, `registeredCapital`, `featuredProducts`, and `featuredProductCount` to the summary contract.
- [ ] Validate nested product summaries and reject malformed nested records.
- [ ] Preserve existing company detail and product-list behavior.
- [ ] Route `company.list` to the new desktop catalog endpoint.
- [ ] Run the focused API client and normalization tests.

### Task 3: Replace the company table with the dense profile list

**Files:**
- Create: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/companies/CompanyCatalogRow.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/companies/CompanyListPage.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`
- Test: `LianLiaoAIPC/tests/unit/enterprise/CompanyListPage.dom.test.tsx`

- [ ] Render one accessible enterprise profile row with Logo, badges, facts, region, address, summary, and primary action.
- [ ] Render at most three product previews and a `+N` overflow marker; product clicks navigate independently.
- [ ] Preserve selected state, double-click, Enter/Space behavior, pagination scroll, loading, empty, and error states.
- [ ] Add responsive rules that reduce product previews at narrower desktop widths without horizontal page stretching.
- [ ] Regenerate i18n types, validate locales, run focused DOM tests, TypeScript, lint, and the desktop package build.
