# 企业工作台供需对接模块设计

- 日期：2026-07-20
- 前端：`E:/ZZY_PROJECT/AI_lianliao/AionUi`
- 后端：`E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-api`
- 旧系统参考：`E:/MyeclipseWorkSpace/JJGC_V1.0`

## 1. 目标

在企业工作台首页、左侧资源导航增加“供需对接”入口，提供真实数据库驱动的查询、分页列表、快速预览和详情页。后端以独立模块聚合 `J_DEMAND`（机加，type=0）与 `J_COMMON_DEMAND`（其他供需类型），避免 Electron 继续依赖旧系统页面 URL。

## 2. 范围

本次包含：

- 首页快捷入口和资源导航入口。
- 供需类型、关键词、地区、状态筛选及分页。
- 统一列表摘要与类型化详情字段。
- Electron 主进程固定路由白名单、严格请求/响应校验、Renderer 数据状态。
- cloud-api Controller、Service、Mapper、XML、DTO/VO 及测试。
- Oracle 字段映射表 DDL 与按旧页面梳理的种子数据。

本次不包含：需求发布、修改、删除、抢单、支付、联系方式解锁、收藏和推荐算法。这些写操作需要新的可信会话鉴权，不能只依赖客户端传入的 `openId`。

## 3. 数据模型

### 3.1 统一列表

列表仅返回公开、安全且跨类型稳定的字段：

- `demandId`：字符串业务 ID。
- `typeId`、`typeName`：类型 ID 与 `DEMAND_TYPE.NAME`。
- `title`：`J_DEMAND.PROJECT_NAME` 或 `J_COMMON_DEMAND.DEMAND_NAME`。
- `companyName`、`province`、`city`、`district`。
- `budget`、`summary`、`publishedAt`、`endTime`。
- `status`、`grabCount`、`remainingGrabCount`。
- `primaryTags`：机加的工艺/应用/材料，或公共需求中映射为列表展示的 PARAM 值。

列表不返回 `OPEN_ID`、`USER_ID`、`UNION_ID`、联系人、电话、客服标记和特殊服务费。

### 3.2 统一详情

详情由稳定公共字段和动态字段数组组成：

```text
DemandDetail
  common fields
  fields[]
    key
    label
    value
    valueType
    unit
```

动态字段由数据库映射表驱动。字段缺值时不返回该项；显示顺序按 `DISPLAY_ORDER`。前端不写死 `PARAM1...PARAM23` 的中文含义。

### 3.3 字段映射表

新增 `JJGC.DEMAND_FIELD_MAPPING`：

- `DEMAND_TYPE_ID`：关联 `DEMAND_TYPE.ID`。
- `SOURCE_TABLE`：仅允许 `J_DEMAND` 或 `J_COMMON_DEMAND`。
- `SOURCE_COLUMN`：真实源列，如 `PROCESS_TYPE`、`PARAM1`。
- `FIELD_KEY`：稳定 API 字段键。
- `FIELD_LABEL`：中文含义。
- `DISPLAY_SCOPE`：`LIST`、`DETAIL`、`BOTH`、`NONE`。
- `DISPLAY_ORDER`、`VALUE_TYPE`、`UNIT`。
- `IS_FILTER`、`IS_SENSITIVE`、`ENABLED`、`REMARK`。

主键为 `(DEMAND_TYPE_ID, SOURCE_COLUMN)`；映射数据通过幂等 `MERGE` 初始化。后端只允许读取服务端查询返回的固定列，不使用客户端输入拼接列名或 SQL。

## 4. 查询语义

列表使用显式 `UNION ALL`：

1. `J_DEMAND` 固定映射为 `type=0`。
2. `J_COMMON_DEMAND` 保留自身 `TYPE`。
3. 两支均限定有效记录与审核通过：机加兼容字符删除标记，公共需求限定 `DEL_SIGN='0'`，均限定 `IS_CHECK=1`。
4. 外层关联有效 `DEMAND_TYPE`，支持 `typeId`、关键词、城市、区县和状态筛选。
5. 稳定排序：进行中优先，随后 `INPUT_TIME DESC, DEMAND_ID DESC`。
6. 使用 `PageHelper` 分页；页码大于 0，页大小 1–100。

详情使用 `(demandId, typeId)` 定位，不依赖跨表 ID 全局唯一。type=0 读取 `J_DEMAND`，其他类型读取 `J_COMMON_DEMAND`。公开详情不返回敏感字段。

## 5. 接口契约

为兼容现有 Electron 企业客户端统一 POST 方式，新增：

- `POST /cloud-api/DemandQueryController/list`
- `POST /cloud-api/DemandQueryController/detail`
- `POST /cloud-api/DemandQueryController/types`

列表请求：`keyword/typeId/city/district/status/pageNum/pageSize`。

详情请求：`demandId/typeId`。

类型请求使用空对象，仅返回当前存在审核通过公开数据的有效类型。

响应继续使用 `CommonResult`，列表 data 为 PageInfo 兼容结构，详情 data 为稳定 VO。失败只返回固定安全消息，不透传数据库异常。

## 6. Electron UI

- 侧栏“数据资源”组在“在建项目”后增加“供需对接”。
- 首页快捷入口增加“供需对接”。
- `/enterprise/supply-demand`：筛选栏 + 表格列表 + 右侧快速预览。
- `/enterprise/supply-demand/:typeId/:demandId`：详情页，公共摘要与动态字段分区展示。
- 列表具备 loading、empty、error、retry、取消旧请求和分页回顶。
- 继续使用企业工作台现有 Ant Design 视觉体系、局部样式模块和 i18n。

## 7. 安全边界

- Renderer 不直连 cloud-api，继续走 preload/IPC/main process。
- cloud-api 地址和路径固定白名单，禁止 Renderer 提供 URL。
- 请求 Zod schema 严格拒绝多余字段、危险对象键和无效 ID。
- SQL 全部使用 `#{}`；排序及动态选择采用固定服务端逻辑。
- 联系方式、微信标识、用户 ID 和企业内部标识本期不进入响应。
- 数据库工具默认只读；DDL 脚本在明确目标库后单独应用。

## 8. 测试与验收

- 后端：Controller contract、Service 分页/详情、Mapper XML 参数绑定与 union 安全合同测试。
- 前端：schema/normalizer、API client 序列化、数据状态、列表 DOM、路由与首页入口测试。
- 验证：后端聚焦 Maven 测试与 package；前端 Vitest、企业测试类型检查、i18n 检查及 package。

## 9. 后续扩展

发布、更新、关闭、抢单和支付应在后续切片中实现，并先补齐桌面端可信令牌、服务端资源归属校验和联系方式投影策略。`DEMAND_TYPE.GZH_DEMAND_UPDATE` 等旧 URL 仅用于迁移核对，不作为新 Electron 页面跳转目标。
