# Enterprise Product Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add database-backed company industry filtering, legacy product-image compatibility, denser company product previews, and safe product-description rendering.

**Architecture:** Add one cloud-api query dedicated to desktop industry options and expose it through the existing typed Electron enterprise request pipeline. Keep URL and HTML transformation pure and renderer-side, while all HTTP remains in the main process. Reuse the current company catalog aggregation endpoint and preserve H5 endpoints.

**Tech Stack:** Java 8, Spring MVC, MyBatis, Oracle SQL, TypeScript, React 19, Ant Design, DOMPurify, CSS Modules, Vitest.

---

### Task 1: Add database-backed industry options to cloud-api

**Files:**
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/controller/CompanyController.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/CompanyService.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/impl/CompanyServcieImpl.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/dao/CompanyDao.java`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/resources/mapper/CompanyDao.xml`
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/dao/CompanyDaoMapperTest.java`

- [ ] Add `List<JSONObject> getQiYeMaIndustryOptions()` to `CompanyDao` and map it to the approved grouped Oracle query.
- [ ] Add `CommonResult getQiYeMaIndustryOptions()` to `CompanyService`; normalize mapper keys with `getCamelcaseJsonList`.
- [ ] Add `POST /CompanyController/getQiYeMaIndustryOptions` without changing the existing H5 or desktop catalog routes.
- [ ] Extend `CompanyDaoMapperTest` to assert the statement exists and contains `DEL_SIGN = 'N'`, `GROUP BY INDUSTRY`, `HAVING COUNT(*) >= 10`, and deterministic ordering.
- [ ] Run:

```powershell
mvn -pl cloud-api -am -DskipTests compile
mvn -pl cloud-api -Dtest=CompanyDaoMapperTest test
```

Expected: both commands exit `0`.

### Task 2: Extend the Electron enterprise operation contract

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/contracts.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/rawSchemas.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/schemas.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/normalizers.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`
- Modify: `LianLiaoAIPC/tests/unit/enterprise/enterpriseApiClient.test.ts`
- Modify: `LianLiaoAIPC/tests/unit/enterprise/enterpriseSchemas.test.ts`

- [ ] Define `EnterpriseIndustryOption`, the `company.industries` empty payload request, and its array response.
- [ ] Add a guarded request schema that accepts only an empty object.
- [ ] Normalize only plain records with a trimmed non-empty `industry` and safe integer `companyCount >= 10`; reject duplicates or malformed arrays.
- [ ] Add the fixed route:

```ts
'company.industries': 'cloud-api/CompanyController/getQiYeMaIndustryOptions',
```

- [ ] Serialize the request only after validating registered company identity, then send an empty body.
- [ ] Add tests for the route, empty body, normalized success response, counts below 10, duplicate industries, and malformed records.
- [ ] Run the focused enterprise API and schema tests; expected result is all passing.

### Task 3: Implement legacy enterprise image compatibility

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/enterprise/enterpriseDataValidation.ts`
- Modify: `LianLiaoAIPC/tests/unit/enterprise/companyData.test.ts`
- Modify: `LianLiaoAIPC/tests/unit/enterprise/productData.test.ts`

- [ ] Add a pure legacy rewrite stage before `URL` validation for the exact PC mappings.
- [ ] Resolve paths without `//` against `https://img.lslnii.com/`.
- [ ] Upgrade HTTP only for the explicit trusted image hosts and retain rejection of credentials, non-default ports, IPs, `data:`, `file:`, and `javascript:`.
- [ ] Add positive tests for relative product paths and every mapped legacy host/path.
- [ ] Keep negative tests proving lookalike domains and unsafe schemes fail closed.
- [ ] Run the two focused data test files; expected result is all passing.

### Task 4: Add industry-option loading and Select UI

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/companies/companyData.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/companies/CompanyListPage.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`
- Modify: `LianLiaoAIPC/tests/unit/enterprise/companyData.test.ts`
- Modify: `LianLiaoAIPC/tests/unit/enterprise/CompanyListPage.dom.test.tsx`

- [ ] Add `loadCompanyIndustryOptions` and `useCompanyIndustryOptions`; validate the exact `company.industries` operation envelope.
- [ ] Load options independently of the company page so a failure does not replace catalog content with an error state.
- [ ] Replace the industry Input with a searchable, clearable Ant Design Select:

```tsx
<Select
  value={draftFilters.industry}
  allowClear
  showSearch
  optionFilterProp='label'
  options={industryOptions.data.map(({ industry, companyCount }) => ({
    value: industry,
    label: t('enterprise.companies.filters.industryOption', { industry, count: companyCount }),
  }))}
  onChange={(industry) => setDraftFilters((current) => ({ ...current, industry }))}
/>
```

- [ ] Preserve an already-selected query value even if the option request fails or no longer returns it.
- [ ] Test success, malformed response, independent failure, selection, clear, submit, and restored query behavior.

### Task 5: Move the company action and enlarge product previews

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/companies/CompanyCatalogRow.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`
- Modify: all `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`
- Modify: `LianLiaoAIPC/tests/unit/enterprise/CompanyListPage.dom.test.tsx`
- Modify: `LianLiaoAIPC/tests/unit/enterprise/enterpriseProductLocales.test.ts`

- [ ] Put a link-style Ant Design Button in `.featuredProductsHeader` after the count.
- [ ] Change the action key/value from “View details/查看详情” to “View more/查看更多” across all configured languages.
- [ ] Remove the bottom `.catalogDetailsButton`, add header spacing with `margin-left: auto`, and increase preview media height at desktop and narrow breakpoints.
- [ ] Test that the action appears on the same header row, navigates to the company, and product clicks remain independent.
- [ ] Run `bun run i18n:types` followed by `node scripts/check-i18n.js`; expected result is no errors.

### Task 6: Add safe product-description transformations

**Files:**
- Modify: `LianLiaoAIPC/package.json`
- Modify: `LianLiaoAIPC/bun.lock`
- Create: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/products/productDescription.ts`
- Create: `LianLiaoAIPC/tests/unit/enterprise/productDescription.dom.test.ts`

- [ ] Declare `dompurify` as a direct dependency using the version already resolved by the lockfile.
- [ ] Implement `toPlainProductText(html)` using DOM parsing, text content, non-breaking-space normalization, and whitespace collapse.
- [ ] Implement `sanitizeProductHtml(html)` with DOMPurify hooks that:

```ts
// policy summary
// - forbid script/style/iframe/object/embed/form/input/button
// - remove all on* attributes
// - keep safe http(s) links with rel="noopener noreferrer"
// - pass img src through parseSafeEnterpriseImageUrl; remove unsafe images
// - remove style attributes to avoid layout injection
```

- [ ] Return an empty string on empty input or a sanitizer failure.
- [ ] Test HTML stripping/entity decoding, script/event removal, JavaScript links, legacy image rewriting, unsafe image removal, and safe formatting retention.

### Task 7: Apply plain text and sanitized HTML to product pages

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/products/ProductListPage.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/products/ProductQuickView.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/products/ProductDetailPage.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css`
- Modify: `LianLiaoAIPC/tests/unit/enterprise/ProductListPage.dom.test.tsx`
- Create: `LianLiaoAIPC/tests/unit/enterprise/ProductDetailPage.dom.test.tsx`

- [ ] Render `toPlainProductText(product.summary) || missing` in product cards.
- [ ] Render sanitized product HTML in quick preview and detail using one small private component or a sanitized `dangerouslySetInnerHTML` container.
- [ ] Add scoped rich-text CSS for paragraphs, lists, links, and responsive images using semantic tokens.
- [ ] Test that list cards show text without markup, preview/detail preserve safe formatting, and unsafe content is absent.

### Task 8: Verify the complete change

**Files:**
- Review all files changed by Tasks 1-7 without staging or committing unrelated workspace changes.

- [ ] Run focused Vitest files for enterprise API, schemas, company pages, product pages, image rules, and description rules.
- [ ] Run:

```powershell
bun run i18n:types
node scripts/check-i18n.js
bunx tsc --noEmit
bun run lint
bun run format:check
bun run build
```

- [ ] Re-run `mvn -pl cloud-api -am -DskipTests compile` from the cloud-service root.
- [ ] Inspect `git diff --check` in both repositories.
- [ ] Report exact passing commands and any unrelated pre-existing failures; do not commit, push, deploy, or modify external databases.
