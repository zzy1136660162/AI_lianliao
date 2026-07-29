# 供需发布 AI 多轮助手部署说明

更新日期：2026-07-28

## 功能范围

本功能在 Electron 供需发布页提供多轮 AI 助手：

- 根据自然语言识别供需业务线；高置信度时自动进入对应表单，存在歧义时最多给出 3 个候选项。
- 业务线明确后，只提取该业务线数据库元数据允许的字段。
- AI 填写、用户手工填写和系统生成的字段分别记录来源；用户手工修改拥有最高优先级。
- 切换业务线前要求用户确认，切换后只保留标题、地区、预算、需求概况等通用字段。
- 会话和每一轮响应写入 Oracle，双机 cloud-api 可以继续同一会话。
- AI 只协助填表，最终发布仍由用户点击原有“发布”按钮完成。

## 部署前提

部署涉及两个代码目录：

- Electron：`E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC`
- cloud-api：`E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api`

数据库 DDL 不会随 Java 服务自动执行。应先备份数据库，并由有权限的运维人员在测试环境验证后执行。

## 数据库脚本顺序

使用 cloud-api 所连接的同一个 Oracle 业务账号，依次执行：

1. `src/main/resources/db/demand_field_mapping.sql`
2. `src/main/resources/db/demand_publish_metadata.sql`
3. `src/main/resources/db/demand_publish_ai.sql`
4. `src/main/resources/db/demand_ai_conversation.sql`

前三个脚本已在环境中执行过时仍可重复执行；脚本采用幂等创建或 `MERGE`。第四个脚本只创建多轮会话表、轮次表、序列和索引，不修改现有供需数据。

执行后至少确认以下对象存在：

```sql
SELECT OBJECT_NAME, OBJECT_TYPE
FROM USER_OBJECTS
WHERE OBJECT_NAME IN (
    'J_CY_AI_MODEL_CFG',
    'J_CY_DEMAND_AI_SESSION',
    'J_CY_DEMAND_AI_TURN',
    'SEQ_CY_DEMAND_AI_TURN',
    'IDX_CY_DEMAND_AI_OPENID'
)
ORDER BY OBJECT_TYPE, OBJECT_NAME;
```

预期存在 3 张表、1 个序列和 1 个索引。Oracle 11g 标识符均不超过 30 个字符。

## 模型配置

模型统一读取 `J_CY_AI_MODEL_CFG`，业务编码必须为 `DEMAND_PARSE`。生产环境至少启用一个配置，建议再准备一个不同供应商或不同线路的备用配置。

```sql
SELECT ID, BUSINESS_CODE, PROVIDER_CODE, MODEL_NAME, BASE_URL,
       PRIORITY, WEIGHT, TIMEOUT_MS, MAX_TOKENS, ENABLED,
       FAILURE_COUNT, LAST_SUCCESS_TIME, LAST_FAILURE_TIME
FROM J_CY_AI_MODEL_CFG
WHERE BUSINESS_CODE = 'DEMAND_PARSE'
ORDER BY PRIORITY, WEIGHT DESC, ID;
```

选择规则：

- `ENABLED='Y'` 且 `API_KEY` 非空才参与调用。
- `PRIORITY` 数值越小越优先。
- 同一优先级按 `WEIGHT` 从高到低选择。
- 当前 MiniMax 中国区 OpenAI 兼容地址为 `https://api.minimaxi.com/v1`，请求实际发送到 `/chat/completions`。
- 密钥只保存在数据库，不通过接口、日志或部署文档输出。
- 主模型失败后按配置重试并尝试下一配置；成功与失败时间会回写配置表。

## cloud-api 配置

默认配置位于 `application.yml`：

```yaml
demand-ai:
  proxy:
    enabled: true
    host: 10.2.202.23
    port: 8443
  conversation:
    enabled: true
    expiry-days: 7
    max-turns: 20
    retry-count: 1
    auto-confirm-threshold: 0.85
    candidate-threshold: 0.55
    minimum-gap: 0.20
```

所有值都可通过环境变量覆盖：

- `DEMAND_AI_PROXY_ENABLED`
- `DEMAND_AI_PROXY_HOST`
- `DEMAND_AI_PROXY_PORT`
- `DEMAND_AI_CONVERSATION_ENABLED`
- `DEMAND_AI_CONVERSATION_EXPIRY_DAYS`
- `DEMAND_AI_CONVERSATION_MAX_TURNS`
- `DEMAND_AI_CONVERSATION_RETRY_COUNT`
- `DEMAND_AI_CONVERSATION_AUTO_CONFIRM_THRESHOLD`
- `DEMAND_AI_CONVERSATION_CANDIDATE_THRESHOLD`
- `DEMAND_AI_CONVERSATION_MINIMUM_GAP`

生产双机 `10.2.24.13` 和 `10.2.202.23` 必须部署相同 cloud-api 包并连接同一 Oracle 库。会话状态不存 JVM 内存，因此负载均衡无需会话粘滞。

## 发布顺序

1. 备份并执行数据库脚本。
2. 检查 `DEMAND_PARSE` 模型配置、密钥和代理连通性。
3. 在一台 cloud-api 实例上部署新包并通过健康检查。
4. 使用测试账号完成一次“描述需求 → 确认业务线 → 补充字段 → 人工发布”的冒烟流程。
5. 部署第二台 cloud-api 实例。
6. 发布包含新供需助手的 Electron 安装包。

不应先发布 Electron 再部署数据库与 cloud-api，否则客户端会得到“AI 助手暂时不可用”提示，但手工发布表单仍可继续使用。

## 接口清单

所有接口均为 `POST`，完整前缀为 `/cloud-api/DemandAiConversationController`：

| 路径 | 用途 |
|---|---|
| `/start` | 新建会话，可带第一段自然语言 |
| `/turn` | 提交一轮自然语言 |
| `/confirm-line` | 确认候选业务线或确认切换 |
| `/patch` | 同步用户手工修改的字段 |
| `/resume` | 恢复当前账号最近的未完成会话 |
| `/cancel` | 取消会话 |
| `/complete` | 原发布接口成功后绑定供需编号并结束会话 |

Electron 渲染层不会传入 `openId`；主进程从当前可信登录上下文注入。直接调试 cloud-api 时才需要在请求体中提供测试账号的 `openId`。

## 冒烟验证

1. 登录 Electron，进入“供需对接 → 发布供需”。
2. 输入同时包含业务线和关键字段的描述，例如设备维修、紧急采购或仓储租售需求。
3. 验证高置信度描述自动选择业务线；模糊描述先显示候选项。
4. 手工修改 AI 已填字段，再补充一轮描述，确认手工值不会被 AI 覆盖。
5. 主动切换业务线，确认出现二次确认，并且只保留通用字段。
6. 关闭并重新进入发布页，确认未完成会话可恢复。
7. 点击发布，确认仍调用原供需发布接口；发布成功后会话状态变为 `SUBMITTED`。

数据库核验：

```sql
SELECT SESSION_ID, OPEN_ID, STATE, TYPE_ID, VERSION_NO, TURN_COUNT,
       SUBMITTED_DEMAND_ID, INPUT_TIME, UPDATE_TIME
FROM J_CY_DEMAND_AI_SESSION
ORDER BY UPDATE_TIME DESC;

SELECT SESSION_ID, TURN_NO, REQUEST_ID, STATUS, MODEL_CONFIG_ID,
       LATENCY_MS, ERROR_CODE, INPUT_TIME
FROM J_CY_DEMAND_AI_TURN
ORDER BY ID DESC;
```

不要在排障截图中展示 `OPEN_ID`、`USER_MESSAGE`、模型响应正文或 `API_KEY`。

## 关闭与回滚

最小风险关闭方式是在两台 cloud-api 上设置：

```text
DEMAND_AI_CONVERSATION_ENABLED=false
```

并重启实例。关闭后 AI 会话接口拒绝新操作，原有手工供需发布接口不受影响。

回滚 Java/Electron 版本时保留新表，不需要删除数据。数据库表是新增对象，删除表会破坏历史会话审计，不作为常规回滚步骤。若仅模型不可用，可将对应配置的 `ENABLED` 改为 `N`，启用备用模型后再观察失败计数与最后成功时间。
