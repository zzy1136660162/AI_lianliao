# 链上辽宁企业码 Electron 桌面端设计规格

> 状态：核心桌面代码已实现并进入联调验收；真实微信、线上接口和 Windows 安装仍待手工验证<br>
> 日期：2026-07-14<br>
> 实施状态更新：2026-07-15<br>
> 目标客户端：Windows Electron 桌面端<br>
> 技术底座：AionUi（React 19、Electron 37、TypeScript）

## 1. 文档目标

本文定义基于 AionUi 开发“链上辽宁企业码桌面端”的 V1 方案。它用于指导接口补齐、实施计划拆分、开发、测试和验收。当前登录与会话、企业、产品、在建项目、工作台和统一搜索的核心代码已经实现；收藏、跟进、上下文 AI 及真实环境交付验收仍按后续阶段推进。

V1 的核心定位是“企业商机智能工作台”：企业负责人、销售和市场人员可以在桌面端查询企业、产品和在建项目，管理收藏与项目跟进，并使用 AI 助手完成摘要、比较、匹配分析和跟进建议。

### 1.1 当前实施状态

| 范围                                          | 状态           | 说明                                                                                                                |
| --------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| 类型化契约、主进程 API 白名单、IPC 与本地会话 | 已实现         | 已有单元测试覆盖响应校验、会话恢复/清除和错误边界                                                                   |
| 扫码登录、未注册引导和注册后检测              | 核心代码已实现 | fake IPC 自动化已覆盖状态机；真实微信扫码、全新微信注册会话和线上回调仍待手工联调                                   |
| Electron 企业路由、工作台框架与退出           | 已实现         | Electron 根路由进入企业空间；Remote WebUI 根路由和登录隔离由 `EnterpriseRouter.dom.test.tsx` 持续回归               |
| 企业库、产品库、在建项目与统一搜索            | 已实现         | 列表、筛选、分页、详情、项目隐私边界和跨域搜索已有自动化覆盖；线上真实数据与 H5 权限矩阵仍待手工验收                |
| 核心跨页回归                                  | 已实现         | `enterpriseWorkbench.dom.test.tsx` 使用生产 Router、Provider、renderer client 契约完成会话恢复到退出及 `/guid` 回归 |
| 收藏与商机跟进                                | 待阶段 3       | `J_CY_INTEREST.TYPE=1/2/6` 和 `J_OPP_LEAD` 不在当前核心交付中                                                       |
| 上下文 AI 与确认式写操作                      | 待阶段 4       | 当前只保留助手入口和布局槽位，不声明业务 AI 已接入                                                                  |
| Windows 安装、真实重启和生产日志              | 待交付验收     | 尚未完成真实安装包、线上配置及人工验收，不作为本轮自动化结论                                                        |

## 2. 参考工程与现状

### 2.1 代码来源

- Electron 技术底座：`E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC`
- 链上辽宁后端：`E:\ZZY_PROJECT\lianshang_liaoning\cloud-service`
- 链上辽宁 H5：`E:\ZZY_PROJECT\lianshang_liaoning\vip_store`
- 企业参考页面：`vip_store/src/page/qiyema/company`
- 产品参考页面：`vip_store/src/page/qiyema/product`
- 在建项目参考页面：`vip_store/src/page/opportunity/AiMaterialOpportunity.vue`
- 扫码登录参考：`QiFeiHao_V1.0_SB/src/main/resources/templates/application/registered/login.html`
- 手机注册页：`https://sjbang.lslnii.com/jjgc/foreground/vip_store/index.html#/qiyema/register`

### 2.2 AionUi 约束

- 渲染层位于 `packages/desktop/src/renderer/`，不能使用 Node.js API。
- 主进程服务位于 `packages/desktop/src/process/`，不能使用 DOM API。
- 跨进程调用必须经过 `packages/desktop/src/preload/` 的 IPC 桥。
- 使用严格 TypeScript，不使用 `any`。
- 新增交互组件使用 Arco Design，图标使用 Icon Park。
- 新增用户可见文案必须进入 i18n。
- 颜色使用语义化 Token，不在组件中硬编码。
- 公共函数使用 JSDoc；代码注释使用英文，并解释业务原因、状态或边界，而不是逐行复述代码。

### 2.3 已发现的兼容问题

1. AionUi 桌面模式当前会自动视为已登录，没有链上辽宁用户身份，需要新增独立的企业身份上下文。
2. H5 企业与产品详情中的收藏展示查询被注释，`isCollect` 固定返回 `-1`，刷新后无法可靠回显收藏状态。
3. H5 收藏交互先修改页面再发请求，请求失败可能造成界面与数据库不一致。
4. 现有收藏新增接口没有明确的幂等保护，重复操作可能产生多条有效记录。
5. 在建项目 H5 会在部分接口失败时静默返回 Mock 数据，桌面生产环境不能沿用该行为。
6. 旧扫码登录使用浏览器 `HttpSession` 和进程内缓存；通用二维码服务已经使用 Redis，更适合作为桌面端基础。
7. 通用二维码 Redis 写入在当前实现中未体现过期时间；桌面登录会话必须限制为 5 分钟。

## 3. 已确认的产品决策

| 决策项     | 结论                                                    |
| ---------- | ------------------------------------------------------- |
| 产品定位   | 企业商机智能工作台                                      |
| 核心用户   | 企业负责人、销售人员、市场人员                          |
| 默认首页   | 企业码工作台，不进入原聊天首页                          |
| AI 位置    | 可折叠的右侧上下文助手；原 AI 能力继续保留              |
| 登录方式   | 微信扫码登录                                            |
| 用户查询   | 允许明文传递 `openid`，按 `openid` 查询用户、企业和权限 |
| 未注册用户 | 展示现有 H5 注册二维码；注册完成后继续查询原 `openid`   |
| 开发语言   | Electron 主进程、Preload、渲染层统一 TypeScript         |
| 收藏表     | `J_CY_INTEREST`                                         |
| 收藏类型   | `1=企业`、`2=产品`、`6=在建项目（新增约定）`            |
| 项目跟进   | `J_OPP_LEAD`，不与收藏状态混用                          |
| 失败兜底   | 显式错误和重试，不静默返回 Mock 数据                    |

## 4. V1 范围

### 4.1 范围内

- 微信扫码登录、会话恢复和退出登录。
- 未注册用户的手机 H5 注册二维码。
- 工作台总览和跨企业、产品、项目的统一搜索入口。
- 企业列表、筛选、分页、快速详情和完整详情。
- 产品列表、筛选、分页、快速详情和完整详情。
- 在建项目看板、列表、筛选、分页、快速详情、完整详情和既有解锁逻辑。
- 企业、产品和项目收藏。
- 项目商机 `TODO / DOING / DONE` 跟进。
- AI 摘要、比较、匹配分析、风险提示、跟进建议和确认式业务操作。
- Windows 打包、重启恢复和发布验证。

### 4.2 V1 不做

- Electron 内置注册表单、短信验证和企业注册流程。
- 替换或下线现有 H5。
- 离线写入与离线数据同步。
- AI 在没有用户确认时自动改变收藏或跟进状态。
- 接口失败时用虚假 Mock 数据冒充真实结果。
- 将企业码工作台扩展到 AionUi Remote WebUI；V1 只交付 Electron。
- 对链上辽宁无关模块进行重构。

## 5. 信息架构与应用框架

### 5.1 主导航

登录成功后进入企业码工作台，左侧主导航包括：

1. 工作台
2. 企业库
3. 产品库
4. 在建项目
5. 我的收藏
6. 商机跟进

导航底部显示当前企业、当前用户，并提供用户中心、设置和退出登录。

### 5.2 三栏布局

- 左栏：稳定主导航。
- 中栏：当前业务页面。
- 右栏：可折叠 AI 商机助手，默认宽度约 360px。

当窗口空间不足或用户浏览高密度表格时，可以收起 AI 栏。应用记住上次访问模块、筛选条件和 AI 展开状态，在重启后恢复工作现场。

### 5.3 全局搜索

顶部搜索框统一搜索企业、产品和在建项目，结果按对象类型分组。V1 可以先复用三个既有查询接口并行检索，不要求后端立即构建统一搜索索引。

### 5.4 路由

建议使用独立企业码路由空间：

```text
/enterprise/login
/enterprise/dashboard
/enterprise/companies
/enterprise/companies/:companyId
/enterprise/products
/enterprise/products/:productId
/enterprise/projects
/enterprise/projects/:projectId
/enterprise/favorites
/enterprise/leads
/enterprise/leads/:leadId
```

Electron 启动后的默认业务路由为 `/enterprise/dashboard`；未建立企业身份时由路由守卫跳转到 `/enterprise/login`。原 AionUi 对话路由继续存在，由右侧 AI 助手或独立入口访问。

## 6. 核心页面设计

### 6.1 工作台

工作台展示：

- 收藏企业数量
- 收藏产品数量
- 收藏项目数量
- 待跟进数量
- 推荐在建项目
- 最近收藏
- 最近跟进

推荐项目优先复用机会模块已有推荐、预算、地区和匹配字段。工作台数据加载失败时，每个区块独立显示错误和重试，不阻塞其他区块。

### 6.2 企业库

默认使用高密度表格，可切换为卡片视图。

主要筛选项：

- 企业名称
- 城市
- 区县
- 行业
- 企业等级
- VIP 状态

列表主要字段：企业名称、简称、行业、城市/区县、地址、法人、企业类型、企业等级、VIP 状态、成立时间、收藏状态。

完整详情按以下区域组织：

- 企业概览：名称、简称、Logo、简介、行业、企业类型、成立时间。
- 经营与资质：企业等级、VIP、统一社会信用代码等后端已返回字段。
- 联系信息：联系人、职务、电话、地址；继续遵守 H5 权限与脱敏规则。
- 关联产品：调用现有企业产品关系接口。
- AI 分析：企业摘要、优势、风险、与指定项目或产品的匹配分析。

### 6.3 产品库

默认使用图文卡片，可切换为紧凑列表。

主要筛选项：

- 产品名称
- 行业
- 所属企业
- 园区
- 排序方式

列表与详情主要字段：产品名称、图片、产品摘要、所属行业、所属企业、企业行业、城市、区县、地址、联系人、电话和收藏状态。

产品详情提供“匹配项目”操作，将当前产品作为 AI 和项目检索的上下文。

### 6.4 在建项目

默认使用可排序的数据表，顶部保留数据看板。

主要筛选项：

- 一级/二级材料分类
- 材料简称与材料名称
- 省、市
- 投资范围
- 建设性质
- 投资类型
- 发布时间

列表主要字段：项目名称、建设单位、省市、总投资、建设性质、投资类型、项目性质、发布时间、建设周期、材料命中和采购摘要。

完整详情复用现有项目字段和解锁逻辑，包括建设单位、联系人、电话、邮箱、地址、行业、用地/建筑/绿化面积、投资、建设周期、建设规模、设备、材料、工程组成和来源链接。

项目详情提供：

- 收藏项目：写入 `J_CY_INTEREST.TYPE=6`。
- 加入跟进：使用 `J_OPP_LEAD`。
- AI 匹配：结合当前登录企业和企业产品给出匹配依据。

### 6.5 通用桌面交互

- 单击记录：选中记录并更新快速详情和 AI 上下文。
- 双击记录或点击“查看详情”：进入完整详情页。
- 列表、筛选和分页状态进入 URL 或模块状态，便于返回时恢复。
- 收藏和跟进按钮在请求期间进入 pending，禁止重复提交。
- 只有接口成功后才更新最终状态；失败时保留原值并显示重试。

## 7. 登录与会话状态机

### 7.1 登录流程

1. Electron 主进程读取持久化的 `openid`。
2. 如果存在 `openid`，调用用户上下文接口校验用户、企业和角色。
3. 校验成功则恢复会话并进入工作台。
4. 没有有效会话时，创建一次性二维码登录标识。
5. 页面展示微信二维码，约每 3 秒轮询扫码状态，同一时刻只允许一个轮询请求。
6. 微信 OAuth 回调获得 `openid/unionId` 后，按明文 `openid` 查询用户上下文。
7. 用户存在且可用时，保存会话并进入工作台。
8. 用户不存在时，切换为手机 H5 注册二维码，并继续使用原 `openid` 查询注册结果。
9. 用户手机注册成功后，桌面端自动进入工作台；同时提供“我已完成注册，立即检测”按钮。

Electron 不暴露本机 HTTP 回调地址。手机端 OAuth 回调将 `openid/unionId` 写入后端 Redis，桌面端只使用一次性登录标识轮询后端。阶段 0 需要确认注册二维码在全新微信会话中会先完成 H5 的微信身份初始化，使注册页调用 `addNewCom.action` 时能够取得同一个 `openid/unionId`。

### 7.2 登录状态

```text
RESTORING
  -> AUTHENTICATED
  -> NEED_QR

NEED_QR
  -> WAITING_SCAN
  -> EXPIRED
  -> SCANNED

SCANNED
  -> AUTHENTICATED
  -> NEED_REGISTER
  -> INACTIVE

NEED_REGISTER
  -> AUTHENTICATED
  -> WAITING_REGISTER
```

二维码有效期为 5 分钟。过期后自动创建新二维码，同时提供手动刷新。轮询在路由离开、窗口关闭或状态成功后立即停止。

### 7.3 会话模型

```ts
type EnterpriseSession = {
  openId: string;
  unionId?: string;
  user: EnterpriseUser;
  company: EnterpriseCompany;
  restoredAt: string;
};
```

`openid` 可以明文持久化并传递，但生产日志不应打印完整 `openid`、手机号或联系人信息。退出登录时清除企业会话和相关 SWR 缓存，不影响 AionUi 其他本地设置。

## 8. 收藏与跟进数据模型

### 8.1 `J_CY_INTEREST`

桌面端核心收藏使用字段：

- `ID`
- `TYPE`
- `USER_ID`
- `INFO_ID`
- `DEL_SIGN`
- `INPUT_TIME`

类型约定：

| TYPE | 对象                 |
| ---- | -------------------- |
| 1    | 企业                 |
| 2    | 产品                 |
| 3    | 服务（既有）         |
| 4    | 产业雷达新闻（既有） |
| 5    | 政策雷达新闻（既有） |
| 6    | 在建项目（V1 新增）  |

收藏接口必须幂等：

- 已存在 `DEL_SIGN='N'` 的同一 `USER_ID + TYPE + INFO_ID` 时，直接返回成功和现有记录。
- 只存在软删除记录时，优先恢复为 `DEL_SIGN='N'` 并更新收藏时间。
- 没有历史记录时再生成新 ID 并插入。
- 取消收藏将有效记录更新为 `DEL_SIGN='Y'`。

收藏列表按 `INPUT_TIME DESC` 返回，并为列表页提供批量状态查询，避免每行发起一次请求。

### 8.2 `J_OPP_LEAD`

项目跟进继续使用现有字段：

- `INTEREST_STATUS`
- `FOLLOW_STATUS`
- `FEEDBACK_REASON`
- `LAST_FOLLOW_TIME`
- `COMPANY_ID`
- `PROJECT_ID`

跟进状态：

```text
NONE -> TODO -> DOING -> DONE
```

跟进是当前登录企业的业务过程，所有查询和更新必须同时约束 `companyId` 与 `leadId`。收藏项目可以不加入跟进；加入跟进也不要求取消收藏。

当项目列表已经返回有效 `leadId` 时，“加入跟进”直接更新该线索。只有 `projectId/hpInfoId`、没有对应 `leadId` 时，后端必须先按当前 `companyId + projectId` 查询或创建 `J_OPP_LEAD`，再返回可更新的 `leadId`；渲染层不能把项目 ID 猜测成线索 ID。

## 9. AI 商机助手

### 9.1 上下文

AI 请求由渲染层构建明确的上下文对象，包含：

- 当前页面类型
- 当前选中的企业、产品或项目 ID
- 当前对象的已加载字段快照
- 当前登录企业
- 当前企业的产品摘要
- 用户主动选中的比较对象

不把整个列表或无关页面状态无条件塞入上下文，以控制长度并减少信息干扰。

### 9.2 V1 能力

- 企业、产品和项目摘要
- 多企业、多产品或多项目比较
- 当前企业产品与项目材料需求的匹配
- 匹配依据和风险提示
- 跟进建议与联系话术草案
- 对工作台推荐结果进行解释

AI 结论尽量标注来源字段。缺少联系人、预算或材料信息时必须明确说明，不允许虚构。

### 9.3 业务写操作

AI 可以生成以下操作草案：收藏、取消收藏、加入跟进、修改跟进状态。每次写操作必须先展示确认卡片，卡片包含对象、操作、目标状态和影响说明；用户确认后才调用领域接口。

AI 通过结构化动作草案表达写操作，渲染层不从自然语言文本中提取并执行命令：

```ts
type EnterpriseActionDraft = {
  action: 'FAVORITE' | 'UNFAVORITE' | 'ADD_LEAD' | 'UPDATE_LEAD_STATUS';
  entityType: 'COMPANY' | 'PRODUCT' | 'PROJECT' | 'LEAD';
  entityId: string;
  targetStatus?: 'TODO' | 'DOING' | 'DONE';
  summary: string;
};
```

## 10. Electron 技术架构

### 10.1 分层

```text
Renderer (React + SWR)
  -> typed preload API
  -> IPC handlers
  -> Enterprise services in Electron main
  -> cloud-service
```

### 10.2 公共契约

建议在 `packages/desktop/src/common/enterprise/` 下维护：

- `authTypes.ts`
- `companyTypes.ts`
- `productTypes.ts`
- `projectTypes.ts`
- `favoriteTypes.ts`
- `leadTypes.ts`
- `schemas.ts`

公共层只包含可跨进程复用的类型、常量、Zod Schema 和纯函数，不依赖 DOM 或 Electron。

### 10.3 主进程

建议在 `packages/desktop/src/process/services/enterprise/` 下维护：

- `EnterpriseApiService`
- `EnterpriseAuthService`
- `EnterpriseSessionStore`

职责：

- 使用 Electron 平台 `net.fetch` 访问云端。
- 统一 base URL、请求超时、CommonResult 解包和错误分类。
- 持久化和清除企业会话。
- 校验远程响应。
- 不向渲染层暴露任意 URL 请求能力。

IPC 注册集中在 `packages/desktop/src/process/bridge/enterpriseBridge.ts`，按 `auth / companies / products / projects / favorites / leads` 暴露窄接口。

### 10.4 Preload

在现有 `electronAPI` 上增加类型化 `enterprise` 命名空间。Preload 只做参数转发和结果返回，不实现业务规则。

### 10.5 渲染层

建议将业务模块放在 `packages/desktop/src/renderer/features/enterprise/`，并按目录规模拆分：

- `auth`
- `shell`
- `dashboard`
- `companies`
- `products`
- `projects`
- `favorites`
- `leads`
- `assistant`

渲染层使用：

- `EnterpriseAuthProvider` 管理企业身份与路由守卫。
- 企业身份上下文与现有 AionUi `AuthContext` 分离，避免改变 Remote WebUI 的账户行为。
- SWR 管理服务器数据、分页、重新验证和 mutation 后缓存失效。
- 组件局部状态管理筛选、选中项和 AI 展开状态。
- Arco Design 实现按钮、输入框、表格、分页、抽屉、弹窗和确认卡片。

不新增 Redux、Axios 或新的持久化库。

## 11. API 设计

### 11.1 直接复用的现有能力

- `CommonWxGZHQrCodeLogIn`：创建设备标识、二维码和 Redis 轮询。
- `CompanyController/getQiYeMaCompanyList`：企业列表。
- `CompanyController/getDetailcompany`：企业详情。
- `CompanyController/getFindProducts`：产品列表。
- `CompanyController/FindProduct`：产品详情。
- `OpportunityController`：项目看板、项目列表、项目详情、解锁和跟进。
- `cloud-admin/getIndustryVillageList/addCollect` 与 `delCollect`：现有收藏写入逻辑的参考实现。

现有接口的最终复用方式需要在实施阶段 0 进行契约测试；不能只依据 H5 前端字段推断。

### 11.2 建议新增的桌面接口

以下名称是建议契约，实施前可以按后端命名规范调整：

#### 用户上下文

```text
POST /cloud-api/DesktopEnterpriseAuthController/getUserContextByOpenId
```

请求：

```json
{ "openId": "...", "unionId": "..." }
```

返回：用户、企业、角色、企业等级和功能权限。接口接受明文 `openid`，不改变 H5 现有加密参数接口。

#### 收藏列表

```text
POST /cloud-api/DesktopEnterpriseFavoriteController/list
```

请求包含 `userId`、`type`、分页和可选关键词，返回收藏记录与对象摘要。

#### 批量收藏状态

```text
POST /cloud-api/DesktopEnterpriseFavoriteController/status
```

请求包含 `userId`、`type` 和 `infoIds`，返回已收藏 ID 集合。

#### 收藏与取消

```text
POST /cloud-api/DesktopEnterpriseFavoriteController/save
POST /cloud-api/DesktopEnterpriseFavoriteController/remove
```

`save` 实现幂等新增或恢复；`remove` 实现软删除。支持 `TYPE=1/2/6`。

### 11.3 超时与轮询

- 普通列表和详情请求默认超时 15 秒。
- 项目解锁和 AI 相关长请求可以单独配置更长超时。
- 扫码状态约每 3 秒轮询一次。
- 二维码 5 分钟过期。
- 页面离开时取消不再需要的请求。

## 12. 错误处理

主进程将错误归一化为：

```ts
type EnterpriseErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'BUSINESS_ERROR'
  | 'UNAUTHORIZED'
  | 'UNREGISTERED'
  | 'INACTIVE'
  | 'FORBIDDEN'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';
```

界面行为：

- 网络与超时：显示重试和最近请求时间。
- 二维码过期：自动刷新并允许手动刷新。
- 未注册：展示 H5 注册二维码。
- 未激活：展示明确说明，不当作未注册。
- 权限不足：保留脱敏字段，展示权限说明或既有升级入口。
- 字段校验失败：显示可恢复错误并记录接口名称，不让整个工作台崩溃。
- 收藏或跟进失败：保持原状态，不显示成功提示。

## 13. 测试策略

### 13.1 单元测试

- DTO 与 Zod Schema
- 后端字段到桌面模型的转换
- 筛选条件序列化
- CommonResult 解包和错误归一化
- 登录状态机
- 收藏类型和幂等行为
- AI 上下文构建

### 13.2 组件测试

- 企业、产品、项目筛选和分页
- 加载、空数据和错误状态
- 联系信息脱敏与权限提示
- 收藏 pending、成功和失败行为
- 跟进状态变更
- AI 操作确认卡片
- 未注册用户二维码页面

### 13.3 IPC 集成测试

- Preload 参数和返回类型
- IPC Handler 输入校验
- 主进程 `net.fetch` 模拟
- 会话保存、恢复和清除
- 路由离开时请求取消

### 13.4 API 契约测试

为企业、产品、项目、收藏、跟进和用户上下文建立脱敏响应样例，校验：

- CommonResult 外层结构
- 分页字段
- 必需 ID
- 收藏状态
- 项目跟进状态
- 联系信息权限字段

### 13.5 Electron E2E

至少覆盖：

1. 模拟扫码并进入工作台。
2. 未注册用户看到 H5 注册二维码。
3. 查询企业、产品和项目。
4. 收藏企业、产品和项目，刷新后状态仍正确。
5. 将项目加入跟进并推进状态。
6. AI 生成写操作草案，用户确认后执行。
7. 重启应用后自动恢复有效会话。
8. 退出后清除企业会话。

## 14. 建议实施阶段

### 阶段 0：接口契约

- 对现有接口做契约测试。
- 确定桌面用户上下文接口。
- 补齐收藏列表、批量状态、幂等写入和 `TYPE=6`。
- 为二维码 Redis 会话增加 5 分钟 TTL。

### 阶段 1：桌面框架与登录（核心代码已实现，真实环境待验收）

- [x] 企业码路由和默认工作台。
- [x] 三栏应用框架。
- [x] 扫码登录状态机、会话恢复、未注册二维码和退出的代码与自动化测试。
- [ ] 真实微信扫码、全新微信注册会话、应用重启恢复和线上回调手工联调。

### 阶段 2：核心数据模块（核心代码已实现，线上数据待验收）

- [x] 企业库。
- [x] 产品库。
- [x] 在建项目与未购买数据的桌面隐私边界。
- [x] 跨企业、产品和项目的统一搜索入口。
- [ ] 线上真实接口字段、联系信息与 H5 权限/解锁矩阵手工验收。

### 阶段 3：收藏与跟进（待实施）

- [ ] 我的收藏。
- [ ] 企业、产品和项目收藏。
- [ ] 商机跟进列表和状态更新。

### 阶段 4：AI 商机助手（待实施）

- [ ] 页面上下文。
- [ ] 摘要、比较、匹配和跟进建议。
- [ ] 确认式业务操作。

### 阶段 5：交付验证（自动化核心回归已实现，手工交付待验收）

- [x] 企业核心单元测试和跨页 DOM 集成回归。
- [x] 原 `/guid` 路由以及 Remote WebUI 根路由/登录行为自动化回归。
- [ ] Windows 打包与安装验证。
- [ ] 真实重启恢复、配置切换和生产日志验证。

## 15. V1 验收标准

以下清单是包含真实环境与阶段 3/4 的最终 V1 验收标准。核心代码自动化通过不等同于真实微信、线上数据或 Windows 安装验收，因此未执行的项目继续保持未勾选。

- [ ] 微信扫码后可以用明文 `openid` 查询用户并进入工作台。
- [ ] 未注册用户看到指定 H5 注册二维码，注册成功后桌面自动识别。
- [ ] 有效会话在应用重启后可以恢复，退出后不再恢复。
- [ ] 企业、产品和项目的列表、筛选、分页与详情读取真实接口。
- [ ] 联系信息、VIP 和项目解锁规则与 H5 一致。
- [ ] `J_CY_INTEREST.TYPE=1/2/6` 收藏状态刷新后仍准确。
- [ ] 重复收藏不会产生多条有效记录。
- [ ] 项目可以进入 `TODO / DOING / DONE` 跟进流程。
- [ ] AI 可以基于当前业务上下文提供有字段依据的分析。
- [ ] AI 写操作必须经过用户确认。
- [ ] 网络、超时、权限、未注册、未激活和字段异常都有明确反馈与恢复入口。
- [ ] 生产接口失败时不返回 Mock 数据。
- [ ] TypeScript、lint、单元测试、集成测试和 E2E 测试通过。
- [ ] Windows 安装、启动、重启、退出和卸载经过验证。

## 16. 风险与缓解

| 风险                       | 影响                 | 缓解                                                 |
| -------------------------- | -------------------- | ---------------------------------------------------- |
| 现有接口字段不稳定         | 页面或 AI 上下文出错 | 主进程适配 + Zod + 契约测试                          |
| 收藏重复记录               | 状态和数量不可信     | 幂等保存、软删除恢复、数据库约束评估                 |
| 二维码缓存无 TTL           | 旧二维码长期有效     | 桌面登录键强制 5 分钟 TTL                            |
| H5 权限逻辑分散            | 桌面显示与 H5 不一致 | 阶段 0 建立权限场景矩阵和契约样例                    |
| 项目接口静默 Mock          | 用户误判真实商机     | 桌面端禁用 Mock 兜底                                 |
| 注册二维码未初始化微信身份 | 注册数据缺少 openid  | 阶段 0 在全新微信会话验证 OAuth 与 localStorage 写入 |
| AI 产生无依据结论          | 降低业务信任         | 字段来源、缺失说明、写操作确认                       |
| 大列表和 AI 同时加载       | 页面卡顿             | 分页、请求取消、SWR 缓存、AI 栏按需加载              |

## 17. 文档复核重点

实施计划开始前，产品和后端负责人应重点复核：

1. `TYPE=6` 是否已在所有收藏查询和统计中纳入。
2. 用户、企业、角色与企业等级的最终返回字段。
3. H5 联系信息、VIP 和项目解锁的完整权限矩阵。
4. 二维码生成、轮询和 5 分钟 TTL 的最终接口契约。
5. `J_OPP_LEAD` 状态枚举和允许的状态转换。
6. H5 注册链接在全新微信会话中的 `openid/unionId` 初始化行为。
7. AI 所使用的模型、企业产品上下文来源和字段脱敏要求。

这些属于阶段 0 的契约冻结工作，不改变本文已经确认的产品方向。
