# Enterprise Quick View Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove visible entity IDs from company, product, and project quick views while replacing technical copy with clear overview and profile actions.

**Architecture:** Keep entity IDs inside the existing record objects and navigation callbacks, but remove the index presentation layer from all three quick-view components. Add entity-specific `quickView.action` translations, update overview copy in all supported locales, and remove obsolete `quickView.index` keys only after every component stops using them.

**Tech Stack:** React 19, TypeScript, Ant Design 6, CSS Modules, react-i18next, Vitest, Testing Library, Python Playwright, Electron/Vite.

---

## File responsibility map

- `packages/desktop/src/renderer/pages/enterprise/companies/CompanyQuickView.tsx`: company preview semantics and detail navigation.
- `packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`: company preview spacing and close-button clearance.
- `packages/desktop/src/renderer/pages/enterprise/products/ProductQuickView.tsx`: product preview semantics, product navigation, and company link.
- `packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css`: product preview spacing without affecting product-card indexes.
- `packages/desktop/src/renderer/pages/enterprise/projects/ProjectQuickView.tsx`: protected project preview and detail navigation.
- `packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css`: project preview spacing without affecting section labels.
- `packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`: overview titles, hints, accessibility labels, and quick-view actions for ten locales.
- `packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`: generated typed translation-key union.
- `tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts`: durable copy and obsolete-key contract for every locale.
- `tests/unit/enterprise/CompanyListPage.dom.test.tsx`: company ID privacy, copy, and navigation behavior.
- `tests/unit/enterprise/ProductListPage.dom.test.tsx`: product ID privacy, copy, and navigation behavior.
- `tests/unit/enterprise/ProjectPage.dom.test.tsx`: project ID privacy, protected content, copy, and navigation behavior.

### Task 1: Add overview and profile copy for all supported locales

**Files:**

- Create: `tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/de-DE/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/en-US/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/ja-JP/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/ko-KR/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/pt-BR/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/ru-RU/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/tr-TR/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/uk-UA/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/zh-CN/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/zh-TW/enterprise.json`
- Regenerate: `packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`

- [ ] **Step 1: Write the failing locale contract test**

Create `tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts` with the complete expected copy:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const LOCALES = ['de-DE', 'en-US', 'ja-JP', 'ko-KR', 'pt-BR', 'ru-RU', 'tr-TR', 'uk-UA', 'zh-CN', 'zh-TW'];

type QuickViewCopy = {
  label: string;
  index?: string;
  title: string;
  hint: string;
  action?: string;
};

type EnterpriseLocale = {
  companies: { quickView: QuickViewCopy };
  products: { quickView: QuickViewCopy };
  projects: { quickView: QuickViewCopy };
};

const CHINESE_COPY = {
  companies: {
    label: '企业概览',
    title: '企业概览',
    hint: '查看完整企业档案，了解企业介绍、关联产品及可用联系方式。',
    action: '查看企业档案',
  },
  products: {
    label: '产品概览',
    title: '产品概览',
    hint: '查看完整产品档案，了解产品信息、所属企业及可用联系方式。',
    action: '查看产品档案',
  },
  projects: {
    label: '项目概览',
    title: '项目概览',
    hint: '查看完整项目档案，了解建设单位、采购需求及联系方式开放状态。',
    action: '查看项目档案',
  },
} as const;

const ENGLISH_COPY = {
  companies: {
    label: 'Company overview',
    title: 'Company overview',
    hint: 'Open the full company profile to learn more about the business, related products, and available contact details.',
    action: 'Open company profile',
  },
  products: {
    label: 'Product overview',
    title: 'Product overview',
    hint: 'Open the full product profile to review product information, its company, and available contact details.',
    action: 'Open product profile',
  },
  projects: {
    label: 'Project overview',
    title: 'Project overview',
    hint: 'Open the full project profile to review the construction unit, procurement needs, and contact-access status.',
    action: 'Open project profile',
  },
} as const;

describe('enterprise quick-view locale copy', () => {
  it.each(LOCALES)('provides clear overview and profile copy in %s', (locale) => {
    const messages = JSON.parse(
      readFileSync(resolve(`packages/desktop/src/renderer/services/i18n/locales/${locale}/enterprise.json`), 'utf8')
    ) as EnterpriseLocale;
    const expected = locale === 'zh-CN' ? CHINESE_COPY : ENGLISH_COPY;

    expect(messages.companies.quickView).toMatchObject(expected.companies);
    expect(messages.products.quickView).toMatchObject(expected.products);
    expect(messages.projects.quickView).toMatchObject(expected.projects);
  });
});
```

- [ ] **Step 2: Run the locale test and confirm RED**

Run:

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts
```

Expected: 10 failures because `action` is missing and the existing label, title, and hint values do not match the approved copy.

- [ ] **Step 3: Update the ten locale files with exact copy**

In `zh-CN/enterprise.json`, replace the three `quickView` objects while retaining their existing `index` keys temporarily:

```json
"quickView": {
  "label": "企业概览",
  "index": "企业 / {{index}}",
  "title": "企业概览",
  "hint": "查看完整企业档案，了解企业介绍、关联产品及可用联系方式。",
  "action": "查看企业档案"
}
```

```json
"quickView": {
  "label": "产品概览",
  "index": "产品 / {{index}}",
  "title": "产品概览",
  "hint": "查看完整产品档案，了解产品信息、所属企业及可用联系方式。",
  "action": "查看产品档案"
}
```

```json
"quickView": {
  "label": "项目概览",
  "index": "项目 / {{index}}",
  "title": "项目概览",
  "hint": "查看完整项目档案，了解建设单位、采购需求及联系方式开放状态。",
  "action": "查看项目档案"
}
```

In each of `de-DE`, `en-US`, `ja-JP`, `ko-KR`, `pt-BR`, `ru-RU`, `tr-TR`, `uk-UA`, and `zh-TW`, use these exact English values while retaining that file's existing `index` value temporarily:

```json
"companies": {
  "quickView": {
    "label": "Company overview",
    "title": "Company overview",
    "hint": "Open the full company profile to learn more about the business, related products, and available contact details.",
    "action": "Open company profile"
  }
},
"products": {
  "quickView": {
    "label": "Product overview",
    "title": "Product overview",
    "hint": "Open the full product profile to review product information, its company, and available contact details.",
    "action": "Open product profile"
  }
},
"projects": {
  "quickView": {
    "label": "Project overview",
    "title": "Project overview",
    "hint": "Open the full project profile to review the construction unit, procurement needs, and contact-access status.",
    "action": "Open project profile"
  }
}
```

The JSON block above documents only the nested values to apply; do not replace the surrounding entity objects.

- [ ] **Step 4: Regenerate typed i18n keys**

Run:

```powershell
npm run i18n:types
```

Expected: `i18n-keys.d.ts` gains `enterprise.companies.quickView.action`, `enterprise.products.quickView.action`, and `enterprise.projects.quickView.action`.

- [ ] **Step 5: Run locale and i18n checks and confirm GREEN**

Run:

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts
node scripts/check-i18n.js
```

Expected: 10/10 locale cases pass and i18n validation exits 0.

- [ ] **Step 6: Commit the copy contract**

```powershell
$localeFiles = Get-ChildItem packages/desktop/src/renderer/services/i18n/locales -Recurse -Filter enterprise.json
git add -- tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts $localeFiles.FullName
git commit -m "文案(企业工作台): 统一快速预览概览文案"
```

### Task 2: Remove the company ID presentation

**Files:**

- Modify: `tests/unit/enterprise/CompanyListPage.dom.test.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyQuickView.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`

- [ ] **Step 1: Extend the company interaction test to require business-only content**

In `opens an accessible quick view by pointer or keyboard and navigates by action or double-click`, add these assertions after obtaining `quickView`, and change the quick-view button query:

```tsx
expect(within(quickView).queryByText(/enterprise\.companies\.quickView\.index|0042/)).toBeNull();
expect(within(quickView).getByText('enterprise.companies.quickView.title')).toBeVisible();
expect(within(quickView).getByText('enterprise.companies.quickView.hint')).toBeVisible();

fireEvent.keyDown(row as HTMLElement, { key: 'Enter' });
await user.click(within(quickView).getByRole('button', { name: 'enterprise.companies.quickView.action' }));
expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/42');
```

Keep the separate row-action assertion for `enterprise.companies.actions.viewDetails`; it proves list copy is unchanged.

- [ ] **Step 2: Run the company test and confirm RED**

Run:

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism tests/unit/enterprise/CompanyListPage.dom.test.tsx
```

Expected: the quick view still contains the `index` translation and has no `quickView.action` button.

- [ ] **Step 3: Remove the company index node and use the quick-view action**

Delete this block from `CompanyQuickView.tsx`:

```tsx
<div className={styles.quickViewIndex}>
  {t('enterprise.companies.quickView.index', {
    index: company.companyId.slice(-4).padStart(4, '0'),
  })}
</div>
```

Change only the primary quick-view button label:

```tsx
<Button type='primary' block icon={<ArrowRight />} onClick={() => onViewDetails(company)}>
  {t('enterprise.companies.quickView.action')}
</Button>
```

- [ ] **Step 4: Remove company index styling and protect the close-button area**

Change the shared selector and heading rule in `company-catalog.module.css`:

```css
.eyebrow {
  color: var(--primary);
  font-family: var(--enterprise-font-ui);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.quickViewHeading {
  margin: 0 0 22px;
  padding-right: 32px;
}
```

- [ ] **Step 5: Run the company test and confirm GREEN**

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism tests/unit/enterprise/CompanyListPage.dom.test.tsx
```

Expected: all company-list tests pass; the quick-view route remains `/enterprise/companies/42` even though `42` is not displayed in the preview.

- [ ] **Step 6: Commit the company change**

```powershell
git add -- tests/unit/enterprise/CompanyListPage.dom.test.tsx packages/desktop/src/renderer/pages/enterprise/companies/CompanyQuickView.tsx packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css
git commit -m "优化(企业库): 移除快速预览编号"
```

### Task 3: Remove the product ID presentation

**Files:**

- Modify: `tests/unit/enterprise/ProductListPage.dom.test.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/ProductQuickView.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css`

- [ ] **Step 1: Extend the product preview test**

In `keeps the article noninteractive and exposes separate keyboard-operable preview and detail actions`, add:

```tsx
expect(within(quickView).queryByText(/enterprise\.products\.quickView\.index|0009/)).toBeNull();
expect(within(quickView).getByText('enterprise.products.quickView.title')).toBeVisible();
expect(within(quickView).getByText('enterprise.products.quickView.hint')).toBeVisible();
expect(within(quickView).getByRole('button', { name: 'enterprise.products.quickView.action' })).toBeVisible();
```

Replace the existing `viewCompany` click and rerender section with this order so each navigation is tested from a freshly mounted list:

```tsx
await user.click(within(quickView).getByRole('button', { name: 'enterprise.products.quickView.action' }));
expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/products/9');

unmount();
const companyRender = renderList(createClient(request));
const companyCard = (await screen.findByRole('heading', { name: 'Industrial pump' })).closest('article') as HTMLElement;
await user.click(
  within(companyCard).getByRole('button', {
    name: 'enterprise.products.actions.quickPreview',
  })
);
const companyQuickView = screen.getByRole('complementary', { name: 'enterprise.products.quickView.label' });
await user.click(within(companyQuickView).getByRole('link', { name: 'enterprise.products.actions.viewCompany' }));
expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/companies/42');

companyRender.unmount();
renderList(createClient(request));
const detailCard = (await screen.findByRole('heading', { name: 'Industrial pump' })).closest('article') as HTMLElement;
await user.click(within(detailCard).getByRole('button', { name: 'enterprise.products.actions.viewDetails' }));
expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/products/9');
```

The card-level button must remain `enterprise.products.actions.viewDetails`.

- [ ] **Step 2: Run the product test and confirm RED**

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism tests/unit/enterprise/ProductListPage.dom.test.tsx
```

Expected: the preview still renders `quickView.index` and its primary button still uses `actions.viewDetails`.

- [ ] **Step 3: Remove the product index and change only its primary action**

Delete the `quickViewIndex` block from `ProductQuickView.tsx`, leaving the focus effect dependency on `product.productId` unchanged. Replace the primary button with:

```tsx
<Button type='primary' block icon={<ArrowRight />} onClick={() => onViewDetails(product)}>
  {t('enterprise.products.quickView.action')}
</Button>
```

Keep the existing `viewCompany` link and its URL unchanged.

- [ ] **Step 4: Remove only product quick-view index styling**

Preserve `.cardIndex`; change the selector and heading rule in `product-catalog.module.css` to:

```css
.eyebrow,
.cardIndex {
  color: var(--primary);
  font-family: var(--enterprise-font-ui);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.quickViewHeading {
  margin: 0 0 22px;
  padding-right: 32px;
}
```

- [ ] **Step 5: Run the product test and confirm GREEN**

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism tests/unit/enterprise/ProductListPage.dom.test.tsx
```

Expected: all product-list tests pass, product cards retain their indexes, and the preview no longer displays `0009`.

- [ ] **Step 6: Commit the product change**

```powershell
git add -- tests/unit/enterprise/ProductListPage.dom.test.tsx packages/desktop/src/renderer/pages/enterprise/products/ProductQuickView.tsx packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css
git commit -m "优化(产品库): 移除快速预览编号"
```

### Task 4: Remove the project ID presentation

**Files:**

- Modify: `tests/unit/enterprise/ProjectPage.dom.test.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectQuickView.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css`

- [ ] **Step 1: Extend the protected-project quick-view test**

In `desensitizes list and quick-view names while preserving the numeric detail route`, add:

```tsx
expect(quickView).not.toHaveTextContent(/enterprise\.projects\.quickView\.index|0901/);
expect(within(quickView).getByText('enterprise.projects.quickView.title')).toBeVisible();
expect(within(quickView).getByText('enterprise.projects.quickView.hint')).toBeVisible();
expect(within(quickView).getByRole('button', { name: 'enterprise.projects.quickView.action' })).toBeVisible();
```

Change the click to the new action while retaining the route assertion:

```tsx
fireEvent.click(within(quickView).getByRole('button', { name: 'enterprise.projects.quickView.action' }));
expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/enterprise/projects/901');
```

- [ ] **Step 2: Run the project test and confirm RED**

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism tests/unit/enterprise/ProjectPage.dom.test.tsx
```

Expected: the preview still renders the `0901` index and does not expose `quickView.action`.

- [ ] **Step 3: Remove the project index and use the project-profile action**

Delete the `quickViewIndex` block from `ProjectQuickView.tsx`. Keep `project.hpInfoId` in the focus-effect dependency and navigation callback. Replace the primary button with:

```tsx
<Button type='primary' block icon={<ArrowRight />} onClick={() => onViewDetails(project)}>
  {t('enterprise.projects.quickView.action')}
</Button>
```

- [ ] **Step 4: Remove only project quick-view index styling**

Preserve `.eyebrow` and `.sectionHeading span`; change the selectors and heading rule in `project-workspace.module.css` to:

```css
.eyebrow,
.sectionHeading span {
  color: var(--primary);
  font-family: var(--enterprise-font-ui);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.quickViewHeading {
  margin: 0 0 22px;
  padding-right: 32px;
}
```

- [ ] **Step 5: Run the project test and confirm GREEN**

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism tests/unit/enterprise/ProjectPage.dom.test.tsx
```

Expected: all project tests pass; protected names remain hidden, the preview omits `0901`, and navigation still uses `/enterprise/projects/901`.

- [ ] **Step 6: Commit the project change**

```powershell
git add -- tests/unit/enterprise/ProjectPage.dom.test.tsx packages/desktop/src/renderer/pages/enterprise/projects/ProjectQuickView.tsx packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css
git commit -m "优化(在建项目): 移除快速预览编号"
```

### Task 5: Remove obsolete index translations and generated types

**Files:**

- Modify: `tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts`
- Modify: all ten `packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json` files
- Regenerate: `packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`

- [ ] **Step 1: Extend the locale contract to reject index keys**

Add these assertions inside the existing locale test:

```ts
expect(messages.companies.quickView).not.toHaveProperty('index');
expect(messages.products.quickView).not.toHaveProperty('index');
expect(messages.projects.quickView).not.toHaveProperty('index');
```

- [ ] **Step 2: Run the locale test and confirm RED**

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts
```

Expected: all ten cases fail because the three obsolete `index` keys are still present.

- [ ] **Step 3: Delete the obsolete keys from all locale files**

In every locale's `enterprise.json`, remove exactly these three properties and leave the surrounding `quickView` objects intact:

```json
"index": "企业 / {{index}}"
"index": "产品 / {{index}}"
"index": "项目 / {{index}}"
```

Non-Chinese files contain English equivalents such as `Company / {{index}}`, `Product / {{index}}`, and `Project / {{index}}`; remove those corresponding properties too.

- [ ] **Step 4: Regenerate types and verify no index type remains**

```powershell
npm run i18n:types
rg -n "enterprise\.(companies|products|projects)\.quickView\.index" packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts packages/desktop/src/renderer/pages/enterprise
```

Expected: type generation succeeds and `rg` returns no matches.

- [ ] **Step 5: Run locale and full i18n checks and confirm GREEN**

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts
node scripts/check-i18n.js
```

Expected: 10/10 locale cases pass and i18n validation exits 0.

- [ ] **Step 6: Commit the cleanup**

```powershell
$localeFiles = Get-ChildItem packages/desktop/src/renderer/services/i18n/locales -Recurse -Filter enterprise.json
git add -- tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts $localeFiles.FullName
git commit -m "清理(企业工作台): 删除废弃预览编号文案"
```

### Task 6: Final verification and Electron runtime acceptance

**Files:**

- Verify only; modify implementation files only if a failing check identifies a scoped defect.

- [ ] **Step 1: Run the complete focused regression set**

```powershell
npx vitest run --maxWorkers=1 --no-file-parallelism tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts tests/unit/enterprise/CompanyListPage.dom.test.tsx tests/unit/enterprise/ProductListPage.dom.test.tsx tests/unit/enterprise/ProjectPage.dom.test.tsx
```

Expected: all four files pass with zero failed tests.

- [ ] **Step 2: Run i18n, TypeScript, formatting, and lint checks**

```powershell
node scripts/check-i18n.js
node_modules\.bin\tsc.exe --noEmit
node_modules\.bin\tsc.exe --noEmit --project tsconfig.enterprise-tests.json
node_modules\.bin\oxfmt.exe --check packages/desktop/src/renderer/pages/enterprise/companies packages/desktop/src/renderer/pages/enterprise/products packages/desktop/src/renderer/pages/enterprise/projects packages/desktop/src/renderer/services/i18n/locales tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts tests/unit/enterprise/CompanyListPage.dom.test.tsx tests/unit/enterprise/ProductListPage.dom.test.tsx tests/unit/enterprise/ProjectPage.dom.test.tsx
node_modules\.bin\oxlint.exe packages/desktop/src/renderer/pages/enterprise/companies/CompanyQuickView.tsx packages/desktop/src/renderer/pages/enterprise/products/ProductQuickView.tsx packages/desktop/src/renderer/pages/enterprise/projects/ProjectQuickView.tsx tests/unit/enterprise/EnterpriseQuickViewLocales.test.ts tests/unit/enterprise/CompanyListPage.dom.test.tsx tests/unit/enterprise/ProductListPage.dom.test.tsx tests/unit/enterprise/ProjectPage.dom.test.tsx
git diff --check
```

Expected: every command exits 0; oxlint reports zero warnings and errors.

- [ ] **Step 3: Build the production Electron bundles**

```powershell
npm run package
```

Expected: main, preload, and renderer bundles build successfully. Existing dependency-level `use client`, circular-chunk, and large-chunk warnings are non-blocking only if no new error appears.

- [ ] **Step 4: Verify the three quick views in the running Electron renderer**

With Electron development mode running on CDP port `9230`, run:

```powershell
@'
import json
import re
from playwright.sync_api import sync_playwright

results = []
console_errors = []

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp('http://127.0.0.1:9230')
    pages = [page for context in browser.contexts for page in context.pages]
    page = next(item for item in pages if 'localhost:5173' in item.url)
    page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
    page.set_viewport_size({'width': 1440, 'height': 900})

    page.goto('http://localhost:5173/#/enterprise/companies', wait_until='networkidle')
    company_row = page.locator('.ll-ant-table-tbody tr.ll-ant-table-row').first
    company_row.click()
    company_preview = page.locator('aside[role="complementary"]')
    company_preview.wait_for(state='visible')
    company_text = company_preview.inner_text()
    assert not re.search(r'企业\s*/\s*-?\d+', company_text)
    assert '企业概览' in company_text and '查看企业档案' in company_text
    page.set_viewport_size({'width': 760, 'height': 900})
    page.wait_for_timeout(200)
    assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
    results.append({'entity': 'company', 'indexHidden': True, 'narrowOverflow': False})

    page.set_viewport_size({'width': 1440, 'height': 900})
    page.goto('http://localhost:5173/#/enterprise/products', wait_until='networkidle')
    page.get_by_role('button', name='快速预览').first.click()
    product_preview = page.locator('aside[role="complementary"]')
    product_preview.wait_for(state='visible')
    product_text = product_preview.inner_text()
    assert not re.search(r'产品\s*/\s*-?\d+', product_text)
    assert '产品概览' in product_text and '查看产品档案' in product_text
    page.set_viewport_size({'width': 760, 'height': 900})
    page.wait_for_timeout(200)
    assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
    results.append({'entity': 'product', 'indexHidden': True, 'narrowOverflow': False})

    page.set_viewport_size({'width': 1440, 'height': 900})
    page.goto('http://localhost:5173/#/enterprise/projects', wait_until='networkidle')
    project_row = page.locator('.ll-ant-table-tbody tr.ll-ant-table-row').first
    project_row.click()
    project_preview = page.locator('aside[role="complementary"]')
    project_preview.wait_for(state='visible')
    project_text = project_preview.inner_text()
    assert not re.search(r'项目\s*/\s*-?\d+', project_text)
    assert '项目概览' in project_text and '查看项目档案' in project_text
    page.set_viewport_size({'width': 760, 'height': 900})
    page.wait_for_timeout(200)
    assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
    results.append({'entity': 'project', 'indexHidden': True, 'narrowOverflow': False})

    assert not console_errors
    print(json.dumps(results, ensure_ascii=False, indent=2))
    browser.close()
'@ | python -
```

Expected: the script prints three successful result objects, no ID appears in any preview, the project page has no horizontal overflow at 760px, and no console error is collected.

- [ ] **Step 5: Confirm repository state and request code review**

```powershell
git status --short
git log --oneline -6
```

Expected: no uncommitted files remain. Request a final review over the implementation commit range, fix any Critical or Important feedback, and rerun the affected verification before reporting completion.
