# Electron 供需发布与 H5 字段对齐矩阵

更新日期：2026-07-28

## 数据驱动结构

- `J_CY_BUSINESS_DICT`：通用业务字典主表，使用 `BUSINESS_DOMAIN + DICT_CODE` 唯一定位。名称不绑定 DEMAND，可继续承载企业、产品、项目、客服等业务字典。
- `J_CY_BUSINESS_DICT_ITEM`：字典选项表，保存选项值、展示顺序、启用状态和扩展 JSON。
- `J_CY_DEMAND_PUBLISH_TYPE`：Electron 可发布类型白名单、业务分组、顺序、统计语义和是否支持子业务。
- `J_CY_DEMAND_PUB_FIELD`：供需发布专用字段元数据。保存 H5 源列、字段类型、分组、选项字典、条件显隐和校验规则。
- `DEMAND_FIELD_MAPPING`：保留原有详情映射兼容用途；新供需详情优先复用 `J_CY_DEMAND_PUB_FIELD`，旧表仅作为未迁移类型的兜底。

数据库脚本：

`E:\ZZY_PROJECT\lianshang_liaoning\cloud-service\cloud-api\src\main\resources\db\demand_publish_metadata.sql`

## 发布类型白名单

输入列表去重后的唯一类型为：

`0, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17, 19, 21, 22, 27`

前后端均按该白名单限制发布。重复传入的 `6`、`17` 不会生成重复入口。

## H5 字段对齐

| 类型 | 业务名称 | H5 参考 | Electron/数据库字段结论 |
|---:|---|---|---|
| 0 | 机加外包 | `foreground/jijiaxuqiu2/xuqiufabu2.html` | 工艺、其他工艺、数量、工期、合作方式、接单类型、预算和概况已对齐 `J_DEMAND` 原生列。 |
| 6 | 包装服务 | `foreground/baozhuang/xuqiufabu.html` | 当前 H5 已注释的行业字段不再显示；包装类型、合作方式、设计、印刷和条件印刷要求已对齐 `PARAM3~7`；预算同步到标准列与旧 `PARAM8`。 |
| 7 | 维修服务 | `foreground/equipment_repair/publish_equRepair.html` | 设备名称只输入一次并同时作为标题和 `PARAM1`；品牌、购买日期、型号、故障描述、数量已对齐 `PARAM2~6`。 |
| 8 | 链上千岗 | `vip_store/src/page/qiyema/liansang_qiangang/index.tsx` | 支持企业招聘、服务外包、培训服务三个 schema；可信身份由服务端写 `PARAM1~3`，工作地点/标题写 `PARAM4~5`，子业务写 `PARAM20`。 |
| 11 | 环保服务 | `foreground/huanbao/xuqiufabu.html` | 企业性质、其他性质、四类环保业务、服务方向、其他方向、联系意愿、预算和区县已对齐 `PARAM1~12`。 |
| 12 | 物流服务 | `foreground/wuliu/xuqiuFaBu.html` | 收货地址、企业性质及其他项、业务/运输/仓储/行业/增值服务、账期、结算、保险、合作方式已对齐 `PARAM2~19`；预算同步 `PARAM11`。 |
| 13 | 施工服务 | `foreground/shigong/xuqiufabu.html` | 区县、项目地址、标题、施工类型、其他类型、预算已对齐 `PARAM1~6`。 |
| 14 | 仓储租售 | `foreground/warehouse2/xuqiufabu.html` | 企业性质及其他项、租售形式、仓储类型、面积、设施、结构、分租、起租期、租价、售价和图片已对齐 `PARAM1~16`。 |
| 15 | 闲置厂房 | `foreground/idle_home/publish_equRepair.html` | 标题、地址、类型及其他项、面积、建成时间、用途、层数、租售方式、价格、图片和区县已对齐 `PARAM1~13`。 |
| 16 | 工业原料 | `foreground/xincailiao/xincailiaofabu.html` | 单选材料类型、其他材料、文本数量、可选或自定义单位、区县和标准预算已对齐 `PARAM2~8`。 |
| 17 | 科技服务 | `foreground/Kjfw/xuqiufabu.html` | 企业性质、标题、服务项目及其他项、预算和区县已对齐 `PARAM1~6`。 |
| 19 | 闲置设备 | `foreground/idle_equipment/publish_equRepair.html` | 标题、生产日期、厂家、型号、原价、年限、数量、详情、租售、价格、图片、区县和地址已对齐 `PARAM1~14`。 |
| 21 | 建材云城 | `foreground/jiancai/xuqiufabu.html` | 企业性质、材料类型、采购数量、预算和概况已对齐 `PARAM1~3` 与标准列。 |
| 22 | 紧急采购 | `foreground/chanpincaigou/publish_equRepair.html` | 标题、采购数量、产品参数、图片、预算和概况已对齐 `PARAM3/5/6` 与标准列。 |
| 27 | 名企采购 | `vip_store/src/page/lnsdxm/zaocanxu/MingQiCaiGou/detail.tsx` | 采购品名、采购分类、规格参数、数量单位、采购金额和采购周期已对齐 `PARAM1/3/4/7` 与标准列。 |

仓储、厂房、闲置设备和紧急采购中的图片字段不是自由填写 URL。Electron 通过
`DemandPublishController/image/upload` 复用服务端图片校验与存储能力，上传成功后只把可信 HTTPS
地址按 H5 对应的分隔格式写入 `PARAM`。

## 链上千岗变体

| 变体 | 标题及业务字段 |
|---|---|
| 企业招聘 | 招聘岗位、岗位数量、岗位类型、岗位性质、经验、学历、证书、薪资、年龄、应届生、其他要求。 |
| 服务外包 | 外包岗位名称、岗位数量、生产环节、岗位类型、岗位周期、结算模式、员工管理、其他要求。 |
| 培训服务 | 培训类型、培训对象、培训人数、服务模式、讲师要求、定制化需求、其他要求。培训类型同时写入标题和 `PARAM5`。 |

详情接口依据 `PARAM20` 选择对应字段标签，避免三个变体共享 `PARAM6~12` 时出现错名。

## 列表统计

- 普通供需：`GRAB_NUM` 作为已抢单数，`DEMAND_TYPE.PAY_COUNT - GRAB_NUM` 作为剩余名额。
- 链上千岗：按 `J_PAY(TYPE=8, STATE=1)` 的去重用户数作为已投递人数，并返回 `statMode=APPLICATION`。
- `END_TIME` 为 14 位时间时，服务端返回 `remainingDays`；到期数据统一返回状态 `2`，Electron 显示“已过期”。
- Electron 列顺序为：需求、类型、地区、预算、抢单/投递进度、剩余天数、发布时间、状态、操作。

## 校验结论

- 15 个白名单类型均有发布 schema。
- H5 中属于下拉、多选、条件输入的字段均改为数据库字典和显隐规则驱动。
- Electron 不接受客户端指定数据库列；只提交 `fieldKey`，服务端根据白名单元数据映射到真实列。
- 标题、地区、预算等标准列由 Electron 提交一次，服务端负责同步旧 H5 仍读取的冗余 `PARAM`。
- 通用字典表未绑定 DEMAND 命名，可直接扩展到其他业务域。

2026-07-28 完成第二轮静态复核：

- 上表列出的 15 个 H5/VIP Store 参考文件均存在。
- 迁移脚本提取出的类型集合严格等于
  `0,6,7,8,11,12,13,14,15,16,17,19,21,22,27`。
- `DemandPublishMapper.xml` 与 `DemandQueryMapper.xml` 均通过 XML 解析。
- Oracle 对象名静态检查未发现超过 30 字符的标识符。
- Electron TypeScript 检查、10 个语言包一致性检查、供需核心测试及 cloud-api 编译均通过。

注意：此结论覆盖源代码和迁移脚本。部署环境只有在执行
`demand_publish_metadata.sql` 并重启 cloud-api 后，才能运行数据库驱动的发布表单。

## AI 多轮发布助手

供需发布页已在上述数据库字段元数据之上增加持久化多轮 AI 助手。AI 只负责识别业务线和生成字段建议，所有候选类型、字段显隐、选项和最终发布仍由服务端白名单及原发布接口控制。

部署时还需执行 `demand_publish_ai.sql` 与 `demand_ai_conversation.sql`。双机部署顺序、模型优先级、冒烟验证和回滚方式见
[`DEMAND_AI_CONVERSATION_DEPLOYMENT.md`](./DEMAND_AI_CONVERSATION_DEPLOYMENT.md)。
