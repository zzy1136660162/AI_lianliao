# Demand AI Iterative Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent multi-turn supply-demand AI assistant that identifies the business line, clarifies ambiguity, fills only the selected database-backed schema, protects manual edits, and leaves final publication to the user.

**Architecture:** cloud-api owns a database-persisted state machine so either production instance can continue a session. A constrained model gateway performs business-line classification and schema-bound extraction with retry/fallback, while deterministic Java validation controls thresholds, field ownership, visibility, completeness, and transitions. Electron uses fixed IPC contracts to display the conversation beside the existing dynamic form and continues to submit through the current publishing API.

**Tech Stack:** Java 8, Spring Boot 2.6, MyBatis, Oracle 11g, FastJSON, Hutool HTTP, JUnit 5, Mockito, Electron, React, TypeScript, Ant Design React, Zod, Vitest, i18next.

---

## Repository roots

- Desktop repository: `E:\ZZY_PROJECT\AI_lianliao`
- Electron application: `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC`
- Cloud repository: `E:\ZZY_PROJECT\lianshang_liaoning`
- cloud-api module: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api`
- Approved design: `E:\ZZY_PROJECT\AI_lianliao\docs\superpowers\specs\2026-07-28-demand-ai-iterative-assistant-design.md`

Do not stage unrelated changes from either dirty working tree. Database scripts are created and statically verified during development; applying Oracle DDL requires a separately authorized deployment action.

## File map

### cloud-api files to create

- `src/main/resources/db/demand_ai_conversation.sql` — idempotent Oracle session/turn schema.
- `src/main/java/com/zzy/cloud/api/config/DemandAiConversationProperties.java` — feature, expiry, turn and retry limits.
- `src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiSessionState.java` — state enum.
- `src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiConversationAction.java` — response action enum.
- `src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiFieldSnapshot.java` — value/source/confidence/lock metadata.
- `src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiLineCandidate.java` — constrained type candidate.
- `src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiLineResolution.java` — deterministic line decision.
- `src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiConversationSession.java` — persistence model.
- `src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiTurnRecord.java` — idempotent turn model.
- `src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiModelReply.java` — validated provider reply.
- `src/main/java/com/zzy/cloud/api/dto/demand/DemandAiStartRequestDTO.java`
- `src/main/java/com/zzy/cloud/api/dto/demand/DemandAiTurnRequestDTO.java`
- `src/main/java/com/zzy/cloud/api/dto/demand/DemandAiConfirmLineRequestDTO.java`
- `src/main/java/com/zzy/cloud/api/dto/demand/DemandAiPatchRequestDTO.java`
- `src/main/java/com/zzy/cloud/api/dto/demand/DemandAiSessionRequestDTO.java`
- `src/main/java/com/zzy/cloud/api/dto/demand/DemandAiCompleteRequestDTO.java`
- `src/main/java/com/zzy/cloud/api/vo/demand/DemandAiConversationVO.java` — stable client snapshot.
- `src/main/java/com/zzy/cloud/api/mapper/DemandAiConversationMapper.java`
- `src/main/resources/mapper/DemandAiConversationMapper.xml`
- `src/main/java/com/zzy/cloud/api/service/DemandAiConversationService.java`
- `src/main/java/com/zzy/cloud/api/service/demandai/DemandAiConversationStateMachine.java`
- `src/main/java/com/zzy/cloud/api/service/demandai/DemandAiPromptFactory.java`
- `src/main/java/com/zzy/cloud/api/service/demandai/DemandAiHttpTransport.java`
- `src/main/java/com/zzy/cloud/api/service/demandai/HutoolDemandAiHttpTransport.java`
- `src/main/java/com/zzy/cloud/api/service/demandai/DemandAiTransportException.java`
- `src/main/java/com/zzy/cloud/api/service/demandai/DemandAiProviderResult.java`
- `src/main/java/com/zzy/cloud/api/service/demandai/DemandAiProvidersUnavailableException.java`
- `src/main/java/com/zzy/cloud/api/service/demandai/DemandAiModelGateway.java`
- `src/main/java/com/zzy/cloud/api/service/demandai/DemandAiModelGatewayImpl.java`
- `src/main/java/com/zzy/cloud/api/service/DemandAiConversationVersionException.java`
- `src/main/java/com/zzy/cloud/api/service/impl/DemandAiConversationServiceImpl.java`
- `src/main/java/com/zzy/cloud/api/controller/DemandAiConversationController.java`

### cloud-api files to modify

- `src/main/resources/application.yml` — environment-overridable conversation settings.
- `src/main/java/com/zzy/cloud/api/service/impl/DemandAiParseServiceImpl.java` — reuse the provider gateway while retaining `/parse`.
- `src/main/java/com/zzy/cloud/api/mapper/DemandPublishMapper.java` — keep model configuration selection and success/failure counters available to the gateway.

### cloud-api tests to create

- `src/test/java/com/zzy/cloud/api/db/DemandAiConversationSchemaContractTest.java`
- `src/test/java/com/zzy/cloud/api/mapper/DemandAiConversationMapperTest.java`
- `src/test/java/com/zzy/cloud/api/service/demandai/DemandAiConversationStateMachineTest.java`
- `src/test/java/com/zzy/cloud/api/service/demandai/DemandAiModelGatewayImplTest.java`
- `src/test/java/com/zzy/cloud/api/service/impl/DemandAiConversationServiceImplTest.java`
- `src/test/java/com/zzy/cloud/api/controller/DemandAiConversationControllerTest.java`

### Electron files to create

- `packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/assistant/demandAiConversationData.ts`
- `packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/assistant/demandAiFormAdapter.ts`
- `packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/assistant/useDemandAiConversation.ts`
- `packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/assistant/DemandAiAssistantPanel.tsx`
- `packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/assistant/demand-ai-assistant.module.css`
- `tests/unit/enterprise/demandAiConversationSchemas.test.ts`
- `tests/unit/enterprise/demandAiConversationData.test.ts`
- `tests/unit/enterprise/demandAiFormAdapter.test.ts`
- `tests/unit/enterprise/DemandAiAssistantPanel.dom.test.tsx`

### Electron files to modify

- `packages/desktop/src/common/enterprise/contracts.ts`
- `packages/desktop/src/common/enterprise/rawSchemas.ts`
- `packages/desktop/src/common/enterprise/schemas.ts`
- `packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts`
- `packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`
- `packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/index.tsx`
- `packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/publish-demand.module.css`
- `packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`
- `tests/unit/enterprise/enterpriseApiClient.test.ts`
- `tests/unit/enterprise/enterpriseSchemas.test.ts`
- `tests/unit/enterprise/supplyDemandApiClient.test.ts`

---

### Task 1: Add the Oracle conversation schema and configuration

**Files:**
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\resources\db\demand_ai_conversation.sql`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\test\java\com\zzy\cloud\api\db\DemandAiConversationSchemaContractTest.java`
- Create: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\java\com\zzy\cloud\api\config\DemandAiConversationProperties.java`
- Modify: `E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\resources\application.yml`

- [ ] **Step 1: Write the failing schema contract test**

```java
class DemandAiConversationSchemaContractTest {
    private String sql;

    @BeforeEach
    void readScript() throws Exception {
        try (InputStream input = getClass().getClassLoader()
                .getResourceAsStream("db/demand_ai_conversation.sql")) {
            assertNotNull(input);
            sql = new String(IOUtils.toByteArray(input), StandardCharsets.UTF_8)
                    .toUpperCase(Locale.ROOT);
        }
    }

    @Test
    void createsSessionTurnAndIdempotencyContracts() {
        assertTrue(sql.contains("CREATE TABLE J_CY_DEMAND_AI_SESSION"));
        assertTrue(sql.contains("CREATE TABLE J_CY_DEMAND_AI_TURN"));
        assertTrue(sql.contains("UNIQUE (REQUEST_ID)"));
        assertTrue(sql.contains("VERSION_NO NUMBER"));
        assertTrue(sql.contains("FORM_VALUES_JSON CLOB"));
    }

    @Test
    void keepsOracleIdentifiersWithinThirtyCharacters() {
        Matcher matcher = Pattern.compile(
                "(?m)^\\s*(?:CREATE\\s+(?:TABLE|SEQUENCE|INDEX)|CONSTRAINT)\\s+([A-Z][A-Z0-9_]*)")
                .matcher(sql);
        while (matcher.find()) {
            assertTrue(matcher.group(1).length() <= 30, matcher.group(1));
        }
    }
}
```

- [ ] **Step 2: Run the test and verify the missing script fails**

Run:

```powershell
mvn -pl cloud-api -Dtest=DemandAiConversationSchemaContractTest test
```

Expected: FAIL because `db/demand_ai_conversation.sql` is absent.

- [ ] **Step 3: Create the idempotent Oracle 11g migration**

The migration must create:

```sql
CREATE TABLE J_CY_DEMAND_AI_SESSION (
    SESSION_ID VARCHAR2(36) NOT NULL,
    OPEN_ID VARCHAR2(255) NOT NULL,
    USER_ID VARCHAR2(64) NOT NULL,
    COMPANY_ID VARCHAR2(64) NOT NULL,
    STATE VARCHAR2(30) NOT NULL,
    TYPE_ID NUMBER,
    VARIANT_CODE VARCHAR2(50),
    LINE_CONFIDENCE NUMBER(5,4),
    FORM_VALUES_JSON CLOB,
    MISSING_FIELDS_JSON CLOB,
    WARNINGS_JSON CLOB,
    VERSION_NO NUMBER DEFAULT 1 NOT NULL,
    TURN_COUNT NUMBER DEFAULT 0 NOT NULL,
    EXPIRES_TIME VARCHAR2(14) NOT NULL,
    SUBMITTED_DEMAND_ID VARCHAR2(64),
    INPUT_TIME VARCHAR2(14) NOT NULL,
    UPDATE_TIME VARCHAR2(14) NOT NULL,
    CONSTRAINT PK_CY_DEMAND_AI_SESSION PRIMARY KEY (SESSION_ID)
);

CREATE TABLE J_CY_DEMAND_AI_TURN (
    ID NUMBER NOT NULL,
    SESSION_ID VARCHAR2(36) NOT NULL,
    TURN_NO NUMBER NOT NULL,
    REQUEST_ID VARCHAR2(36) NOT NULL,
    USER_MESSAGE CLOB,
    ASSISTANT_ACTION_JSON CLOB NOT NULL,
    MODEL_CONFIG_ID NUMBER,
    STATUS VARCHAR2(20) NOT NULL,
    LATENCY_MS NUMBER,
    ERROR_CODE VARCHAR2(50),
    INPUT_TIME VARCHAR2(14) NOT NULL,
    CONSTRAINT PK_CY_DEMAND_AI_TURN PRIMARY KEY (ID),
    CONSTRAINT UK_CY_DEMAND_AI_TURN_NO UNIQUE (SESSION_ID, TURN_NO),
    CONSTRAINT UK_CY_DEMAND_AI_REQUEST UNIQUE (REQUEST_ID),
    CONSTRAINT FK_CY_DEMAND_AI_SESSION FOREIGN KEY (SESSION_ID)
        REFERENCES J_CY_DEMAND_AI_SESSION (SESSION_ID)
);
```

Wrap table, sequence and index creation in the same `ORA-00955` idempotency pattern used by the existing database scripts. Add state/status check constraints, an index on `(OPEN_ID, UPDATE_TIME)`, and comments for every table and non-obvious column.

- [ ] **Step 4: Add typed configuration**

```java
@Component
@ConfigurationProperties(prefix = "demand-ai.conversation")
@Data
public class DemandAiConversationProperties {
    private boolean enabled = true;
    private int expiryDays = 7;
    private int maxTurns = 20;
    private int retryCount = 1;
    private double autoConfirmThreshold = 0.85D;
    private double candidateThreshold = 0.55D;
    private double minimumGap = 0.20D;

    @PostConstruct
    public void validate() {
        if (expiryDays < 1 || maxTurns < 1 || retryCount < 0) {
            throw new IllegalStateException("Invalid demand AI conversation limits");
        }
        if (candidateThreshold < 0D || autoConfirmThreshold > 1D
                || candidateThreshold >= autoConfirmThreshold
                || minimumGap < 0D || minimumGap > 1D) {
            throw new IllegalStateException("Invalid demand AI confidence thresholds");
        }
    }
}
```

Add environment-overridable YAML keys with the design defaults.

- [ ] **Step 5: Run the focused test**

Run:

```powershell
mvn -pl cloud-api -Dtest=DemandAiConversationSchemaContractTest test
```

Expected: PASS, with both Oracle identifiers and required schema clauses verified.

- [ ] **Step 6: Commit only Task 1 cloud files**

```powershell
git -C E:\ZZY_PROJECT\lianshang_liaoning add -- `
  cloud-service/cloud-api/src/main/resources/db/demand_ai_conversation.sql `
  cloud-service/cloud-api/src/main/resources/application.yml `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/config/DemandAiConversationProperties.java `
  cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/db/DemandAiConversationSchemaContractTest.java
git -C E:\ZZY_PROJECT\lianshang_liaoning commit -m "功能：增加供需AI会话数据库结构"
```

---

### Task 2: Build pure conversation state and field ownership rules

**Files:**
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiSessionState.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiConversationAction.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiFieldSnapshot.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiLineCandidate.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiLineResolution.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiModelReply.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/demandai/DemandAiConversationStateMachine.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/service/demandai/DemandAiConversationStateMachineTest.java`

- [ ] **Step 1: Write failing threshold, ownership and switch tests**

```java
@Test
void autoConfirmsOnlyWhenThresholdAndGapBothPass() {
    DemandAiLineResolution result = machine.resolveLine(Arrays.asList(
            candidate(22, 0.91D), candidate(27, 0.62D)));
    assertEquals(DemandAiSessionState.COLLECTING_FIELDS, result.getState());
    assertEquals(Integer.valueOf(22), result.getSelected().getTypeId());
}

@Test
void asksForConfirmationWhenCandidateGapIsTooSmall() {
    DemandAiLineResolution result = machine.resolveLine(Arrays.asList(
            candidate(22, 0.90D), candidate(27, 0.78D)));
    assertEquals(DemandAiSessionState.CONFIRMING_LINE, result.getState());
    assertEquals(2, result.getCandidates().size());
}

@Test
void aiPatchNeverOverwritesManualLockedField() {
    Map<String, DemandAiFieldSnapshot> current = singletonMap(
            "budget", DemandAiFieldSnapshot.manual("10~50万元", 2));
    Map<String, String> patch = singletonMap("budget", "100万元以上");
    Map<String, DemandAiFieldSnapshot> merged = machine.mergeAiPatch(current, patch,
            singletonMap("budget", 0.96D), 3);
    assertEquals("10~50万元", merged.get("budget").getValue());
    assertEquals("MANUAL", merged.get("budget").getSource());
}

@Test
void lineSwitchKeepsOnlyBaseFields() {
    Map<String, DemandAiFieldSnapshot> switched = machine.retainBaseFields(values(
            "title", "采购零件", "budget", "10万元", "packingType", "纸箱"));
    assertTrue(switched.containsKey("title"));
    assertTrue(switched.containsKey("budget"));
    assertFalse(switched.containsKey("packingType"));
}
```

- [ ] **Step 2: Run the state-machine test and verify missing types fail**

Run:

```powershell
mvn -pl cloud-api -Dtest=DemandAiConversationStateMachineTest test
```

Expected: compilation FAIL because the state machine and domain types do not exist.

- [ ] **Step 3: Implement the enums and immutable state values**

Use exactly:

```java
public enum DemandAiSessionState {
    DISCOVERING_LINE,
    CONFIRMING_LINE,
    COLLECTING_FIELDS,
    CONFIRMING_SWITCH,
    REVIEW_READY,
    SUBMITTED,
    CANCELLED
}

public enum DemandAiConversationAction {
    ASK,
    CONFIRM_LINE,
    APPLY_PATCH,
    CONFIRM_SWITCH,
    REVIEW_READY,
    RETRY_AVAILABLE
}
```

`DemandAiFieldSnapshot` must expose factory methods `ai`, `manual`, and `system`. Manual/system snapshots are always locked; AI snapshots are unlocked.

`DemandAiLineResolution` is an immutable Lombok value with:

```java
@Value
@Builder
public class DemandAiLineResolution {
    DemandAiSessionState state;
    DemandAiLineCandidate selected;
    List<DemandAiLineCandidate> candidates;
}
```

- [ ] **Step 4: Implement deterministic state-machine methods**

The public surface must be:

```java
public DemandAiLineResolution resolveLine(List<DemandAiLineCandidate> candidates);

public Map<String, DemandAiFieldSnapshot> mergeAiPatch(
        Map<String, DemandAiFieldSnapshot> current,
        Map<String, String> patch,
        Map<String, Double> confidence,
        int turn);

public Map<String, DemandAiFieldSnapshot> mergeManualPatch(
        Map<String, DemandAiFieldSnapshot> current,
        Map<String, String> patch,
        int turn);

public Map<String, DemandAiFieldSnapshot> retainBaseFields(
        Map<String, DemandAiFieldSnapshot> current);

public List<String> selectQuestionFields(
        List<DemandPublishFieldVO> visibleFields,
        Map<String, DemandAiFieldSnapshot> values,
        int limit);
```

`resolveLine` sorts candidates, caps returned candidates at three, and applies the configured `0.85/0.55/0.20` thresholds. `selectQuestionFields` returns required missing fields first, grouped by `groupCode`, and never exceeds three.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
mvn -pl cloud-api -Dtest=DemandAiConversationStateMachineTest test
```

Expected: PASS for thresholds, manual ownership, base-field retention and maximum question count.

- [ ] **Step 6: Commit Task 2**

```powershell
git -C E:\ZZY_PROJECT\lianshang_liaoning add -- `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/domain/demand/ai `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/demandai/DemandAiConversationStateMachine.java `
  cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/service/demandai/DemandAiConversationStateMachineTest.java
git -C E:\ZZY_PROJECT\lianshang_liaoning commit -m "功能：实现供需AI会话状态规则"
```

---

### Task 3: Add persistent sessions, idempotent turns and optimistic locking

**Files:**
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiConversationSession.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiTurnRecord.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/mapper/DemandAiConversationMapper.java`
- Create: `cloud-api/src/main/resources/mapper/DemandAiConversationMapper.xml`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/mapper/DemandAiConversationMapperTest.java`

- [ ] **Step 1: Write a failing MyBatis contract test**

```java
@Test
void optimisticUpdateBindsSessionAndExpectedVersion() {
    DemandAiConversationSession session = new DemandAiConversationSession();
    session.setSessionId("session-1");
    session.setVersionNo(4);
    String sql = normalize(statement("updateSessionOptimistic")
            .getBoundSql(session).getSql());
    assertTrue(sql.contains("where session_id = ?"));
    assertTrue(sql.contains("and version_no = ?"));
    assertTrue(sql.contains("version_no = version_no + 1"));
}

@Test
void turnLookupUsesUniqueRequestId() {
    String sql = normalize(statement("selectTurnByRequestId")
            .getBoundSql("request-1").getSql());
    assertTrue(sql.contains("where request_id = ?"));
}
```

- [ ] **Step 2: Run and verify the missing mapper fails**

Run:

```powershell
mvn -pl cloud-api -Dtest=DemandAiConversationMapperTest test
```

Expected: FAIL because `DemandAiConversationMapper.xml` does not exist.

- [ ] **Step 3: Implement mapper operations**

The mapper interface must contain:

```java
int insertSession(DemandAiConversationSession session);
DemandAiConversationSession selectSession(@Param("sessionId") String sessionId,
                                          @Param("openId") String openId);
DemandAiConversationSession selectLatestActiveSession(@Param("openId") String openId,
                                                      @Param("now") String now);
int updateSessionOptimistic(DemandAiConversationSession session);
String selectNextTurnId();
int insertTurn(DemandAiTurnRecord turn);
DemandAiTurnRecord selectTurnByRequestId(String requestId);
int markSubmitted(@Param("sessionId") String sessionId,
                  @Param("openId") String openId,
                  @Param("versionNo") Integer versionNo,
                  @Param("demandId") String demandId,
                  @Param("updateTime") String updateTime);
```

All identifiers remain strings in Java. The XML maps CLOB values to strings, filters sessions by the trusted openId, excludes terminal/expired sessions from latest-resume, and uses `VERSION_NO` in every mutating statement.

- [ ] **Step 4: Implement idempotency behavior in mapper SQL**

`insertTurn` stores the response snapshot before returning it to Electron. If `REQUEST_ID` already exists, service code must call `selectTurnByRequestId` and return the stored action instead of invoking the model again. Do not use `MAX(TURN_NO)+1`; derive the next turn from the locked session's `TURN_COUNT + 1`.

- [ ] **Step 5: Run mapper and schema tests**

Run:

```powershell
mvn -pl cloud-api -Dtest=DemandAiConversationSchemaContractTest,DemandAiConversationMapperTest test
```

Expected: PASS and MyBatis XML parsing succeeds.

- [ ] **Step 6: Commit Task 3**

```powershell
git -C E:\ZZY_PROJECT\lianshang_liaoning add -- `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiConversationSession.java `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/domain/demand/ai/DemandAiTurnRecord.java `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/mapper/DemandAiConversationMapper.java `
  cloud-service/cloud-api/src/main/resources/mapper/DemandAiConversationMapper.xml `
  cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/mapper/DemandAiConversationMapperTest.java
git -C E:\ZZY_PROJECT\lianshang_liaoning commit -m "功能：持久化供需AI会话与轮次"
```

---

### Task 4: Extract a testable model gateway with retry and fallback

**Files:**
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/demandai/DemandAiPromptFactory.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/demandai/DemandAiHttpTransport.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/demandai/HutoolDemandAiHttpTransport.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/demandai/DemandAiTransportException.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/demandai/DemandAiProviderResult.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/demandai/DemandAiProvidersUnavailableException.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/demandai/DemandAiModelGateway.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/demandai/DemandAiModelGatewayImpl.java`
- Modify: `cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DemandAiParseServiceImpl.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/service/demandai/DemandAiModelGatewayImplTest.java`

- [ ] **Step 1: Write failing provider fallback tests**

```java
@Test
void retriesIoFailureOnceThenUsesSecondProvider() {
    when(mapper.selectAiModelConfigs("DEMAND_PARSE"))
            .thenReturn(Arrays.asList(model(1L), model(2L)));
    when(transport.execute(eq(model(1L)), any(JSONObject.class)))
            .thenThrow(new DemandAiTransportException("NETWORK", true))
            .thenThrow(new DemandAiTransportException("NETWORK", true));
    when(transport.execute(eq(model(2L)), any(JSONObject.class)))
            .thenReturn(validReply());

    DemandAiProviderResult result = gateway.invoke("FIELD_EXTRACTION", payload());

    assertEquals(Long.valueOf(2L), result.getModelConfigId());
    verify(transport, times(2)).execute(eq(model(1L)), any(JSONObject.class));
    verify(mapper).markModelFailure(1L);
    verify(mapper).markModelSuccess(2L);
}

@Test
void authenticationFailureDoesNotRetrySameProvider() {
    when(transport.execute(any(), any()))
            .thenThrow(new DemandAiTransportException("AUTHENTICATION", false));
    assertThrows(DemandAiProvidersUnavailableException.class,
            () -> gateway.invoke("LINE_CLASSIFICATION", payload()));
    verify(transport, times(1)).execute(any(), any());
}
```

- [ ] **Step 2: Run and verify gateway classes are missing**

Run:

```powershell
mvn -pl cloud-api -Dtest=DemandAiModelGatewayImplTest test
```

Expected: compilation FAIL.

- [ ] **Step 3: Implement the transport boundary**

```java
public interface DemandAiHttpTransport {
    JSONObject execute(DemandAiModelConfigRow config, JSONObject payload);
}
```

`HutoolDemandAiHttpTransport` owns URL construction, Authorization header, proxy, timeout and response parsing. It classifies errors into `NETWORK`, `TIMEOUT`, `AUTHENTICATION`, `RATE_LIMIT`, `PROVIDER_5XX`, `INVALID_RESPONSE` without including API keys or response bodies in exceptions.

Supporting contracts:

```java
@Getter
public final class DemandAiTransportException extends RuntimeException {
    private final String errorCode;
    private final boolean retryable;

    public DemandAiTransportException(String errorCode, boolean retryable) {
        super(errorCode);
        this.errorCode = errorCode;
        this.retryable = retryable;
    }
}

@Value
public class DemandAiProviderResult {
    Long modelConfigId;
    JSONObject response;
    long latencyMs;
}

public final class DemandAiProvidersUnavailableException extends RuntimeException {
    public DemandAiProvidersUnavailableException(String errorCode) {
        super(errorCode);
    }
}
```

- [ ] **Step 4: Implement gateway retry/fallback**

```java
public interface DemandAiModelGateway {
    DemandAiProviderResult invoke(String purpose, JSONObject payload);
}
```

The gateway selects configs by existing priority/weight logic, retries only retryable errors up to `retryCount`, marks success/failure, and returns the selected config ID plus validated JSON. It must not log the full payload or raw model response.

- [ ] **Step 5: Implement separate prompts**

`DemandAiPromptFactory` exposes:

```java
JSONObject classificationPayload(List<DemandTypeOptionVO> types, String message);
JSONObject extractionPayload(DemandPublishSchemaVO schema,
                             Map<String, DemandAiFieldSnapshot> current,
                             String message,
                             List<String> questionFieldKeys);
```

Classification output is restricted to `{candidates, clarificationQuestion}`. Extraction output is restricted to `{fieldPatch, confidence, lineConflict, questionFieldKeys, assistantMessage}`. Include only allowed type IDs, field keys and dictionary values.

- [ ] **Step 6: Preserve one-shot compatibility**

Refactor `DemandAiParseServiceImpl` to call the gateway for its provider request while retaining the current request/response contract and schema filtering. Existing `/DemandPublishController/parse` behavior and tests must remain valid.

- [ ] **Step 7: Run gateway and existing demand tests**

Run:

```powershell
mvn -pl cloud-api -Dtest=DemandAiModelGatewayImplTest,DemandQueryMapperTest test
```

Expected: PASS; no live provider call occurs in tests.

- [ ] **Step 8: Commit Task 4**

```powershell
git -C E:\ZZY_PROJECT\lianshang_liaoning add -- `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/demandai `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DemandAiParseServiceImpl.java `
  cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/service/demandai/DemandAiModelGatewayImplTest.java
git -C E:\ZZY_PROJECT\lianshang_liaoning commit -m "重构：增加供需AI模型重试与故障切换"
```

---

### Task 5: Implement the multi-turn orchestration service

**Files:**
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/dto/demand/DemandAiStartRequestDTO.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/dto/demand/DemandAiTurnRequestDTO.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/dto/demand/DemandAiConfirmLineRequestDTO.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/dto/demand/DemandAiPatchRequestDTO.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/dto/demand/DemandAiSessionRequestDTO.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/dto/demand/DemandAiCompleteRequestDTO.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/vo/demand/DemandAiConversationVO.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/DemandAiConversationService.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/DemandAiConversationVersionException.java`
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DemandAiConversationServiceImpl.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/service/impl/DemandAiConversationServiceImplTest.java`

- [ ] **Step 1: Write failing orchestration tests**

Cover these exact scenarios:

```java
@Test
void highConfidenceStartClassifiesExtractsAndPersistsOneTurn() {
    when(gateway.invoke(eq("LINE_CLASSIFICATION"), any())).thenReturn(highConfidenceType22());
    when(gateway.invoke(eq("FIELD_EXTRACTION"), any())).thenReturn(extractedTitleAndQuantity());
    DemandAiConversationVO result = service.start(startRequest());
    assertEquals("COLLECTING_FIELDS", result.getState());
    assertEquals(Integer.valueOf(22), result.getLineDecision().getTypeId());
    assertEquals("采购零件", result.getFormValues().get("title").getValue());
    verify(mapper).insertTurn(any(DemandAiTurnRecord.class));
}

@Test
void duplicateRequestReturnsStoredTurnWithoutCallingModel() {
    when(mapper.selectTurnByRequestId("request-1")).thenReturn(storedTurn());
    DemandAiConversationVO result = service.turn(turnRequest("request-1"));
    assertEquals("ASK", result.getAction());
    verifyNoInteractions(gateway);
}

@Test
void staleVersionReturnsConflictWithoutOverwritingSession() {
    when(mapper.updateSessionOptimistic(any())).thenReturn(0);
    assertThrows(DemandAiConversationVersionException.class,
            () -> service.patch(patchRequest(3)));
}

@Test
void allProvidersUnavailableKeepsFormAndReturnsRetryAction() {
    when(gateway.invoke(anyString(), any()))
            .thenThrow(new DemandAiProvidersUnavailableException("NETWORK"));
    DemandAiConversationVO result = service.turn(turnRequest("request-2"));
    assertEquals("RETRY_AVAILABLE", result.getAction());
    assertEquals(existingFormValues(), result.getFormValues());
}
```

- [ ] **Step 2: Run and verify the service is missing**

Run:

```powershell
mvn -pl cloud-api -Dtest=DemandAiConversationServiceImplTest test
```

Expected: compilation FAIL.

- [ ] **Step 3: Define the service API**

```java
public interface DemandAiConversationService {
    DemandAiConversationVO start(DemandAiStartRequestDTO request);
    DemandAiConversationVO turn(DemandAiTurnRequestDTO request);
    DemandAiConversationVO confirmLine(DemandAiConfirmLineRequestDTO request);
    DemandAiConversationVO patch(DemandAiPatchRequestDTO request);
    DemandAiConversationVO resume(DemandAiSessionRequestDTO request);
    DemandAiConversationVO cancel(DemandAiSessionRequestDTO request);
    DemandAiConversationVO complete(DemandAiCompleteRequestDTO request);
}
```

Every DTO carries `openId`; every mutating DTO carries a UUID `requestId`; existing session mutations also carry `sessionId` and `version`.

Use this stable conflict type:

```java
public class DemandAiConversationVersionException extends RuntimeException {
    public DemandAiConversationVersionException() {
        super("会话已在其他位置更新，请刷新后继续");
    }
}
```

- [ ] **Step 4: Implement start and turn transactions**

`start` validates identity, creates a UUID session, classifies the line, optionally performs first extraction, stores the session and turn, and returns the persisted snapshot.

`turn` checks openId ownership, expiry, terminal state, max 20 turns and request idempotency before invoking the model. It applies schema visibility and option validation after every model reply. When required visible fields are complete it returns `REVIEW_READY`; otherwise it returns an `ASK` message for no more than three fields.

- [ ] **Step 5: Implement confirm, patch, resume, cancel and complete**

- `confirmLine`: verifies the selected type is among the returned candidates or allowed types, then loads its schema.
- `patch`: serializes manual values using the same format as `DemandPublishServiceImpl`; unknown fields are rejected.
- `resume`: when sessionId is absent, loads the latest non-terminal session for openId.
- `cancel`: optimistic transition to `CANCELLED`.
- `complete`: idempotently records `SUBMITTED` and `demandId`; it never publishes the demand itself.

- [ ] **Step 6: Calculate a stable completion value**

Use:

```text
required contribution = requiredFilled / max(requiredTotal, 1) * 0.8
optional contribution = optionalFilled / max(optionalTotal, 1) * 0.2
completion = min(1.0, required contribution + optional contribution)
```

If there are no optional fields, required contribution uses the full weight. `REVIEW_READY` depends only on visible required fields, not the percentage.

- [ ] **Step 7: Run focused service tests**

Run:

```powershell
mvn -pl cloud-api -Dtest=DemandAiConversationStateMachineTest,DemandAiConversationServiceImplTest test
```

Expected: PASS for high/mid confidence, idempotency, version conflict, manual locking, switch behavior, max turns and provider degradation.

- [ ] **Step 8: Commit Task 5**

```powershell
git -C E:\ZZY_PROJECT\lianshang_liaoning add -- `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/dto/demand/DemandAi* `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/vo/demand/DemandAiConversationVO.java `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/DemandAiConversationService.java `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/DemandAiConversationVersionException.java `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/service/impl/DemandAiConversationServiceImpl.java `
  cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/service/impl/DemandAiConversationServiceImplTest.java
git -C E:\ZZY_PROJECT\lianshang_liaoning commit -m "功能：实现供需AI多轮会话编排"
```

---

### Task 6: Expose fixed cloud-api conversation endpoints

**Files:**
- Create: `cloud-api/src/main/java/com/zzy/cloud/api/controller/DemandAiConversationController.java`
- Test: `cloud-api/src/test/java/com/zzy/cloud/api/controller/DemandAiConversationControllerTest.java`

- [ ] **Step 1: Write failing MockMvc endpoint tests**

```java
@Test
void startReturnsConversationSnapshot() throws Exception {
    when(service.start(any())).thenReturn(snapshot("COLLECTING_FIELDS", "ASK"));
    mockMvc.perform(post("/DemandAiConversationController/start")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"openId\":\"openid-1\",\"requestId\":\"request-uuid\","
                    + "\"initialMessage\":\"采购200件不锈钢零件\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.state").value("COLLECTING_FIELDS"));
}

@Test
void staleVersionReturnsStableRefreshMessage() throws Exception {
    when(service.turn(any())).thenThrow(new DemandAiConversationVersionException());
    mockMvc.perform(post("/DemandAiConversationController/turn")
            .contentType(MediaType.APPLICATION_JSON)
            .content(validTurnJson()))
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.message").value("会话已在其他位置更新，请刷新后继续"));
}
```

- [ ] **Step 2: Run and verify the controller is missing**

Run:

```powershell
mvn -pl cloud-api -Dtest=DemandAiConversationControllerTest test
```

Expected: compilation FAIL.

- [ ] **Step 3: Implement all POST endpoints**

Create:

```text
/DemandAiConversationController/start
/DemandAiConversationController/turn
/DemandAiConversationController/confirm-line
/DemandAiConversationController/patch
/DemandAiConversationController/resume
/DemandAiConversationController/cancel
/DemandAiConversationController/complete
```

Controllers only translate stable validation/version/provider exceptions into `CommonResult`. Do not log request bodies. Unexpected exceptions return a generic Chinese message and a server-side trace ID.

- [ ] **Step 4: Run controller and service tests**

Run:

```powershell
mvn -pl cloud-api -Dtest=DemandAiConversationControllerTest,DemandAiConversationServiceImplTest test
```

Expected: PASS.

- [ ] **Step 5: Compile cloud-api**

Run:

```powershell
mvn -pl cloud-api -am -DskipTests compile
```

Expected: reactor BUILD SUCCESS.

- [ ] **Step 6: Commit Task 6**

```powershell
git -C E:\ZZY_PROJECT\lianshang_liaoning add -- `
  cloud-service/cloud-api/src/main/java/com/zzy/cloud/api/controller/DemandAiConversationController.java `
  cloud-service/cloud-api/src/test/java/com/zzy/cloud/api/controller/DemandAiConversationControllerTest.java
git -C E:\ZZY_PROJECT\lianshang_liaoning commit -m "功能：开放供需AI多轮会话接口"
```

---

### Task 7: Add strict Electron IPC contracts and fixed API routes

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/contracts.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/rawSchemas.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/enterprise/schemas.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`
- Test: `LianLiaoAIPC/tests/unit/enterprise/demandAiConversationSchemas.test.ts`
- Test: `LianLiaoAIPC/tests/unit/enterprise/enterpriseApiClient.test.ts`
- Test: `LianLiaoAIPC/tests/unit/enterprise/supplyDemandApiClient.test.ts`

- [ ] **Step 1: Write failing request/response schema tests**

```typescript
const UUID = '3f594650-3437-4fd8-9cb8-bcef46f1df72';

it('accepts a strict AI start request and rejects renderer-supplied openId', () => {
  expect(
    enterpriseRequestSchema.safeParse({
      operation: 'demand.aiConversation.start',
      payload: { requestId: UUID, initialMessage: '采购200件零件' },
    }).success
  ).toBe(true);
  expect(
    enterpriseRequestSchema.safeParse({
      operation: 'demand.aiConversation.start',
      payload: { requestId: UUID, initialMessage: '采购200件零件', openId: 'forged' },
    }).success
  ).toBe(false);
});

it('rejects an AI snapshot containing an unknown action or field source', () => {
  expect(() =>
    parseEnterpriseResponse('demand.aiConversation.start', {
      sessionId: UUID,
      version: 1,
      state: 'COLLECTING_FIELDS',
      action: 'RUN_TOOL',
      formValues: {},
      missingRequiredFields: [],
      warnings: [],
      completion: 0,
    })
  ).toThrow();
});
```

- [ ] **Step 2: Run and verify operation types are missing**

Run:

```powershell
bunx vitest run tests/unit/enterprise/demandAiConversationSchemas.test.ts
```

Expected: FAIL because the operations and schemas do not exist.

- [ ] **Step 3: Add the shared contracts**

Add exact unions:

```typescript
export type DemandAiSessionState =
  | 'DISCOVERING_LINE' | 'CONFIRMING_LINE' | 'COLLECTING_FIELDS'
  | 'CONFIRMING_SWITCH' | 'REVIEW_READY' | 'SUBMITTED' | 'CANCELLED';

export type DemandAiConversationAction =
  | 'ASK' | 'CONFIRM_LINE' | 'APPLY_PATCH'
  | 'CONFIRM_SWITCH' | 'REVIEW_READY' | 'RETRY_AVAILABLE';

export type DemandAiFieldSnapshot = {
  value: string;
  source: 'AI' | 'MANUAL' | 'SYSTEM';
  confidence?: number;
  updatedTurn: number;
  locked: boolean;
};
```

Define the full conversation response from the approved design and request payloads for start, turn, confirmLine, patch, resume, cancel and complete. UUID fields use lowercase/uppercase hex-compatible UUID validation and all collections have bounded sizes.

- [ ] **Step 4: Add fixed routes**

```typescript
'demand.aiConversation.start': 'cloud-api/DemandAiConversationController/start',
'demand.aiConversation.turn': 'cloud-api/DemandAiConversationController/turn',
'demand.aiConversation.confirmLine': 'cloud-api/DemandAiConversationController/confirm-line',
'demand.aiConversation.patch': 'cloud-api/DemandAiConversationController/patch',
'demand.aiConversation.resume': 'cloud-api/DemandAiConversationController/resume',
'demand.aiConversation.cancel': 'cloud-api/DemandAiConversationController/cancel',
'demand.aiConversation.complete': 'cloud-api/DemandAiConversationController/complete',
```

Update the route-map equality test so an omitted or absolute route fails.

- [ ] **Step 5: Inject trusted identity in the main process**

Extend `serializeRequest` so every conversation operation receives `openId` from `EnterpriseUserContext`. Never accept openId in renderer payloads. Preserve requestId/sessionId/version exactly and enforce the existing request timeout boundary.

- [ ] **Step 6: Run contract/client tests and typecheck**

Run:

```powershell
bunx vitest run `
  tests/unit/enterprise/demandAiConversationSchemas.test.ts `
  tests/unit/enterprise/enterpriseApiClient.test.ts `
  tests/unit/enterprise/supplyDemandApiClient.test.ts
bunx tsc --noEmit
```

Expected: all selected tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit Task 7**

```powershell
git -C E:\ZZY_PROJECT\AI_lianliao add -- `
  LianLiaoAIPC/packages/desktop/src/common/enterprise/contracts.ts `
  LianLiaoAIPC/packages/desktop/src/common/enterprise/rawSchemas.ts `
  LianLiaoAIPC/packages/desktop/src/common/enterprise/schemas.ts `
  LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts `
  LianLiaoAIPC/packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts `
  LianLiaoAIPC/tests/unit/enterprise/demandAiConversationSchemas.test.ts `
  LianLiaoAIPC/tests/unit/enterprise/enterpriseApiClient.test.ts `
  LianLiaoAIPC/tests/unit/enterprise/supplyDemandApiClient.test.ts
git -C E:\ZZY_PROJECT\AI_lianliao commit -m "功能：增加供需AI会话桌面契约"
```

---

### Task 8: Build renderer data functions, form adapter and session hook

**Files:**
- Create: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/assistant/demandAiConversationData.ts`
- Create: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/assistant/demandAiFormAdapter.ts`
- Create: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/assistant/useDemandAiConversation.ts`
- Test: `LianLiaoAIPC/tests/unit/enterprise/demandAiConversationData.test.ts`
- Test: `LianLiaoAIPC/tests/unit/enterprise/demandAiFormAdapter.test.ts`

- [ ] **Step 1: Write failing adapter and operation tests**

```typescript
const UUID = '3f594650-3437-4fd8-9cb8-bcef46f1df72';

it('converts AI snapshots to Ant form values by schema input type', () => {
  expect(
    toPublishFormPatch(schema, {
      quantity: aiValue('200'),
      deliveryDate: aiValue('2026-08-20'),
      processType: aiValue('车削、铣削'),
    })
  ).toEqual({
    quantity: 200,
    deliveryDate: dayjs('2026-08-20'),
    processType: ['车削', '铣削'],
  });
});

it('serializes only changed manual fields for patch', () => {
  expect(toManualPatch(schema, { budget: '10~50万元' }))
    .toEqual({ budget: '10~50万元' });
});

it('starts and resumes through exact operations', async () => {
  await startDemandAiConversation(client, UUID, '采购200件零件');
  expect(client.request).toHaveBeenCalledWith({
    operation: 'demand.aiConversation.start',
    payload: { requestId: UUID, initialMessage: '采购200件零件' },
  });
});
```

- [ ] **Step 2: Run and verify helper modules are missing**

Run:

```powershell
bunx vitest run `
  tests/unit/enterprise/demandAiConversationData.test.ts `
  tests/unit/enterprise/demandAiFormAdapter.test.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement one function per API action**

`demandAiConversationData.ts` exports:

```typescript
startDemandAiConversation(client, requestId, initialMessage)
sendDemandAiTurn(client, sessionId, requestId, version, message)
confirmDemandAiLine(client, payload)
patchDemandAiFields(client, payload)
resumeDemandAiConversation(client, sessionId?)
cancelDemandAiConversation(client, sessionId, requestId, version)
completeDemandAiConversation(client, sessionId, requestId, version, demandId)
```

Every function checks the response operation and throws a stable local error for mismatches.

- [ ] **Step 4: Implement schema-aware form conversion**

`demandAiFormAdapter.ts` converts dates to Dayjs, numbers to finite numbers, multi-select strings by `valueSeparator`, custom selects to one-element arrays and images to URL arrays. Manual changes are serialized with existing `serializePublishFieldValue`; unknown fields are dropped before the request.

- [ ] **Step 5: Implement the stateful hook**

The hook exposes:

```typescript
{
  snapshot,
  messages,
  loading,
  error,
  start,
  send,
  confirmLine,
  confirmSwitch,
  patchManualFields,
  resume,
  retry,
  cancel,
  markSubmitted
}
```

Use one `AbortController` per active request, ignore stale responses, generate `crypto.randomUUID()` request IDs and debounce manual patches for 400 ms. Retain the failed request for one explicit retry without generating a new requestId.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```powershell
bunx vitest run `
  tests/unit/enterprise/demandAiConversationData.test.ts `
  tests/unit/enterprise/demandAiFormAdapter.test.ts
bunx tsc --noEmit
```

Expected: PASS and TypeScript exits 0.

- [ ] **Step 7: Commit Task 8**

```powershell
git -C E:\ZZY_PROJECT\AI_lianliao add -- `
  LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/assistant `
  LianLiaoAIPC/tests/unit/enterprise/demandAiConversationData.test.ts `
  LianLiaoAIPC/tests/unit/enterprise/demandAiFormAdapter.test.ts
git -C E:\ZZY_PROJECT\AI_lianliao commit -m "功能：实现供需AI会话前端状态"
```

---

### Task 9: Integrate the assistant panel beside the dynamic form

**Files:**
- Create: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/assistant/DemandAiAssistantPanel.tsx`
- Create: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/assistant/demand-ai-assistant.module.css`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/index.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish/publish-demand.module.css`
- Test: `LianLiaoAIPC/tests/unit/enterprise/DemandAiAssistantPanel.dom.test.tsx`

- [ ] **Step 1: Write failing DOM flow tests**

Test these user-visible paths:

```typescript
it('shows candidate buttons instead of changing type for ambiguous input', async () => {
  renderPanel(snapshot({ state: 'CONFIRMING_LINE', candidates: [type22, type27] }));
  expect(screen.getByRole('button', { name: '紧急采购' })).toBeVisible();
  expect(onConfirmLine).not.toHaveBeenCalled();
});

it('applies AI values and marks them without overriding manual fields', async () => {
  renderPublishPageWithConversation(aiSnapshot);
  expect(screen.getByLabelText('采购数量')).toHaveValue('200');
  expect(screen.getByText('AI 填写')).toBeVisible();
  await userEvent.clear(screen.getByLabelText('采购数量'));
  await userEvent.type(screen.getByLabelText('采购数量'), '300');
  expect(onPatchManual).toHaveBeenCalledWith({ quantity: '300' });
});

it('never submits when review becomes ready', () => {
  renderPanel(snapshot({ state: 'REVIEW_READY', action: 'REVIEW_READY' }));
  expect(screen.getByText('请检查表单后手动提交审核')).toBeVisible();
  expect(publishDemand).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and verify the panel is missing**

Run:

```powershell
bunx vitest run tests/unit/enterprise/DemandAiAssistantPanel.dom.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the assistant panel**

The panel renders:

- Initial large textarea and “让 AI 帮我填写”.
- Conversation messages with stable keys.
- Up to three business candidate buttons.
- Confirm-switch card showing kept/cleared fields.
- Completion progress.
- Retry/manual fallback for `RETRY_AVAILABLE`.
- Review summary and non-blocking warnings.
- Cancel action.

Use Ant Design components already installed; do not add another UI library.

- [ ] **Step 4: Integrate with the existing Form**

`Publish/index.tsx` must:

- Keep the existing database-driven schema renderer.
- Apply `snapshot.formValues` with `form.setFieldsValue(toPublishFormPatch(...))`.
- Mark AI/manual field sources next to labels.
- Send changed manual values through the debounced patch hook.
- Treat manual type selection during an active session as `confirmLine` or `confirmSwitch`.
- Preserve the existing purely manual workflow if no AI session is started.
- Call `markSubmitted` only after `publishDemand` returns a real demandId.

- [ ] **Step 5: Implement responsive layout**

Desktop grid:

```css
.workspace {
  display: grid;
  grid-template-columns: minmax(320px, 38fr) minmax(560px, 62fr);
  gap: 20px;
  align-items: start;
}

@media (max-width: 1100px) {
  .workspace {
    grid-template-columns: 1fr;
  }
}
```

The conversation card has its own bounded scroll area and must not extend the overall Electron shell height.

- [ ] **Step 6: Run DOM tests and typecheck**

Run:

```powershell
bunx vitest run `
  tests/unit/enterprise/DemandAiAssistantPanel.dom.test.tsx `
  tests/unit/enterprise/SupplyDemandPage.dom.test.tsx
bunx tsc --noEmit
```

Expected: PASS with no React act warnings introduced by the new tests.

- [ ] **Step 7: Commit Task 9**

```powershell
git -C E:\ZZY_PROJECT\AI_lianliao add -- `
  LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/supplyDemand/Publish `
  LianLiaoAIPC/tests/unit/enterprise/DemandAiAssistantPanel.dom.test.tsx
git -C E:\ZZY_PROJECT\AI_lianliao commit -m "功能：集成供需AI多轮发布助手"
```

---

### Task 10: Add complete translations, compatibility fallback and deployment documentation

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/zh-CN/enterprise.json`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/en-US/enterprise.json`
- Modify: all other `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`
- Modify: `E:\ZZY_PROJECT\AI_lianliao\docs\H5_SUPPLY_DEMAND_ALIGNMENT.md`
- Create: `E:\ZZY_PROJECT\AI_lianliao\docs\DEMAND_AI_CONVERSATION_DEPLOYMENT.md`

- [ ] **Step 1: Add the complete Chinese key tree**

Under `enterprise.supplyDemand.publish.aiConversation`, add keys for:

```text
startTitle, startPlaceholder, startAction, currentLine, completion,
candidateTitle, clarificationTitle, confirmLine, switchTitle,
switchKeep, switchClear, confirmSwitch, rejectSwitch, aiFilled,
manualFilled, retry, continueManually, reviewTitle, reviewHint,
missingOptional, warningTitle, cancel, cancelConfirm, expired,
maxTurns, versionConflict, unavailable
```

Use literal, reader-facing Chinese; do not put API or database terminology in UI strings.

- [ ] **Step 2: Add matching keys to all ten locales**

Every locale must have the same enterprise key set. English fallback text is acceptable only where that locale already uses English for enterprise pages; Chinese and English must be fully authored.

- [ ] **Step 3: Generate and validate i18n types**

Run:

```powershell
bun run i18n:types
node scripts/check-i18n.js
```

Expected: enterprise locale keys are complete and generated key types are synchronized. Existing unrelated global warnings may remain, but no warning may mention `aiConversation`.

- [ ] **Step 4: Document deployment and rollback**

`DEMAND_AI_CONVERSATION_DEPLOYMENT.md` must state:

1. Apply `demand_ai_conversation.sql` using the JJGC Oracle account.
2. Verify tables, constraints, indexes and sequence with read-only SQL.
3. Configure at least one enabled `DEMAND_PARSE` model; two are recommended for fallback.
4. Deploy both cloud-api instances.
5. Smoke-test through the shared gateway.
6. Release Electron only after cloud verification.
7. Roll back by setting `DEMAND_AI_CONVERSATION_ENABLED=false`; do not drop session tables.

Update the H5 alignment document to note that multi-turn AI uses the same schema and does not alter H5.

- [ ] **Step 5: Commit Task 10**

```powershell
git -C E:\ZZY_PROJECT\AI_lianliao add -- `
  LianLiaoAIPC/packages/desktop/src/renderer/services/i18n `
  docs/H5_SUPPLY_DEMAND_ALIGNMENT.md `
  docs/DEMAND_AI_CONVERSATION_DEPLOYMENT.md
git -C E:\ZZY_PROJECT\AI_lianliao commit -m "文档：补充供需AI会话发布与多语言"
```

---

### Task 11: Run final verification and local smoke tests

**Files:**
- Verify only; do not add generated build output.

- [ ] **Step 1: Run cloud focused tests**

```powershell
mvn -pl cloud-api -Dtest=DemandAiConversationSchemaContractTest,DemandAiConversationMapperTest,DemandAiConversationStateMachineTest,DemandAiModelGatewayImplTest,DemandAiConversationServiceImplTest,DemandAiConversationControllerTest test
```

Expected: all selected tests PASS.

- [ ] **Step 2: Compile the full cloud-api dependency chain**

```powershell
mvn -pl cloud-api -am -DskipTests compile
```

Expected: reactor BUILD SUCCESS.

- [ ] **Step 3: Run Electron core tests**

```powershell
bunx vitest run `
  tests/unit/enterprise/demandAiConversationSchemas.test.ts `
  tests/unit/enterprise/demandAiConversationData.test.ts `
  tests/unit/enterprise/demandAiFormAdapter.test.ts `
  tests/unit/enterprise/DemandAiAssistantPanel.dom.test.tsx `
  tests/unit/enterprise/enterpriseApiClient.test.ts `
  tests/unit/enterprise/enterpriseSchemas.test.ts `
  tests/unit/enterprise/supplyDemandApiClient.test.ts `
  tests/unit/enterprise/supplyDemandData.test.ts
```

Expected: all selected files PASS.

- [ ] **Step 4: Run Electron static checks**

```powershell
bunx tsc --noEmit
node scripts/check-i18n.js
git diff --check
```

Expected: TypeScript and diff checks exit 0; no new enterprise i18n inconsistency.

- [ ] **Step 5: Verify the database migration statically**

Parse both new MyBatis XML files with the existing JUnit tests and run a PowerShell identifier scan:

```powershell
$sql = Get-Content `
  E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\resources\db\demand_ai_conversation.sql `
  -Raw -Encoding utf8
$names = [regex]::Matches(
  $sql,
  '(?im)^\s*(?:CREATE\s+(?:TABLE|SEQUENCE|INDEX)|CONSTRAINT)\s+([A-Z][A-Z0-9_$#]*)'
) | ForEach-Object { $_.Groups[1].Value }
if ($names | Where-Object Length -gt 30) { throw 'Oracle identifier exceeds 30 characters' }
```

Expected: no exception. Do not execute DDL during this development verification.

- [ ] **Step 6: After authorized migration, run the local gateway smoke path**

Using a registered Electron session, verify:

```text
POST http://127.0.0.1:12580/cloud-api/DemandAiConversationController/start
POST http://127.0.0.1:12580/cloud-api/DemandAiConversationController/turn
POST http://127.0.0.1:12580/cloud-api/DemandAiConversationController/patch
POST http://127.0.0.1:12580/cloud-api/DemandAiConversationController/complete
```

Expected:

- Clear purchase text selects type 22 and returns an initial field patch.
- Ambiguous text returns `CONFIRM_LINE` without silently selecting a type.
- Manual budget remains unchanged after the next AI turn.
- Provider outage returns `RETRY_AVAILABLE` with the existing form snapshot.
- Complete changes only the AI session state and does not create another demand.

- [ ] **Step 7: Inspect both repositories before handoff**

```powershell
git -C E:\ZZY_PROJECT\AI_lianliao status --short
git -C E:\ZZY_PROJECT\lianshang_liaoning status --short
```

Expected: only intentional changes remain; no secrets, database dumps, logs, `target`, `out`, screenshots or installers are staged.
