# 供需发布字段对齐与通用业务字典设计

## 目标

将 Electron 供需发布、列表和详情的数据契约与现有 H5 及 Oracle 生产数据保持一致，并把发布类型、字段选项、字段顺序、条件显示和校验规则改成服务端元数据驱动。

## 发布类型范围

仅允许以下 15 个类型通过 Electron 发布：

```text
17, 8, 6, 0, 22, 15, 19, 14, 27, 16, 12, 21, 13, 7, 11
```

`6` 和 `17` 在原始需求中重复，白名单按唯一值处理。后端查询和发布服务必须同时校验白名单，不能只依赖前端隐藏选项。

发布类型按以下业务组展示：

1. 采购需求：22、27、16、21
2. 生产服务：0、6、7、11、12、13、17
3. 闲置资源：14、15、19
4. 人才服务：8

## 数据来源

字段设计必须同时满足三个来源：

1. 旧 H5 发布页面：`E:\MyeclipseWorkSpace\JJGC_V1.0\WebRoot\foreground`
2. 新 H5 链上千岗、名企采购页面：`E:\ZZY_PROJECT\lianshang_liaoning\vip_store\src`
3. Oracle 实际表：`J_DEMAND`、`J_COMMON_DEMAND`、`DEMAND_TYPE`、`DEMAND_FIELD_MAPPING`

旧 H5 的 `PARAM1` 至 `PARAM23` 含义以具体 `TYPE` 为边界，不能跨类型复用标签。Electron 提交的可信身份字段由 `openId` 对应用户和企业关系生成，不允许客户端提交企业名称、联系人和联系电话覆盖服务端数据。

## 通用业务字典

字段选项字典后续需要服务于供需之外的业务，因此使用通用命名：

### J_CY_BUSINESS_DICT

字典主表保存业务域和字典编码。

```text
ID
BUSINESS_DOMAIN
DICT_CODE
DICT_NAME
ENABLED
REMARK
INPUT_TIME
UPDATE_TIME
```

唯一约束为 `(BUSINESS_DOMAIN, DICT_CODE)`。

### J_CY_BUSINESS_DICT_ITEM

字典项表保存单选、多选和下拉选项。

```text
ID
DICT_ID
ITEM_LABEL
ITEM_VALUE
DISPLAY_ORDER
ENABLED
EXTRA_JSON
INPUT_TIME
UPDATE_TIME
```

唯一约束为 `(DICT_ID, ITEM_VALUE)`。`EXTRA_JSON` 只保存非核心扩展属性，不保存标签、值、顺序或启用状态。

## 发布类型配置

新增 `J_CY_DEMAND_PUBLISH_TYPE`：

```text
TYPE_ID
GROUP_CODE
GROUP_NAME
DISPLAY_ORDER
PUBLISH_ENABLED
VARIANT_ENABLED
STAT_MODE
DEFAULT_VALID_DAYS
REMARK
INPUT_TIME
UPDATE_TIME
```

`STAT_MODE` 支持：

- `GRAB`：普通供需，使用需求表 `GRAB_NUM` 和 `DEMAND_TYPE.PAY_COUNT`
- `APPLICATION`：链上千岗，使用 `J_PAY` 的有效投递记录

即使配置表被误改，Java 服务仍使用固定 15 类型白名单做最终保护。

## 发布字段元数据

现有 `DEMAND_FIELD_MAPPING` 的主键为 `(DEMAND_TYPE_ID, SOURCE_COLUMN)`，并且继续承担公开详情字段映射。type 8 的三个子业务会重复使用相同 `PARAM`、但标签和选项不同，因此不能直接在该表中保存三套发布定义。

新增 `J_CY_DEMAND_PUB_FIELD`，专门保存发布表单契约：

```text
ID
TYPE_ID
VARIANT_CODE
TARGET_KIND
SOURCE_COLUMN
FIELD_KEY
FIELD_LABEL
GROUP_CODE
GROUP_NAME
GROUP_ORDER
DISPLAY_ORDER
INPUT_TYPE
IS_REQUIRED
PLACEHOLDER
MAX_LENGTH
DICT_CODE
VISIBLE_WHEN_JSON
VALIDATION_JSON
DEFAULT_VALUE
CONTROL_PROPS_JSON
VALUE_SEPARATOR
AI_HINT
ENABLED
INPUT_TIME
UPDATE_TIME
```

约束：

- 唯一约束为 `(TYPE_ID, VARIANT_CODE, SOURCE_COLUMN)` 和 `(TYPE_ID, VARIANT_CODE, FIELD_KEY)`
- `TARGET_KIND` 支持 `BASE`、`DYNAMIC`、`IDENTITY`
- `INPUT_TYPE` 支持 `TEXT`、`TEXTAREA`、`NUMBER`、`DATE`、`SELECT`、`MULTISELECT`、`IMAGE`
- 选项字段通过 `DICT_CODE` 读取通用字典，不再优先依赖 `OPTIONS_JSON`
- `VISIBLE_WHEN_JSON` 表示字段依赖条件，例如仅当“是否需要印刷=是”时显示印刷要求
- `VALIDATION_JSON` 表示最小长度、最大长度、数值范围、正则和选项数量限制
- `VARIANT_CODE` 用于 type 8 的 `企业招聘`、`服务外包`、`培训服务`
- `IDENTITY` 字段不下发为可编辑控件，由服务端写入旧 H5 使用的 `PARAM`
- `DEMAND_FIELD_MAPPING` 保持现状，避免影响现有公开详情

## type 8 子业务

type 8 根据 `PARAM20` 切换三套字段：

- 企业招聘：`PARAM1` 至 `PARAM15`，`PARAM20=企业招聘`
- 服务外包：`PARAM1` 至 `PARAM12`，`PARAM20=服务外包`
- 培训服务：`PARAM1` 至 `PARAM11`，`PARAM20=培训服务`

企业名称、联系人、联系方式由服务端身份生成；H5 中对应的 `PARAM1`、`PARAM2`、`PARAM3` 仍按旧表契约写入，客户端不允许自行覆盖。

## 条件字段

元数据必须覆盖以下依赖关系：

- 包装服务：需要印刷时显示印刷要求
- 环保、物流、施工、仓储、厂房、科技服务：选择“其他”时显示其他说明
- 仓储租售、闲置厂房、闲置设备：出租显示租价，出售显示售价
- 仓储租售：选择“有条件分租”时显示分租条件
- 链上千岗：切换子业务时切换整套字段

隐藏字段不提交；服务端重新计算可见性并拒绝伪造的隐藏字段。

## 列表统计

列表新增：

```text
interactionCount
remainingCount
remainingDays
effectiveStatus
interactionLabel
remainingLabel
```

普通供需：

- `interactionCount = NVL(GRAB_NUM, 0)`
- `remainingCount = MAX(DEMAND_TYPE.PAY_COUNT - interactionCount, 0)`
- 标签为“已抢单”“剩余名额”

链上千岗：

- `interactionCount` 使用 `J_PAY` 中 `DEL_SIGN='N' AND TYPE=8 AND DEMAND_ID=需求编号` 的去重投递数
- 招聘人数是区间，不能伪造精确剩余人数
- 标签为“已投递”“岗位数量”，第二个值显示 `PARAM6`

剩余天数：

- 截止时间为空：长期有效
- 大于 0：剩余 N 天
- 等于 0：今天截止
- 小于 0：已截止

`effectiveStatus` 是展示状态，不回写历史 `DEMAND_STATE`。

## Electron 表单

字段顺序统一为：

1. 业务类型与子业务
2. 需求名称
3. 核心业务参数
4. 数量和单位
5. 地区与详细地址
6. 预算、结算或租售价格
7. 合作方式与服务要求
8. 有效期
9. 需求概况和其他要求
10. 图片或附件

React 表单根据服务端 schema 渲染，不在客户端维护 15 套重复字段常量。AI 解析结果只能写入当前 schema 中存在且可见的字段；选项值必须命中字典项。

## 审核状态

Electron 新发布数据继续写入 `IS_CHECK=2`，等待原有后台审核。列表默认只显示 `IS_CHECK=1` 的数据，因此提交成功页需要明确提示“已提交审核”，不能承诺立即出现在公开列表。

## 验收

1. 发布类型接口只返回 15 个唯一类型。
2. 逐类型对照 H5，字段、选项、必填、顺序、条件显示一致。
3. type 8 三个子业务能分别保存到正确 `PARAM` 和 `PARAM20`。
4. type 27 能保存采购分类、规格参数、数量单位、预算和采购周期。
5. 非白名单类型、无效选项、隐藏字段伪造在服务端被拒绝。
6. 列表显示城市、已抢单或已投递、剩余名额或岗位数量、剩余天数。
7. Electron 类型检查、国际化检查、聚焦测试和 Cloud API 编译通过。
