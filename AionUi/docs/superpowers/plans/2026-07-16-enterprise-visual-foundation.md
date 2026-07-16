# Enterprise Visual Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“链上辽宁·产业云城”企业空间改造成使用微软雅黑、白色卡片、15px 圆角、柔和阴影和稳定独立滚动的明亮工作台，同时不改变链辽AI和普通设置页面的视觉样式。

**Architecture:** 新增一个仅由 `.enterprise-shell` 与 `.enterprise-login` 消费的全局企业视觉 Token 文件；现有企业 CSS 只引用这些语义 Token。保留当前 React 路由、数据加载和 Electron 壳逻辑，只调整企业导航分组、企业 DOM 装饰和样式契约；所有新分组文案进入现有 `enterprise` i18n 模块。

**Tech Stack:** React 19、TypeScript、Electron 37、Arco Design、CSS Modules、Vitest 4、Testing Library、i18next、Oxfmt

---

## 0. 约束和文件结构

工作目录：`E:\ZZY_PROJECT\AI_lianliao\AionUi`

本计划只修改 AionUi，不修改 `cloud-service` 或 `vip_store`。

新增文件职责：

- `packages/desktop/src/renderer/styles/enterprise-theme.css`：企业空间唯一公共视觉 Token 和字体作用域。
- `tests/unit/enterprise/enterpriseVisualTheme.test.ts`：公共 Token、导入顺序、字体隔离和企业样式契约。
- `tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts`：企业、产品、项目卡片视觉契约。

现有文件职责保持不变：

- `EnterpriseSider.tsx`：企业导航结构和退出交互；只增加分组结构。
- `EnterpriseShell.tsx`：企业工作区 DOM 和路由出口；只移除旧蓝图装饰。
- `enterprise-shell.css`：企业壳、菜单、头部、助手和滚动布局。
- 各页面 CSS Module：页面内部卡片和响应式样式。
- `enterprise-login.css`：扫码登录页企业视觉。

不可变规则：

- 不给 `html`、`body` 或链辽AI设置微软雅黑；字体作用域只覆盖企业根节点。
- 不修改企业列表、详情、项目或搜索的数据逻辑。
- 不把业务指标替换成演示数字。
- 不删除键盘焦点、窄窗口和 reduced-motion 行为。
- 组件继续使用现有 Arco Design 和 Icon Park。

## Task 1: Add scoped enterprise visual tokens

**Files:**

- Create: `packages/desktop/src/renderer/styles/enterprise-theme.css`
- Modify: `packages/desktop/src/renderer/main.tsx`
- Create: `tests/unit/enterprise/enterpriseVisualTheme.test.ts`

- [ ] **Step 1: Write the failing public-theme contract test**

Create `tests/unit/enterprise/enterpriseVisualTheme.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererMain = readFileSync(resolve('packages/desktop/src/renderer/main.tsx'), 'utf8');
const themePath = resolve('packages/desktop/src/renderer/styles/enterprise-theme.css');

describe('enterprise visual theme contract', () => {
  it('loads the scoped enterprise theme after the shared color scheme', () => {
    const sharedThemeImport = rendererMain.indexOf("import './styles/themes/index.css';");
    const enterpriseThemeImport = rendererMain.indexOf("import './styles/enterprise-theme.css';");

    expect(sharedThemeImport).toBeGreaterThanOrEqual(0);
    expect(enterpriseThemeImport).toBeGreaterThan(sharedThemeImport);
  });

  it('defines the approved enterprise font, radius, surface, and shadow tokens', () => {
    const css = readFileSync(themePath, 'utf8');

    expect(css).toMatch(/\.enterprise-shell,\s*\.enterprise-login\s*\{/s);
    expect(css).toMatch(/--enterprise-font-ui:\s*'Microsoft YaHei',\s*'微软雅黑'/);
    expect(css).toMatch(/--enterprise-page-bg:\s*#[0-9a-f]{6}/i);
    expect(css).toMatch(/--enterprise-surface:\s*#[0-9a-f]{6}/i);
    expect(css).toMatch(/--enterprise-radius-card:\s*15px/);
    expect(css).toMatch(/--enterprise-radius-control:\s*10px/);
    expect(css).toMatch(/--enterprise-shadow-card:\s*0\s+8px\s+24px/);
  });

  it('does not apply the enterprise font to the global document', () => {
    const css = readFileSync(themePath, 'utf8');

    expect(css).not.toMatch(/(?:^|\n)\s*(?:html|body|:root)\s*\{/);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing file/import failure**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/enterpriseVisualTheme.test.ts
```

Expected: FAIL because `enterprise-theme.css` and its import do not exist.

- [ ] **Step 3: Add the complete enterprise token file**

Create `packages/desktop/src/renderer/styles/enterprise-theme.css`:

```css
/* Scoped visual tokens for 链上辽宁·产业云城. */
.enterprise-shell,
.enterprise-login {
  --enterprise-font-ui: 'Microsoft YaHei', '微软雅黑', 'Segoe UI', Arial, sans-serif;
  --enterprise-page-bg: #f4f8ff;
  --enterprise-surface: #ffffff;
  --enterprise-surface-soft: #f8fbff;
  --enterprise-border: #d8e6f5;
  --enterprise-primary: #2878ff;
  --enterprise-primary-soft: #eaf3ff;
  --enterprise-text-primary: #102a43;
  --enterprise-text-secondary: #6b7f93;
  --enterprise-radius-card: 15px;
  --enterprise-radius-control: 10px;
  --enterprise-shadow-card: 0 8px 24px rgba(36, 92, 145, 0.08);
  --enterprise-shadow-hover: 0 12px 30px rgba(36, 92, 145, 0.13);
  --enterprise-content-gap: 14px;

  color: var(--enterprise-text-primary);
  font-family: var(--enterprise-font-ui);
  font-weight: 400;
}

.enterprise-shell :where(button, input, textarea, select),
.enterprise-login :where(button, input, textarea, select) {
  font-family: inherit;
}
```

Add the import in `packages/desktop/src/renderer/main.tsx` immediately after the shared theme import:

```ts
import './styles/themes/index.css';
import './styles/enterprise-theme.css';
```

- [ ] **Step 4: Run the focused test and formatting check**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/enterpriseVisualTheme.test.ts
npx --no-install oxfmt --check packages/desktop/src/renderer/styles/enterprise-theme.css packages/desktop/src/renderer/main.tsx tests/unit/enterprise/enterpriseVisualTheme.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit the scoped theme foundation**

```powershell
git add packages/desktop/src/renderer/styles/enterprise-theme.css packages/desktop/src/renderer/main.tsx tests/unit/enterprise/enterpriseVisualTheme.test.ts
git commit -m "style(enterprise): add scoped visual tokens"
```

## Task 2: Group the enterprise navigation into card sections

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseSider.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`
- Regenerate: `packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`
- Modify: `tests/unit/enterprise/EnterpriseRouter.dom.test.tsx`
- Modify: `tests/unit/enterprise/enterpriseResponsiveShell.test.ts`

- [ ] **Step 1: Add failing DOM and CSS tests for grouped navigation**

Add this test inside `describe('enterprise desktop routing', ...)` in `EnterpriseRouter.dom.test.tsx`:

```tsx
it('groups enterprise links into overview, resource, and collaboration cards', async () => {
  renderAt('/enterprise/dashboard');

  const navigation = await screen.findByRole(
    'navigation',
    { name: 'enterprise.accessibility.primaryNavigation' },
    ROUTE_WAIT_OPTIONS
  );

  expect(within(navigation).getByText('enterprise.navigationGroups.overview')).toBeVisible();
  expect(within(navigation).getByText('enterprise.navigationGroups.resources')).toBeVisible();
  expect(within(navigation).getByText('enterprise.navigationGroups.collaboration')).toBeVisible();
  expect(navigation.querySelectorAll('.enterprise-sider__nav-group')).toHaveLength(3);
});
```

Add this test to `enterpriseResponsiveShell.test.ts`:

```ts
it('renders navigation groups as shared-token cards', () => {
  const groupRule = css.match(/\.enterprise-sider__nav-group\s*\{([^}]*)\}/s)?.[1] ?? '';

  expect(groupRule).toMatch(/background:\s*var\(--enterprise-surface\)/);
  expect(groupRule).toMatch(/border-radius:\s*var\(--enterprise-radius-card\)/);
  expect(groupRule).toMatch(/box-shadow:\s*var\(--enterprise-shadow-card\)/);
});
```

- [ ] **Step 2: Run the two tests and verify they fail**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/enterpriseResponsiveShell.test.ts
```

Expected: FAIL because the group labels, group DOM and card styles do not exist.

- [ ] **Step 3: Replace the flat navigation array with typed groups**

Replace `primaryItems` in `EnterpriseSider.tsx` with:

```tsx
const navigationGroups = [
  {
    labelKey: 'enterprise.navigationGroups.overview',
    items: [{ path: '/enterprise/dashboard', labelKey: 'enterprise.navigation.dashboard', Icon: DashboardOne }],
  },
  {
    labelKey: 'enterprise.navigationGroups.resources',
    items: [
      { path: '/enterprise/companies', labelKey: 'enterprise.navigation.companies', Icon: BuildingFour },
      { path: '/enterprise/products', labelKey: 'enterprise.navigation.products', Icon: Box },
      { path: '/enterprise/projects', labelKey: 'enterprise.navigation.projects', Icon: EngineeringBrand },
    ],
  },
  {
    labelKey: 'enterprise.navigationGroups.collaboration',
    items: [
      { path: '/enterprise/favorites', labelKey: 'enterprise.navigation.favorites', Icon: Star },
      { path: '/enterprise/leads', labelKey: 'enterprise.navigation.leads', Icon: FollowUpDateSort },
    ],
  },
] as const;
```

Replace the contents of `<nav>` with:

```tsx
{
  navigationGroups.map((group) => (
    <section key={group.labelKey} className='enterprise-sider__nav-group'>
      <span className='enterprise-sider__nav-group-label'>{t(group.labelKey)}</span>
      <div className='enterprise-sider__nav-group-links'>
        {group.items.map(({ path, labelKey, Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `enterprise-sider__nav-item${isActive ? ' enterprise-sider__nav-item--active' : ''}`
            }
          >
            <Icon size={18} />
            <span>{t(labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </section>
  ));
}
```

- [ ] **Step 4: Add exact group translations to every supported locale**

Insert a `navigationGroups` object beside `navigation` in all ten `enterprise.json` files using these exact values:

```json
{
  "zh-CN": { "overview": "工作台", "resources": "数据资源", "collaboration": "业务协同" },
  "en-US": { "overview": "Overview", "resources": "Data resources", "collaboration": "Business collaboration" },
  "ja-JP": { "overview": "概要", "resources": "データリソース", "collaboration": "業務連携" },
  "zh-TW": { "overview": "總覽", "resources": "資料資源", "collaboration": "業務協作" },
  "ko-KR": { "overview": "개요", "resources": "데이터 리소스", "collaboration": "비즈니스 협업" },
  "tr-TR": { "overview": "Genel bakış", "resources": "Veri kaynakları", "collaboration": "İş işbirliği" },
  "ru-RU": { "overview": "Обзор", "resources": "Ресурсы данных", "collaboration": "Деловое взаимодействие" },
  "uk-UA": { "overview": "Огляд", "resources": "Ресурси даних", "collaboration": "Бізнес-взаємодія" },
  "pt-BR": { "overview": "Visão geral", "resources": "Recursos de dados", "collaboration": "Colaboração empresarial" },
  "de-DE": { "overview": "Übersicht", "resources": "Datenressourcen", "collaboration": "Geschäftliche Zusammenarbeit" }
}
```

The locale wrapper shown above is a mapping guide; each locale file receives only its corresponding inner object under the key `navigationGroups`.

- [ ] **Step 5: Add the navigation card styles**

Update the navigation section of `enterprise-shell.css` to include:

```css
.enterprise-sider__navigation {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 14px 12px;
}

.enterprise-sider__nav-group {
  padding: 10px;
  border: 1px solid var(--enterprise-border);
  border-radius: var(--enterprise-radius-card);
  background: var(--enterprise-surface);
  box-shadow: var(--enterprise-shadow-card);
}

.enterprise-sider__nav-group-label {
  display: block;
  margin: 0 8px 7px;
  color: var(--enterprise-text-secondary);
  font-size: 11px;
  font-weight: 500;
}

.enterprise-sider__nav-group-links {
  display: grid;
  gap: 4px;
}
```

Set `.enterprise-sider__nav-item` to `border-radius: var(--enterprise-radius-control)` and set its active background to `var(--enterprise-primary-soft)`.

Inside the existing `@media (max-width: 780px)` block, add:

```css
.enterprise-sider__nav-group {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  padding: 4px;
  border-radius: var(--enterprise-radius-control);
  box-shadow: none;
}

.enterprise-sider__nav-group-label {
  display: none;
}

.enterprise-sider__nav-group-links {
  display: flex;
}
```

- [ ] **Step 6: Regenerate and validate i18n, then run focused tests**

Run:

```powershell
npm run i18n:types
node scripts/check-i18n.js
npx --no-install vitest run tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/enterpriseResponsiveShell.test.ts
```

Expected: i18n validation reports no errors and both test files pass.

- [ ] **Step 7: Commit grouped navigation**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseSider.tsx packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css packages/desktop/src/renderer/services/i18n/locales packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/enterpriseResponsiveShell.test.ts
git commit -m "feat(enterprise): group workspace navigation"
```

## Task 3: Convert the enterprise shell into independent white cards

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css`
- Modify: `tests/unit/enterprise/EnterpriseRouter.dom.test.tsx`
- Modify: `tests/unit/enterprise/enterpriseResponsiveShell.test.ts`

- [ ] **Step 1: Add failing shell surface and decoration tests**

Add to the grouped navigation DOM test after rendering:

```tsx
expect(document.querySelector('.enterprise-shell__blueprint')).not.toBeInTheDocument();
```

Add to `enterpriseResponsiveShell.test.ts`:

```ts
it('uses independent white cards for the navigation and workspace', () => {
  const siderRule = css.match(/\.enterprise-sider\s*\{([^}]*)\}/s)?.[1] ?? '';
  const workspaceRule = css.match(/\.enterprise-shell__workspace\s*\{([^}]*)\}/s)?.[1] ?? '';

  for (const rule of [siderRule, workspaceRule]) {
    expect(rule).toMatch(/background:\s*var\(--enterprise-surface\)/);
    expect(rule).toMatch(/border-radius:\s*var\(--enterprise-radius-card\)/);
    expect(rule).toMatch(/box-shadow:\s*var\(--enterprise-shadow-card\)/);
  }
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/enterpriseResponsiveShell.test.ts
```

Expected: FAIL because the blueprint still exists and the shell surfaces do not use the new tokens.

- [ ] **Step 3: Remove the blueprint decoration from the shell DOM and CSS**

Delete this line from `EnterpriseShell.tsx`:

```tsx
<div className='enterprise-shell__blueprint' aria-hidden='true' />
```

Delete the complete `.enterprise-shell__blueprint` rule from `enterprise-shell.css`.

- [ ] **Step 4: Apply the exact card shell structure**

Change the relevant shell rules to:

```css
.enterprise-shell {
  --enterprise-sider-width: 216px;
  --enterprise-assistant-width: 264px;

  position: relative;
  display: grid;
  grid-template-columns: var(--enterprise-sider-width) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  height: 100vh;
  height: 100dvh;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--enterprise-page-bg);
}

.enterprise-sider {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  margin: 12px 0 12px 12px;
  overflow: hidden;
  border: 1px solid var(--enterprise-border);
  border-radius: var(--enterprise-radius-card);
  background: var(--enterprise-surface);
  box-shadow: var(--enterprise-shadow-card);
}

.enterprise-shell__workspace {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: 62px minmax(0, 1fr);
  margin: 12px;
  overflow: hidden;
  border: 1px solid var(--enterprise-border);
  border-radius: var(--enterprise-radius-card);
  background: var(--enterprise-surface);
  box-shadow: var(--enterprise-shadow-card);
}

.enterprise-header {
  background: var(--enterprise-surface);
}

.enterprise-shell__main {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: clamp(20px, 3vw, 38px);
  background: var(--enterprise-page-bg);
}

.enterprise-assistant {
  background: var(--enterprise-surface-soft);
}
```

Update enterprise shell text and border colors to `--enterprise-text-primary`, `--enterprise-text-secondary`, `--enterprise-border`, and `--enterprise-primary`. Do not replace unrelated global tokens outside `.enterprise-shell` selectors.

Inside `@media (max-width: 780px)`, add:

```css
.enterprise-sider {
  margin: 8px;
}

.enterprise-shell__workspace {
  margin: 0 8px 8px;
}
```

Keep the existing viewport lock, main-pane `overflow: auto`, compact document release and independent assistant/navigation scrolling rules intact.

- [ ] **Step 5: Run shell tests**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/enterpriseResponsiveShell.test.ts
```

Expected: both files pass, including existing compact-window and scroll assertions.

- [ ] **Step 6: Commit shell card layout**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/enterpriseResponsiveShell.test.ts
git commit -m "style(enterprise): brighten workspace shell"
```

## Task 4: Standardize enterprise typography on Microsoft YaHei

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/login/enterprise-login.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css`
- Modify: `tests/unit/enterprise/enterpriseVisualTheme.test.ts`

- [ ] **Step 1: Add a failing typography isolation test**

Append this setup and test to `enterpriseVisualTheme.test.ts`:

```ts
const enterpriseStylePaths = [
  'packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css',
  'packages/desktop/src/renderer/pages/enterprise/login/enterprise-login.css',
  'packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css',
  'packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css',
  'packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css',
  'packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css',
] as const;

it('removes the old serif and display-monospace typography from enterprise pages', () => {
  for (const path of enterpriseStylePaths) {
    const css = readFileSync(resolve(path), 'utf8');

    expect(css, path).not.toContain('Noto Serif SC');
    expect(css, path).not.toContain('Source Han Serif SC');
    expect(css, path).not.toMatch(/font-family:\s*ui-monospace/);
  }
});
```

- [ ] **Step 2: Run the theme test and verify it fails on existing font declarations**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/enterpriseVisualTheme.test.ts
```

Expected: FAIL and report existing serif or `ui-monospace` declarations in enterprise CSS.

- [ ] **Step 3: Replace every enterprise display font declaration**

Apply these exact replacements in the six enterprise style files:

```css
/* Old heading font */
font-family: 'Noto Serif SC', 'Source Han Serif SC', serif;

/* New heading font */
font-family: var(--enterprise-font-ui);
```

```css
/* Old display/data label font */
font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;

/* New enterprise UI font */
font-family: var(--enterprise-font-ui);
```

For multiline monospace stacks, replace the complete declaration with `font-family: var(--enterprise-font-ui);`.

Retain `font-variant-numeric: tabular-nums` on countdowns and numeric metrics so numbers remain aligned without using a thin monospace face.

Set these weights explicitly:

```css
.enterprise-sider__nav-item,
.enterprise-sider__utility,
.enterprise-header__route {
  font-weight: 500;
}

.enterprise-sider__brand strong,
.enterprise-assistant h2,
.enterprise-page-state__copy h1 {
  font-weight: 600;
}
```

For each page CSS Module, keep body text at inherited `400`, set page/card headings to `600`, and retain existing `700` only for primary statistics and short brand marks.

- [ ] **Step 4: Run the typography and enterprise DOM tests**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/enterpriseVisualTheme.test.ts tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx
```

Expected: all tests pass and no enterprise CSS contains the removed font families.

- [ ] **Step 5: Commit enterprise typography**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css packages/desktop/src/renderer/pages/enterprise/login/enterprise-login.css packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css tests/unit/enterprise/enterpriseVisualTheme.test.ts
git commit -m "style(enterprise): use Microsoft YaHei typography"
```

## Task 5: Brighten the dashboard surfaces

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css`
- Modify: `tests/unit/enterprise/DashboardSearchStyles.test.ts`

- [ ] **Step 1: Add failing dashboard card-token assertions**

Append to `DashboardSearchStyles.test.ts`:

```ts
it('uses the shared enterprise card tokens for dashboard sections', () => {
  for (const selector of ['searchSection', 'radarSection', 'identityCard', 'quickCard']) {
    const rule = dashboardStyles.match(new RegExp(`\\.${selector}(?:,|\\s*\\{)([\\s\\S]*?)\\}`))?.[1] ?? '';

    expect(rule, selector).toMatch(/border-radius:\s*var\(--enterprise-radius-card\)/);
    expect(rule, selector).toMatch(/box-shadow:\s*var\(--enterprise-shadow-card\)/);
  }
});

it('keeps dashboard cards white instead of using the old gray surface', () => {
  expect(dashboardStyles).toMatch(
    /\.identityCard,[\s\S]*?\.quickCard\s*\{[^}]*background:\s*var\(--enterprise-surface\)/s
  );
});
```

- [ ] **Step 2: Run the dashboard CSS test and verify it fails**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/DashboardSearchStyles.test.ts
```

Expected: FAIL because dashboard cards still use zero-radius or old gray surfaces.

- [ ] **Step 3: Apply the dashboard card system**

Set the dashboard sections to:

```css
.searchSection,
.radarSection,
.identityCard,
.quickCard {
  border: 1px solid var(--enterprise-border);
  border-radius: var(--enterprise-radius-card);
  background: var(--enterprise-surface);
  box-shadow: var(--enterprise-shadow-card);
}

.searchSection,
.radarSection {
  overflow: hidden;
}

.identityCard,
.quickCard {
  padding: 20px;
}
```

Change search options, radar metric subcards and quick links to `var(--enterprise-surface-soft)` with `var(--enterprise-radius-control)`. Change all dashboard border colors to `var(--enterprise-border)` and all primary accents to `var(--enterprise-primary)`.

Keep the existing `.searchTotalError` wrapping and all responsive/reduced-motion rules unchanged.

- [ ] **Step 4: Run dashboard behavior and CSS tests**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/DashboardSearchStyles.test.ts tests/unit/enterprise/DashboardPage.dom.test.tsx tests/unit/enterprise/dashboardData.test.ts
```

Expected: all three files pass.

- [ ] **Step 5: Commit dashboard surfaces**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css tests/unit/enterprise/DashboardSearchStyles.test.ts
git commit -m "style(enterprise): brighten dashboard cards"
```

## Task 6: Apply card tokens to company, product, and project workspaces

**Files:**

- Create: `tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css`

- [ ] **Step 1: Write a failing shared catalog visual test**

Create `tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = {
  company: readFileSync(
    resolve('packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css'),
    'utf8'
  ),
  product: readFileSync(
    resolve('packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css'),
    'utf8'
  ),
  project: readFileSync(
    resolve('packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css'),
    'utf8'
  ),
} as const;

const extractRule = (css: string, selector: string): string =>
  css.match(new RegExp(`\\.${selector}(?:,|\\s*\\{)([\\s\\S]*?)\\}`))?.[1] ?? '';

describe('enterprise catalog visual contract', () => {
  it.each([
    ['company', 'filterForm'],
    ['company', 'content'],
    ['product', 'filterForm'],
    ['product', 'content'],
    ['project', 'filterForm'],
    ['project', 'dashboard'],
    ['project', 'catalogSection'],
  ] as const)('%s %s uses shared card radius and surface', (domain, selector) => {
    const rule = extractRule(styles[domain], selector);

    expect(rule).toMatch(/border-radius:\s*var\(--enterprise-radius-card\)/);
    expect(rule).toMatch(/background:\s*var\(--enterprise-surface\)/);
    expect(rule).toMatch(/box-shadow:\s*var\(--enterprise-shadow-card\)/);
  });

  it('uses a card treatment for product result cards', () => {
    const rule = extractRule(styles.product, 'productCard');

    expect(rule).toMatch(/border-radius:\s*var\(--enterprise-radius-card\)/);
    expect(rule).toMatch(/box-shadow:\s*var\(--enterprise-shadow-card\)/);
  });
});
```

- [ ] **Step 2: Run the test and verify old surfaces fail**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts
```

Expected: FAIL because filters and content panels do not yet use the shared card tokens.

- [ ] **Step 3: Apply the exact shared panel contract**

In all three CSS Modules, use this contract for each top-level filter/content selector named by the test:

```css
border: 1px solid var(--enterprise-border);
border-radius: var(--enterprise-radius-card);
background: var(--enterprise-surface);
box-shadow: var(--enterprise-shadow-card);
```

Apply it to these exact selectors:

```text
company: .filterForm, .content, .detailBody
product: .filterForm, .content, .productCard, .detailBody
project: .filterForm, .dashboard, .catalogSection, .detailContent
```

Use `var(--enterprise-surface-soft)` for embedded quick views and detail hero blocks. Use `var(--enterprise-radius-control)` for embedded subcards and form controls. Remove old `border-radius: 0` and `border-radius: 2px` declarations from these surfaces.

For `.productCard:hover`, retain the existing transform only when motion is allowed and change the shadow to `var(--enterprise-shadow-hover)`. Preserve the existing reduced-motion override that removes the transform.

- [ ] **Step 4: Run catalog CSS and DOM tests**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts tests/unit/enterprise/CompanyListPage.dom.test.tsx tests/unit/enterprise/ProductListPage.dom.test.tsx tests/unit/enterprise/ProjectPage.dom.test.tsx tests/unit/enterprise/productCatalogResponsiveCss.test.ts
```

Expected: all five files pass.

- [ ] **Step 5: Commit catalog surfaces**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts
git commit -m "style(enterprise): unify catalog card surfaces"
```

## Task 7: Bring the enterprise login page into the same bright system

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/login/EnterpriseLoginPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/login/enterprise-login.css`
- Modify: `tests/unit/enterprise/enterpriseLoginCss.test.ts`
- Modify: `tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx`

- [ ] **Step 1: Update the login theme test to include scoped token definitions**

Replace the theme setup in `enterpriseLoginCss.test.ts` with:

```ts
const ENTERPRISE_THEME_PATH = resolve(process.cwd(), 'packages/desktop/src/renderer/styles/enterprise-theme.css');

const loginCss = readFileSync(LOGIN_CSS_PATH, 'utf8');
const themeCss = readFileSync(DEFAULT_THEME_PATH, 'utf8');
const enterpriseThemeCss = readFileSync(ENTERPRISE_THEME_PATH, 'utf8');
```

In the existing token test, replace the definition setup with:

```ts
const [lightTheme = '', darkTheme = ''] = themeCss.split('/* Dark Mode */');
const enterpriseDefinitions = extractDefinitions(enterpriseThemeCss);
const lightDefinitions = new Set([...extractDefinitions(lightTheme), ...enterpriseDefinitions]);
const darkDefinitions = new Set([...extractDefinitions(darkTheme), ...enterpriseDefinitions]);
```

Add these tests:

```ts
it('uses the enterprise surface, radius, and shadow tokens', () => {
  const cardRule = loginCss.match(/\.enterprise-login__stage-card\s*\{([^}]*)\}/s)?.[1] ?? '';

  expect(cardRule).toMatch(/border-radius:\s*var\(--enterprise-radius-card\)/);
  expect(cardRule).toMatch(/background:\s*var\(--enterprise-surface\)/);
  expect(cardRule).toMatch(/box-shadow:\s*var\(--enterprise-shadow-card\)/);
});

it('does not retain the old blueprint decoration', () => {
  expect(loginCss).not.toContain('.enterprise-login__blueprint');
});
```

Add this assertion to the existing `renders the main-process QR image, accessible countdown, and automatic status` test in `EnterpriseLoginPage.dom.test.tsx`:

```tsx
expect(document.querySelector('.enterprise-login__blueprint')).not.toBeInTheDocument();
```

- [ ] **Step 2: Run login tests and verify they fail**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/enterpriseLoginCss.test.ts tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx
```

Expected: FAIL because the blueprint and old stage-card styling are still present.

- [ ] **Step 3: Remove the login blueprint and use shared enterprise surfaces**

Delete the `.enterprise-login__blueprint` element from `EnterpriseLoginPage.tsx` and delete its CSS rule.

Apply:

```css
.enterprise-login {
  background: var(--enterprise-page-bg);
}

.enterprise-login__story {
  margin: 18px 0 18px 18px;
  border: 1px solid var(--enterprise-border);
  border-radius: var(--enterprise-radius-card);
  background: var(--enterprise-surface);
  box-shadow: var(--enterprise-shadow-card);
}

.enterprise-login__stage-card {
  border-color: var(--enterprise-border) !important;
  border-radius: var(--enterprise-radius-card) !important;
  background: var(--enterprise-surface) !important;
  box-shadow: var(--enterprise-shadow-card);
}

.enterprise-login__brand-mark,
.enterprise-login__stage-index,
.enterprise-login__qr-frame,
.enterprise-login__registration-qr {
  border-radius: var(--enterprise-radius-control);
  background: var(--enterprise-surface-soft);
}
```

Inside `@media (max-width: 880px)`, reset the story margin to `16px` and keep the stage card width and document scrolling behavior. Preserve all login states, QR sizing, focus indicators and reduced-motion rules.

- [ ] **Step 4: Run login tests**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/enterpriseLoginCss.test.ts tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx
```

Expected: both files pass.

- [ ] **Step 5: Commit login visual alignment**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/login/EnterpriseLoginPage.tsx packages/desktop/src/renderer/pages/enterprise/login/enterprise-login.css tests/unit/enterprise/enterpriseLoginCss.test.ts tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx
git commit -m "style(enterprise): align login with bright theme"
```

## Task 8: Verify the complete visual foundation

**Files:**

- Verify all files changed by Tasks 1–7

- [ ] **Step 1: Regenerate i18n types and validate locale parity**

Run:

```powershell
npm run i18n:types
node scripts/check-i18n.js
```

Expected: both commands exit 0 with no missing enterprise keys.

- [ ] **Step 2: Format and lint all changed source files**

Run:

```powershell
npx --no-install oxfmt packages/desktop/src/renderer/styles/enterprise-theme.css packages/desktop/src/renderer/main.tsx packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseSider.tsx packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css packages/desktop/src/renderer/pages/enterprise/login/EnterpriseLoginPage.tsx packages/desktop/src/renderer/pages/enterprise/login/enterprise-login.css packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css packages/desktop/src/renderer/services/i18n/locales packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts tests/unit/enterprise/enterpriseVisualTheme.test.ts tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/enterpriseResponsiveShell.test.ts tests/unit/enterprise/DashboardSearchStyles.test.ts tests/unit/enterprise/enterpriseLoginCss.test.ts tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx
npx --no-install oxlint packages/desktop/src/renderer/main.tsx packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseSider.tsx packages/desktop/src/renderer/pages/enterprise/login/EnterpriseLoginPage.tsx tests/unit/enterprise/enterpriseVisualTheme.test.ts tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/enterpriseResponsiveShell.test.ts tests/unit/enterprise/DashboardSearchStyles.test.ts tests/unit/enterprise/enterpriseLoginCss.test.ts tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx
```

Expected: formatting completes and lint exits 0.

- [ ] **Step 3: Run TypeScript validation**

Run:

```powershell
npx --no-install tsc --noEmit
```

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 4: Run the complete enterprise test suite**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise tests/integration/enterprise
```

Expected: all enterprise unit and integration tests pass.

- [ ] **Step 5: Run the repository test suite**

Run:

```powershell
npm test
```

Expected: exit 0. If the repository still contains a separately documented pre-existing baseline failure, record the exact failing test names and verify none touch files changed by this plan before proceeding; do not describe the full suite as passing.

- [ ] **Step 6: Check the final diff and worktree**

Run:

```powershell
git diff --check
git status --short
```

Expected: `git diff --check` exits 0 and `git status --short` contains only intentional phase-0 files.

- [ ] **Step 7: Perform manual Electron visual acceptance**

Run the existing development command used by the repository, sign in, and verify these exact routes at normal and narrow window widths:

```text
/enterprise/login
/enterprise/dashboard
/enterprise/companies
/enterprise/products
/enterprise/projects
/enterprise/favorites
/enterprise/leads
```

Verify:

- the enterprise UI uses Microsoft YaHei while `/guid` retains the original font/theme;
- navigation groups are white cards with 15px radius and readable active states;
- company, product, project and dashboard panels use white cards and soft shadows;
- the main pane scrolls without stretching the Electron document;
- navigation remains usable in a short or narrow window;
- assistant collapse/expand, logout, keyboard tab order and F12 continue to work.

- [ ] **Step 8: Commit any formatter-only final adjustments**

If Step 2 changed files after the previous task commits, stage only those formatter adjustments and commit:

```powershell
git add packages/desktop/src/renderer/styles/enterprise-theme.css packages/desktop/src/renderer/main.tsx packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseSider.tsx packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css packages/desktop/src/renderer/pages/enterprise/login/EnterpriseLoginPage.tsx packages/desktop/src/renderer/pages/enterprise/login/enterprise-login.css packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css packages/desktop/src/renderer/services/i18n/locales packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts tests/unit/enterprise/enterpriseVisualTheme.test.ts tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/enterprise/enterpriseResponsiveShell.test.ts tests/unit/enterprise/DashboardSearchStyles.test.ts tests/unit/enterprise/enterpriseLoginCss.test.ts tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx
git commit -m "chore(enterprise): format visual foundation"
```

If Step 2 produced no diff, skip this commit and leave the worktree clean.
