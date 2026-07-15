# Enterprise Signed Entity Identifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow every currently numeric enterprise entity ID to be a non-zero signed decimal while preserving all pagination, count, state, money, level, time, session, and openid rules.

**Architecture:** Define one AionUi entity-ID predicate and reuse it at request, response, authentication, IPC, and renderer boundaries. Apply the same signed non-zero rule to the Java user-context and QR-poll boundaries; do not alter opaque correlation identifiers such as `openid`, `loginKey`, or `runId`, and do not alter non-ID numeric validation.

**Tech Stack:** TypeScript, Zod, Vitest, Electron IPC, Java 8, Spring Boot, JUnit 5, Mockito, Maven

---

## File map

### AionUi repository

- Create `packages/desktop/src/common/enterprise/entityId.ts`: single signed entity-ID predicate with an optional digit limit.
- Modify `packages/desktop/src/common/enterprise/rawSchemas.ts`: accept signed project detail IDs.
- Modify `packages/desktop/src/common/enterprise/normalizers.ts`: accept signed project response IDs.
- Modify `packages/desktop/src/renderer/pages/enterprise/data/enterpriseDataValidation.ts`: route company, product, and project ID checks through the common predicate.
- Modify `packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`: accept signed user and company IDs in authenticated poll results.
- Modify `packages/desktop/src/process/bridge/enterpriseBridge.ts`: accept signed user and company IDs before session persistence.
- Modify the focused enterprise tests listed below to prove negative IDs and preserve zero/malformed rejection.

### cloud-service repository

- Modify `cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImpl.java`: normalize every user-context entity ID as a non-zero signed integer.
- Modify `cloud-api/src/main/java/com/zzy/cloud/api/service/impl/CommonQrCodeServiceImpl.java`: authenticate signed user/company IDs and whitelist a signed role ID.
- Modify the two corresponding JUnit test classes.

## Task 1: Common AionUi entity-ID contract

**Files:**
- Create: `packages/desktop/src/common/enterprise/entityId.ts`
- Create: `tests/unit/enterprise/enterpriseEntityId.test.ts`

- [ ] **Step 1: Write the failing predicate tests**

```ts
import { describe, expect, it } from 'vitest';
import { isEnterpriseEntityId } from '@/common/enterprise/entityId';

describe('enterprise entity identifiers', () => {
  it.each(['1', '-1', '900719925474099312345', '-900719925474099312345'])(
    'accepts a non-zero signed decimal: %s',
    (value) => expect(isEnterpriseEntityId(value)).toBe(true)
  );

  it.each(['0', '-0', '+1', '1.0', '1e3', ' 1', '1 ', 'company-1', ''])('rejects a non-entity ID: %s', (value) => {
    expect(isEnterpriseEntityId(value)).toBe(false);
  });

  it('enforces a digit limit without counting the minus sign', () => {
    expect(isEnterpriseEntityId('-' + '1'.repeat(31), 31)).toBe(true);
    expect(isEnterpriseEntityId('-' + '1'.repeat(32), 31)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run from `E:\ZZY_PROJECT\AI_lianliao\AionUi`:

```powershell
npx vitest run tests/unit/enterprise/enterpriseEntityId.test.ts
```

Expected: FAIL because `@/common/enterprise/entityId` does not exist.

- [ ] **Step 3: Implement the predicate**

```ts
const SIGNED_ENTITY_ID_PATTERN = /^-?([1-9][0-9]*)$/;

/** Accepts canonical non-zero signed decimal entity IDs; an optional limit counts digits only. */
export const isEnterpriseEntityId = (value: unknown, maxDigits?: number): value is string => {
  if (typeof value !== 'string') return false;
  const match = SIGNED_ENTITY_ID_PATTERN.exec(value);
  if (!match) return false;
  return maxDigits === undefined || (Number.isInteger(maxDigits) && maxDigits > 0 && match[1]!.length <= maxDigits);
};
```

- [ ] **Step 4: Run the test and verify GREEN**

Run the command from Step 2. Expected: one test file passes.

- [ ] **Step 5: Commit the common predicate**

```powershell
git add packages/desktop/src/common/enterprise/entityId.ts tests/unit/enterprise/enterpriseEntityId.test.ts
git commit -m "feat(enterprise): define signed entity identifiers"
```

## Task 2: AionUi request, response, and renderer entity IDs

**Files:**
- Modify: `packages/desktop/src/common/enterprise/rawSchemas.ts`
- Modify: `packages/desktop/src/common/enterprise/normalizers.ts`
- Modify: `packages/desktop/src/renderer/pages/enterprise/data/enterpriseDataValidation.ts`
- Test: `tests/unit/enterprise/enterpriseSchemas.test.ts`
- Test: `tests/unit/enterprise/companyData.test.ts`
- Test: `tests/unit/enterprise/productData.test.ts`
- Test: `tests/unit/enterprise/projectData.test.ts`

- [ ] **Step 1: Write failing signed-ID behavior tests**

Add assertions that:

```ts
expect(
  enterpriseRequestSchema.safeParse({ operation: 'project.detail', payload: { hpInfoId: '-901' } }).success
).toBe(true);

expect(parseEnterpriseResponse('project.detail', { hpInfoId: '-901', projectName: 'Legacy project' })).toMatchObject({
  data: { hpInfoId: '-901' },
});

expect(parseCompanyId('-42')).toBe('-42');
await expect(loadProductDetail(client, '-9', signal)).resolves.toMatchObject({ productId: '-9', companyId: '-42' });
await expect(loadProjectDetail(client, '-901', signal)).resolves.toMatchObject({ hpInfoId: '-901' });
```

Move `-1` out of the existing invalid-ID tables. Keep `0`, `-0`, `+1`, decimals, query fragments, alphabetic IDs, whitespace, and overlength IDs in rejection tables.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npx vitest run tests/unit/enterprise/enterpriseSchemas.test.ts tests/unit/enterprise/companyData.test.ts tests/unit/enterprise/productData.test.ts tests/unit/enterprise/projectData.test.ts
```

Expected: negative project request/response and company/product/project renderer ID assertions fail under the existing positive-only patterns.

- [ ] **Step 3: Use the common predicate at every current numeric entity-ID boundary**

In `rawSchemas.ts`, replace the positive-only project schema with:

```ts
const projectRequestIdentifierSchema = z.string().refine((value) => isEnterpriseEntityId(value, 31));
```

In `normalizers.ts`, make `requiredProjectIdentifier` call:

```ts
if (!isEnterpriseEntityId(value, 31)) throw operationError(operation, `invalid ${field}`);
```

In `enterpriseDataValidation.ts`, replace the local regex and delegate:

```ts
export const isNumericEnterpriseId = (value: string | undefined): value is string =>
  isEnterpriseEntityId(value, 31);
```

Import `isEnterpriseEntityId` from `@/common/enterprise/entityId` in all three files. Leave page/count/status validation untouched.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all four files pass, including zero/malformed and pagination regression cases.

- [ ] **Step 5: Commit business entity compatibility**

```powershell
git add packages/desktop/src/common/enterprise/rawSchemas.ts packages/desktop/src/common/enterprise/normalizers.ts packages/desktop/src/renderer/pages/enterprise/data/enterpriseDataValidation.ts tests/unit/enterprise/enterpriseSchemas.test.ts tests/unit/enterprise/companyData.test.ts tests/unit/enterprise/productData.test.ts tests/unit/enterprise/projectData.test.ts
git commit -m "feat(enterprise): accept signed business entity ids"
```

## Task 3: cloud-service signed enterprise identity

**Files:**
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImpl.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/service/impl/CommonQrCodeServiceImpl.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImplTest.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/service/impl/CommonQrCodeServiceImplDesktopSessionTest.java`

- [ ] **Step 1: Write failing Java tests for signed IDs**

Add a service test using numeric and string negative IDs:

```java
@Test
void acceptsSignedNonZeroEnterpriseEntityIds() {
    JSONObject user = new JSONObject();
    user.put("id", -60);
    user.put("companyId", "-2001");
    user.put("roleId", -7L);
    when(companyService.getUserDetail(any(JSONObject.class))).thenReturn(CommonResult.success(user));

    CommonResult<JSONObject> result = service.getUserContext(OPEN_ID);

    assertSuccess(result);
    assertEquals("-60", result.getData().getString("userId"));
    assertEquals("-2001", result.getData().getString("companyId"));
    assertEquals("-7", result.getData().getString("roleId"));
}
```

Add a QR-poll test whose registered context contains `userId=-60`, `companyId=-2001`, and `roleId=-7`, and assert `status=AUTHENTICATED` with those values preserved. Remove `-1` and `"-1"` from `invalidIds()` while keeping zero and malformed forms.

- [ ] **Step 2: Run Java tests and verify RED**

Run from `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service`:

```powershell
mvn -pl cloud-api -Dtest=DesktopEnterpriseServiceImplTest,CommonQrCodeServiceImplDesktopSessionTest test
```

Expected: the two new negative-ID tests fail because `normalizeId` requires a positive sign and QR polling uses `^[1-9][0-9]*$`.

- [ ] **Step 3: Implement the minimal backend rule**

In `DesktopEnterpriseServiceImpl.normalizeId`, return every non-zero integer:

```java
return integer.signum() != 0 ? integer.toString() : null;
```

In `CommonQrCodeServiceImpl`, replace the positive helper with:

```java
private boolean isEntityId(Object value) {
    return value instanceof String && ((String) value).matches("^-?[1-9][0-9]*$");
}
```

Use `isEntityId` for required `userId`, required `companyId`, and optional `roleId`. Do not change openid, Redis, TTL, or response-whitelist logic.

- [ ] **Step 4: Run Java tests and verify GREEN**

Run the Step 2 command. Expected: both test classes pass.

- [ ] **Step 5: Commit only the four scoped cloud-service files**

From the Git root `E:\ZZY_PROJECT\lianshang_liaoning`:

```powershell
git add cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImpl.java cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/impl/CommonQrCodeServiceImpl.java cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/service/impl/DesktopEnterpriseServiceImplTest.java cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/service/impl/CommonQrCodeServiceImplDesktopSessionTest.java
git commit -m "fix(enterprise): accept signed entity identifiers"
```

The repository already contains unrelated enrollment edits and many untracked files; do not stage or modify them.

## Task 4: Electron authentication and IPC signed IDs

**Files:**
- Modify: `packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`
- Modify: `packages/desktop/src/process/bridge/enterpriseBridge.ts`
- Test: `tests/unit/enterprise/enterpriseApiClient.test.ts`
- Test: `tests/unit/enterprise/enterpriseBridge.test.ts`

- [ ] **Step 1: Write failing authentication tests**

Add an API-client poll case that returns:

```ts
userContext: {
  registered: true,
  openId,
  userId: '-60',
  companyId: '-2001',
  roleId: '-7',
}
```

Assert `pollLoginSession` resolves to `AUTHENTICATED`. Add bridge poll and registration-completion cases using the same signed context and assert the openid is persisted. Keep existing zero and non-decimal rejection tests.

- [ ] **Step 2: Run authentication tests and verify RED**

```powershell
npx vitest run tests/unit/enterprise/enterpriseApiClient.test.ts tests/unit/enterprise/enterpriseBridge.test.ts
```

Expected: signed authenticated contexts fail the positive-only API-client and bridge checks.

- [ ] **Step 3: Reuse the entity-ID predicate in both main-process boundaries**

Import `isEnterpriseEntityId` from `@/common/enterprise/entityId`.

In `EnterpriseApiClient.pollLoginSession`, replace both positive-only regular expressions with:

```ts
isEnterpriseEntityId(userContext.userId) && isEnterpriseEntityId(userContext.companyId)
```

In `enterpriseBridge.ts`, replace `isRealIdentifier` with the shared predicate in `isRegisteredContext` for both required IDs. Leave the openid equality check and session-generation checks unchanged.

- [ ] **Step 4: Run authentication tests and verify GREEN**

Run the Step 2 command. Expected: both files pass, including zero/malformed rejection and persistence tests.

- [ ] **Step 5: Commit Electron authentication compatibility**

```powershell
git add packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts packages/desktop/src/process/bridge/enterpriseBridge.ts tests/unit/enterprise/enterpriseApiClient.test.ts tests/unit/enterprise/enterpriseBridge.test.ts
git commit -m "fix(enterprise): authenticate signed entity ids"
```

## Task 5: Regression, build, and live login verification

**Files:**
- No production files expected.

- [ ] **Step 1: Format and inspect only scoped files**

```powershell
npx oxfmt packages/desktop/src/common/enterprise/entityId.ts packages/desktop/src/common/enterprise/rawSchemas.ts packages/desktop/src/common/enterprise/normalizers.ts packages/desktop/src/renderer/pages/enterprise/data/enterpriseDataValidation.ts packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts packages/desktop/src/process/bridge/enterpriseBridge.ts tests/unit/enterprise/enterpriseEntityId.test.ts tests/unit/enterprise/enterpriseSchemas.test.ts tests/unit/enterprise/companyData.test.ts tests/unit/enterprise/productData.test.ts tests/unit/enterprise/projectData.test.ts tests/unit/enterprise/enterpriseApiClient.test.ts tests/unit/enterprise/enterpriseBridge.test.ts
git diff --check
```

Expected: formatter succeeds and `git diff --check` prints nothing.

- [ ] **Step 2: Run the complete AionUi enterprise unit suite**

```powershell
npx vitest run tests/unit/enterprise
```

Expected: all enterprise test files pass.

- [ ] **Step 3: Build AionUi**

```powershell
npm run package
```

Expected: main, preload, and renderer builds complete successfully; existing chunk-size warnings are non-fatal.

- [ ] **Step 4: Re-run the focused cloud-service tests**

```powershell
mvn -pl cloud-api -Dtest=DesktopEnterpriseServiceImplTest,CommonQrCodeServiceImplDesktopSessionTest test
```

Expected: both test classes pass without touching unrelated enrollment changes.

- [ ] **Step 5: Verify the real local login flow**

Restart/reload the local cloud-api process so it contains the compiled backend change, keep AionUi development mode pointed at `http://127.0.0.1:12580/`, rescan the QR using the diagnosed legacy account, and verify:

```text
desktop/poll -> AUTHENTICATED
userId -> "-60"
renderer route -> /enterprise/dashboard
registration panel -> not rendered
```

- [ ] **Step 6: Check both worktrees without staging unrelated files**

```powershell
git status --short
git log -5 --oneline
```

Expected: the AionUi worktree is clean; the cloud-service repository retains its pre-existing unrelated enrollment edits and untracked files, with no new uncommitted enterprise changes.
