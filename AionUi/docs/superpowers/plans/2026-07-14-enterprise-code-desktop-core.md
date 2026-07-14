# Enterprise Code Desktop Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AionUi Electron 中交付可登录、可恢复会话的企业码默认工作台，并完成企业、产品、在建项目、工作台总览和统一搜索的只读核心体验。

**Architecture:** 企业码使用独立路由空间、独立企业身份上下文和 Electron 主进程网络层。渲染进程不直接访问链上辽宁服务，也不读取磁盘；所有远程请求由主进程通过白名单操作和 `net.fetch` 执行，经 preload 暴露类型化桥接。原 AionUi WebUI 登录、聊天路由和后端保持不变，Electron 根路由改为企业工作台，原 AI 页面继续可访问。

**Tech Stack:** Electron 37、React 19、TypeScript、React Router 7、Arco Design、Icon Park、SWR、Zod、Vitest、Testing Library、UnoCSS

---

## 0. 依赖与执行顺序

工作目录：`E:\ZZY_PROJECT\AI_lianliao\AionUi`

先完成并在测试环境部署 [后端契约计划](./2026-07-14-enterprise-code-backend.md) 的 Task 2–3；企业/产品/项目原有查询接口可以并行联调。收藏、跟进和 AI 写操作不在本计划实现，见第三份计划。

生产默认配置：

```ts
export const ENTERPRISE_CLOUD_BASE_URL = 'https://cloud.lslnii.com/';
export const ENTERPRISE_REGISTRATION_URL =
  'https://sjbang.lslnii.com/jjgc/foreground/vip_store/index.html#/qiyema/register';
```

允许通过 `AIONUI_ENTERPRISE_CLOUD_BASE_URL` 覆盖云端地址。生产构建只接受 `https:`；开发构建额外允许 `http://127.0.0.1` 和 `http://localhost`。主进程 API 超时 15 秒，不做静默 mock。

## Task 1: 定义企业域契约和运行时校验

**Files:**

- Create: `packages/desktop/src/common/enterprise/constants.ts`
- Create: `packages/desktop/src/common/enterprise/contracts.ts`
- Create: `packages/desktop/src/common/enterprise/schemas.ts`
- Test: `tests/unit/enterprise/enterpriseSchemas.test.ts`

- [ ] **Step 1: 写失败测试——CommonResult 与登录状态解析**

测试 `commonResultSchema` 拒绝 `success=false`，并让扫码结果只接受 `WAITING/AUTHENTICATED/REGISTER_REQUIRED/EXPIRED`。测试用户上下文将数字 ID 正规化为字符串。

Run: `bun run test -- tests/unit/enterprise/enterpriseSchemas.test.ts`

Expected: FAIL，因为 schema 尚不存在。

- [ ] **Step 2: 定义稳定域类型**

核心类型必须使用 `type`：

```ts
export type EnterpriseLoginStatus = 'WAITING' | 'AUTHENTICATED' | 'REGISTER_REQUIRED' | 'EXPIRED';

export type EnterpriseUserContext = {
  registered: boolean;
  openId: string;
  userId?: string;
  userName?: string;
  companyId?: string;
  companyName?: string;
  companyLevel?: number;
  roleId?: string;
};

export type EnterprisePage<T> = {
  list: T[];
  pageNum: number;
  pageSize: number;
  pages: number;
  total: number;
};
```

再定义 `EnterpriseCompanySummary/Detail`、`EnterpriseProductSummary/Detail`、`EnterpriseProjectDashboard/ProjectSummary/ProjectDetail`。只有列表和详情实际展示的字段进入稳定域模型；原接口额外字段保存在 schema 的 `.passthrough()` 结果中但不在组件内任意索引。

- [ ] **Step 3: 定义白名单操作联合类型**

```ts
export type EnterpriseRequest =
  | { operation: 'company.list'; payload: CompanyListQuery }
  | { operation: 'company.detail'; payload: { companyId: string } }
  | { operation: 'product.list'; payload: ProductListQuery }
  | { operation: 'product.detail'; payload: { productId: string } }
  | { operation: 'project.dashboard'; payload: { runId?: string } }
  | { operation: 'project.drill'; payload: ProjectDrillQuery }
  | { operation: 'project.list'; payload: ProjectListQuery }
  | { operation: 'project.detail'; payload: { hpInfoId: string } };

export type EnterpriseResponse =
  | { operation: 'company.list'; data: EnterprisePage<EnterpriseCompanySummary> }
  | { operation: 'company.detail'; data: EnterpriseCompanyDetail }
  | { operation: 'product.list'; data: EnterprisePage<EnterpriseProductSummary> }
  | { operation: 'product.detail'; data: EnterpriseProductDetail }
  | { operation: 'project.dashboard'; data: EnterpriseProjectDashboard }
  | { operation: 'project.drill'; data: EnterpriseProjectDrillItem[] }
  | { operation: 'project.list'; data: EnterprisePage<EnterpriseProjectSummary> }
  | { operation: 'project.detail'; data: EnterpriseProjectDetail };
```

请求结构中不允许 renderer 传 URL、header 或 HTTP method。

- [ ] **Step 4: 实现 schema 与字段正规化**

处理现有后端的 `id/ID`、`companyId/COMPANY_ID` 等历史差异；正规化函数必须是纯函数并有 JSDoc。缺失必需字段时抛出带 operation 的明确错误，不返回空假数据。

- [ ] **Step 5: 运行测试并提交**

Run: `bun run test -- tests/unit/enterprise/enterpriseSchemas.test.ts`

Expected: PASS。

```bash
git add packages/desktop/src/common/enterprise tests/unit/enterprise/enterpriseSchemas.test.ts
git commit -m "feat(enterprise): define desktop domain contracts"
```

## Task 2: 实现主进程链上辽宁 API 客户端

**Files:**

- Create: `packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`
- Create: `packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts`
- Test: `tests/unit/enterprise/enterpriseApiClient.test.ts`

- [ ] **Step 1: 写失败测试——只允许白名单 host 和 operation**

使用注入的 fake transport，验证：

- 生产拒绝 `http:`；
- 生产拒绝非 `cloud.lslnii.com` host；
- 未知 operation 在发送请求前失败；
- 请求超时使用 `AbortController`；
- HTTP 非 2xx、非法 JSON、`CommonResult.success=false` 分别产生不同错误码。

Run: `bun run test -- tests/unit/enterprise/enterpriseApiClient.test.ts`

Expected: FAIL。

- [ ] **Step 2: 定义固定路由映射**

```ts
export const ENTERPRISE_API_ROUTES = {
  'company.list': 'cloud-api/CompanyController/getQiYeMaCompanyList',
  'company.detail': 'cloud-api/CompanyController/getDetailcompany',
  'product.list': 'cloud-api/CompanyController/getFindProducts',
  'product.detail': 'cloud-api/CompanyController/FindProduct',
  'project.dashboard': 'cloud-api/OpportunityController/getAiMaterialDashboard',
  'project.drill': 'cloud-api/OpportunityController/getAiMaterialDrillList',
  'project.list': 'cloud-api/OpportunityController/getAiMaterialProjectList',
  'project.detail': 'cloud-api/OpportunityController/getAiMaterialProjectDetail',
  'auth.create': 'cloud-api/CommonWxGZHQrCodeLogIn/desktop/create',
  'auth.poll': 'cloud-api/CommonWxGZHQrCodeLogIn/desktop/poll',
  'auth.userContext': 'cloud-api/DesktopEnterpriseController/userContext',
} as const;
```

- [ ] **Step 3: 实现可测试 transport**

生产 transport 使用 Electron `net.fetch`；测试注入 `(url, init) => Promise<Response>`。请求统一为 `POST application/json`。客户端解析 `CommonResult` 后再用 Task 1 的 operation schema 解析 `data`。

- [ ] **Step 4: 注入当前用户字段**

`company.list` 自动加入 `openId`、`fromCompanyId`、`fromUserId`；`company.detail` 加入 `openId`、`userId`、`fromCompanyId`、产品分页默认值；`product.detail` 加入 `userId`；全部项目请求加入 `openId` 和 `companyId`。renderer 不重复拼装身份字段。

- [ ] **Step 5: 运行测试并提交**

Run: `bun run test -- tests/unit/enterprise/enterpriseApiClient.test.ts`

Expected: PASS。

```bash
git add packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts packages/desktop/src/process/services/enterprise/enterpriseApiRoutes.ts tests/unit/enterprise/enterpriseApiClient.test.ts
git commit -m "feat(enterprise): add main-process cloud API client"
```

## Task 3: 持久化明文 openid 并提供类型化 IPC

**Files:**

- Create: `packages/desktop/src/process/services/enterprise/enterpriseSessionStore.ts`
- Create: `packages/desktop/src/process/bridge/enterpriseBridge.ts`
- Modify: `packages/desktop/src/process/bridge/index.ts`
- Modify: `packages/desktop/src/preload/main.ts`
- Modify: `packages/desktop/src/common/types/platform/electron.ts`
- Test: `tests/unit/enterprise/enterpriseSessionStore.test.ts`
- Test: `tests/unit/enterprise/enterpriseBridge.test.ts`

- [ ] **Step 1: 写失败测试——session 文件恢复与损坏隔离**

session 文件固定为 `<userData>/enterprise-session.json`，结构：

```json
{ "version": 1, "openId": "o-demo-openid" }
```

测试空文件、不合法 JSON、错误 version、空 openId 均返回 `null`；写入使用临时文件后 rename；clear 后文件不存在。测试日志不得包含 openId。

Run: `bun run test -- tests/unit/enterprise/enterpriseSessionStore.test.ts`

Expected: FAIL。

- [ ] **Step 2: 实现主进程 session store**

使用 `fs/promises` 和 Zod，不使用 renderer `localStorage`。用户已确认 openid 可明文持久化；文件仍只放 openid，不保存 unionId、手机号或整份用户信息。

- [ ] **Step 3: 写失败测试——桥接认证生命周期**

桥接依赖通过参数注入，覆盖：

- `auth.create` 创建会话并把后端 QR PNG 下载为 `data:image/png;base64,...`；
- `auth.poll` 返回 `AUTHENTICATED` 时才保存 openid；
- `auth.completeRegistration(openId)` 仅在 `registered=true` 时保存；
- `auth.restore` 读取 openid 后重新请求用户上下文，不信任磁盘旧用户字段；
- `auth.clear` 删除 session；
- `request` 无登录时拒绝业务操作。

- [ ] **Step 4: 定义 renderer 可见 API**

在 `ElectronBridgeAPI` 增加：

```ts
enterprise?: {
  createLoginSession: () => Promise<EnterpriseLoginSession>;
  pollLoginSession: (loginKey: string) => Promise<EnterpriseLoginPollResult>;
  completeRegistration: (openId: string) => Promise<EnterpriseUserContext>;
  restoreSession: () => Promise<EnterpriseUserContext | null>;
  clearSession: () => Promise<void>;
  request: (request: EnterpriseRequest) => Promise<EnterpriseResponse>;
};
```

preload 只暴露固定 IPC channel；参数和返回值都引用 `common/enterprise/contracts.ts`，不得使用 `any`。

- [ ] **Step 5: 注册 bridge**

在 `initAllBridges()` 调用 `initEnterpriseBridge()`。handler 名称使用：

```text
enterprise:auth:create
enterprise:auth:poll
enterprise:auth:complete-registration
enterprise:auth:restore
enterprise:auth:clear
enterprise:request
```

重复初始化前 `removeHandler`，避免开发热重载重复注册。

- [ ] **Step 6: 运行测试与类型构建**

Run:

```bash
bun run test -- tests/unit/enterprise/enterpriseSessionStore.test.ts tests/unit/enterprise/enterpriseBridge.test.ts
bun run package
```

Expected: PASS / Electron Vite build 成功。

- [ ] **Step 7: 提交本任务**

```bash
git add packages/desktop/src/process/services/enterprise/enterpriseSessionStore.ts packages/desktop/src/process/bridge/enterpriseBridge.ts packages/desktop/src/process/bridge/index.ts packages/desktop/src/preload/main.ts packages/desktop/src/common/types/platform/electron.ts tests/unit/enterprise/enterpriseSessionStore.test.ts tests/unit/enterprise/enterpriseBridge.test.ts
git commit -m "feat(enterprise): add session storage and typed IPC"
```

## Task 4: 实现独立企业身份上下文和扫码/注册页面

**Files:**

- Create: `packages/desktop/src/renderer/services/enterprise/enterpriseClient.ts`
- Create: `packages/desktop/src/renderer/hooks/context/EnterpriseAuthContext.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/login/EnterpriseLoginPage.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/login/EnterpriseRegistrationPanel.tsx`
- Modify: `packages/desktop/src/renderer/main.tsx`
- Test: `tests/unit/enterprise/EnterpriseAuthContext.dom.test.tsx`
- Test: `tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx`

- [ ] **Step 1: 写失败测试——启动恢复**

mock `window.electronAPI.enterprise`。断言 provider 启动时调用 `restoreSession()`：有用户进入 `authenticated`，无 session 进入 `unauthenticated`，网络错误进入可重试 `error`，不影响原 `AuthContext`。

- [ ] **Step 2: 定义身份状态机**

```ts
export type EnterpriseAuthStatus =
  | 'checking'
  | 'unauthenticated'
  | 'waiting'
  | 'registerRequired'
  | 'authenticated'
  | 'error';
```

context 暴露 `startLogin`、`retry`、`logout`、`user`、`loginSession`、`registrationOpenId`、`error`。所有 timer 存在 ref 中，卸载、重新扫码、退出时必须清理。

- [ ] **Step 3: 写失败测试——3 秒轮询与 5 分钟过期**

使用 fake timers 验证：创建成功立即显示二维码；每 3000ms 轮询；`AUTHENTICATED` 停止 timer；`REGISTER_REQUIRED` 切换注册面板并继续每 3000ms 调用 `completeRegistration`；`EXPIRED` 停止并显示刷新按钮。

- [ ] **Step 4: 实现登录页面**

使用 Arco `Card/Spin/Alert/Button`。二维码显示主进程返回的 `qrDataUrl`，页面明确显示“请使用微信扫码登录”和剩余时间。图片失败、网络失败、后端业务失败均显示重试，不自动填充测试身份。

- [ ] **Step 5: 实现未注册面板**

使用现有 `qrcode.react` 为固定注册链接生成二维码：

```tsx
<QRCodeSVG value={ENTERPRISE_REGISTRATION_URL} size={220} level='M' />
```

显示“请在手机完成注册，本页面会自动检测”。继续查询原扫码得到的 openid，不创建第二个登录会话。

- [ ] **Step 6: 挂载 provider 并运行测试**

在 `AppProviders` 内把 `EnterpriseAuthProvider` 放在 `AuthProvider` 内层、ThemeProvider 外层，使登录页可使用主题且不改变原认证生命周期。

Run:

```bash
bun run test -- tests/unit/enterprise/EnterpriseAuthContext.dom.test.tsx tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx
bun run package
```

Expected: PASS / build 成功。

- [ ] **Step 7: 提交本任务**

```bash
git add packages/desktop/src/renderer/services/enterprise packages/desktop/src/renderer/hooks/context/EnterpriseAuthContext.tsx packages/desktop/src/renderer/pages/enterprise/login packages/desktop/src/renderer/main.tsx tests/unit/enterprise/EnterpriseAuthContext.dom.test.tsx tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx
git commit -m "feat(enterprise): add QR login and registration flow"
```

## Task 5: 建立企业工作台路由、框架和国际化

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseSider.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseHeader.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/layout/EnterprisePageState.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css`
- Modify: `packages/desktop/src/renderer/components/layout/Router.tsx`
- Create: `packages/desktop/src/renderer/services/i18n/locales/{de-DE,en-US,ja-JP,ko-KR,pt-BR,ru-RU,tr-TR,uk-UA,zh-CN,zh-TW}/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/{de-DE,en-US,ja-JP,ko-KR,pt-BR,ru-RU,tr-TR,uk-UA,zh-CN,zh-TW}/index.ts`
- Test: `tests/unit/enterprise/EnterpriseRouter.dom.test.tsx`

- [ ] **Step 1: 写失败测试——Electron 与 WebUI 根路由隔离**

覆盖：

- Electron 已登录访问 `/` → `/enterprise/dashboard`；
- Electron 未登录访问业务页 → `/enterprise/login`；
- WebUI 访问 `/` 仍 → `/guid`；
- 原 `/login`、`/guid`、`/conversation/:id` 路由保持可用；
- 企业退出后回到 `/enterprise/login`。

- [ ] **Step 2: 建立嵌套路由**

企业路由：

```text
/enterprise/login
/enterprise/dashboard
/enterprise/companies
/enterprise/companies/:companyId
/enterprise/products
/enterprise/products/:productId
/enterprise/projects
/enterprise/projects/:hpInfoId
/enterprise/favorites
/enterprise/leads
```

本计划先为 favorites/leads 放置明确的“将在下一阶段启用”页面，不提供假数据或不可用按钮。

- [ ] **Step 3: 实现三栏 shell 的前两栏**

左栏固定导航，中栏 `<Outlet />`，右栏留出可折叠 assistant slot，第三份计划填充。左栏使用 Icon Park 图标，导航包含工作台、企业库、产品库、在建项目、我的收藏、商机跟进；底部显示企业名、用户名、AI 入口、设置入口、退出登录。

不要复用原聊天 `Sider`，避免企业导航和会话历史相互污染。

- [ ] **Step 4: 实现通用页面状态**

`EnterprisePageState` 统一处理 loading、empty、error/retry。错误页显示服务端安全消息与重试按钮，不能在 catch 后返回演示数据。

- [ ] **Step 5: 添加 i18n namespace**

`zh-CN/enterprise.json` 使用完整中文；`en-US` 使用完整英文；其余 8 个 locale 首版复用英文值，确保 namespace key 完整。每个 locale `index.ts` import 并导出 `enterprise`。

Run:

```bash
bun run i18n:types
bun run test -- tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/common/i18n.test.ts
```

Expected: 类型生成成功、测试 PASS。

- [ ] **Step 6: 运行构建并提交**

Run: `bun run package`

Expected: build 成功。

```bash
git add packages/desktop/src/renderer/pages/enterprise/layout packages/desktop/src/renderer/components/layout/Router.tsx packages/desktop/src/renderer/services/i18n tests/unit/enterprise/EnterpriseRouter.dom.test.tsx
git commit -m "feat(enterprise): add desktop workbench shell and routes"
```

## Task 6: 实现企业库列表与详情

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/companies/companyData.ts`
- Create: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyListPage.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyDetailPage.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyQuickView.tsx`
- Test: `tests/unit/enterprise/companyData.test.ts`
- Test: `tests/unit/enterprise/CompanyListPage.dom.test.tsx`

- [ ] **Step 1: 写失败测试——查询参数和响应映射**

覆盖名称、行业、省市区、会员等级、页码、每页数量；改变筛选时页码重置为 1。列表响应缺失 `list` 时视为契约错误，不视为空列表。

- [ ] **Step 2: 实现 SWR data hooks**

key 包含所有查询条件；请求使用 `enterpriseClient.request({operation:'company.list', ...})`。列表保留上一页数据仅限翻页过程，筛选变化显示 loading。

- [ ] **Step 3: 实现表格列表**

使用 Arco `Form/Input/Select/Table/Pagination`。列：企业名称、行业、地区、会员等级、主营摘要、更新时间、操作。单击行更新右侧 quick view，双击或“查看详情”进入完整详情。

- [ ] **Step 4: 实现详情页**

展示企业基本信息、联系方式、地址、企业简介、主营产品摘要和该企业产品列表。电话权限和 H5 原付费限制由后端响应决定；未返回完整电话时不得尝试绕过。

- [ ] **Step 5: 运行测试与提交**

Run:

```bash
bun run test -- tests/unit/enterprise/companyData.test.ts tests/unit/enterprise/CompanyListPage.dom.test.tsx
bun run package
```

Expected: PASS / build 成功。

```bash
git add packages/desktop/src/renderer/pages/enterprise/companies tests/unit/enterprise/companyData.test.ts tests/unit/enterprise/CompanyListPage.dom.test.tsx
git commit -m "feat(enterprise): add company catalog and detail"
```

## Task 7: 实现产品库列表与详情

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/products/productData.ts`
- Create: `packages/desktop/src/renderer/pages/enterprise/products/ProductListPage.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/products/ProductDetailPage.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/products/ProductQuickView.tsx`
- Test: `tests/unit/enterprise/productData.test.ts`
- Test: `tests/unit/enterprise/ProductListPage.dom.test.tsx`

- [ ] **Step 1: 写失败测试——产品筛选和详情字段映射**

覆盖关键词、行业、地区、分页；详情映射 `productsName`、`companyId`、`companyName`、`industry/compIndustry`、`compPhone`、`compAddress`、`productAbs` 和图片 URL。

- [ ] **Step 2: 实现产品卡片列表**

产品页采用响应式卡片网格；卡片展示图片、产品名、企业、行业、地区和简介。图片加载失败显示文字占位，不引入新的占位图片资源。

- [ ] **Step 3: 实现 quick view 和详情**

quick view 支持跳转产品详情和关联企业详情。详情中的富文本先经过现有项目允许的安全渲染策略；若没有可复用 sanitizer，则首版按纯文本显示，不直接使用未经处理的 `dangerouslySetInnerHTML`。

- [ ] **Step 4: 运行测试与提交**

Run:

```bash
bun run test -- tests/unit/enterprise/productData.test.ts tests/unit/enterprise/ProductListPage.dom.test.tsx
bun run package
```

Expected: PASS / build 成功。

```bash
git add packages/desktop/src/renderer/pages/enterprise/products tests/unit/enterprise/productData.test.ts tests/unit/enterprise/ProductListPage.dom.test.tsx
git commit -m "feat(enterprise): add product catalog and detail"
```

## Task 8: 实现在建项目看板、列表和详情

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/projects/projectData.ts`
- Create: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectPage.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectDashboard.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectTable.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectDetailPage.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectQuickView.tsx`
- Test: `tests/unit/enterprise/projectData.test.ts`
- Test: `tests/unit/enterprise/ProjectPage.dom.test.tsx`

- [ ] **Step 1: 写失败测试——禁止 H5 静默 mock 行为**

fake API reject 时断言页面显示错误和重试，列表保持空，不能出现 H5 mock 中的 `90001/90002` 项目。

- [ ] **Step 2: 实现项目 dashboard 数据**

读取 `getAiMaterialDashboard` 和 `getAiMaterialDrillList`。V1 展示项目数、品类数、材料数、投资总额、地区分布和重点采购品类；图表库若当前工程无合适依赖，使用 Arco Progress/统计卡和 CSS 条形分布，不新增重型图表依赖。

- [ ] **Step 3: 实现项目筛选和表格**

筛选：关键词、品类一级/二级、材料简称/名称、省市、投资区间、页码。列：项目名、地区、投资额、项目性质、采购摘要、发布日期、操作。

- [ ] **Step 4: 实现详情和解锁状态展示**

详情调用真实 `getAiMaterialProjectDetail`，显示建设单位、联系人、电话、地址、性质、投资、周期、建设内容、设备、原材料。`isPurchased=false` 时仅展示后端允许字段和明确锁定提示；本计划不自动调用解锁写接口。

- [ ] **Step 5: 运行测试与提交**

Run:

```bash
bun run test -- tests/unit/enterprise/projectData.test.ts tests/unit/enterprise/ProjectPage.dom.test.tsx
bun run package
```

Expected: PASS / build 成功。

```bash
git add packages/desktop/src/renderer/pages/enterprise/projects tests/unit/enterprise/projectData.test.ts tests/unit/enterprise/ProjectPage.dom.test.tsx
git commit -m "feat(enterprise): add project dashboard and catalog"
```

## Task 9: 实现工作台总览和跨域统一搜索

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/dashboard/DashboardPage.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/dashboard/GlobalSearch.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/dashboard/dashboardData.ts`
- Test: `tests/unit/enterprise/dashboardData.test.ts`
- Test: `tests/unit/enterprise/DashboardPage.dom.test.tsx`

- [ ] **Step 1: 写失败测试——三类搜索并行和部分失败**

输入至少 2 个字符、停顿 300ms 后并行请求企业、产品、项目，每类最多 5 条。某一类失败时显示该分组错误，其他成功分组仍可用；三类全失败显示总错误。

- [ ] **Step 2: 实现总览卡片**

工作台首版显示当前企业信息、项目采购雷达摘要、最近使用入口和搜索。收藏数、跟进数尚未接入时不显示伪造数字；第三份计划接入后再增加。

- [ ] **Step 3: 实现分组搜索结果**

结果按企业、产品、项目分组，键盘上下选择、Enter 跳转详情、Esc 关闭。搜索框和结果使用 Arco 组件，ARIA label 进入 i18n。

- [ ] **Step 4: 运行测试与提交**

Run:

```bash
bun run test -- tests/unit/enterprise/dashboardData.test.ts tests/unit/enterprise/DashboardPage.dom.test.tsx
bun run package
```

Expected: PASS / build 成功。

```bash
git add packages/desktop/src/renderer/pages/enterprise/dashboard tests/unit/enterprise/dashboardData.test.ts tests/unit/enterprise/DashboardPage.dom.test.tsx
git commit -m "feat(enterprise): add dashboard and global search"
```

## Task 10: 核心工作台回归验证

**Files:**

- Create: `tests/integration/enterprise/enterpriseWorkbench.dom.test.tsx`
- Modify: `docs/specs/enterprise-code-desktop/design.md`

- [ ] **Step 1: 添加跨页面集成测试**

使用内存路由和 fake `electronAPI.enterprise` 完成：恢复登录 → 工作台 → 搜索企业 → 企业详情 → 关联产品详情 → 项目列表 → 项目详情 → 退出登录。断言原 `/guid` 仍可导航。

- [ ] **Step 2: 运行企业相关测试**

Run: `bun run test -- tests/unit/enterprise tests/integration/enterprise`

Expected: 全部 PASS。

- [ ] **Step 3: 运行项目级检查**

Run:

```bash
bun run i18n:types
bun run lint
bun run format:check
bun run package
```

Expected: 全部成功。若仓库已有无关基线失败，保存完整输出并证明新增文件没有新增失败，不得直接忽略。

- [ ] **Step 4: 联调手工验收**

在 Windows Electron 开发构建中验证：

1. 新安装显示微信扫码页；
2. 扫码已注册用户进入工作台；
3. 未注册用户显示注册链接二维码，手机注册后自动进入；
4. 重启应用恢复 openid 并重新拉取用户上下文；
5. 退出后删除 session 并回到扫码页；
6. 企业、产品、项目列表/详情均来自真实接口；
7. 服务不可用时显示错误与重试，不显示 mock；
8. `/guid` 和原聊天功能仍可使用；
9. Remote WebUI 根路由与登录行为不变。

- [ ] **Step 5: 更新设计文档状态并提交**

只把实现完成项标记为“已实现”，保留收藏/跟进/AI 为“待第三阶段”。

```bash
git add tests/integration/enterprise/enterpriseWorkbench.dom.test.tsx docs/specs/enterprise-code-desktop/design.md
git commit -m "test(enterprise): verify core desktop workbench"
```

## 完成判定

- Electron 默认进入企业码登录或工作台；Remote WebUI 行为不变。
- openid 只保存在主进程 userData 文件，renderer 不直接读写磁盘。
- 渲染进程无法构造任意云端 URL。
- 扫码、未注册引导、注册后自动进入、重启恢复和退出均可用。
- 企业、产品、项目和统一搜索全部使用真实接口，失败时无静默 mock。
- 原 AionUi AI 聊天路由和能力保持可访问。
- 企业单元/集成测试、i18n 类型、lint、format check 和 Electron build 通过。
