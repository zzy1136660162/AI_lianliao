# Enterprise Supply-Demand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a database-backed, read-only supply-demand catalog in the Electron enterprise workbench with secure main-process API routing, filters, paging, preview, and typed detail fields.

**Architecture:** `cloud-api` exposes public read-only demand types, list, and detail projections over `J_DEMAND` and `J_COMMON_DEMAND`. Electron validates and normalizes those responses in the shared/main-process boundary, while renderer data helpers and Ant Design pages handle stale-response suppression, filters, paging, preview, and navigation without receiving identity or contact fields.

**Tech Stack:** Java 8, Spring Boot 2.6, MyBatis, PageHelper, Oracle 11g, JUnit 5, React 19, TypeScript 5.8, Zod, Ant Design 6, Vitest 4, React Testing Library, i18next.

---

## 0. Current Working-Tree Baseline

The feature has an uncommitted prototype. Preserve it and review it as provisional code:

- Electron common/main drafts already add `demand.list` and `demand.detail` contracts, schemas, normalizers, routes, and serialization.
- Backend drafts already add Controller, DTO, Service, Mapper, XML, VO, tests, and `demand_field_mapping.sql`.
- Frontend tests exist, but renderer `supplyDemand` modules do not exist yet.
- User-owned brand changes overlap `EnterpriseSider.tsx`; keep the imported `app-mark.png` and existing brand markup.
- Backend enrollment changes are unrelated; never stage them.
- `docs/superpowers/**` is ignored by default, so add the approved design and this plan with `git add -f` only when committing documentation.

Fresh baseline on 2026-07-20:

```text
Backend demand tests: 12 passed
Frontend demand tests: 5 passed, 1 assertion failed, 2 suites failed to import missing renderer modules
```

Passing prototype tests do not prove a prior RED step. From this point onward, every newly changed behavior must be observed failing before production code changes.

## 1. Locked Decisions and One Implementation Clarification

- This slice is read-only: query, filters, list, preview, and detail only.
- No publish, edit, delete, grab-order, payment, unlock, favorite, recommendation, or contact data.
- `demandId` is a canonical non-zero signed decimal string; `typeId` is a non-negative integer and `0` selects `J_DEMAND`.
- The list/detail response must never contain `OPEN_ID`, `USER_ID`, `UNION_ID`, contact name, contact phone, service fee, or customer-service flags.
- Renderer never supplies URLs and never receives a backend access credential.
- The mapping DDL may be edited and contract-tested, but must not be executed until the user separately confirms the target Oracle schema and SQL impact.
- The approved UI requires a usable type selector, while the approved design only named list/detail endpoints. Add the minimal read-only `POST /DemandQueryController/types` endpoint so type labels continue to come from `DEMAND_TYPE`; do not hardcode type names in React.

## 2. File Map

### Backend: create/complete

```text
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/controller/DemandQueryController.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/dto/demand/DemandDetailQueryDTO.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/dto/demand/DemandQueryDTO.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/mapper/DemandQueryMapper.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/DemandQueryService.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DemandQueryServiceImpl.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/vo/demand/DemandTypeOptionVO.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/vo/demand/DemandListVO.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/vo/demand/DemandDetailVO.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/vo/demand/DemandDetailFieldVO.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/vo/demand/DemandFieldMappingVO.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/resources/mapper/DemandQueryMapper.xml
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/resources/db/demand_field_mapping.sql
```

### Backend tests

```text
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/controller/DemandQueryControllerTest.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/service/impl/DemandQueryServiceImplTest.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/mapper/DemandQueryMapperTest.java
E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/db/DemandFieldMappingSchemaContractTest.java
```

### Electron shared/main boundary

```text
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/common/enterprise/contracts.ts
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/common/enterprise/rawSchemas.ts
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/common/enterprise/normalizers.ts
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/common/enterprise/schemas.ts
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts
```

### Electron renderer

```text
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/renderer/pages/enterprise/supplyDemand/supplyDemandData.ts
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/renderer/pages/enterprise/supplyDemand/SupplyDemandListPage.tsx
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/renderer/pages/enterprise/supplyDemand/SupplyDemandDetailPage.tsx
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/renderer/pages/enterprise/supplyDemand/supply-demand.module.css
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/renderer/components/layout/Router.tsx
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseSider.tsx
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseHeader.tsx
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/renderer/pages/enterprise/dashboard/DashboardPage.tsx
E:/ZZY_PROJECT/AI_lianliao/AionUi/packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json
```

### Electron tests

```text
E:/ZZY_PROJECT/AI_lianliao/AionUi/tests/unit/enterprise/supplyDemandApiClient.test.ts
E:/ZZY_PROJECT/AI_lianliao/AionUi/tests/unit/enterprise/supplyDemandData.test.ts
E:/ZZY_PROJECT/AI_lianliao/AionUi/tests/unit/enterprise/SupplyDemandPage.dom.test.tsx
E:/ZZY_PROJECT/AI_lianliao/AionUi/tests/unit/enterprise/EnterpriseRouter.dom.test.tsx
E:/ZZY_PROJECT/AI_lianliao/AionUi/tests/unit/enterprise/DashboardPage.dom.test.tsx
E:/ZZY_PROJECT/AI_lianliao/AionUi/tests/unit/enterprise/EnterpriseLogout.dom.test.tsx
```

### Task 1: Harden Backend Identifiers and Mapping SQL

**Files:**

- Modify: `cloud-api/src/test/java/com/zzy/cloud/api/controller/DemandQueryControllerTest.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/controller/DemandQueryController.java`
- Modify: `cloud-api/src/test/java/com/zzy/cloud/api/db/DemandFieldMappingSchemaContractTest.java`
- Modify: `cloud-api/src/main/resources/db/demand_field_mapping.sql`

- [x] **Step 1: Write the failing non-zero signed-ID controller test**

Add this test to `DemandQueryControllerTest`:

```java
@Test
void rejectsZeroAndNonCanonicalDemandIds() throws Exception {
    for (String demandId : new String[]{"0", "-0", "01", "-01", "+1", "1.0"}) {
        mockMvc.perform(post("/DemandQueryController/detail")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demandId\":\"" + demandId + "\",\"typeId\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("demandId格式不正确"));
    }
}
```

- [x] **Step 2: Run the controller test and verify RED**

Run:

```powershell
mvn -pl cloud-api "-Dtest=DemandQueryControllerTest" test
```

Expected: FAIL for at least `0` because the prototype regex accepts zero.

- [x] **Step 3: Implement canonical validation**

In `DemandQueryController`, add:

```java
import java.util.regex.Pattern;

private static final Pattern DEMAND_ID_PATTERN = Pattern.compile("^-?[1-9][0-9]{0,30}$");

private boolean isValidDemandId(String demandId) {
    return demandId != null && DEMAND_ID_PATTERN.matcher(demandId).matches();
}
```

Replace the detail check with:

```java
if (query == null || !isValidDemandId(query.getDemandId())) {
    return CommonResult.validateFailed("demandId格式不正确");
}
```

- [x] **Step 4: Write the SQL-chain contract test**

Add this assertion helper and test to `DemandFieldMappingSchemaContractTest`:

```java
@Test
void joinsEverySeedSelectWithUnionAll() throws Exception {
    String ddl = loadDdl().replaceAll("--[^\\r\\n]*", " ").replaceAll("\\s+", " ").toUpperCase();
    String seed = ddl.substring(ddl.indexOf("USING ("), ddl.indexOf(") SOURCE"));
    String[] selects = seed.split("SELECT ");
    for (int index = 2; index < selects.length; index++) {
        assertTrue(selects[index - 1].trim().endsWith("UNION ALL"),
                "Every non-final seed SELECT must end with UNION ALL");
    }
}

private String loadDdl() throws Exception {
    String resource = "db/demand_field_mapping.sql";
    try (InputStream input = getClass().getClassLoader().getResourceAsStream(resource)) {
        assertNotNull(input, resource + " must be on the classpath");
        return StreamUtils.copyToString(input, StandardCharsets.UTF_8);
    }
}
```

Refactor the existing schema test to call `loadDdl()`.

- [x] **Step 5: Run the schema contract test**

Run:

```powershell
mvn -pl cloud-api "-Dtest=DemandFieldMappingSchemaContractTest" test
```

Execution note (2026-07-20): the current script already joins every non-final row with
`UNION ALL`, so this regression test passed immediately. The earlier expected defect was
not present in the checked working tree.

- [x] **Step 6: Verify every seed transition (no repair required)**

For every non-final seed row, ensure the SQL ends with:

```sql
FROM DUAL UNION ALL
```

Only the final type-24 seed row may end with:

```sql
FROM DUAL
) source
```

Do not execute this DDL.

- [x] **Step 7: Run both tests and verify GREEN**

```powershell
mvn -pl cloud-api "-Dtest=DemandQueryControllerTest,DemandFieldMappingSchemaContractTest" test
```

Expected: all tests PASS.

### Task 2: Add a Database-Backed Demand-Type Selector Contract

**Files:**

- Modify: `cloud-api/src/test/java/com/zzy/cloud/api/controller/DemandQueryControllerTest.java`
- Modify: `cloud-api/src/test/java/com/zzy/cloud/api/service/impl/DemandQueryServiceImplTest.java`
- Modify: `cloud-api/src/test/java/com/zzy/cloud/api/mapper/DemandQueryMapperTest.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/vo/demand/DemandTypeOptionVO.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/mapper/DemandQueryMapper.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/service/DemandQueryService.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DemandQueryServiceImpl.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/controller/DemandQueryController.java`
- Modify: `cloud-api/src/main/resources/mapper/DemandQueryMapper.xml`

- [x] **Step 1: Write failing Controller, Service, and Mapper tests**

Controller behavior:

```java
@Test
void listsOnlyPublicDemandTypeOptions() throws Exception {
    when(demandQueryService.types()).thenReturn(Collections.singletonList(new DemandTypeOptionVO(6, "包装服务")));

    mockMvc.perform(post("/DemandQueryController/types"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].typeId").value(6))
            .andExpect(jsonPath("$.data[0].typeName").value("包装服务"));
}
```

Mapper contract:

```java
@Test
void listsEnabledTypesThatHavePublicDemandRows() {
    String sql = normalize(statement("selectDemandTypes").getBoundSql(null).getSql());
    assertTrue(sql.contains("from demand_type"));
    assertTrue(sql.contains("exists"));
    assertTrue(sql.contains("is_check = 1"));
    assertTrue(sql.contains("order by"));
}
```

- [x] **Step 2: Run tests and verify RED**

```powershell
mvn -pl cloud-api "-Dtest=DemandQueryControllerTest,DemandQueryMapperTest" test
```

Expected: test compilation fails because `types()` and `DemandTypeOptionVO` do not exist.

- [x] **Step 3: Implement the minimal type option**

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DemandTypeOptionVO {
    private Integer typeId;
    private String typeName;
}
```

Add `List<DemandTypeOptionVO> selectDemandTypes()` to the Mapper, `List<DemandTypeOptionVO> types()` to the Service, a direct delegating implementation, and:

```java
@PostMapping("/types")
public CommonResult<List<DemandTypeOptionVO>> types() {
    return CommonResult.success(service.types());
}
```

Add fixed SQL:

```xml
<select id="selectDemandTypes" resultType="com.zzy.cloud.api.vo.demand.DemandTypeOptionVO">
    SELECT t.ID AS typeId, t.NAME AS typeName
    FROM DEMAND_TYPE t
    WHERE NVL(t.DEL_SIGN, 'N') = 'N'
      AND (
        (t.ID = 0 AND EXISTS (
          SELECT 1 FROM J_DEMAND d
          WHERE d.DEL_SIGN IN ('0', 'N') AND d.IS_CHECK = 1
        ))
        OR
        (t.ID != 0 AND EXISTS (
          SELECT 1 FROM J_COMMON_DEMAND c
          WHERE c.TYPE = t.ID AND c.DEL_SIGN = '0' AND c.IS_CHECK = 1
        ))
      )
    ORDER BY t.ID
</select>
```

- [x] **Step 4: Run all backend demand tests**

```powershell
mvn -pl cloud-api "-Dtest=DemandQueryControllerTest,DemandQueryServiceImplTest,DemandQueryMapperTest,DemandFieldMappingSchemaContractTest" test
```

Expected: all demand tests PASS.

- [x] **Step 5: Commit the backend read-only contract**

Stage only the demand files listed in this plan. Confirm `JyexEnrollment*` is not staged.

```powershell
git diff --cached --name-only
git commit -m "feat(demand): 新增供需只读查询接口"
```

Completed as commit `3dc5343f` (`feat(demand): 新增供需只读查询接口`).

### Task 3: Finish the Electron Main-Process Contract

**Files:**

- Modify: `tests/unit/enterprise/supplyDemandApiClient.test.ts`
- Modify: `packages/desktop/src/common/enterprise/contracts.ts`
- Modify: `packages/desktop/src/common/enterprise/rawSchemas.ts`
- Modify: `packages/desktop/src/common/enterprise/normalizers.ts`
- Modify: `packages/desktop/src/common/enterprise/schemas.ts`
- Modify: `packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts`
- Modify: `packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`

- [x] **Step 1: Correct the locked detail expectation**

The approved `EnterpriseDemandDetail` extends `EnterpriseDemandSummary`, so an absent tag array normalizes to an empty array. Add this property to the existing expected detail:

```ts
primaryTags: [],
```

This is a test correction against the approved contract, not a production change.

- [x] **Step 2: Write failing type-operation tests**

Add:

```ts
it('loads database-backed demand type labels through a fixed route', async () => {
  const calls: string[] = [];
  const client = new EnterpriseApiClient({
    transport: async (url) => {
      calls.push(url);
      return success([{ typeId: 0, typeName: '机加外包' }]);
    },
  });

  await expect(client.request({ operation: 'demand.types', payload: {} }, context)).resolves.toEqual({
    operation: 'demand.types',
    data: [{ typeId: 0, typeName: '机加外包' }],
  });
  expect(calls).toEqual(['https://cloud.lslnii.com/cloud-api/DemandQueryController/types']);
});
```

- [x] **Step 3: Run and verify RED**

```powershell
npm run test -- tests/unit/enterprise/supplyDemandApiClient.test.ts
```

Expected: TypeScript transform/test fails because `demand.types` is not in the contract.

- [x] **Step 4: Implement the type contract through every boundary**

Add:

```ts
export type EnterpriseDemandTypeOption = { typeId: number; typeName: string };
```

Extend the unions:

```ts
| { operation: 'demand.types'; payload: Record<string, never> }
| { operation: 'demand.types'; data: EnterpriseDemandTypeOption[] }
```

Add a strict empty payload schema, a guarded raw option schema, normalizer using `requiredNonNegativeInteger` and `requiredText`, response switch case, fixed route, and serialization returning `{}`. The route must be exactly:

```ts
'demand.types': 'cloud-api/DemandQueryController/types',
```

- [x] **Step 5: Run API and existing enterprise schema tests**

```powershell
npm run test -- tests/unit/enterprise/supplyDemandApiClient.test.ts tests/unit/enterprise/enterpriseSchemas.test.ts tests/unit/enterprise/enterpriseApiClient.test.ts
```

Expected: all tests PASS.

- [x] **Step 6: Commit the Electron transport boundary**

```powershell
git add packages/desktop/src/common/enterprise packages/desktop/src/process/services/enterprise tests/unit/enterprise/supplyDemandApiClient.test.ts
git diff --cached --name-only
git commit -m "feat(demand): 接入桌面供需查询契约"
```

Completed as commit `536cbb5` (`feat(demand): 接入桌面供需查询契约`).

### Task 4: Implement the Renderer Data Boundary

**Files:**

- Modify: `tests/unit/enterprise/supplyDemandData.test.ts`
- Create: `packages/desktop/src/renderer/pages/enterprise/supplyDemand/supplyDemandData.ts`

- [x] **Step 1: Extend the existing RED test with type loading and abort behavior**

Add:

```ts
it('loads demand types from the exact operation', async () => {
  const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
    operation: 'demand.types',
    data: [{ typeId: 0, typeName: '机加外包' }],
  });
  await expect(loadDemandTypes(createClient(request))).resolves.toEqual([{ typeId: 0, typeName: '机加外包' }]);
  expect(request).toHaveBeenCalledWith({ operation: 'demand.types', payload: {} });
});

it('drops a list response that finishes after cancellation', async () => {
  const controller = new AbortController();
  const request = vi.fn<EnterpriseClient['request']>().mockImplementation(async () => {
    controller.abort();
    return { operation: 'demand.list', data: { list: [], pageNum: 1, pageSize: 20, pages: 0, total: 0 } };
  });
  await expect(
    loadDemandList(createClient(request), buildDemandListQuery({}, { pageNum: 1, pageSize: 20 }), controller.signal)
  ).rejects.toMatchObject({ code: 'ABORTED' });
});
```

- [x] **Step 2: Run and verify RED**

```powershell
npm run test -- tests/unit/enterprise/supplyDemandData.test.ts
```

Expected: suite fails to import the missing `supplyDemandData.ts` module.

- [x] **Step 3: Implement the minimal data module**

Implement these public contracts:

```ts
export type SupplyDemandDataErrorCode = 'INVALID_FILTER' | 'INVALID_ROUTE' | 'INVALID_RESPONSE' | 'ABORTED';

export class SupplyDemandDataError extends Error {
  constructor(readonly code: SupplyDemandDataErrorCode) {
    super(code);
    this.name = 'SupplyDemandDataError';
  }
}

export const buildDemandListQuery = (
  filters: Partial<Omit<DemandListQuery, 'pageNum' | 'pageSize'>>,
  page: Pick<DemandListQuery, 'pageNum' | 'pageSize'>
): DemandListQuery => {
  const query: DemandListQuery = { pageNum: page.pageNum, pageSize: page.pageSize };
  const setText = (key: 'keyword' | 'city' | 'district', value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) query[key] = trimmed;
  };
  setText('keyword', filters.keyword);
  setText('city', filters.city);
  setText('district', filters.district);
  if (filters.typeId !== undefined) query.typeId = filters.typeId;
  if (filters.status !== undefined) query.status = filters.status;
  const parsed = enterpriseRequestSchema.safeParse({ operation: 'demand.list', payload: query });
  if (!parsed.success) throw new SupplyDemandDataError('INVALID_FILTER');
  return query;
};
```

For `loadDemandTypes`, `loadDemandList`, and `loadDemandDetail`, call only the exact `EnterpriseClient.request` operation, verify `response.operation`, re-run `parseEnterpriseResponse` at the injected-client boundary, and check `signal.aborted` before and after awaiting. `parseDemandRouteParams` must accept `typeId=0`, reject negative/non-canonical/unsafe values, and preserve the signed `demandId` string with `isEnterpriseEntityId(demandId, 31)`.

- [x] **Step 4: Run and verify GREEN**

```powershell
npm run test -- tests/unit/enterprise/supplyDemandData.test.ts
```

Expected: all tests PASS.

- [x] **Step 5: Commit the renderer data boundary**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/supplyDemand/supplyDemandData.ts tests/unit/enterprise/supplyDemandData.test.ts
git commit -m "feat(demand): 封装供需页面数据边界"
```

Completed as commit `83a75b8` (`feat(demand): 封装供需页面数据边界`).

### Task 5: Build the List, Filters, Paging, and Quick Preview

**Files:**

- Modify: `tests/unit/enterprise/SupplyDemandPage.dom.test.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/supplyDemand/SupplyDemandListPage.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/supplyDemand/supply-demand.module.css`

- [x] **Step 1: Add failing behavior tests**

Split tests so each verifies one behavior. First extract these render helpers beside the existing `createClient`:

```tsx
const renderList = (client: EnterpriseClient) =>
  render(
    <EnterpriseAntdProvider>
      <MemoryRouter initialEntries={['/enterprise/supply-demand']}>
        <Routes>
          <Route path='/enterprise/supply-demand' element={<SupplyDemandListPage client={client} />} />
          <Route path='/enterprise/supply-demand/:typeId/:demandId' element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </EnterpriseAntdProvider>
  );

const renderDetail = (path: string, client: EnterpriseClient) =>
  render(
    <EnterpriseAntdProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path='/enterprise/supply-demand/:typeId/:demandId'
            element={<SupplyDemandDetailPage client={client} />}
          />
        </Routes>
      </MemoryRouter>
    </EnterpriseAntdProvider>
  );
```

Use the existing `createClient`, `MemoryRouter`, and `EnterpriseAntdProvider` setup, with these exact inputs and assertions:

```ts
it('submits trimmed filters and resets to page one', async () => {
  const client = createClient();
  renderList(client);
  await screen.findByText('精密零件加工');
  await userEvent.type(screen.getByLabelText('enterprise.supplyDemand.filters.keyword'), '  航空零件  ');
  await userEvent.click(screen.getByRole('button', { name: 'enterprise.supplyDemand.actions.search' }));
  await waitFor(() =>
    expect(client.request).toHaveBeenLastCalledWith({
      operation: 'demand.list',
      payload: { keyword: '航空零件', pageNum: 1, pageSize: 20 },
    })
  );
});
```

For the retry test, implement `client.request` so `demand.types` always resolves, the first `demand.list` rejects with `new Error('network')`, and the second returns `listResponse`. Assert the button named `enterprise.actions.retry` appears, click it, and assert `精密零件加工` appears and the list operation was called twice.

For stale-response suppression, hold the first `demand.list` in a manually controlled Promise, submit keyword `航空零件` so the second call resolves with title `航空零件加工`, then resolve the first call with title `旧供需结果`. Assert the second title is visible and the old title is absent.

For pagination, return `total: 21, pages: 2`, replace `HTMLElement.prototype.scrollIntoView` with a spy, click the Ant pagination button named `2`, and assert the next list payload has `pageNum: 2` and the scroll spy was called.

- [x] **Step 2: Run and verify RED**

```powershell
npm run test -- tests/unit/enterprise/SupplyDemandPage.dom.test.tsx
```

Expected: suite still fails because `SupplyDemandListPage.tsx` is missing.

- [x] **Step 3: Implement the page state machine**

Use a monotonically increasing request generation and `AbortController`:

```ts
const generationRef = useRef(0);

const fetchList = useCallback(
  async (query: DemandListQuery) => {
    const generation = ++generationRef.current;
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setState({ status: 'loading' });
    try {
      const data = await loadDemandList(client, query, controller.signal);
      if (generation === generationRef.current) setState({ status: 'ready', data });
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setState({ status: 'error' });
    }
  },
  [client]
);
```

Render:

- Ant `Form`, `Input`, database-backed type `Select`, city/district inputs, status `Select`, primary search `Button`, reset `Button`.
- Ant `Table` with title, type, enterprise, area, budget, state, published date, and action.
- A right-side quick-preview card updated by row selection.
- Shared `EnterprisePageState` for full-width loading, empty, and error/retry.
- Controlled `Pagination` and `useEnterprisePaginationScroll` after successful page changes.
- Detail links built with `encodeURIComponent(String(typeId))` and `encodeURIComponent(demandId)`.

- [x] **Step 4: Implement scoped styles**

Use enterprise tokens and no hardcoded component colors:

```css
.page {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: var(--enterprise-space-lg);
}

.contentGrid {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
  gap: var(--enterprise-space-lg);
}

@media (max-width: 1180px) {
  .contentGrid {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [x] **Step 5: Run and verify GREEN**

```powershell
npm run test -- tests/unit/enterprise/SupplyDemandPage.dom.test.tsx tests/unit/enterprise/useEnterprisePaginationScroll.dom.test.tsx
```

Expected: list, retry, stale-response, navigation, and paging tests PASS.

### Task 6: Build the Typed Detail Page

**Files:**

- Modify: `tests/unit/enterprise/SupplyDemandPage.dom.test.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/supplyDemand/SupplyDemandDetailPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/supplyDemand/supply-demand.module.css`

- [x] **Step 1: Add failing route/error tests**

```ts
it('does not call IO for an invalid detail route', async () => {
  const client = createClient();
  renderDetail('/enterprise/supply-demand/0/1%20OR%201=1', client);
  expect(await screen.findByText('enterprise.supplyDemand.errors.invalidRoute')).toBeVisible();
  expect(client.request).not.toHaveBeenCalled();
});
```

Add a second test with a client whose first `demand.detail` call rejects with `new Error('network')` and whose second call returns `detailResponse`. Assert `enterprise.actions.retry` is shown, click it, then assert the heading `精密零件加工` is visible and `demand.detail` was called twice.

- [x] **Step 2: Run and verify RED**

```powershell
npm run test -- tests/unit/enterprise/SupplyDemandPage.dom.test.tsx
```

Expected: detail tests fail because the page is missing.

- [x] **Step 3: Implement the detail page**

The page must:

1. Parse `typeId` and `demandId` before IO.
2. Use a per-request `AbortController` and ignore stale/unmounted completion.
3. Render a translated back button to `/enterprise/supply-demand`.
4. Render title, type badge, company, area, budget, status, time, and public summary.
5. Render `fields` in backend order using Ant `Descriptions`; append `unit` only when present.
6. Never render internal IDs, OpenID, user ID, contacts, phone, service fee, or raw `PARAMn` labels.
7. Use `EnterprisePageState` for loading/error/not-found responses.

Use this safe field display function:

```ts
const displayFieldValue = (field: EnterpriseDemandDetailField): string =>
  field.unit ? `${field.value} ${field.unit}` : field.value;
```

- [x] **Step 4: Run and verify GREEN**

```powershell
npm run test -- tests/unit/enterprise/SupplyDemandPage.dom.test.tsx
```

Expected: all list and detail DOM tests PASS.

- [x] **Step 5: Commit list and detail UI**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/supplyDemand tests/unit/enterprise/SupplyDemandPage.dom.test.tsx
git commit -m "feat(demand): 开发供需列表与详情页面"
```

Completed as commit `b0cc961` (`feat(demand): 开发供需列表与详情页面`).

### Task 7: Wire Routes, Navigation, Dashboard Entry, and i18n

**Files:**

- Modify: `packages/desktop/src/renderer/components/layout/Router.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseSider.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseHeader.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/dashboard/DashboardPage.tsx`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/{zh-CN,en-US,ja-JP,zh-TW,ko-KR,tr-TR,ru-RU,uk-UA,pt-BR,de-DE}/enterprise.json`
- Modify: `tests/unit/enterprise/EnterpriseRouter.dom.test.tsx`
- Modify: `tests/unit/enterprise/DashboardPage.dom.test.tsx`
- Modify: `tests/unit/enterprise/EnterpriseLogout.dom.test.tsx`

- [x] **Step 1: Write failing route and entry tests**

Assert:

```ts
expect(screen.getByRole('link', { name: 'enterprise.navigation.supplyDemand' })).toHaveAttribute(
  'href',
  '/enterprise/supply-demand'
);
```

Add route tests for both paths:

```text
/enterprise/supply-demand
/enterprise/supply-demand/6/-800000000000000001
```

Verify the dashboard quick link uses the same path. In `EnterpriseLogout.dom.test.tsx`, preserve the existing user-owned brand assertions while adding the supply-demand link expectation.

- [x] **Step 2: Run and verify RED**

```powershell
npm run test -- tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/DashboardPage.dom.test.tsx tests/unit/enterprise/EnterpriseLogout.dom.test.tsx
```

Expected: supply-demand links/routes are missing.

- [x] **Step 3: Wire lazy routes**

Add:

```ts
const SupplyDemandListPage = React.lazy(() => import('@renderer/pages/enterprise/supplyDemand/SupplyDemandListPage'));
const SupplyDemandDetailPage = React.lazy(
  () => import('@renderer/pages/enterprise/supplyDemand/SupplyDemandDetailPage')
);
```

Routes:

```tsx
<Route path='supply-demand' element={withRouteFallback(SupplyDemandListPage)} />
<Route path='supply-demand/:typeId/:demandId' element={withRouteFallback(SupplyDemandDetailPage)} />
```

- [x] **Step 4: Add navigation and header matching**

Under the resource group, after projects:

```ts
{ path: '/enterprise/supply-demand', labelKey: 'enterprise.navigation.supplyDemand', Icon: ExchangeFour },
```

Add the same quick link to `DashboardPage`. In `EnterpriseHeader`, match the detail path before the list path.

- [x] **Step 5: Add complete translations**

Add the same key shape to all ten locale files under `enterprise`:

```json
{
  "navigation": { "supplyDemand": "供需对接" },
  "routes": {
    "supplyDemand": { "title": "供需对接" },
    "supplyDemandDetail": { "title": "供需详情" }
  },
  "supplyDemand": {
    "title": "供需对接",
    "subtitle": "查询已审核的企业供需信息",
    "filters": {
      "keyword": "关键词",
      "type": "供需类型",
      "city": "城市",
      "district": "区县",
      "status": "状态"
    },
    "actions": { "search": "查询供需", "reset": "重置筛选", "detail": "查看详情", "back": "返回供需列表" },
    "states": { "loading": "正在加载供需信息", "empty": "暂无符合条件的供需信息" },
    "errors": { "load": "供需信息加载失败", "invalidRoute": "供需详情地址无效" }
  }
}
```

Use equivalent translations for non-Chinese locales; do not copy Chinese text into every locale.

- [x] **Step 6: Regenerate and validate i18n**

```powershell
npm run i18n:types
node scripts/check-i18n.js
npm run test -- tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/DashboardPage.dom.test.tsx tests/unit/enterprise/EnterpriseLogout.dom.test.tsx
```

Expected: i18n validation and route/entry tests PASS.

- [x] **Step 7: Commit integration UI**

```powershell
git add packages/desktop/src/renderer/components/layout/Router.tsx packages/desktop/src/renderer/pages/enterprise/layout packages/desktop/src/renderer/pages/enterprise/dashboard packages/desktop/src/renderer/services/i18n/locales tests/unit/enterprise
git diff --cached --name-only
git commit -m "feat(demand): 接入供需导航与工作台入口"
```

Before committing, verify the stage includes the intended existing brand changes only if the user wants them in this commit; otherwise unstage those brand-only hunks without reverting the files.

Completed as commit `2bad1c0` (`feat(demand): 接入供需导航与工作台入口`). The commit includes the previously confirmed graphical product-mark change and excludes the unrelated enterprise data-validation migration.

### Task 8: Cross-Layer Verification and Documentation

**Files:**

- Modify: `docs/ai-development-handoff/03-current-status.md`
- Modify: `docs/ai-development-handoff/04-data-and-api-contracts.md`
- Force-add: `docs/superpowers/specs/2026-07-20-enterprise-supply-demand-design.md`
- Force-add: `docs/superpowers/plans/2026-07-20-enterprise-supply-demand.md`

- [x] **Step 1: Run complete demand-focused frontend verification**

```powershell
npm run test -- tests/unit/enterprise/supplyDemandApiClient.test.ts tests/unit/enterprise/supplyDemandData.test.ts tests/unit/enterprise/SupplyDemandPage.dom.test.tsx tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/DashboardPage.dom.test.tsx tests/unit/enterprise/EnterpriseLogout.dom.test.tsx
npm run typecheck:enterprise-tests
npm run i18n:types
node scripts/check-i18n.js
npm run format:check
npm run lint
npm run package
```

Expected: all commands exit 0. If a repository-wide pre-existing failure occurs, capture its exact output and prove the demand-focused checks still pass.

Verification result: 6 files / 72 tests, enterprise TypeScript, i18n, lint, and production package passed. The 21 demand-related files passed focused formatting. Repository-wide `format:check` remains blocked by six unrelated pre-existing files (`docs/specs/enterprise-code-desktop/remaining-tasks.md` and five bundled AionCore/Node resource files); these files were not modified.

- [x] **Step 2: Run backend verification**

```powershell
mvn -pl cloud-api "-Dtest=DemandQueryControllerTest,DemandQueryServiceImplTest,DemandQueryMapperTest,DemandFieldMappingSchemaContractTest" test
mvn -pl cloud-api -am package "-DskipTests"
```

Expected: demand tests and package exit 0.

Verification result: 17 focused tests passed and the four-module reactor package completed with `BUILD SUCCESS`.

- [x] **Step 3: Perform security scans**

```powershell
rg -n "OPEN_ID|USER_ID|UNION_ID|CONTACT_TEL|CONTACT_PERSON|SERVICE_FEE" cloud-api/src/main/java/com/zzy/cloud/api/controller/DemandQueryController.java cloud-api/src/main/java/com/zzy/cloud/api/dto/demand cloud-api/src/main/java/com/zzy/cloud/api/service/DemandQueryService.java cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DemandQueryServiceImpl.java cloud-api/src/main/java/com/zzy/cloud/api/vo/demand cloud-api/src/main/resources/mapper/DemandQueryMapper.xml
rg -n "fetch\(|axios|http://|https://" packages/desktop/src/renderer/pages/enterprise/supplyDemand
```

Expected: sensitive source columns do not appear in response VO/list projections; renderer contains no direct network call or hardcoded API URL. Mapper detail projection may only contain explicitly approved public columns and mapping source columns.

Verification result: sensitive response fields, Renderer direct-network patterns, and MyBatis dynamic interpolation patterns all returned zero matches.

- [x] **Step 4: Update status and API documents**

Record:

- `demand.types`, `demand.list`, `demand.detail` operation paths;
- read-only scope and excluded write operations;
- signed string ID rule and `typeId=0` source-table rule;
- DDL script location and the fact it has not been executed;
- tests actually run and remaining Oracle real-data acceptance.

- [x] **Step 5: Commit documentation**

```powershell
git add docs/ai-development-handoff/03-current-status.md docs/ai-development-handoff/04-data-and-api-contracts.md
git add -f docs/superpowers/specs/2026-07-20-enterprise-supply-demand-design.md docs/superpowers/plans/2026-07-20-enterprise-supply-demand.md
git commit -m "docs(demand): 完善供需模块实施与验收说明"
```

Completed in the documentation commit containing this plan (`docs(demand): 完善供需模块实施与验收说明`).

## 3. Manual Acceptance Gate

Do not apply `demand_field_mapping.sql` automatically. Before real-data acceptance, ask the user to confirm:

1. target Oracle service/schema is `JJGC` in the intended environment;
2. executing `CREATE TABLE`, constraints, comments, and `MERGE` seed rows is approved;
3. a rollback SQL and pre-change object check have been reviewed.

After explicit approval only:

- apply the DDL once;
- verify table, PK/check constraints, seed counts, and enabled mappings;
- call `/types`, `/list`, and `/detail` through local gateway `127.0.0.1:12580`;
- verify type `0` and at least two `J_COMMON_DEMAND` types;
- confirm no contact/OpenID fields cross the API boundary;
- verify filters, paging, preview, detail, error, empty, and narrow-window scroll behavior in Electron.
