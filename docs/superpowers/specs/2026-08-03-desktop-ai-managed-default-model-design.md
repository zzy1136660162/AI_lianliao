# 链辽桌面 AI 数据库托管默认模型设计

## 1. 背景与目标

链辽 AI 通用对话当前只读取 LianLiaoAICore 本地 Provider。当本机未配置 Provider 时，发送消息会提示“未配置模型，请前往设置页面配置”。业务侧已经通过 Oracle 表 `J_CY_AI_MODEL_CFG` 管理供需解析和产业检索模型，因此桌面通用 AI 也应由同一张表集中下发默认模型。

本次目标：

- 新增业务编码 `DESKTOP_AI_CHAT`，独立管理桌面通用 AI 默认模型。
- cloud-api 从数据库读取启用模型。
- Electron 主进程将配置托管同步到 LianLiaoAICore 本地 Provider。
- 新会话默认使用数据库模型；用户在当前会话手动切换后，以用户选择为准。
- 云端暂时不可用时继续使用上次同步成功的本地模型。

本次不建设完整的大模型反向代理，不修改 LianLiaoAICore Provider REST 契约，不将模型密钥写入源码、日志或文档。

## 2. 已确认现状

`J_CY_AI_MODEL_CFG` 当前已有以下启用业务配置：

| BUSINESS_CODE | Provider | Model | Protocol |
| --- | --- | --- | --- |
| `DEMAND_PARSE` | `minimax-cn` | `MiniMax-M3` | `OPENAI_CHAT_COMPLETIONS` |
| `CATALOG_ASSISTANT` | `minimax-cn` | `MiniMax-M3` | `OPENAI_CHAT_COMPLETIONS` |

Electron 的 `useGuidModelSelection` 通过 LianLiaoAICore `/api/providers` 读取本地 Provider，并在没有明确选择时使用第一个可用模型。cloud-api 模型配置目前不会自动进入该 Provider 列表。

## 3. 方案选择

采用“Electron 主进程托管同步”方案：

1. cloud-api 读取 `DESKTOP_AI_CHAT`。
2. Electron 主进程通过 HTTPS 获取托管配置。
3. 主进程调用本机 LianLiaoAICore Provider API 完成幂等创建或更新。
4. 渲染进程只接收同步结果，不接收 cloud-api 原始模型配置。
5. AI 页面刷新本地 Provider 列表并选择固定托管 Provider。

未采用的方案：

- 渲染进程直接读取配置：密钥会额外经过 React 状态和开发者工具。
- cloud-api 代理全部模型请求：需要兼容 SSE、工具调用、多轮上下文和取消语义，超出本次默认模型目标。

## 4. 数据库设计

业务编码固定为：

```text
DESKTOP_AI_CHAT
```

新增可重复执行的 Oracle `MERGE` 脚本，从当前启用的 `DEMAND_PARSE` 配置复制以下字段：

- `PROVIDER_CODE`
- `MODEL_NAME`
- `BASE_URL`
- `PROTOCOL_TYPE`
- `API_KEY`
- `PRIORITY`
- `WEIGHT`
- `TIMEOUT_MS`
- `MAX_TOKENS`

唯一性继续由 `(BUSINESS_CODE, PROVIDER_CODE, MODEL_NAME)` 保证。脚本不包含任何明文密钥。

本次经用户明确授权，在开发数据库执行该 `MERGE`，执行后只读核对新增记录，不输出 `API_KEY` 内容。

## 5. cloud-api 设计

### 5.1 查询规则

新增专用 Mapper 查询桌面模型配置：

- `BUSINESS_CODE = 'DESKTOP_AI_CHAT'`
- `ENABLED = 'Y'`
- `API_KEY IS NOT NULL`
- `ORDER BY PRIORITY ASC, WEIGHT DESC, ID ASC`
- 只返回第一条可用配置

### 5.2 接口

新增桌面模型 Controller 与 Service，接口只供 Electron 主进程调用。响应字段：

```text
providerCode
modelName
baseUrl
protocolType
apiKey
timeoutMs
maxTokens
configVersion
```

`configVersion` 由配置 ID 和更新时间组合生成，用于识别云端配置变化，不包含密钥。

### 5.3 安全和日志

- Controller、Service、异常日志禁止记录响应对象、API Key 或完整请求头。
- 诊断日志只记录业务编码、配置 ID、Provider、模型名和查询结果状态。
- 密钥只在 HTTPS 响应体和 Electron 主进程内存中短暂存在。
- 接口异常统一返回普通失败信息，不将数据库异常或密钥带给客户端。

## 6. Electron 与 LianLiaoAICore 设计

### 6.1 固定托管标识

托管 Provider ID 固定为：

```text
lianliao-managed-desktop-ai
```

显示名称固定为“链辽托管模型”。该固定 ID 用于幂等更新、默认选择和区分用户自行创建的 Provider。

### 6.2 Provider 映射

首版映射：

| cloud-api providerCode | LianLiaoAICore platform |
| --- | --- |
| `minimax-cn` | `custom` |

Provider 内容：

- `base_url` 使用数据库 `BASE_URL`。
- `api_key` 使用数据库 `API_KEY`。
- `models` 只包含数据库 `MODEL_NAME`。
- `enabled = true`。
- 能力至少包含文本和 function calling，以支持通用 AI 和工具调用。

未知 `providerCode` 不做猜测映射，同步返回不支持状态并保留本机已有托管 Provider。

### 6.3 幂等同步

主进程同步步骤：

1. 请求 cloud-api 托管配置。
2. 查询 LianLiaoAICore `/api/providers`。
3. 固定 ID 不存在时执行创建。
4. 固定 ID 已存在时执行更新。
5. 不删除、不覆盖其他用户 Provider。
6. 同步失败时不删除原托管 Provider。

LianLiaoAICore 继续负责本地 API Key 加密存储。正式日志不得输出 Provider 请求体或响应体。

### 6.4 触发时机

- LianLiaoAICore 可用后执行一次启动期最佳努力同步。
- 进入 AI 首页且 Provider 列表尚未包含托管 Provider 时再执行一次按需同步。
- 同一进程内合并并发同步，避免重复请求和重复创建。

## 7. 默认选择与用户选择

- 新 AI 会话优先选择固定托管 Provider 的数据库模型。
- 用户在模型选择器中手动选择其他模型后，当前会话不再被后台同步覆盖。
- 新建会话重新应用数据库托管默认值。
- 数据库配置更新后，下次同步更新同一固定 Provider；已有运行中会话不强制切换。
- 设置页面继续展示用户自行配置的模型，托管 Provider 与用户 Provider 共存。

## 8. 失败和回退

| 场景 | 行为 |
| --- | --- |
| cloud-api 可用且配置有效 | 创建或更新托管 Provider并默认选中 |
| cloud-api 不可用，但本地已有托管 Provider | 使用本地缓存，不阻塞 AI |
| cloud-api 返回空配置，但本地已有托管 Provider | 保留本地配置并记录无配置状态 |
| cloud-api 返回未知 Provider | 保留本地配置，不进行错误覆盖 |
| cloud-api 与本地均无模型 | 保留现有“未配置模型”提示 |
| AionCore Provider 更新失败 | 保留旧 Provider，返回同步失败状态 |

## 9. 代码范围

### cloud-service/cloud-api

- 桌面模型配置 DTO/VO。
- Mapper 查询。
- Service 和 Controller。
- `DESKTOP_AI_CHAT` 幂等初始化 SQL。

### LianLiaoAIPC

- 公共托管模型契约与校验。
- cloud-api 路由和主进程客户端方法。
- 主进程托管同步服务与 IPC。
- preload 暴露仅返回状态的同步方法。
- AI 首页模型加载与默认选择逻辑。

### LianLiaoAICore

本次不修改。继续复用现有 `/api/providers` 创建和更新接口。

## 10. 验证范围

用户要求先开发后测试，不采用 TDD。开发完成后执行核心风险验证：

1. SQL 连续执行两次仍只有一条 `DESKTOP_AI_CHAT` 配置。
2. cloud-api 在有配置、无配置和数据库异常时返回符合约定的结果。
3. 日志中不出现 API Key。
4. 首次同步可创建固定 Provider。
5. 二次同步可更新固定 Provider且不产生重复记录。
6. cloud-api 临时不可用时仍能使用本地托管 Provider。
7. AI 首页自动选中 `MiniMax-M3`。
8. 用户手动切换模型后，当前会话保持用户选择。
9. 发送一条真实消息，确认模型调用成功。
10. 运行 cloud-api 编译、Electron 类型检查和生产构建。

## 11. 非目标

- 不建设模型配置后台管理页面。
- 不实现 cloud-api OpenAI 兼容反向代理。
- 不改变 AionCore Provider 数据库结构。
- 不强制覆盖用户手动选择。
- 不自动删除本地托管 Provider。
