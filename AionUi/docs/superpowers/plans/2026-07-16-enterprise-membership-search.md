# Enterprise Membership and Search Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify H5-compatible enterprise membership badges across the desktop workbench, remove the company update-time column, and align the dashboard search input with its search button.

**Architecture:** A pure membership resolver owns every `companyLevel` mapping and a single React component owns rendering, accessibility, and sizing. The five enterprise surfaces consume that component, while the existing company API and search behavior remain unchanged. Static H5 badge images are copied into the desktop package so packaged builds do not depend on another application's asset URL.

**Tech Stack:** React 19, TypeScript, Ant Design, CSS Modules, react-i18next, Vitest, Testing Library, Electron/Vite

---

## File map

- Create `packages/desktop/src/renderer/pages/enterprise/membership/companyMembership.ts`: pure level-to-presentation resolver.
- Create `packages/desktop/src/renderer/pages/enterprise/membership/CompanyMembershipBadge.tsx`: shared accessible badge renderer.
- Create `packages/desktop/src/renderer/pages/enterprise/membership/company-membership.module.css`: compact/default badge sizing and fallback label styling.
- Create `packages/desktop/src/renderer/pages/enterprise/membership/assets/*.png`: byte-for-byte copies of the six H5 assets used by valid mappings.
- Create `tests/unit/enterprise/companyMembership.test.ts`: pure mapping coverage.
- Create `tests/unit/enterprise/CompanyMembershipBadge.dom.test.tsx`: component rendering and accessibility coverage.
- Modify `packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`: stable membership names and unknown-level fallback.
- Modify `packages/desktop/src/renderer/pages/enterprise/dashboard/DashboardPage.tsx`: current-company membership badge.
- Modify `packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css`: search group/button alignment.
- Modify `packages/desktop/src/renderer/pages/enterprise/companies/CompanyListPage.tsx`: badge column/filter, remove update-time column, reduce table width.
- Modify `packages/desktop/src/renderer/pages/enterprise/companies/CompanyQuickView.tsx`: shared badge.
- Modify `packages/desktop/src/renderer/pages/enterprise/companies/CompanyDetailPage.tsx`: shared badge in identity and facts.
- Modify `packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`: filter option and detail badge alignment.
- Modify `packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`: clarify the existing renderer-to-H5 parameter translation comment without changing behavior.
- Modify enterprise DOM/CSS tests to protect every integration point.

### Task 1: Add the pure H5-compatible membership resolver

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/membership/companyMembership.ts`
- Create: `packages/desktop/src/renderer/pages/enterprise/membership/assets/sm.png`
- Create: `packages/desktop/src/renderer/pages/enterprise/membership/assets/ordinary-member.png`
- Create: `packages/desktop/src/renderer/pages/enterprise/membership/assets/vip-member.png`
- Create: `packages/desktop/src/renderer/pages/enterprise/membership/assets/four-star-member.png`
- Create: `packages/desktop/src/renderer/pages/enterprise/membership/assets/five-star-member.png`
- Create: `packages/desktop/src/renderer/pages/enterprise/membership/assets/flagship-store.png`
- Test: `tests/unit/enterprise/companyMembership.test.ts`

- [ ] **Step 1: Write the failing resolver test**

```ts
import { describe, expect, it } from 'vitest';

import { resolveCompanyMembership } from '@/renderer/pages/enterprise/membership/companyMembership';

describe('company membership presentation', () => {
  it.each([
    [1, 'verified', 'enterprise.companies.memberLevel.verified'],
    [1.1, 'ordinary', 'enterprise.companies.memberLevel.ordinary'],
    [1.2, 'vip', 'enterprise.companies.memberLevel.vip'],
    [2, 'vip', 'enterprise.companies.memberLevel.vip'],
    [3, 'vip', 'enterprise.companies.memberLevel.vip'],
    [4, 'star', 'enterprise.companies.memberLevel.fourStar'],
    [5, 'star', 'enterprise.companies.memberLevel.fiveStar'],
    [6, 'flagship', 'enterprise.companies.memberLevel.flagship'],
  ] as const)('maps H5 company level %s to %s', (level, kind, labelKey) => {
    expect(resolveCompanyMembership(level)).toMatchObject({ kind, labelKey });
    expect(resolveCompanyMembership(level).iconSrc).toBeTruthy();
  });

  it('does not create a broken icon for H5 levels without an asset', () => {
    expect(resolveCompanyMembership(3.1)).toEqual({
      kind: 'unknown',
      labelKey: 'enterprise.companies.memberLevel.fallback',
      labelValues: { level: 3.1 },
      iconSrc: null,
    });
  });

  it('uses the ungraded fallback for absent and non-finite values', () => {
    expect(resolveCompanyMembership(undefined).labelKey).toBe('enterprise.companies.memberLevel.unknown');
    expect(resolveCompanyMembership(Number.NaN).iconSrc).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```powershell
npx --no-install vitest run tests/unit/enterprise/companyMembership.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `companyMembership.ts` does not exist.

- [ ] **Step 3: Copy and verify the six source assets**

Copy the exact files from the read-only H5 reference into the new membership asset directory:

```powershell
$source = 'E:\ZZY_PROJECT\lianshang_liaoning\vip_store\src\assets\images\hzk_company\level'
$target = 'packages/desktop/src/renderer/pages/enterprise/membership/assets'
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item "$source\sm.png" "$target\sm.png"
Copy-Item "$source\l1.1 copy.png" "$target\ordinary-member.png"
Copy-Item "$source\VIP_level.png" "$target\vip-member.png"
Copy-Item "$source\l4 copy.png" "$target\four-star-member.png"
Copy-Item "$source\l5 copy.png" "$target\five-star-member.png"
Copy-Item "$source\l6 copy.png" "$target\flagship-store.png"
Get-FileHash "$source\sm.png", "$target\sm.png"
```

Expected: each source/target pair has the same SHA-256 hash. Do not modify the H5 repository.

- [ ] **Step 4: Implement the resolver with one documented compatibility boundary**

```ts
import flagshipStoreIcon from './assets/flagship-store.png';
import fiveStarMemberIcon from './assets/five-star-member.png';
import fourStarMemberIcon from './assets/four-star-member.png';
import ordinaryMemberIcon from './assets/ordinary-member.png';
import verifiedIcon from './assets/sm.png';
import vipMemberIcon from './assets/vip-member.png';

export type CompanyMembershipKind = 'verified' | 'ordinary' | 'vip' | 'star' | 'flagship' | 'unknown';

export type CompanyMembershipPresentation = {
  kind: CompanyMembershipKind;
  labelKey: string;
  labelValues?: { level: number };
  iconSrc: string | null;
};

const presentation = (
  kind: CompanyMembershipKind,
  labelKey: string,
  iconSrc: string | null,
  labelValues?: { level: number }
): CompanyMembershipPresentation => ({ kind, labelKey, iconSrc, ...(labelValues ? { labelValues } : {}) });

/** Mirrors the active H5 `comLevel` image rules and fails closed when H5 has no matching image asset. */
export const resolveCompanyMembership = (level: number | undefined): CompanyMembershipPresentation => {
  if (typeof level !== 'number' || !Number.isFinite(level)) {
    return presentation('unknown', 'enterprise.companies.memberLevel.unknown', null);
  }
  if (level === 1) return presentation('verified', 'enterprise.companies.memberLevel.verified', verifiedIcon);
  if (level === 1.1) return presentation('ordinary', 'enterprise.companies.memberLevel.ordinary', ordinaryMemberIcon);
  if (level >= 1.2 && level <= 3) return presentation('vip', 'enterprise.companies.memberLevel.vip', vipMemberIcon);
  if (level === 4) return presentation('star', 'enterprise.companies.memberLevel.fourStar', fourStarMemberIcon);
  if (level === 5) return presentation('star', 'enterprise.companies.memberLevel.fiveStar', fiveStarMemberIcon);
  if (level === 6) return presentation('flagship', 'enterprise.companies.memberLevel.flagship', flagshipStoreIcon);
  return presentation('unknown', 'enterprise.companies.memberLevel.fallback', null, { level });
};
```

- [ ] **Step 5: Run the resolver test and confirm GREEN**

Run the command from Step 2. Expected: all resolver cases PASS.

- [ ] **Step 6: Commit the resolver and assets**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/membership tests/unit/enterprise/companyMembership.test.ts
git commit -m "功能(企业会员): 封装 H5 等级映射"
```

### Task 2: Build the reusable accessible badge component

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/membership/CompanyMembershipBadge.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/membership/company-membership.module.css`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/zh-CN/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/zh-TW/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/en-US/enterprise.json`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/ru-RU/enterprise.json`
- Test: `tests/unit/enterprise/CompanyMembershipBadge.dom.test.tsx`

- [ ] **Step 1: Write failing component tests**

```tsx
it('renders the H5 VIP image with one translated accessible name', () => {
  render(<CompanyMembershipBadge level={2} />);
  expect(screen.getByRole('img', { name: 'enterprise.companies.memberLevel.vip' })).toHaveAttribute(
    'src',
    expect.stringContaining('vip-member')
  );
  expect(screen.queryByText('enterprise.companies.memberLevel.value:2')).toBeNull();
});

it('renders text instead of a broken image for an unmapped finite level', () => {
  render(<CompanyMembershipBadge level={7} compact />);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('enterprise.companies.memberLevel.fallback:7')).toBeVisible();
});
```

- [ ] **Step 2: Run the component test and confirm RED**

```powershell
npx --no-install vitest run tests/unit/enterprise/CompanyMembershipBadge.dom.test.tsx --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `CompanyMembershipBadge` does not exist.

- [ ] **Step 3: Add localized business names**

Extend each locale's existing `companies.memberLevel` object with these keys while preserving `vipAggregate` and `unknown`:

```json
{
  "verified": "实名认证",
  "ordinary": "普通会员",
  "vip": "VIP 会员",
  "fourStar": "4 星会员",
  "fiveStar": "5 星会员",
  "flagship": "旗舰店",
  "fallback": "会员等级 {{level}}"
}
```

Use these exact values:

| Locale  | verified          | ordinary        | vip        | fourStar      | fiveStar      | flagship       | fallback                     |
| ------- | ----------------- | --------------- | ---------- | ------------- | ------------- | -------------- | ---------------------------- |
| `zh-CN` | 实名认证          | 普通会员        | VIP 会员   | 4 星会员      | 5 星会员      | 旗舰店         | 会员等级 `{{level}}`         |
| `zh-TW` | 實名認證          | 普通會員        | VIP 會員   | 4 星會員      | 5 星會員      | 旗艦店         | 會員等級 `{{level}}`         |
| `en-US` | Verified business | Standard member | VIP member | 4-star member | 5-star member | Flagship store | Membership level `{{level}}` |
| `ru-RU` | Verified business | Standard member | VIP member | 4-star member | 5-star member | Flagship store | Membership level `{{level}}` |

`ru-RU` intentionally follows that file's existing English enterprise copy instead of introducing a partial Russian translation in this focused change.

- [ ] **Step 4: Implement the component and CSS module**

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

import { resolveCompanyMembership } from './companyMembership';
import styles from './company-membership.module.css';

export type CompanyMembershipBadgeProps = {
  level?: number;
  compact?: boolean;
  className?: string;
};

/** Single renderer for every enterprise membership surface, including unknown-level degradation. */
const CompanyMembershipBadge: React.FC<CompanyMembershipBadgeProps> = ({ level, compact = false, className }) => {
  const { t } = useTranslation();
  const membership = resolveCompanyMembership(level);
  const label = t(membership.labelKey, membership.labelValues);
  const badgeClassName = [styles.badge, compact ? styles.compact : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={badgeClassName} data-membership-kind={membership.kind}>
      {membership.iconSrc ? (
        <img className={styles.image} src={membership.iconSrc} alt={label} title={label} />
      ) : (
        <span className={styles.fallback}>{label}</span>
      )}
    </span>
  );
};

export default CompanyMembershipBadge;
```

```css
.badge {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  vertical-align: middle;
}

.image {
  display: block;
  width: auto;
  max-width: 112px;
  height: 24px;
  object-fit: contain;
}

.compact .image {
  max-width: 88px;
  height: 19px;
}

.fallback {
  padding: 2px 8px;
  color: var(--text-secondary);
  border: 1px solid var(--border-base);
  border-radius: 999px;
  background: var(--bg-2);
  font-size: 11px;
  line-height: 1.45;
  white-space: nowrap;
}
```

- [ ] **Step 5: Run component and resolver tests**

Run both Task 1 and Task 2 test files. Expected: PASS with no accessibility warnings.

- [ ] **Step 6: Commit the component**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/membership packages/desktop/src/renderer/services/i18n/locales tests/unit/enterprise/CompanyMembershipBadge.dom.test.tsx
git commit -m "功能(企业会员): 增加统一等级标识组件"
```

### Task 3: Integrate the badge everywhere and remove update time

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/dashboard/DashboardPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyListPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyQuickView.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyDetailPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`
- Test: `tests/unit/enterprise/DashboardPage.dom.test.tsx`
- Test: `tests/unit/enterprise/CompanyListPage.dom.test.tsx`

- [ ] **Step 1: Add failing integration assertions**

Add assertions that:

```tsx
expect(screen.getByRole('img', { name: 'enterprise.companies.memberLevel.vip' })).toBeVisible();
expect(screen.queryByText('enterprise.companies.columns.updatedAt')).toBeNull();
expect(container.querySelector('.enterprise-company-list .ll-ant-table')).toHaveAttribute(
  'style',
  expect.not.stringContaining('1148')
);
```

In the detail render test, assert two VIP images exist: one in the identity area and one in the membership fact. In the quick-view test, assert the selected company renders the same VIP image. Update existing select assertions so known levels use business-name images and `3.1`, `7` through `10` use `memberLevel.fallback` text.

- [ ] **Step 2: Run the two DOM test files and confirm RED**

```powershell
npx --no-install vitest run tests/unit/enterprise/DashboardPage.dom.test.tsx tests/unit/enterprise/CompanyListPage.dom.test.tsx --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because pages still render numeric member text and the update-time column.

- [ ] **Step 3: Replace every membership rendering with the shared component**

Import `CompanyMembershipBadge` into all four page files. Use:

```tsx
<CompanyMembershipBadge level={user?.companyLevel} />
```

for the dashboard, and:

```tsx
<CompanyMembershipBadge level={company.companyLevel} compact />
```

for table, filter, quick-view, and detail contexts. Keep the existing `companyLevel !== undefined` guards where a surface should remain absent rather than show “暂未分级”. For filter options, pass each numeric option through the component; keep the special “全部 VIP 企业” option text and add the VIP badge beside it.

- [ ] **Step 4: Allow React content in detail facts without weakening missing-value handling**

Change the fact value type and render helper to:

```tsx
type DetailFact = {
  label: string;
  value?: React.ReactNode;
};

const isMissingFact = (value: React.ReactNode): boolean => value === undefined || value === null || value === '';
```

Then pass `<CompanyMembershipBadge level={company.companyLevel} compact />` as the member-level fact value.

- [ ] **Step 5: Remove the update-time column and correct the table width**

Delete the `updatedAt` column definition and change:

```tsx
scroll={{ x: 1016 }}
```

The value is the exact sum of the remaining declared column widths: `210 + 150 + 180 + 120 + 240 + 116`.

- [ ] **Step 6: Add only the layout rules required by the shared badge**

```css
.memberFilterOption {
  display: inline-flex;
  min-width: 0;
  gap: 8px;
  align-items: center;
}

.detailMembership {
  flex: 0 0 auto;
}
```

Pass `className={styles.detailMembership}` to the detail identity badge, so the page targets a stable CSS Module class without relying on a global selector.

- [ ] **Step 7: Run both DOM test files and confirm GREEN**

Run the command from Step 2. Expected: PASS and no numeric `memberLevel.value` rendering remains in the covered pages.

- [ ] **Step 8: Commit the page integration**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/dashboard/DashboardPage.tsx packages/desktop/src/renderer/pages/enterprise/companies tests/unit/enterprise/DashboardPage.dom.test.tsx tests/unit/enterprise/CompanyListPage.dom.test.tsx
git commit -m "重构(企业会员): 统一工作台等级展示"
```

### Task 4: Align the dashboard search input and button

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css`
- Test: `tests/unit/enterprise/DashboardSearchStyles.test.ts`

- [ ] **Step 1: Add the failing style contract**

```ts
it('aligns the search input group and button to one control height', () => {
  expect(dashboardStyles).toMatch(/\.searchControl\s+:global\(\.ll-ant-input-group\)[^{]*\{[^}]*height:\s*46px/s);
  expect(dashboardStyles).toMatch(/\.ll-ant-input-affix-wrapper[^}]*height:\s*46px/s);
  expect(dashboardStyles).toMatch(/\.ll-ant-input-search-button[^}]*height:\s*46px/s);
});
```

- [ ] **Step 2: Run the CSS test and confirm RED**

```powershell
npx --no-install vitest run tests/unit/enterprise/DashboardSearchStyles.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because the group and search button do not share a height declaration.

- [ ] **Step 3: Implement the smallest CSS fix**

```css
.searchControl :global(.ll-ant-input-group) {
  display: flex;
  width: 100%;
  height: 46px;
}

.searchControl :global(.ll-ant-input-affix-wrapper),
.searchControl :global(.ll-ant-input-search-button) {
  height: 46px;
}

.searchControl :global(.ll-ant-input-search-button) {
  min-width: 46px;
  border-start-end-radius: 10px;
  border-end-end-radius: 10px;
}
```

Keep the existing input background, focus border, and focus shadow declarations. Do not change `GlobalSearch.tsx` behavior.

- [ ] **Step 4: Run the CSS and dashboard DOM tests**

Expected: both files PASS; autocomplete keyboard behavior remains unchanged.

- [ ] **Step 5: Commit the search fix**

```powershell
git add packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css tests/unit/enterprise/DashboardSearchStyles.test.ts
git commit -m "修复(企业工作台): 对齐统一搜索栏按钮"
```

### Task 5: Clarify adjacent comments and verify the complete change

**Files:**

- Modify: `packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts`
- Modify only if inaccurate: files changed in Tasks 1 through 4

- [ ] **Step 1: Clarify the company-list serialization boundary**

Place this comment immediately above `serializeCompanyList` and remove any now-redundant or misleading adjacent comment:

```ts
/**
 * Converts renderer-friendly filters to the H5 controller contract.
 * Identity fields come only from the validated desktop session; `keyword` and
 * `companyLevel` intentionally become the legacy controller keys `name` and `comLevel`.
 */
```

Do not change the serializer body or request route.

- [ ] **Step 2: Audit comments only in touched files**

Check that comments describe business intent, stale-response protection, H5 compatibility, or fallback policy. Remove comments that merely restate syntax. Do not rewrite unrelated modules.

- [ ] **Step 3: Run focused tests**

```powershell
npx --no-install vitest run tests/unit/enterprise/companyMembership.test.ts tests/unit/enterprise/CompanyMembershipBadge.dom.test.tsx tests/unit/enterprise/DashboardSearchStyles.test.ts tests/unit/enterprise/DashboardPage.dom.test.tsx tests/unit/enterprise/CompanyListPage.dom.test.tsx --maxWorkers=1 --no-file-parallelism
```

Expected: all focused tests PASS.

- [ ] **Step 4: Run the complete enterprise suite**

```powershell
npx --no-install vitest run tests/unit/enterprise tests/integration/enterprise --maxWorkers=1 --no-file-parallelism
```

Expected: all enterprise unit and integration tests PASS.

- [ ] **Step 5: Run type, format, lint, and build checks**

```powershell
npx --no-install tsc --noEmit
npx --no-install tsc --noEmit --project tsconfig.enterprise-tests.json
npx --no-install oxfmt --check packages/desktop/src/renderer/pages/enterprise packages/desktop/src/process/services/enterprise tests/unit/enterprise tests/integration/enterprise
npx --no-install oxlint packages/desktop/src/renderer/pages/enterprise packages/desktop/src/process/services/enterprise tests/unit/enterprise tests/integration/enterprise
npm run package
git diff --check
```

Expected: both TypeScript checks exit `0`, formatting and lint report no errors, package build completes, and `git diff --check` is silent.

- [ ] **Step 6: Perform Electron runtime acceptance**

Start or reuse the development Electron instance. Verify:

1. Dashboard search input and button have equal computed heights and aligned top/bottom edges.
2. Dashboard identity, company table, filter dropdown, quick view, and detail render the same image for the same level.
3. The company table has no update-time header.
4. A narrow window has no document-level horizontal overflow.
5. F12 opens DevTools and the console has no new errors.

- [ ] **Step 7: Commit the comment and verification-ready state**

```powershell
git add packages/desktop/src/process/services/enterprise/enterpriseApiClient.ts
git commit -m "文档(企业接口): 说明企业库参数转换边界"
git status --short
```

Expected: commit succeeds and the final status is clean.
