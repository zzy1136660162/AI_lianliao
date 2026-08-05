# Desktop AI Managed Default Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI workspace automatically use the enabled `DESKTOP_AI_CHAT` model from `J_CY_AI_MODEL_CFG`, while preserving an explicit model choice made by the user in the current AI session.

**Architecture:** Cloud API selects the highest-priority enabled desktop-chat model and returns it only to the Electron main process. A main-process managed-model service upserts one fixed provider into the local AionCore provider store; the renderer receives only a sync status and refreshes its provider list. The AI page prefers this fixed provider only when no still-valid user selection exists.

**Tech Stack:** Java 8, Spring Boot, MyBatis, Oracle, Electron, TypeScript, React, Zod, SWR, Vitest 4, AionCore REST provider API.

**Delivery mode:** The user explicitly requested development before testing and no TDD. Implement all tasks first, then run the focused failure-path tests, type checking, cloud compilation, and database verification. Do not commit, push, publish, or deploy unless separately requested.

---

## File Map

### Cloud API

- Create `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/desktopai/DesktopAiModelConfigService.java`: select and sanitize the effective desktop model row.
- Create `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/controller/desktopai/DesktopAiModelController.java`: fixed POST endpoint for Electron main process.
- Create `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/vo/desktopai/DesktopAiModelConfigVO.java`: response object containing provider metadata and the in-memory API key.
- Modify `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/domain/demand/DemandAiModelConfigRow.java`: add update time for a non-secret config version.
- Modify `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/resources/mapper/DemandPublishMapper.xml`: select `UPDATE_TIME` with the model configuration.
- Create `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api/src/main/resources/db/desktop_ai_chat_model.sql`: idempotently copy the existing enabled `DEMAND_PARSE` connection into `DESKTOP_AI_CHAT` without embedding a key literal.

### Electron

- Create `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/common/enterprise/managed-ai-model/contracts.ts`: renderer-safe IPC status contract and fixed provider/channel constants.
- Create `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/common/enterprise/managed-ai-model/schemas.ts`: strict IPC response validation.
- Modify `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts`: add the fixed cloud endpoint.
- Modify `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`: fetch and validate the cloud model configuration without logging response data.
- Create `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/process/services/enterprise/desktopManagedAiModelService.ts`: merge concurrent syncs and upsert the fixed provider through AionCore REST.
- Modify `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/process/bridge/enterpriseBridge.ts`: register a trusted, result-only managed-model IPC handler.
- Modify `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/process/bridge/index.ts`: pass the managed-model dependency through bridge initialization.
- Modify `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/preload/main.ts`: expose only `sync()` and validate its response; never expose the cloud configuration or API key.
- Modify `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/common/types/platform/electron.ts`: type the renderer-safe bridge.
- Modify `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/index.ts`: schedule a best-effort sync after AionCore and the renderer are ready.
- Modify `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/packages/desktop/src/renderer/pages/guid/hooks/useGuidModelSelection.ts`: trigger an on-demand sync, refresh SWR, and prefer the managed provider only in the absence of a valid manual choice.

### Verification

- Create `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/tests/unit/enterprise/desktopManagedAiModelService.test.ts`: provider create/update, cache fallback, concurrent-call merge, and secret-free result tests.
- Create `E:/ZZY_PROJECT/AI_lianliao/LianLiaoAIPC/tests/unit/renderer/hooks/useGuidModelSelection.dom.test.tsx`: default selection and manual-selection preservation tests.
- Add a focused Cloud API service test only if the current Maven module test classpath can load the mapper/service without unrelated legacy failures; otherwise compile the module and verify the endpoint with the running local service.

---

### Task 1: Add the desktop model row and Cloud API contract

- [ ] **Step 1: Add the idempotent Oracle script**

Create `desktop_ai_chat_model.sql` with a `MERGE` whose source is the enabled `DEMAND_PARSE` row:

```sql
MERGE INTO J_CY_AI_MODEL_CFG target
USING (
    SELECT 'DESKTOP_AI_CHAT' BUSINESS_CODE, PROVIDER_CODE, MODEL_NAME,
           BASE_URL, PROTOCOL_TYPE, API_KEY, PRIORITY, WEIGHT,
           TIMEOUT_MS, MAX_TOKENS
    FROM J_CY_AI_MODEL_CFG
    WHERE BUSINESS_CODE = 'DEMAND_PARSE' AND ENABLED = 'Y'
) source
ON (target.BUSINESS_CODE = source.BUSINESS_CODE
    AND target.PROVIDER_CODE = source.PROVIDER_CODE
    AND target.MODEL_NAME = source.MODEL_NAME)
WHEN MATCHED THEN UPDATE SET
    target.BASE_URL = source.BASE_URL,
    target.PROTOCOL_TYPE = source.PROTOCOL_TYPE,
    target.API_KEY = source.API_KEY,
    target.PRIORITY = source.PRIORITY,
    target.WEIGHT = source.WEIGHT,
    target.TIMEOUT_MS = source.TIMEOUT_MS,
    target.MAX_TOKENS = source.MAX_TOKENS,
    target.ENABLED = 'Y',
    target.UPDATE_TIME = TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS')
WHEN NOT MATCHED THEN INSERT (
    ID, BUSINESS_CODE, PROVIDER_CODE, MODEL_NAME, BASE_URL, PROTOCOL_TYPE,
    API_KEY, PRIORITY, WEIGHT, TIMEOUT_MS, MAX_TOKENS, ENABLED,
    INPUT_TIME, UPDATE_TIME
) VALUES (
    SEQ_CY_AI_MODEL_CFG.NEXTVAL, source.BUSINESS_CODE, source.PROVIDER_CODE,
    source.MODEL_NAME, source.BASE_URL, source.PROTOCOL_TYPE, source.API_KEY,
    source.PRIORITY, source.WEIGHT, source.TIMEOUT_MS, source.MAX_TOKENS, 'Y',
    TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS'), TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS')
);
COMMIT;
```

- [ ] **Step 2: Extend the internal row and mapper**

Add `private String updateTime;` to `DemandAiModelConfigRow` and `UPDATE_TIME AS updateTime` to `selectAiModelConfigs`. Do not serialize this internal row directly.

- [ ] **Step 3: Add the response VO**

`DesktopAiModelConfigVO` must define only these fields:

```java
private String providerCode;
private String modelName;
private String baseUrl;
private String protocolType;
private String apiKey;
private Integer timeoutMs;
private Integer maxTokens;
private String configVersion;
```

`configVersion` is `id + ":" + updateTime`; it must not contain or hash the API key.

- [ ] **Step 4: Add service selection rules**

`DesktopAiModelConfigService#getDefaultConfig()` calls `selectAiModelConfigs("DESKTOP_AI_CHAT")`, uses the first row (mapper order is priority ascending, weight descending, ID ascending), rejects blank provider/model/base URL/protocol/key fields, and maps a detached VO. It must never log the row or key.

- [ ] **Step 5: Add the fixed endpoint**

Expose `POST DesktopAiModelController/defaultConfig` and return:

```java
CommonResult.success(service.getDefaultConfig())
```

When no usable configuration exists, return `CommonResult.failed("desktop AI model is unavailable")`; do not return the internal exception or model row.

### Task 2: Define a renderer-safe Electron boundary

- [ ] **Step 1: Add the shared contract**

Use one fixed provider ID and one fixed IPC channel:

```ts
export const DESKTOP_MANAGED_AI_PROVIDER_ID = 'lianliao-managed-desktop-ai';
export const DESKTOP_MANAGED_AI_SYNC_CHANNEL = 'desktop-managed-ai:sync';

export type DesktopManagedAiSyncState = 'synced' | 'cached' | 'unavailable';
export type DesktopManagedAiSyncResult = {
  state: DesktopManagedAiSyncState;
  providerId: typeof DESKTOP_MANAGED_AI_PROVIDER_ID;
  modelName?: string;
};
```

No field may contain `apiKey`, `baseUrl`, raw cloud data, or a model-provider object.

- [ ] **Step 2: Add strict schema validation**

Create a Zod object with `.strict()` for `state`, the literal provider ID, and optional non-empty `modelName`. Reject unknown fields so an accidental secret addition cannot cross preload.

- [ ] **Step 3: Type the preload surface**

Add:

```ts
desktopManagedAi?: {
  sync: () => Promise<DesktopManagedAiSyncResult>;
};
```

The preload catches IPC rejection and returns `{ state: 'unavailable', providerId }`; it validates fulfilled data with the strict schema.

### Task 3: Fetch and validate the cloud model configuration in main process

- [ ] **Step 1: Add the fixed route**

Add:

```ts
'desktopAi.defaultConfig': 'cloud-api/DesktopAiModelController/defaultConfig',
```

to `ENTERPRISE_API_ROUTES`.

- [ ] **Step 2: Define a main-process-only schema**

Inside the enterprise service layer, validate the unwrapped response with:

```ts
const desktopAiModelConfigSchema = z.object({
  providerCode: z.string().trim().min(1),
  modelName: z.string().trim().min(1),
  baseUrl: z.string().url(),
  protocolType: z.literal('OPENAI_CHAT_COMPLETIONS'),
  apiKey: z.string().trim().min(1),
  timeoutMs: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  configVersion: z.string().trim().min(1),
}).strict();
```

- [ ] **Step 3: Add a dedicated client method**

`EnterpriseApiClient#getDesktopAiModelConfig()` posts an empty JSON object to the fixed route, validates it, and throws the existing sanitized `INVALID_RESPONSE` failure when invalid. The existing failure logger records only route, endpoint, status/code, and duration.

### Task 4: Upsert the managed provider into AionCore

- [ ] **Step 1: Add pure mapping**

Map a valid cloud config to this AionCore create/update shape:

```ts
{
  id: DESKTOP_MANAGED_AI_PROVIDER_ID,
  platform: 'custom',
  name: '链辽托管模型',
  base_url: config.baseUrl,
  api_key: config.apiKey,
  models: [config.modelName],
  enabled: true,
  capabilities: [{ type: 'text' }, { type: 'function_calling' }],
  model_enabled: { [config.modelName]: true },
}
```

The Chinese provider name is stored data, not renderer UI text. Keep the AionCore API path and internal provider contract unchanged.

- [ ] **Step 2: Add injected IO dependencies**

`DesktopManagedAiModelService` accepts:

```ts
type Dependencies = {
  fetchConfig: () => Promise<DesktopAiModelConfig>;
  listProviders: () => Promise<IProvider[]>;
  createProvider: (request: CreateProviderRequest) => Promise<IProvider>;
  updateProvider: (request: { id: string } & UpdateProviderRequest) => Promise<IProvider>;
};
```

The production factory delegates to `EnterpriseApiClient` and `ipcBridge.mode`.

- [ ] **Step 3: Implement sync semantics**

If the fixed provider exists, update it; otherwise create it. If cloud retrieval or provider update fails, list providers again: return `cached` only when the fixed provider still exists with at least one enabled model, otherwise return `unavailable`. Never delete any provider and never overwrite the cached provider with partial data.

- [ ] **Step 4: Merge concurrent calls**

Store the in-flight promise and return it to every concurrent caller. Clear it in `finally`, including failure, so a later retry is possible.

### Task 5: Wire startup and on-demand synchronization

- [ ] **Step 1: Register managed-model IPC**

Add an `initDesktopManagedAiModelBridge` handler to the enterprise bridge module. It validates the sender using the same trusted-renderer rule as existing enterprise IPC and always resolves with a serializable `DesktopManagedAiSyncResult`.

- [ ] **Step 2: Create one shared main-process service instance**

Instantiate the service after process configuration exists, pass the same instance into bridge dependencies, and schedule `sync()` only after AionCore is ready and the renderer `did-finish-load` path is available. Startup failure is best-effort and must not block window creation.

- [ ] **Step 3: Add renderer on-demand retry**

In `useGuidModelSelection`, call `window.electronAPI?.desktopManagedAi?.sync()` once per hook mount. After `synced` or `cached`, call the SWR `mutate()` returned by `useProvidersQuery` to reload `/api/providers`.

- [ ] **Step 4: Prefer managed provider without overriding the user**

Resolve the default as:

```ts
const defaultModel =
  modelList.find((provider) => provider.id === DESKTOP_MANAGED_AI_PROVIDER_ID) ?? modelList[0];
```

Keep `selectedModelKeyRef` authoritative: if it still exists in the refreshed provider list, do not reset it. Only a missing/invalid selection receives the managed default.

### Task 6: Execute the authorized database change

- [ ] **Step 1: Execute the script once**

Use the repository's local Oracle query utility with transaction commit. Do not echo connection credentials, `API_KEY`, or the full row.

- [ ] **Step 2: Verify non-secret metadata**

Run:

```sql
SELECT ID, BUSINESS_CODE, PROVIDER_CODE, MODEL_NAME, BASE_URL,
       PROTOCOL_TYPE, PRIORITY, WEIGHT, TIMEOUT_MS, MAX_TOKENS,
       ENABLED, CASE WHEN API_KEY IS NULL THEN 0 ELSE 1 END AS KEY_CONFIGURED
FROM J_CY_AI_MODEL_CFG
WHERE BUSINESS_CODE = 'DESKTOP_AI_CHAT';
```

Expected: one enabled row, `KEY_CONFIGURED = 1`, provider `minimax-cn`, model `MiniMax-M3`, OpenAI-compatible protocol.

### Task 7: Focused verification after implementation

- [ ] **Step 1: Test managed provider sync risks**

Cover create, update, cloud failure with cached provider, cloud failure without cache, concurrent call coalescing, retry after failure, and absence of secret fields in the returned IPC status.

- [ ] **Step 2: Test default selection risks**

Cover managed provider preference, fallback to the first provider when managed is absent, refresh after successful sync, and preservation of an explicit valid user selection.

- [ ] **Step 3: Run focused Electron tests**

```powershell
bun run test -- tests/unit/enterprise/desktopManagedAiModelService.test.ts tests/unit/renderer/hooks/useGuidModelSelection.dom.test.tsx
```

Expected: exit code 0.

- [ ] **Step 4: Run Electron type and i18n checks**

```powershell
bunx tsc --noEmit
bun run i18n:types
node scripts/check-i18n.js
```

Expected: all exit codes 0. No new renderer-facing text is added, so locale JSON files should remain unchanged.

- [ ] **Step 5: Compile Cloud API**

```powershell
mvn -pl cloud-api -am -DskipTests package
```

Expected: `BUILD SUCCESS`. If unrelated legacy modules prevent the reactor build, run the cloud-api module compile with its established local Maven command and report the exact external blocker rather than hiding it.

- [ ] **Step 6: Static secret and whitespace checks**

```powershell
rg -n "apiKey|API_KEY" LianLiaoAIPC/packages/desktop/src/process/services/enterprise/managed-ai-model LianLiaoAIPC/packages/desktop/src/common/enterprise/managed-ai-model
git diff --check
```

Expected: API key appears only as a typed in-memory transport field and AionCore request field; it does not appear in logs, renderer-safe contracts, docs as a value, or SQL literals. `git diff --check` reports no new whitespace errors in affected files.
