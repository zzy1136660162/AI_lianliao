# Supply-Demand Schema Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Electron supply-demand publishing with the H5 field contracts, enforce the 15-type whitelist, add reusable business dictionaries, and expose accurate list interaction and expiry statistics.

**Architecture:** Oracle metadata remains the source of truth. `J_CY_DEMAND_PUB_FIELD` defines variant-aware publish fields while reusable option values live in generic business dictionary tables; the existing `DEMAND_FIELD_MAPPING` remains the public-detail mapping. cloud-api validates schemas and translates submissions into legacy `J_DEMAND` or `J_COMMON_DEMAND` columns, and Electron consumes the schema without hard-coded per-type forms.

**Tech Stack:** Oracle 11g, Spring Boot, MyBatis XML, Java 8, React, TypeScript, Ant Design, Zod, Vitest, i18next.

---

### Task 1: Create the Oracle metadata migration

**Files:**
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\resources\db\demand_publish_ai.sql`

- [ ] **Step 1: Add idempotent DDL**

Add Oracle blocks for `J_CY_BUSINESS_DICT`, `J_CY_BUSINESS_DICT_ITEM`, `J_CY_DEMAND_PUBLISH_TYPE`, and `J_CY_DEMAND_PUB_FIELD`, including sequences, unique indexes, foreign keys, checks, and comments. Do not change the existing `DEMAND_FIELD_MAPPING` primary key.

- [ ] **Step 2: Seed the 15 publish types**

Insert exactly:

```text
17,8,6,0,22,15,19,14,27,16,12,21,13,7,11
```

with group, order, variant, statistics mode, and default validity settings. Use merge statements so rerunning the script is safe.

- [ ] **Step 3: Seed reusable dictionaries**

Create dictionary codes for company nature, yes/no, budget ranges, transaction mode, type-specific categories, area ranges, floor ranges, logistics choices, construction choices, and type 8 choices. Store labels and values as separate structured rows.

- [ ] **Step 4: Seed aligned field mappings**

Merge the H5 field definitions for all 15 types. Set `VARIANT_CODE` for type 8 and seed type 27 as:

```text
PARAM1 purchaseCategory
PARAM3 specification
PARAM4 quantityAndUnit
PARAM7 purchaseCycle
```

Use visibility and validation JSON for dependent fields and H5 length rules.

- [ ] **Step 5: Validate migration syntax**

Run the existing Oracle read-only tool after applying the script in the controlled database session and query `USER_TABLES`, `USER_TAB_COLUMNS`, and aggregate seed counts. Expected result: both dictionary tables, the publish type table, and the publish field table exist, and 15 enabled type rows are present.

### Task 2: Extend cloud-api schema contracts

**Files:**
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\domain\demand\DemandPublishFieldRow.java`
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\vo\demand\DemandPublishFieldVO.java`
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\vo\demand\DemandPublishSchemaVO.java`
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\dto\demand\DemandPublishRequestDTO.java`
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\resources\mapper\DemandPublishMapper.xml`

- [ ] **Step 1: Add schema metadata properties**

Expose `variantCode`, group metadata, dictionary code, visibility rule, validation rule, default value, control properties, and value separator from the mapper row through the API VO.

- [ ] **Step 2: Add type and variant metadata**

Return type group, display order, supported variants, and statistics mode from the publish types and schema endpoints.

- [ ] **Step 3: Load dictionary options**

Add one batched mapper query that loads all enabled dictionary items needed by the selected schema. Preserve `OPTIONS_JSON` only as a compatibility fallback.

- [ ] **Step 4: Accept the selected variant**

Add `variantCode` to schema and publish requests. For type 8, require one of `ENTERPRISE_RECRUITMENT`, `SERVICE_OUTSOURCING`, or `TRAINING_SERVICE`; reject variants on non-variant types.

### Task 3: Enforce publishing rules and legacy column alignment

**Files:**
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\service\impl\DemandPublishServiceImpl.java`
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\resources\mapper\DemandPublishMapper.xml`
- Test: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\test\java\com\zzy\cloud\api\service\DemandPublishServiceImplTest.java`

- [ ] **Step 1: Add the server-side whitelist**

Define an immutable set containing the 15 allowed IDs and reject any other type before schema lookup or insertion. Keep the mapper `IN` predicate as defense in depth.

- [ ] **Step 2: Resolve trusted identity fields**

For type 8, map server-derived company name, contact name, contact phone, and address into the legacy `PARAM1` to `PARAM4` contract. Write the variant label to `PARAM20` and `SECOND_TYPE='链上千岗'`.

- [ ] **Step 3: Validate dictionary and visibility rules**

Reject unknown option values, multiple values outside dictionary choices, required visible fields that are empty, and submitted fields whose visibility condition is false.

- [ ] **Step 4: Preserve exact legacy value formats**

Serialize multi-select values with the separator configured by metadata. Normalize dates to the legacy format expected by each source column and never coerce H5 range values such as area or floors into numbers.

- [ ] **Step 5: Add focused tests after implementation**

Cover:

```text
allowed and disallowed type IDs
type 8 variant and PARAM20 mapping
type 27 column mapping
invalid dictionary option rejection
hidden dependent field rejection
trusted identity override prevention
```

- [ ] **Step 6: Run cloud-api verification**

Run:

```powershell
mvn -pl cloud-api -am -DskipTests compile
mvn -pl cloud-api -am -Dtest=DemandPublishServiceImplTest test
```

Expected: both commands exit with code 0.

### Task 4: Add list interaction and expiry semantics

**Files:**
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\resources\mapper\DemandQueryMapper.xml`
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\vo\demand\DemandListVO.java`
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\service\impl\DemandQueryServiceImpl.java`

- [ ] **Step 1: Add list result properties**

Add `interactionCount`, `remainingCount`, `remainingDays`, `effectiveStatus`, `interactionLabel`, and `remainingLabel`, while keeping `grabCount` and `remainingGrabCount` for backward compatibility.

- [ ] **Step 2: Calculate ordinary demand statistics**

Use `GRAB_NUM` and numeric `DEMAND_TYPE.PAY_COUNT`. Clamp remaining count to zero.

- [ ] **Step 3: Calculate type 8 delivery statistics**

Count distinct valid `J_PAY` applications for `TYPE=8` and the current demand ID. Return `PARAM6` as the position or participant range instead of inventing an exact remaining count.

- [ ] **Step 4: Calculate expiry status**

Parse the confirmed 14-digit `END_TIME`, compute calendar remaining days, and return long-term, today, expired, or active semantics without updating `DEMAND_STATE`.

### Task 5: Extend Electron contracts and normalizers

**Files:**
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\common\enterprise\contracts.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\common\enterprise\rawSchemas.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\common\enterprise\normalizers.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\common\enterprise\schemas.ts`
- Test: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\tests\unit\enterprise\demandPublishSchema.test.ts`

- [ ] **Step 1: Add metadata types**

Represent grouped publish types, variant choices, `IMAGE` fields, dictionaries, visibility conditions, validation rules, and list statistics with strict TypeScript types.

- [ ] **Step 2: Normalize the expanded API**

Safely normalize optional metadata and preserve compatibility when an older cloud-api omits new properties.

- [ ] **Step 3: Add focused contract tests**

Verify variant schemas, option arrays, dependent rule parsing, negative/invalid counters, missing compatibility fields, and remaining-day boundaries.

### Task 6: Render the aligned Electron form

**Files:**
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\supplyDemand\Publish\index.tsx`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\supplyDemand\Publish\publishDemandData.ts`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\supplyDemand\Publish\publish-demand.module.css`

- [ ] **Step 1: Add grouped type and variant selection**

Render types grouped by server metadata. Show a second selector for type 8 variants and reload the schema when the variant changes.

- [ ] **Step 2: Render all input types**

Support text, textarea, number, date, single select, multi-select, and image metadata. Use dictionary labels and values from the server.

- [ ] **Step 3: Apply conditional visibility**

Evaluate the declarative visibility conditions against current form values. Clear fields when they become hidden so stale values are not submitted.

- [ ] **Step 4: Apply validation and logical ordering**

Render group headings, use group and display order, apply required/min/max/pattern rules, and place the description and attachment fields last.

- [ ] **Step 5: Constrain AI suggestions**

Only apply AI values for currently visible schema fields. Split multi-select values with the correct Chinese delimiter and discard values outside dictionary choices.

### Task 7: Render list statistics and labels

**Files:**
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\supplyDemand\SupplyDemandListPage.tsx`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\supplyDemand\SupplyDemandQuickView.tsx`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\pages\enterprise\supplyDemand\supply-demand.module.css`

- [ ] **Step 1: Reorder desktop columns**

Use title/summary, type, city/district, budget, interaction, remaining or position range, remaining days, status, publish time, and actions.

- [ ] **Step 2: Keep the table readable**

Clamp the summary to two lines, prevent action text wrapping, set stable widths, and provide a compact quick-view layout for narrower windows.

- [ ] **Step 3: Display computed expiry**

Use `effectiveStatus` and `remainingDays` for visual status while retaining the source status in the detail contract.

### Task 8: Complete internationalization

**Files:**
- Modify: every `enterprise.json` under `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\locales`
- Generate: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\packages\desktop\src\renderer\services\i18n\i18n-keys.d.ts`

- [ ] **Step 1: Add new enterprise keys to all configured locales**

Add labels for grouped publishing, variants, interaction statistics, position range, expiry states, dependent form errors, image controls, and review status.

- [ ] **Step 2: Generate and validate i18n**

Run:

```powershell
bun run i18n:types
node scripts/check-i18n.js
```

Expected: both commands exit with code 0.

### Task 9: Cross-check every type against H5 and Oracle

**Files:**
- Create: `E:\ZZY_PROJECT\AI_lianliao\docs\supply-demand-h5-alignment-matrix.md`

- [ ] **Step 1: Record the final mapping matrix**

For each of the 15 types record H5 source page, legacy source table/column, Electron field key, label, input type, dictionary code, required state, dependency, and display order.

- [ ] **Step 2: Compare metadata counts**

Use read-only Oracle queries to confirm every enabled publish field has a source column, every referenced dictionary exists, and no publish type has an empty schema.

- [ ] **Step 3: Verify representative schemas**

Call the local cloud-api schema endpoint for every type and all three type 8 variants. Compare the response to the alignment matrix.

### Task 10: Final verification

**Files:**
- No new files

- [ ] **Step 1: Run Electron focused tests**

```powershell
bun run test -- tests/unit/enterprise/demandPublishSchema.test.ts
```

- [ ] **Step 2: Run Electron checks**

```powershell
bunx tsc --noEmit
bun run i18n:types
node scripts/check-i18n.js
```

- [ ] **Step 3: Run cloud-api checks**

```powershell
mvn -pl cloud-api -am -DskipTests compile
mvn -pl cloud-api -am -Dtest=DemandPublishServiceImplTest test
```

- [ ] **Step 4: Perform a non-destructive database audit**

Confirm 15 enabled publish types, no missing dictionary references, no duplicate option values, and correct type 8/type 27 field mappings. Do not insert, update, or delete production demand data during verification.
