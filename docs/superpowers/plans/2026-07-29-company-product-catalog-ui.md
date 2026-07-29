# Company and Product Catalog UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Electron enterprise and product catalogs to the approved bright, compact design with shared list/detail primitives, four-column products, sticky contact sidebars, and list-state restoration.

**Architecture:** Keep Cloud API requests and membership/contact rules unchanged. Add renderer-only catalog layout primitives under `pages/enterprise/layout/catalog`, let company and product pages compose those primitives, preserve optional H5 membership fields already present in responses, and carry list-return state through React Router location state. Existing data hooks remain the source of request concurrency, retry, and safe error behavior.

**Tech Stack:** React 19, TypeScript, React Router, Ant Design React, CSS Modules, `@icon-park/react`, react-i18next, Vitest 4, Testing Library, Oxlint, Oxfmt.

---

## Repository constraints

- Work in `E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC`.
- Do not modify Cloud API or any external database.
- Do not expose entity IDs in user-facing text.
- Do not add a collection/favorite mutation; the desktop contract currently has no write operation for it.
- Do not render empty product-parameter sections because the current product detail contract does not provide those fields.
- Use Ant Design components and `@icon-park/react`; do not add raw interactive HTML.
- Use existing `enterprise-theme.css` tokens and keep `15px` as the card radius.
- Do not commit, push, or publish unless the user explicitly authorizes it. The checkpoints below are verification checkpoints, not automatic commit steps.

## File map

### New files

- `packages/desktop/src/renderer/pages/enterprise/layout/catalog/CatalogLayout.tsx`
  - Shared list page shell, filter surface, pagination, and quick-view frame.
- `packages/desktop/src/renderer/pages/enterprise/layout/catalog/DetailLayout.tsx`
  - Shared hero, section card, two-column detail body, and sticky sidebar.
- `packages/desktop/src/renderer/pages/enterprise/layout/catalog/catalog-layout.module.css`
  - Shared bright/compact list and detail layout.
- `packages/desktop/src/renderer/pages/enterprise/layout/catalog/catalogReturnState.ts`
  - Safe route-state creation, parsing, and enterprise-main scroll restoration.
- `tests/unit/enterprise/CatalogLayout.dom.test.tsx`
  - Shared component semantics and keyboard behavior.
- `tests/unit/enterprise/catalogReturnState.test.ts`
  - Route-state validation and scroll restoration.

### Existing files to modify

- `packages/desktop/src/renderer/styles/enterprise-theme.css`
- `packages/desktop/src/common/enterprise/contracts.ts`
- `packages/desktop/src/common/enterprise/rawSchemas.ts`
- `packages/desktop/src/common/enterprise/normalizers.ts`
- `packages/desktop/src/renderer/pages/enterprise/companies/CompanyListPage.tsx`
- `packages/desktop/src/renderer/pages/enterprise/companies/CompanyQuickView.tsx`
- `packages/desktop/src/renderer/pages/enterprise/companies/CompanyDetailPage.tsx`
- `packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`
- `packages/desktop/src/renderer/pages/enterprise/companies/companyData.ts`
- `packages/desktop/src/renderer/pages/enterprise/products/ProductListPage.tsx`
- `packages/desktop/src/renderer/pages/enterprise/products/ProductQuickView.tsx`
- `packages/desktop/src/renderer/pages/enterprise/products/ProductDetailPage.tsx`
- `packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css`
- `packages/desktop/src/renderer/pages/enterprise/products/productData.ts`
- `tests/unit/enterprise/CompanyListPage.dom.test.tsx`
- `tests/unit/enterprise/ProductListPage.dom.test.tsx`
- `tests/unit/enterprise/companyData.test.ts`
- `tests/unit/enterprise/productData.test.ts`
- `tests/unit/enterprise/enterpriseSchemas.test.ts`
- `tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts`
- `tests/unit/enterprise/productCatalogResponsiveCss.test.ts`

## Task 1: Shared bright catalog layout primitives

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/layout/catalog/CatalogLayout.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/layout/catalog/DetailLayout.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/layout/catalog/catalog-layout.module.css`
- Modify: `packages/desktop/src/renderer/styles/enterprise-theme.css`
- Create: `tests/unit/enterprise/CatalogLayout.dom.test.tsx`
- Modify: `tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts`

- [ ] **Step 1: Write failing shared-layout tests**

Add tests that require:

```tsx
render(
  <EnterpriseCatalogShell
    titleId='catalog-title'
    eyebrow='产业资源'
    title='企业库'
    description='查询企业'
    filters={<div data-testid='filters' />}
  >
    <div data-testid='results' />
  </EnterpriseCatalogShell>
);

expect(screen.getByRole('heading', { name: '企业库' })).toHaveAttribute('id', 'catalog-title');
expect(screen.getByTestId('filters')).toBeVisible();
expect(screen.getByTestId('results')).toBeVisible();
```

Test the quick-view close action:

```tsx
const onClose = vi.fn();
render(
  <CatalogQuickViewPanel ariaLabel='企业快速预览' title='沈阳航燃科技' onClose={onClose}>
    <span>高端装备</span>
  </CatalogQuickViewPanel>
);

await userEvent.click(screen.getByRole('button', { name: 'enterprise.catalog.closeQuickView' }));
expect(onClose).toHaveBeenCalledOnce();
```

Test detail composition:

```tsx
render(
  <DetailColumns
    main={<DetailSectionCard title='企业概况'>内容</DetailSectionCard>}
    sidebar={<StickyDetailSidebar>联系方式</StickyDetailSidebar>}
  />
);

expect(screen.getByText('企业概况')).toBeVisible();
expect(screen.getByText('联系方式')).toBeVisible();
```

- [ ] **Step 2: Run the new test and verify the imports fail**

Run:

```powershell
bunx vitest run tests/unit/enterprise/CatalogLayout.dom.test.tsx
```

Expected: FAIL because `CatalogLayout.tsx` and `DetailLayout.tsx` do not exist.

- [ ] **Step 3: Add shared theme tokens**

Extend `enterprise-theme.css` inside the existing enterprise theme scope:

```css
--enterprise-catalog-gap: 12px;
--enterprise-catalog-row-height: 54px;
--enterprise-catalog-image-ratio: 4 / 3;
--enterprise-detail-sidebar-width: 300px;
--enterprise-detail-section-gap: 12px;
```

Do not redefine these existing values:

```css
--enterprise-font-ui: 'Microsoft YaHei', '微软雅黑', 'Segoe UI', Arial, sans-serif;
--enterprise-page-bg: #f4f8ff;
--enterprise-surface: #ffffff;
--enterprise-radius-card: 15px;
```

- [ ] **Step 4: Implement the list primitives**

Create `CatalogLayout.tsx` with these public APIs:

```tsx
import { CloseSmall } from '@icon-park/react';
import { Button, Form, Pagination, type FormProps, type PaginationProps } from 'antd';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './catalog-layout.module.css';

export type EnterpriseCatalogShellProps = {
  titleId: string;
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  filters: ReactNode;
  children: ReactNode;
  className?: string;
};

export const EnterpriseCatalogShell = ({
  titleId,
  eyebrow,
  title,
  description,
  filters,
  children,
  className,
}: EnterpriseCatalogShellProps) => (
  <section className={[styles.page, className].filter(Boolean).join(' ')} aria-labelledby={titleId}>
    <header className={styles.pageHeader}>
      <div>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1 id={titleId}>{title}</h1>
        <p>{description}</p>
      </div>
      <div className={styles.headerRule} aria-hidden='true' />
    </header>
    {filters}
    <div className={styles.content}>{children}</div>
  </section>
);

export type CatalogFilterCardProps = Pick<FormProps, 'onFinish'> & {
  children: ReactNode;
  actions: ReactNode;
  className?: string;
};

export const CatalogFilterCard = ({ children, actions, className, onFinish }: CatalogFilterCardProps) => (
  <Form className={[styles.filterCard, className].filter(Boolean).join(' ')} layout='vertical' onFinish={onFinish}>
    {children}
    <div className={styles.filterActions}>{actions}</div>
  </Form>
);

export type CatalogPaginationProps = Pick<
  PaginationProps,
  'current' | 'pageSize' | 'total' | 'onChange'
> & {
  resultText: ReactNode;
};

export const CatalogPagination = ({
  current,
  pageSize,
  total,
  onChange,
  resultText,
}: CatalogPaginationProps) => (
  <div className={styles.paginationBar}>
    <span>{resultText}</span>
    <Pagination
      current={current}
      pageSize={pageSize}
      total={total}
      size='small'
      showQuickJumper
      showSizeChanger
      pageSizeOptions={[10, 20, 50]}
      onChange={onChange}
    />
  </div>
);

export type CatalogQuickViewPanelProps = {
  ariaLabel: string;
  title: ReactNode;
  eyebrow: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
};

export const CatalogQuickViewPanel = ({
  ariaLabel,
  title,
  eyebrow,
  onClose,
  children,
  footer,
}: CatalogQuickViewPanelProps) => {
  const { t } = useTranslation();
  return (
    <aside className={styles.quickView} role='complementary' tabIndex={-1} aria-label={ariaLabel}>
      <Button
        className={styles.quickViewClose}
        type='text'
        size='small'
        icon={<CloseSmall />}
        aria-label={t('enterprise.catalog.closeQuickView')}
        onClick={onClose}
      />
      <div className={styles.quickViewHeading}>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {children}
      <div className={styles.quickViewFooter}>{footer}</div>
    </aside>
  );
};
```

- [ ] **Step 5: Implement the detail primitives**

Create `DetailLayout.tsx`:

```tsx
import { Card, type CardProps } from 'antd';
import type { ReactNode } from 'react';

import styles from './catalog-layout.module.css';

export type DetailHeroCardProps = {
  media: ReactNode;
  eyebrow: ReactNode;
  titleId: string;
  title: ReactNode;
  tags?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

export const DetailHeroCard = ({
  media,
  eyebrow,
  titleId,
  title,
  tags,
  actions,
  children,
}: DetailHeroCardProps) => (
  <section className={styles.detailHero} aria-labelledby={titleId}>
    <div className={styles.detailHeroMedia}>{media}</div>
    <div className={styles.detailHeroIdentity}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h2 id={titleId}>{title}</h2>
      {tags ? <div className={styles.detailHeroTags}>{tags}</div> : null}
      {children}
    </div>
    {actions ? <div className={styles.detailHeroActions}>{actions}</div> : null}
  </section>
);

export const DetailSectionCard = ({ className, ...props }: CardProps) => (
  <Card className={[styles.detailSection, className].filter(Boolean).join(' ')} variant='outlined' {...props} />
);

export const StickyDetailSidebar = ({ children }: { children: ReactNode }) => (
  <aside className={styles.detailSidebar}>{children}</aside>
);

export const DetailColumns = ({ main, sidebar }: { main: ReactNode; sidebar: ReactNode }) => (
  <div className={styles.detailColumns}>
    <div className={styles.detailMain}>{main}</div>
    {sidebar}
  </div>
);
```

- [ ] **Step 6: Add the shared bright/compact CSS**

Create `catalog-layout.module.css` with the complete shared layout contract:

```css
.page {
  min-width: 0;
  color: var(--text-primary);
}

.pageHeader {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  margin-bottom: 18px;
}

.pageHeader h1,
.detailHeroIdentity h2,
.quickViewHeading h2 {
  margin: 4px 0 0;
  font-family: var(--enterprise-font-ui);
  font-weight: 700;
  letter-spacing: -0.025em;
}

.pageHeader h1 {
  font-size: clamp(25px, 3vw, 36px);
}

.pageHeader p {
  max-width: 690px;
  margin: 7px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.eyebrow {
  color: var(--primary);
  font-family: var(--enterprise-font-ui);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.headerRule {
  width: min(26%, 220px);
  height: 1px;
  margin-bottom: 9px;
  background: linear-gradient(90deg, var(--primary), transparent);
}

.filterCard {
  display: grid;
  gap: 10px;
  align-items: end;
  padding: 14px;
  background: var(--enterprise-surface);
  border: 1px solid var(--enterprise-border);
  border-radius: var(--enterprise-radius-card);
  box-shadow: var(--enterprise-shadow-card);
}

.filterCard :global(.ll-ant-form-item) {
  margin: 0;
}

.filterActions {
  display: flex;
  grid-column: 1 / -1;
  justify-content: flex-end;
  gap: 8px;
}

.content {
  min-width: 0;
  margin-top: 12px;
  overflow: hidden;
  background: var(--enterprise-surface);
  border: 1px solid var(--enterprise-border);
  border-radius: var(--enterprise-radius-card);
  box-shadow: var(--enterprise-shadow-card);
}

.paginationBar {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-top: 1px solid var(--border-light);
}

.quickView {
  position: relative;
  min-width: 0;
  padding: 20px 18px;
  border-left: 1px solid var(--enterprise-border);
  background: var(--enterprise-surface-soft);
}

.quickViewClose {
  position: absolute;
  top: 12px;
  right: 10px;
}

.quickViewHeading {
  padding-right: 32px;
}

.quickViewFooter {
  margin-top: 18px;
}

.detailHero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  padding: 18px;
  background: var(--enterprise-surface);
  border: 1px solid var(--enterprise-border);
  border-radius: var(--enterprise-radius-card);
  box-shadow: var(--enterprise-shadow-card);
}

.detailHeroTags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.detailColumns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, var(--enterprise-detail-sidebar-width));
  gap: var(--enterprise-detail-section-gap);
  align-items: start;
  margin-top: var(--enterprise-detail-section-gap);
}

.detailMain,
.detailSidebar {
  display: grid;
  min-width: 0;
  gap: var(--enterprise-detail-section-gap);
}

.detailSidebar {
  position: sticky;
  top: 12px;
}

.detailSection {
  border-radius: var(--enterprise-radius-card);
  box-shadow: var(--enterprise-shadow-card);
}

@media (max-width: 980px) {
  .detailColumns {
    grid-template-columns: minmax(0, 1fr);
  }

  .detailSidebar {
    position: static;
  }
}

@media (max-width: 720px) {
  .pageHeader,
  .detailHero {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
  }

  .headerRule {
    display: none;
  }
}
```

- [ ] **Step 7: Run the shared tests**

Run:

```powershell
bunx vitest run tests/unit/enterprise/CatalogLayout.dom.test.tsx tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts
```

Expected: PASS with no failed tests.

## Task 2: Safe list-return state and scroll restoration

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/layout/catalog/catalogReturnState.ts`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/companyData.ts`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/productData.ts`
- Create: `tests/unit/enterprise/catalogReturnState.test.ts`
- Modify: `tests/unit/enterprise/companyData.test.ts`
- Modify: `tests/unit/enterprise/productData.test.ts`

- [ ] **Step 1: Write failing route-state tests**

Test accepted state:

```ts
const state = createCatalogReturnState({
  kind: 'companies',
  path: '/enterprise/companies',
  query: { keyword: 'steel', pageNum: 2, pageSize: 20 },
  scrollTop: 640,
  selectedId: '-8',
});

expect(readCatalogReturnState(state, 'companies')).toEqual(state.catalogReturn);
```

Test malformed state:

```ts
expect(readCatalogReturnState({ catalogReturn: { path: 'https://evil.example' } }, 'companies')).toBeNull();
expect(readCatalogReturnState({ catalogReturn: { scrollTop: -1 } }, 'companies')).toBeNull();
```

Test restoration:

```ts
const main = document.createElement('main');
main.className = 'enterprise-shell__main';
document.body.append(main);
restoreEnterpriseCatalogScroll(320);
flushAnimationFrame();
expect(main.scrollTop).toBe(320);
```

- [ ] **Step 2: Run the route-state test and verify failure**

Run:

```powershell
bunx vitest run tests/unit/enterprise/catalogReturnState.test.ts
```

Expected: FAIL because `catalogReturnState.ts` does not exist.

- [ ] **Step 3: Implement route-state validation**

Create `catalogReturnState.ts`:

```ts
import type { CompanyListQuery, ProductListQuery } from '@/common/enterprise/contracts';

export type CatalogKind = 'companies' | 'products';
export type CatalogQuery = CompanyListQuery | ProductListQuery;

export type CatalogReturn = {
  kind: CatalogKind;
  path: '/enterprise/companies' | '/enterprise/products';
  query: CatalogQuery;
  scrollTop: number;
  selectedId?: string;
};

export type CatalogRouteState = {
  catalogReturn: CatalogReturn;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const createCatalogReturnState = (catalogReturn: CatalogReturn): CatalogRouteState => ({
  catalogReturn,
});

export const readCatalogReturnState = (value: unknown, expectedKind: CatalogKind): CatalogReturn | null => {
  if (!isRecord(value) || !isRecord(value.catalogReturn)) return null;
  const state = value.catalogReturn;
  const expectedPath = expectedKind === 'companies' ? '/enterprise/companies' : '/enterprise/products';
  if (state.kind !== expectedKind || state.path !== expectedPath || !isRecord(state.query)) return null;
  if (!Number.isFinite(state.scrollTop) || Number(state.scrollTop) < 0) return null;
  if (!Number.isInteger(state.query.pageNum) || Number(state.query.pageNum) < 1) return null;
  if (!Number.isInteger(state.query.pageSize) || Number(state.query.pageSize) < 1) return null;
  if (state.selectedId !== undefined && typeof state.selectedId !== 'string') return null;
  return state as CatalogReturn;
};

export const getEnterpriseCatalogScrollTop = (): number => {
  const element = document.querySelector<HTMLElement>('.enterprise-shell__main');
  return Math.max(0, element?.scrollTop ?? 0);
};

export const restoreEnterpriseCatalogScroll = (scrollTop: number): void => {
  window.requestAnimationFrame(() => {
    const element = document.querySelector<HTMLElement>('.enterprise-shell__main');
    if (element) element.scrollTop = Math.max(0, scrollTop);
  });
};
```

- [ ] **Step 4: Let data hooks accept a complete initial query**

Change both hook signatures:

```ts
export const useCompanyCatalog = (
  client: Pick<EnterpriseClient, 'request'>,
  initialQuery: CompanyListQuery = { pageNum: 1, pageSize: 20 }
): CompanyCatalogState => {
  const [filters, setFilters] = useState<CompanyFilters>(() => ({
    keyword: initialQuery.keyword,
    industry: initialQuery.industry,
    province: initialQuery.province,
    city: initialQuery.city,
    district: initialQuery.district,
    companyLevel: initialQuery.companyLevel,
    vip: initialQuery.vip,
  }));
  const [pagination, setPagination] = useState<CompanyPagination>(() => ({
    pageNum: initialQuery.pageNum,
    pageSize: initialQuery.pageSize,
  }));
```

```ts
export const useProductCatalog = (
  client: Pick<EnterpriseClient, 'request'>,
  initialQuery: ProductListQuery = { pageNum: 1, pageSize: 20 }
): ProductCatalogState => {
  const [filters, setFilters] = useState<ProductFilters>(() => ({
    keyword: initialQuery.keyword,
    industry: initialQuery.industry,
    province: initialQuery.province,
    city: initialQuery.city,
    district: initialQuery.district,
  }));
  const [pagination, setPagination] = useState<ProductPagination>(() => ({
    pageNum: initialQuery.pageNum,
    pageSize: initialQuery.pageSize,
  }));
```

The initializer is read only on first mount; later query changes continue through `applyFilters` and `changePage`.

- [ ] **Step 5: Add initial-query tests**

For both hooks, render with page 2 initial state and assert the first request contains:

```ts
expect(request).toHaveBeenCalledWith({
  operation: 'company.list',
  payload: { keyword: 'steel', pageNum: 2, pageSize: 50 },
});
```

```ts
expect(request).toHaveBeenCalledWith({
  operation: 'product.list',
  payload: { keyword: 'pump', pageNum: 3, pageSize: 20 },
});
```

- [ ] **Step 6: Run navigation and data tests**

Run:

```powershell
bunx vitest run tests/unit/enterprise/catalogReturnState.test.ts tests/unit/enterprise/companyData.test.ts tests/unit/enterprise/productData.test.ts
```

Expected: PASS.

## Task 3: Compact enterprise list and shared quick view

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyListPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyQuickView.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`
- Modify: `tests/unit/enterprise/CompanyListPage.dom.test.tsx`

- [ ] **Step 1: Add failing list interaction tests**

Add a route-state probe that renders `JSON.stringify(location.state)` and verify detail navigation carries:

```ts
expect(JSON.parse(screen.getByLabelText('location-state').textContent ?? '{}')).toMatchObject({
  catalogReturn: {
    kind: 'companies',
    path: '/enterprise/companies',
    query: { pageNum: 1, pageSize: 20 },
    selectedId: '42',
  },
});
```

Add assertions for:

```ts
expect(row).toHaveAttribute('aria-selected', 'true');
expect(screen.queryByText(/companyId|企业编号|42\s*$/)).toBeNull();
expect(container.querySelector('[data-catalog-table-anchor]')).toBeInTheDocument();
```

- [ ] **Step 2: Run the company page test and verify the new assertions fail**

Run:

```powershell
bunx vitest run tests/unit/enterprise/CompanyListPage.dom.test.tsx
```

Expected: FAIL on missing route state, selected-row semantics, or shared layout.

- [ ] **Step 3: Compose the shared list shell**

In `CompanyListPage.tsx`:

- Read `location.state` with `readCatalogReturnState(location.state, 'companies')`.
- Initialize `draftFilters` and `useCompanyCatalog` from the saved query.
- Replace the duplicate page header, form shell, pagination, and content surface with:

```tsx
<EnterpriseCatalogShell
  titleId='company-catalog-title'
  eyebrow={t('enterprise.companies.eyebrow')}
  title={t('enterprise.routes.companies.title')}
  description={t('enterprise.companies.description')}
  filters={
    <CatalogFilterCard
      className={styles.filterGrid}
      onFinish={submitFilters}
      actions={
        <>
          <Button htmlType='submit' type='primary' icon={<Search />}>
            {t('enterprise.companies.actions.search')}
          </Button>
          <Button icon={<Refresh />} onClick={resetFilters}>
            {t('enterprise.companies.actions.reset')}
          </Button>
        </>
      }
    >
      {companyFilterFields}
    </CatalogFilterCard>
  }
>
  {renderContent()}
</EnterpriseCatalogShell>
```

Keep the six current filter fields and current H5 membership selector.

- [ ] **Step 4: Carry return state into details**

Use:

```ts
const location = useLocation();
const restored = readCatalogReturnState(location.state, 'companies');
const initialQuery = restored?.query as CompanyListQuery | undefined;
const catalog = useCompanyCatalog(client, initialQuery);

const viewDetails = (company: EnterpriseCompanySummary) => {
  navigate(companyDetailPath(company.companyId), {
    state: createCatalogReturnState({
      kind: 'companies',
      path: '/enterprise/companies',
      query: catalog.query,
      scrollTop: getEnterpriseCatalogScrollTop(),
      selectedId: company.companyId,
    }),
  });
};
```

After retained data becomes available:

```ts
useEffect(() => {
  if (restored && catalog.data) restoreEnterpriseCatalogScroll(restored.scrollTop);
}, [catalog.data, restored]);
```

- [ ] **Step 5: Add compact selected-row behavior**

Set:

```tsx
rowClassName={(company) => (selectedCompany?.companyId === company.companyId ? styles.selectedRow : '')}
```

Return:

```tsx
onRow={(company) => ({
  tabIndex: 0,
  'aria-selected': selectedCompany?.companyId === company.companyId,
  onClick: () => setSelectedCompany(company),
  onDoubleClick: () => viewDetails(company),
  onKeyDown: handleCompanyRowKeyDown(company),
})}
```

Space selects the row; Enter navigates to the full detail:

```ts
const handleCompanyRowKeyDown =
  (company: EnterpriseCompanySummary) => (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === ' ') {
      event.preventDefault();
      setSelectedCompany(company);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      viewDetails(company);
    }
  };
```

- [ ] **Step 6: Refactor `CompanyQuickView` onto `CatalogQuickViewPanel`**

Keep the current facts and membership badge. Supply this footer:

```tsx
<Button type='primary' block icon={<ArrowRight />} onClick={() => onViewDetails(company)}>
  {t('enterprise.companies.quickView.action')}
</Button>
```

Do not render `company.companyId` or any label derived from it.

- [ ] **Step 7: Apply compact company CSS**

Keep only company-specific rules in `company-catalog.module.css`:

```css
.filterGrid {
  grid-template-columns: minmax(160px, 1.35fr) repeat(5, minmax(118px, 1fr));
}

.tablePanel {
  min-width: 0;
  overflow: hidden;
}

.tablePanel :global(.ll-ant-table-thead > tr > .ll-ant-table-cell) {
  position: sticky;
  top: 0;
  z-index: 2;
  color: var(--text-secondary);
  background: var(--enterprise-surface-soft);
}

.tablePanel :global(.ll-ant-table-tbody > tr > .ll-ant-table-cell) {
  height: var(--enterprise-catalog-row-height);
  padding-top: 8px;
  padding-bottom: 8px;
}

.selectedRow > :global(.ll-ant-table-cell) {
  background: color-mix(in srgb, var(--primary) 8%, var(--enterprise-surface));
}

.catalogGridWithPreview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(252px, 27%);
}
```

At widths below `980px`, stack the preview above the table and give it `scroll-margin-top`.

- [ ] **Step 8: Run the company tests**

Run:

```powershell
bunx vitest run tests/unit/enterprise/CompanyListPage.dom.test.tsx tests/unit/enterprise/companyData.test.ts
```

Expected: PASS.

## Task 4: Four-column product cards and optional membership preservation

**Files:**

- Modify: `packages/desktop/src/common/enterprise/contracts.ts`
- Modify: `packages/desktop/src/common/enterprise/rawSchemas.ts`
- Modify: `packages/desktop/src/common/enterprise/normalizers.ts`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/productData.ts`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/ProductListPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/ProductQuickView.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css`
- Modify: `tests/unit/enterprise/enterpriseSchemas.test.ts`
- Modify: `tests/unit/enterprise/productData.test.ts`
- Modify: `tests/unit/enterprise/ProductListPage.dom.test.tsx`
- Modify: `tests/unit/enterprise/productCatalogResponsiveCss.test.ts`

- [ ] **Step 1: Add failing product membership normalization tests**

Normalize:

```ts
{
  ID: -9,
  PRODUCT_NAME: '航空燃料组件',
  COMPANY_ID: -8,
  COMPANY_NAME: '沈阳航燃科技',
  COM_LEVEL: 2,
  PAY_VIP: true,
}
```

Expected:

```ts
expect(product).toMatchObject({
  productId: '-9',
  companyId: '-8',
  companyLevel: 2,
  vip: true,
});
```

Add a renderer parser test that keeps `companyLevel` and `vip`.

- [ ] **Step 2: Run normalization tests and verify failure**

Run:

```powershell
bunx vitest run tests/unit/enterprise/enterpriseSchemas.test.ts tests/unit/enterprise/productData.test.ts
```

Expected: FAIL because product membership fields are currently discarded.

- [ ] **Step 3: Preserve optional membership fields**

Extend `EnterpriseProductSummary`:

```ts
companyLevel?: number;
vip?: boolean;
```

Extend `enterpriseProductRawSchema`:

```ts
numbers: ['comLevel', 'COM_LEVEL', 'companyLevel', 'COMPANY_LEVEL'] as const,
booleans: [
  'vip',
  'VIP',
  'payVip',
  'PAY_VIP',
  'isCollect',
  'IS_COLLECT',
  'collected',
  'COLLECTED',
] as const,
```

Extend `normalizeProduct`:

```ts
setNumber(result, 'companyLevel', raw.companyLevel, raw.COMPANY_LEVEL, raw.comLevel, raw.COM_LEVEL);
setBoolean(result, 'vip', raw.vip, raw.VIP, raw.payVip, raw.PAY_VIP);
```

Extend `PRODUCT_FIELD_RULES`:

```ts
['companyLevel', 'number'],
['vip', 'boolean'],
```

These fields remain optional. The UI renders no empty badge when the service omits them.

- [ ] **Step 4: Add failing four-column and ID-removal tests**

Assert:

```ts
expect(screen.queryByText('009')).toBeNull();
expect(container.querySelector('[class*="cardIndex"]')).toBeNull();
expect(screen.getByRole('img', { name: 'enterprise.companies.memberLevel.fiveStar' })).toBeVisible();
```

Update the CSS contract to require:

```ts
expect(productGridRule).toMatch(/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
expect(productImageRule).toMatch(/aspect-ratio:\s*var\(--enterprise-catalog-image-ratio\)/);
```

- [ ] **Step 5: Compose the shared product list shell**

Use `EnterpriseCatalogShell`, `CatalogFilterCard`, `CatalogPagination`, and `CatalogQuickViewPanel`.

Carry this route state when entering product detail:

```ts
createCatalogReturnState({
  kind: 'products',
  path: '/enterprise/products',
  query: catalog.query,
  scrollTop: getEnterpriseCatalogScrollTop(),
  selectedId: product.productId,
});
```

Keep separate keyboard-operable “快速预览” and “查看详情” buttons. Do not turn the complete card into a nested interactive control.

- [ ] **Step 6: Remove the product ID fragment and add membership**

Delete `cardIndex` from `ProductImage`.

Render:

```tsx
{product.companyLevel !== undefined ? (
  <CompanyMembershipBadge level={product.companyLevel} compact />
) : null}
```

Keep name, company, classification, region, two-line summary, quick preview, and detail action.

- [ ] **Step 7: Apply the four-column CSS**

Use:

```css
.filterGrid {
  grid-template-columns: minmax(180px, 1.4fr) repeat(4, minmax(118px, 1fr));
}

.productGrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--enterprise-catalog-gap);
}

.cardImage {
  position: relative;
  display: grid;
  width: 100%;
  aspect-ratio: var(--enterprise-catalog-image-ratio);
  place-items: center;
  overflow: hidden;
  background: var(--enterprise-surface-soft);
}

.cardHeading h2 {
  min-height: 40px;
  font-size: 16px;
  line-height: 1.3;
}

.cardBody > p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@media (max-width: 1280px) {
  .productGrid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .productGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

Do not add a one-column breakpoint unless the enterprise shell itself enters a mobile layout.

- [ ] **Step 8: Run product tests**

Run:

```powershell
bunx vitest run tests/unit/enterprise/enterpriseSchemas.test.ts tests/unit/enterprise/productData.test.ts tests/unit/enterprise/ProductListPage.dom.test.tsx tests/unit/enterprise/productCatalogResponsiveCss.test.ts
```

Expected: PASS.

## Task 5: Enterprise overview detail with sticky contact sidebar

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyDetailPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`
- Modify: `tests/unit/enterprise/CompanyListPage.dom.test.tsx`

- [ ] **Step 1: Add failing detail-layout tests**

Render company detail and assert:

```ts
expect(screen.getByRole('region', { name: 'enterprise.companyDetail.sections.basic' })).toBeVisible();
expect(screen.getByRole('complementary', { name: 'enterprise.companyDetail.sections.contact' })).toBeVisible();
expect(screen.getByRole('link', { name: 'Industrial pump' })).toHaveAttribute('href', '/enterprise/products/9');
expect(container.querySelector('[class*="detailSidebar"]')).toBeInTheDocument();
expect(container).not.toHaveTextContent(/companyId|企业编号/);
```

Add a return-state entry:

```ts
{
  pathname: '/enterprise/companies/42',
  state: createCatalogReturnState({
    kind: 'companies',
    path: '/enterprise/companies',
    query: { keyword: 'steel', pageNum: 2, pageSize: 20 },
    scrollTop: 520,
  }),
}
```

Click back and assert the destination contains the same route state.

- [ ] **Step 2: Run the company detail test and verify failure**

Run:

```powershell
bunx vitest run tests/unit/enterprise/CompanyListPage.dom.test.tsx
```

Expected: FAIL on the new hero/sidebar/return-state assertions.

- [ ] **Step 3: Replace the company identity with `DetailHeroCard`**

Compose:

```tsx
<DetailHeroCard
  media={<CompanyLogo company={company} />}
  eyebrow={company.shortName || t('enterprise.companyDetail.profileEyebrow')}
  titleId='company-name'
  title={company.name}
  tags={
    <>
      {company.industry ? <Tag>{company.industry}</Tag> : null}
      {region ? <Tag>{region}</Tag> : null}
      {company.companyLevel !== undefined ? (
        <CompanyMembershipBadge level={company.companyLevel} compact />
      ) : null}
    </>
  }
/>
```

Do not add a favorite button.

- [ ] **Step 4: Compose the main overview and sidebar**

Use:

```tsx
<DetailColumns
  main={
    <>
      <DetailSectionCard title={t('enterprise.companyDetail.sections.basic')}>
        <DetailFacts facts={basicFacts} missing={missing} />
      </DetailSectionCard>
      <DetailSectionCard title={t('enterprise.companyDetail.sections.businessSummary')}>
        <p className={styles.plainText}>{company.businessSummary || missing}</p>
      </DetailSectionCard>
      <DetailSectionCard title={t('enterprise.companyDetail.sections.description')}>
        <p className={styles.plainText}>{company.description || missing}</p>
      </DetailSectionCard>
      <DetailSectionCard title={t('enterprise.companyDetail.sections.products')}>
        {productContent}
      </DetailSectionCard>
    </>
  }
  sidebar={
    <StickyDetailSidebar>
      <DetailSectionCard
        title={t('enterprise.companyDetail.sections.contact')}
        aria-label={t('enterprise.companyDetail.sections.contact')}
      >
        <DetailFacts facts={contactFacts} missing={missing} />
        <EnterpriseContactAccessPanel
          client={client}
          resourceType='COMPANY'
          resourceId={company.companyId}
          maskedPhone={company.phone}
        />
      </DetailSectionCard>
    </StickyDetailSidebar>
  }
/>
```

The existing `EnterpriseContactAccessPanel` remains the only component that acquires and reveals contact data.

- [ ] **Step 5: Implement state-aware back navigation**

Read:

```ts
const location = useLocation();
const catalogReturn = readCatalogReturnState(location.state, 'companies');
```

Use:

```ts
const backToList = () => {
  navigate(catalogReturn?.path ?? '/enterprise/companies', {
    state: catalogReturn ? createCatalogReturnState(catalogReturn) : undefined,
  });
};
```

Connect the existing back button to `backToList`.

- [ ] **Step 6: Keep company-only CSS**

Keep logo, fact grid, text, and product-card CSS in `company-catalog.module.css`. Remove duplicated page header, surface, generic detail columns, generic sidebar, and generic quick-view rules now owned by `catalog-layout.module.css`.

Use a three-column product grid at wide detail widths and two columns below `900px`.

- [ ] **Step 7: Run company detail tests**

Run:

```powershell
bunx vitest run tests/unit/enterprise/CompanyListPage.dom.test.tsx tests/unit/enterprise/EnterpriseContactAccessPanel.dom.test.tsx
```

Expected: PASS.

## Task 6: Product overview detail with company and contact sidebar

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/products/ProductDetailPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css`
- Modify: `tests/unit/enterprise/ProductListPage.dom.test.tsx`

- [ ] **Step 1: Add failing product detail tests**

Assert:

```ts
expect(screen.getByRole('heading', { name: 'Industrial pump' })).toBeVisible();
expect(screen.getByRole('complementary', { name: 'enterprise.productDetail.sections.contact' })).toBeVisible();
expect(screen.getByRole('link', { name: 'Alpha Hydraulics' })).toHaveAttribute(
  'href',
  '/enterprise/companies/42'
);
expect(screen.queryByText(/productId|产品编号|009/)).toBeNull();
expect(screen.queryByText('产品参数')).toBeNull();
```

Add the same route-state back-navigation assertion with `kind: 'products'`.

- [ ] **Step 2: Run the product detail test and verify failure**

Run:

```powershell
bunx vitest run tests/unit/enterprise/ProductListPage.dom.test.tsx
```

Expected: FAIL on shared hero/sidebar or return-state behavior.

- [ ] **Step 3: Compose the product hero**

Use:

```tsx
<DetailHeroCard
  media={<DetailImage product={product} />}
  eyebrow={t('enterprise.productDetail.profileEyebrow')}
  titleId='product-name'
  title={product.name}
  tags={
    <>
      {displayIndustry ? <Tag>{displayIndustry}</Tag> : null}
      <Tag>{region}</Tag>
      {product.companyLevel !== undefined ? (
        <CompanyMembershipBadge level={product.companyLevel} compact />
      ) : null}
    </>
  }
>
  <Link className={styles.detailCompanyLink} to={`/enterprise/companies/${encodeURIComponent(product.companyId)}`}>
    {product.companyName || missing}
  </Link>
</DetailHeroCard>
```

- [ ] **Step 4: Compose the product overview and sidebar**

Main column:

```tsx
<DetailSectionCard title={t('enterprise.productDetail.sections.profile')}>
  <ProductFacts product={product} missing={missing} />
</DetailSectionCard>
<DetailSectionCard title={t('enterprise.productDetail.sections.summary')}>
  <p className={styles.plainText}>{product.summary || missing}</p>
</DetailSectionCard>
```

Sidebar:

```tsx
<StickyDetailSidebar>
  <DetailSectionCard title={t('enterprise.products.fields.company')}>
    <Link to={`/enterprise/companies/${encodeURIComponent(product.companyId)}`}>
      {product.companyName || missing}
    </Link>
    {product.companyIndustry ? <p>{product.companyIndustry}</p> : null}
  </DetailSectionCard>
  <DetailSectionCard
    title={t('enterprise.productDetail.sections.contact')}
    aria-label={t('enterprise.productDetail.sections.contact')}
  >
    <EnterpriseContactAccessPanel
      client={client}
      resourceType='PRODUCT'
      resourceId={product.productId}
      maskedPhone={product.phone}
    />
  </DetailSectionCard>
</StickyDetailSidebar>
```

Do not render invented parameters, applicability, or long-description sections.

- [ ] **Step 5: Implement state-aware product back navigation**

Read `readCatalogReturnState(location.state, 'products')` and navigate to its path and state. Fall back to `/enterprise/products` when the detail was opened from another route.

- [ ] **Step 6: Keep product-only detail CSS**

Keep image fallback, product facts, plain text, company link, card body, and responsive product-grid rules in `product-catalog.module.css`. Remove duplicate generic detail columns, header, surface, sidebar, and quick-view CSS.

- [ ] **Step 7: Run product detail tests**

Run:

```powershell
bunx vitest run tests/unit/enterprise/ProductListPage.dom.test.tsx tests/unit/enterprise/EnterpriseContactAccessPanel.dom.test.tsx
```

Expected: PASS.

## Task 7: Internationalization, visual contracts, and focused regression suite

**Files:**

- Modify only if new text is required:
  - `packages/desktop/src/renderer/services/i18n/locales/zh-CN/enterprise.json`
  - `packages/desktop/src/renderer/services/i18n/locales/zh-TW/enterprise.json`
  - `packages/desktop/src/renderer/services/i18n/locales/en-US/enterprise.json`
  - `packages/desktop/src/renderer/services/i18n/locales/de-DE/enterprise.json`
  - `packages/desktop/src/renderer/services/i18n/locales/ja-JP/enterprise.json`
  - `packages/desktop/src/renderer/services/i18n/locales/ko-KR/enterprise.json`
  - `packages/desktop/src/renderer/services/i18n/locales/pt-BR/enterprise.json`
  - `packages/desktop/src/renderer/services/i18n/locales/ru-RU/enterprise.json`
  - `packages/desktop/src/renderer/services/i18n/locales/tr-TR/enterprise.json`
  - `packages/desktop/src/renderer/services/i18n/locales/uk-UA/enterprise.json`
- Generated: `packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`
- Modify: `tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts`
- Modify: `tests/unit/enterprise/productCatalogResponsiveCss.test.ts`

- [ ] **Step 1: Reuse existing keys before adding text**

Use existing company, product, contact, retry, missing, loading, empty, quick-preview, and detail keys wherever their meaning is unchanged.

The only shared key expected by Task 1 is:

```json
"catalog": {
  "closeQuickView": "关闭快速预览"
}
```

Add the equivalent key to all ten locales if an existing close-action key cannot be reused. Do not leave English fallback text in non-English locale files.

- [ ] **Step 2: Generate i18n types**

Run:

```powershell
bun run i18n:types
```

Expected: exit code `0` and generated keys up to date.

- [ ] **Step 3: Run the i18n checker**

Run:

```powershell
node scripts/check-i18n.js
```

Expected: exit code `0`; no new missing key or unknown key introduced by this work.

- [ ] **Step 4: Strengthen CSS contract tests**

Require:

```ts
expect(sharedCss).toMatch(/\.detailSidebar[\s\S]*position:\s*sticky/);
expect(sharedCss).toMatch(/@media\s*\(max-width:\s*980px\)[\s\S]*position:\s*static/);
expect(companyCss).toMatch(/\.selectedRow/);
expect(productCss).toMatch(/repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
expect(productCss).not.toMatch(/\.cardIndex/);
```

- [ ] **Step 5: Run the focused catalog regression suite**

Run:

```powershell
bunx vitest run tests/unit/enterprise/CatalogLayout.dom.test.tsx tests/unit/enterprise/catalogReturnState.test.ts tests/unit/enterprise/companyData.test.ts tests/unit/enterprise/productData.test.ts tests/unit/enterprise/CompanyListPage.dom.test.tsx tests/unit/enterprise/ProductListPage.dom.test.tsx tests/unit/enterprise/EnterpriseContactAccessPanel.dom.test.tsx tests/unit/enterprise/enterpriseSchemas.test.ts tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts tests/unit/enterprise/productCatalogResponsiveCss.test.ts tests/unit/enterprise/useEnterprisePaginationScroll.dom.test.tsx
```

Expected: all selected test files and tests pass.

## Task 8: Engineering verification and manual acceptance

**Files:**

- No additional source files unless verification exposes a defect in the tasks above.

- [ ] **Step 1: Run TypeScript**

Run:

```powershell
bunx tsc --noEmit
```

Expected: exit code `0`.

- [ ] **Step 2: Run lint on the affected source and tests**

Run:

```powershell
bunx oxlint packages/desktop/src/common/enterprise/contracts.ts packages/desktop/src/common/enterprise/rawSchemas.ts packages/desktop/src/common/enterprise/normalizers.ts packages/desktop/src/renderer/pages/enterprise/layout/catalog packages/desktop/src/renderer/pages/enterprise/companies packages/desktop/src/renderer/pages/enterprise/products tests/unit/enterprise/CatalogLayout.dom.test.tsx tests/unit/enterprise/catalogReturnState.test.ts tests/unit/enterprise/CompanyListPage.dom.test.tsx tests/unit/enterprise/ProductListPage.dom.test.tsx
```

Expected: `0 warnings and 0 errors` for the selected files.

- [ ] **Step 3: Run format check**

Run:

```powershell
bunx oxfmt --check packages/desktop/src/common/enterprise/contracts.ts packages/desktop/src/common/enterprise/rawSchemas.ts packages/desktop/src/common/enterprise/normalizers.ts packages/desktop/src/renderer/pages/enterprise/layout/catalog packages/desktop/src/renderer/pages/enterprise/companies packages/desktop/src/renderer/pages/enterprise/products tests/unit/enterprise/CatalogLayout.dom.test.tsx tests/unit/enterprise/catalogReturnState.test.ts tests/unit/enterprise/CompanyListPage.dom.test.tsx tests/unit/enterprise/ProductListPage.dom.test.tsx
```

Expected: all matched files use the correct format.

- [ ] **Step 4: Build the production renderer and main process**

Close any application running from `out/win-unpacked` before this command.

Run:

```powershell
bun run package
```

Expected: exit code `0` and Vite reports a completed build. This step does not create or publish an installer.

- [ ] **Step 5: Manually verify the enterprise list**

In the Electron development build:

1. Open 企业库.
2. Confirm filters and action buttons align.
3. Confirm compact rows and sticky table header.
4. Click a row and confirm the selected highlight and right preview.
5. Double-click a row and confirm full detail navigation.
6. Return and confirm filters, page, selected item, and scroll position.
7. Change page and confirm automatic scroll to the table header.

- [ ] **Step 6: Manually verify the product list**

1. Open 产品库.
2. Confirm four columns at normal desktop width.
3. Narrow the window and confirm three columns, then two columns.
4. Confirm every description is at most two lines.
5. Confirm failed images show the branded fallback.
6. Confirm no product ID fragment appears on any card.
7. Open and close quick preview using keyboard controls.

- [ ] **Step 7: Manually verify details and permissions**

1. Open an enterprise detail.
2. Confirm hero, main overview, representative products, and sticky contact sidebar.
3. Confirm locked contact values stay in position and remain blurred until unlocked.
4. Unlock contact data and confirm it appears in place.
5. Open a product detail and confirm the company card and contact panel.
6. Confirm no empty product-parameter section and no database ID.
7. Simulate a contact request failure and confirm public detail remains usable.

- [ ] **Step 8: Stop before version-control or release actions**

Report:

- Changed files.
- Focused test counts.
- Typecheck, lint, format, i18n, and build results.
- Manual acceptance results.
- Any pre-existing warning that is unrelated to this change.

Do not stage, commit, push, upload, update a database, or publish a release without a new explicit user instruction.
