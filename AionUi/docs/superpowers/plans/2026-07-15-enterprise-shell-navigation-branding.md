# Enterprise Shell, Navigation, and Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复企业模块在 Electron 窗口中的纵向溢出，建立 AI 与企业工作台的稳定双向导航，并把用户可见桌面产品统一为“链辽AI”，同时继续使用旧 `AionUi` 用户数据目录。

**Architecture:** 企业壳层在桌面断点内使用确定视口高度，中间业务区成为唯一主要滚动容器；移动断点恢复自然文档滚动。AI 侧栏新增独立的企业入口组件，所有显示品牌通过共享显示常量、i18n 和打包元数据更新；启动最早阶段通过纯路径解析函数把正式版 `userData` 固定到旧目录。

**Tech Stack:** Electron 37、React 19、TypeScript、React Router、Arco Design、Icon Park、CSS Grid、i18next、Vitest 4、Testing Library、electron-builder

**Execution constraint:** 按用户要求直接在当前 `master` 实施，不创建 worktree，不修改 `cloud-service`，不推送远程仓库。

---

## File map

### Enterprise shell and routing

- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx` — own the business scroll container reference and reset it on enterprise pathname changes.
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css` — constrain desktop grid height, assign scroll ownership, and restore mobile document scrolling.
- Modify: `tests/unit/enterprise/enterpriseResponsiveShell.test.ts` — lock the desktop and compact CSS contracts.
- Modify: `tests/unit/enterprise/EnterpriseRouter.dom.test.tsx` — verify pathname scroll reset and query-only preservation through the production router.

### Bidirectional navigation

- Create: `packages/desktop/src/renderer/components/layout/Sider/SiderEnterpriseEntry.tsx` — render and execute the fixed AI-to-enterprise navigation entry.
- Modify: `packages/desktop/src/renderer/components/layout/Sider/index.tsx` — mount the entry immediately above the existing footer.
- Modify: `tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx` — verify dashboard navigation, cleanup, collapsed rendering, and navigation rejection handling.
- Modify: `packages/desktop/src/renderer/services/i18n/locales/{zh-CN,en-US,ja-JP,zh-TW,ko-KR,tr-TR,ru-RU,uk-UA,pt-BR,de-DE}/enterprise.json` — set the enterprise brand and AI action in every supported language.

### Display branding

- Modify: `packages/desktop/src/common/config/constants.ts` — expose the renderer/main-safe `AI_PRODUCT_NAME` display constant.
- Modify: `packages/desktop/src/common/utils/appConfig.ts` — use the display constant as the client-name fallback.
- Modify: `packages/desktop/src/renderer/components/layout/Layout.tsx` — rename the AI wordmark without changing its settings navigation behavior.
- Modify: `packages/desktop/src/renderer/components/layout/Titlebar/index.tsx` — use the new product name for desktop and mobile fallback titles.
- Modify: `packages/desktop/src/renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx` — rename the About heading while preserving upstream links and license information.
- Modify: `packages/desktop/src/renderer/components/agent/ChannelConflictWarning.tsx` — use the display constant in the existing conflict guidance without changing OpenClaw logic.
- Modify: `packages/desktop/src/renderer/hooks/assistant/useTalkToButler.ts` — rename the fallback Butler toast.
- Modify: `packages/desktop/src/renderer/components/settings/SettingsModal/contents/FeedbackReportModal.tsx` — rename the fallback diagnosis prompt.
- Modify: `packages/desktop/src/renderer/components/settings/SettingsModal/contents/WebuiModalContent.tsx` — rename the fallback remote-access prompt.
- Modify: `packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx` — rename channel-description fallback strings.
- Modify: `packages/desktop/src/renderer/hooks/system/notification/useBrowserNotification.ts` — rename browser notification titles.
- Modify: `packages/desktop/src/process/utils/tray.ts` — rename the system tray tooltip.
- Modify: `packages/desktop/src/renderer/index.html` — rename document/PWA metadata and the HTML title.
- Modify: all exact product-name-bearing JSON files under `packages/desktop/src/renderer/services/i18n/locales/{zh-CN,en-US,ja-JP,zh-TW,ko-KR,tr-TR,ru-RU,uk-UA,pt-BR,de-DE}/{common,conversation,cron,login,preview,settings}.json` — replace display-value occurrences of `AionUi` with `链辽AI` without changing keys.
- Modify: `tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx` — update wordmark assertions.
- Modify: `tests/unit/settings/AboutModalContent.dom.test.tsx` — verify the About product heading.
- Modify: `tests/unit/renderer/useBrowserNotification.dom.test.tsx` — verify notification titles.
- Create: `tests/unit/common-config/brandDisplay.test.ts` — enforce the product constant, HTML metadata, and locale-value branding boundary.

### User data compatibility

- Create: `packages/desktop/src/common/platform/userDataPath.ts` — pure runtime-name and user-data path resolver.
- Modify: `packages/desktop/src/common/platform/index.ts` — re-export the resolver and apply it in the early platform fallback for packaged and development modes.
- Modify: `packages/desktop/src/process/utils/configureChromium.ts` — apply the same resolver before storage/logging/Sentry users can cache `userData`.
- Create: `tests/unit/process/userDataPath.test.ts` — verify production, development, multi-instance, invalid input, and startup import order.

### Packaging and local release assets

- Modify: `package.json` — change only root `productName`; keep package name and author metadata.
- Modify: `packages/desktop/electron-builder.yml` — change installed product/executable/protocol display names and Linux desktop name; keep app ID, URI scheme, repository, vendor, copyright, and icon identifiers.
- Modify: `scripts/create-mock-release-artifacts.sh` — generate mock desktop artifacts with the new display prefix.
- Modify: `scripts/prepare-release-assets.sh` — validate the new macOS artifact prefix.
- Modify: `scripts/verify-release-assets.sh` — verify the renamed desktop distributables while retaining `aionui-web-*` CLI assets.
- Modify: `tests/unit/releasePackagingConfig.test.ts` — verify renamed packaging metadata, protected internal identifiers, and renamed release fixtures.

## Task 1: Constrain the enterprise shell and restore scroll ownership

**Files:**
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx:1-40`
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css:1-455`
- Modify: `tests/unit/enterprise/enterpriseResponsiveShell.test.ts:1-35`
- Modify: `tests/unit/enterprise/EnterpriseRouter.dom.test.tsx:90-235`

- [ ] **Step 1: Write failing desktop and compact scroll-contract tests**

Extend `enterpriseResponsiveShell.test.ts` with a desktop slice and explicit scroll ownership assertions:

```ts
const compactStart = css.indexOf('@media (max-width: 780px)');
const desktopCss = css.slice(0, compactStart);

describe('enterprise desktop shell CSS contract', () => {
  it('constrains the shell to the viewport and gives the main pane vertical scroll ownership', () => {
    const shellRule = desktopCss.match(/\.enterprise-shell\s*\{([^}]*)\}/s)?.[1] ?? '';
    const mainRule = desktopCss.match(/\.enterprise-shell__main\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(shellRule).toMatch(/height:\s*100d?vh/);
    expect(shellRule).toMatch(/min-height:\s*0/);
    expect(shellRule).toMatch(/overflow:\s*hidden/);
    expect(mainRule).toMatch(/overflow:\s*auto/);
  });

  it('keeps the sidebar navigation and assistant usable in a short window', () => {
    const navigationRule = desktopCss.match(/\.enterprise-sider__navigation\s*\{([^}]*)\}/s)?.[1] ?? '';
    const assistantRule = desktopCss.match(/\.enterprise-assistant\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(navigationRule).toMatch(/overflow-y:\s*auto/);
    expect(assistantRule).toMatch(/overflow-y:\s*auto/);
  });
});
```

Add this compact assertion to the existing compact describe block:

```ts
it('returns the enterprise document and main pane to natural page scrolling', () => {
  const shellRule = compactCss.match(/\.enterprise-shell\s*\{([^}]*)\}/s)?.[1] ?? '';
  const mainRule = compactCss.match(/\.enterprise-shell__main\s*\{([^}]*)\}/s)?.[1] ?? '';

  expect(compactCss).toMatch(/(?:html|body|#root):has\(\.enterprise-shell\)/);
  expect(shellRule).toMatch(/height:\s*auto/);
  expect(shellRule).toMatch(/overflow:\s*visible/);
  expect(mainRule).toMatch(/overflow:\s*visible/);
});
```

- [ ] **Step 2: Write failing route-scroll behavior tests**

Add these tests inside `describe('enterprise desktop routing', ...)` in `EnterpriseRouter.dom.test.tsx`:

```tsx
it('resets the business pane to the top when the enterprise pathname changes', async () => {
  const user = userEvent.setup();
  const { container } = renderAt('/enterprise/dashboard');
  const main = await waitFor(() => {
    const element = container.querySelector<HTMLElement>('.enterprise-shell__main');
    expect(element).not.toBeNull();
    return element as HTMLElement;
  }, ROUTE_WAIT_OPTIONS);
  main.scrollTop = 320;

  await user.click(screen.getByRole('link', { name: 'enterprise.navigation.companies' }));

  await waitFor(() => expect(window.location.hash).toBe('#/enterprise/companies'), ROUTE_WAIT_OPTIONS);
  expect(main.scrollTop).toBe(0);
});

it('preserves the business scroll position for a query-only route update', async () => {
  const { container } = renderAt('/enterprise/dashboard');
  const main = await waitFor(() => {
    const element = container.querySelector<HTMLElement>('.enterprise-shell__main');
    expect(element).not.toBeNull();
    return element as HTMLElement;
  }, ROUTE_WAIT_OPTIONS);
  main.scrollTop = 240;

  window.location.hash = '#/enterprise/dashboard?page=2';
  window.dispatchEvent(new HashChangeEvent('hashchange'));

  await waitFor(() => expect(window.location.hash).toBe('#/enterprise/dashboard?page=2'), ROUTE_WAIT_OPTIONS);
  expect(main.scrollTop).toBe(240);
});
```

- [ ] **Step 3: Run the new tests and verify they fail for the current indefinite-height shell**

Run:

```powershell
npx vitest run tests/unit/enterprise/enterpriseResponsiveShell.test.ts tests/unit/enterprise/EnterpriseRouter.dom.test.tsx --no-file-parallelism
```

Expected: FAIL because the shell has no definite `height`, the sidebar/assistant do not own short-window overflow, compact root scrolling is not restored, and route changes do not reset `.enterprise-shell__main`.

- [ ] **Step 4: Implement viewport constraint, independent auxiliary scrolling, and pathname reset**

Update `EnterpriseShell.tsx` imports and main element:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

const EnterpriseShell: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(true);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  return (
    <div className={`enterprise-shell${assistantOpen ? '' : ' enterprise-shell--assistant-closed'}`}>
      {/* existing chrome, sider, and header stay unchanged */}
      <main
        ref={mainRef}
        className='enterprise-shell__main'
        aria-label={t('enterprise.accessibility.workspace')}
      >
        <Outlet />
      </main>
      {/* existing assistant stays unchanged */}
    </div>
  );
};
```

Apply these CSS contracts in `enterprise-shell.css` while preserving existing colors and grid definitions:

```css
.enterprise-shell {
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.enterprise-sider__navigation {
  overflow-y: auto;
}

.enterprise-assistant {
  overflow-x: hidden;
  overflow-y: auto;
}

@media (max-width: 780px) {
  html:has(.enterprise-shell),
  body:has(.enterprise-shell),
  #root:has(.enterprise-shell) {
    height: auto;
    min-height: 100%;
    overflow: visible;
  }

  .enterprise-shell {
    height: auto;
    min-height: 100vh;
    overflow: visible;
  }

  .enterprise-shell__main {
    overflow: visible;
  }
}
```

- [ ] **Step 5: Run focused tests and commit the scroll fix**

Run:

```powershell
npx vitest run tests/unit/enterprise/enterpriseResponsiveShell.test.ts tests/unit/enterprise/EnterpriseRouter.dom.test.tsx --no-file-parallelism
```

Expected: PASS for both files, including the existing compact navigation and route guard cases.

Commit:

```powershell
git add packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css tests/unit/enterprise/enterpriseResponsiveShell.test.ts tests/unit/enterprise/EnterpriseRouter.dom.test.tsx
git commit -m "fix(enterprise): constrain workspace scrolling"
```

## Task 2: Add the fixed AI-to-enterprise return entry

**Files:**
- Create: `packages/desktop/src/renderer/components/layout/Sider/SiderEnterpriseEntry.tsx`
- Modify: `packages/desktop/src/renderer/components/layout/Sider/index.tsx:1-220`
- Modify: `tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx:1-175`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/{zh-CN,en-US,ja-JP,zh-TW,ko-KR,tr-TR,ru-RU,uk-UA,pt-BR,de-DE}/enterprise.json`

- [ ] **Step 1: Write failing return-entry behavior tests**

Add `waitFor` to the existing Testing Library import. Add the hoisted spies below, and replace the file's existing `@renderer/utils/ui/siderTooltip` mock instead of declaring that module mock twice:

```tsx
const siderEntryMocks = vi.hoisted(() => ({
  blurActiveElement: vi.fn(),
  cleanupSiderTooltips: vi.fn(),
  closePreview: vi.fn(),
  onSessionClick: vi.fn(),
}));

vi.mock('@renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ closePreview: siderEntryMocks.closePreview }),
}));
vi.mock('@renderer/utils/ui/focus', () => ({
  blurActiveElement: siderEntryMocks.blurActiveElement,
}));
vi.mock('@renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: siderEntryMocks.cleanupSiderTooltips,
}));
```

Import the new component and add a separate describe block:

```tsx
import SiderEnterpriseEntry from '@renderer/components/layout/Sider/SiderEnterpriseEntry';

describe('Sider enterprise return entry', () => {
  beforeEach(() => {
    navigate.mockReset();
    navigate.mockReturnValue(undefined);
    Object.values(siderEntryMocks).forEach((mock) => mock.mockClear());
  });

  it('always returns to the enterprise dashboard and cleans transient AI UI', () => {
    render(
      <SiderEnterpriseEntry
        collapsed={false}
        isMobile={false}
        siderTooltipProps={{ disabled: true }}
        onSessionClick={siderEntryMocks.onSessionClick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'enterprise.shell.brand' }));

    expect(navigate).toHaveBeenCalledWith('/enterprise/dashboard');
    expect(siderEntryMocks.closePreview).toHaveBeenCalledOnce();
    expect(siderEntryMocks.cleanupSiderTooltips).toHaveBeenCalledOnce();
    expect(siderEntryMocks.blurActiveElement).toHaveBeenCalledOnce();
    expect(siderEntryMocks.onSessionClick).toHaveBeenCalledOnce();
  });

  it('keeps an accessible icon entry while the AI sidebar is collapsed', () => {
    render(
      <SiderEnterpriseEntry
        collapsed
        isMobile={false}
        siderTooltipProps={{ disabled: false }}
        onSessionClick={siderEntryMocks.onSessionClick}
      />
    );

    const entry = screen.getByRole('button', { name: 'enterprise.shell.brand' });
    expect(entry).toBeVisible();
    expect(entry.querySelector('.collapsed-hidden')).not.toBeNull();
  });

  it('reports a rejected navigation without leaking or blocking sidebar cleanup', async () => {
    const navigationError = new Error('route rejected');
    navigate.mockRejectedValueOnce(navigationError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <SiderEnterpriseEntry
        collapsed={false}
        isMobile
        siderTooltipProps={{ disabled: true }}
        onSessionClick={siderEntryMocks.onSessionClick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'enterprise.shell.brand' }));

    await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Navigation failed:', navigationError));
    expect(siderEntryMocks.onSessionClick).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 2: Run the component test and verify the missing module failure**

Run:

```powershell
npx vitest run tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx --no-file-parallelism
```

Expected: FAIL because `SiderEnterpriseEntry.tsx` does not exist.

- [ ] **Step 3: Implement the focused Arco return-entry component**

Create `SiderEnterpriseEntry.tsx`:

```tsx
import { Button, Tooltip } from '@arco-design/web-react';
import { BuildingFour } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { usePreviewContext } from '@renderer/pages/conversation/Preview/context/PreviewContext';
import { blurActiveElement } from '@renderer/utils/ui/focus';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { cleanupSiderTooltips } from '@renderer/utils/ui/siderTooltip';

type SiderEnterpriseEntryProps = {
  collapsed: boolean;
  isMobile: boolean;
  siderTooltipProps: SiderTooltipProps;
  onSessionClick?: () => void;
};

/** Fixed bridge from the AI shell back to the authenticated enterprise workspace. */
const SiderEnterpriseEntry: React.FC<SiderEnterpriseEntryProps> = ({
  collapsed,
  isMobile,
  siderTooltipProps,
  onSessionClick,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closePreview } = usePreviewContext();
  const label = t('enterprise.shell.brand');

  const handleClick = () => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
    Promise.resolve(navigate('/enterprise/dashboard')).catch((error) => {
      console.error('Navigation failed:', error);
    });
    onSessionClick?.();
  };

  return (
    <div className='shrink-0 px-0 pb-8px'>
      <Tooltip {...siderTooltipProps} content={label} position='right'>
        <Button
          type='text'
          long
          aria-label={label}
          className={classNames(
            'h-34px !flex !items-center !text-t-primary hover:!bg-fill-3',
            collapsed ? '!px-0 !justify-center' : '!px-10px !justify-start !gap-8px',
            isMobile && 'sider-footer-btn-mobile'
          )}
          icon={<BuildingFour theme='outline' size='16' fill='currentColor' />}
          onClick={handleClick}
        >
          <span className='collapsed-hidden truncate'>{label}</span>
        </Button>
      </Tooltip>
    </div>
  );
};

export default SiderEnterpriseEntry;
```

Mount it in `Sider/index.tsx` immediately before `<SiderFooter>`:

```tsx
import SiderEnterpriseEntry from './SiderEnterpriseEntry';

<SiderEnterpriseEntry
  collapsed={collapsed}
  isMobile={isMobile}
  siderTooltipProps={siderTooltipProps}
  onSessionClick={onSessionClick}
/>
<SiderFooter
  isMobile={isMobile}
  isSettings={isSettings}
  collapsed={collapsed}
  theme={theme}
  siderTooltipProps={siderTooltipProps}
  onSettingsClick={handleSettingsClick}
  onThemeToggle={handleQuickThemeToggle}
  showLogout={showLogout}
  onLogoutClick={handleLogout}
/>
```

Do not change `EnterpriseSider.tsx` route behavior: its existing AI `NavLink` stays at `/guid`; only its translated label changes.

- [ ] **Step 4: Update enterprise brand/action values in every supported locale**

Set these exact values in the ten `enterprise.json` files:

```json
{
  "shell": {
    "brand": "链上辽宁·产业云城",
    "actions": {
      "ai": "进入链辽AI"
    }
  }
}
```

Only replace the two existing values inside each full JSON document; do not replace other keys or discard surrounding translations. The proper product names remain identical in every locale.

- [ ] **Step 5: Regenerate i18n types, validate all locales, run tests, and commit**

Run in order:

```powershell
npm run i18n:types
node scripts/check-i18n.js
npx vitest run tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx tests/unit/enterprise/EnterpriseRouter.dom.test.tsx --no-file-parallelism
```

Expected: i18n validation exits 0; both test files PASS. The generated key file should remain unchanged because no keys were added.

Commit:

```powershell
git add packages/desktop/src/renderer/components/layout/Sider/SiderEnterpriseEntry.tsx packages/desktop/src/renderer/components/layout/Sider/index.tsx packages/desktop/src/renderer/services/i18n/locales tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx
git commit -m "feat(enterprise): add AI workspace return entry"
```

## Task 3: Replace user-visible AI branding while retaining technical identifiers

**Files:**
- Modify: `packages/desktop/src/common/config/constants.ts:7-67`
- Modify: `packages/desktop/src/common/utils/appConfig.ts:20-27`
- Modify: `packages/desktop/src/renderer/components/layout/Layout.tsx:120-145,381-401`
- Modify: `packages/desktop/src/renderer/components/layout/Titlebar/index.tsx:105-110`
- Modify: `packages/desktop/src/renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx:131-148`
- Modify: `packages/desktop/src/renderer/components/agent/ChannelConflictWarning.tsx:20-82`
- Modify: `packages/desktop/src/renderer/hooks/assistant/useTalkToButler.ts:55-66`
- Modify: `packages/desktop/src/renderer/components/settings/SettingsModal/contents/FeedbackReportModal.tsx:190-202`
- Modify: `packages/desktop/src/renderer/components/settings/SettingsModal/contents/WebuiModalContent.tsx:664-674`
- Modify: `packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx:625-825`
- Modify: `packages/desktop/src/renderer/hooks/system/notification/useBrowserNotification.ts:45-56`
- Modify: `packages/desktop/src/process/utils/tray.ts:239-248`
- Modify: `packages/desktop/src/renderer/index.html:1-35`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/{zh-CN,en-US,ja-JP,zh-TW,ko-KR,tr-TR,ru-RU,uk-UA,pt-BR,de-DE}/{common,conversation,cron,login,preview,settings}.json`
- Modify: `tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx`
- Modify: `tests/unit/settings/AboutModalContent.dom.test.tsx`
- Modify: `tests/unit/renderer/useBrowserNotification.dom.test.tsx`
- Create: `tests/unit/common-config/brandDisplay.test.ts`

- [ ] **Step 1: Write failing display-brand contract tests**

Create `tests/unit/common-config/brandDisplay.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AI_PRODUCT_NAME } from '@/common/config/constants';

const projectRoot = resolve(__dirname, '../../..');
const localesRoot = resolve(projectRoot, 'packages/desktop/src/renderer/services/i18n/locales');

const collectStringValues = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectStringValues);
  return [];
};

describe('display brand contract', () => {
  it('exposes the approved AI product name without changing internal AionUi identifiers', () => {
    expect(AI_PRODUCT_NAME).toBe('链辽AI');

    const constants = readFileSync(
      resolve(projectRoot, 'packages/desktop/src/common/config/constants.ts'),
      'utf8'
    );
    expect(constants).toContain("AIONUI_TIMESTAMP_SEPARATOR = '_aionui_'");
  });

  it('uses the approved product name in static HTML metadata', () => {
    const html = readFileSync(resolve(projectRoot, 'packages/desktop/src/renderer/index.html'), 'utf8');

    expect(html).toContain('<title>链辽AI</title>');
    expect(html).toContain('name="application-name" content="链辽AI"');
    expect(html).not.toContain('<title>AionUi</title>');
  });

  it('does not expose the legacy display name through localized values', () => {
    const legacyValues: string[] = [];
    for (const localeName of readdirSync(localesRoot)) {
      const localeDir = resolve(localesRoot, localeName);
      for (const fileName of readdirSync(localeDir).filter((name) => name.endsWith('.json'))) {
        const document = JSON.parse(readFileSync(resolve(localeDir, fileName), 'utf8')) as unknown;
        legacyValues.push(...collectStringValues(document).filter((value) => value.includes('AionUi')));
      }
    }

    expect(legacyValues).toEqual([]);
  });
});
```

Update existing DOM assertions:

```tsx
// LayoutSiderBrandHome.dom.test.tsx
const wordmark = screen.getByText('链辽AI');
fireEvent.click(screen.getByText('链辽AI'));

// AboutModalContent.dom.test.tsx
it('shows the approved product name without changing upstream support links', () => {
  render(<AboutModalContent />);
  expect(screen.getByRole('heading', { name: '链辽AI' })).toBeVisible();
});

// useBrowserNotification.dom.test.tsx, after emitting a terminal event
expect(FakeNotification.instances[0].title).toBe('链辽AI');
```

- [ ] **Step 2: Run brand tests and verify they fail on legacy visible names**

Run:

```powershell
npx vitest run tests/unit/common-config/brandDisplay.test.ts tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx tests/unit/settings/AboutModalContent.dom.test.tsx tests/unit/renderer/useBrowserNotification.dom.test.tsx --no-file-parallelism
```

Expected: FAIL because `AI_PRODUCT_NAME` is missing and HTML, locales, wordmark, About, and notifications still expose `AionUi`.

- [ ] **Step 3: Add the shared display constant and use it on TypeScript surfaces**

Add to `packages/desktop/src/common/config/constants.ts`:

```ts
/** User-visible AI desktop product name. Do not use it for protocols, storage keys, or package scopes. */
export const AI_PRODUCT_NAME = '链辽AI';
```

Import and use `AI_PRODUCT_NAME` in the following exact places:

```ts
// common/utils/appConfig.ts
return appConfig?.name || AI_PRODUCT_NAME;

// renderer/components/layout/Titlebar/index.tsx
const appTitle = AI_PRODUCT_NAME;

// renderer/hooks/system/notification/useBrowserNotification.ts
const notification = new Notification(AI_PRODUCT_NAME, { body });

// process/utils/tray.ts
tray.setToolTip(AI_PRODUCT_NAME);
```

Use `{AI_PRODUCT_NAME}` for both `Layout.tsx` wordmarks and the `AboutModalContent.tsx` heading. Import from `@/common/config/constants` in every file. Preserve the existing logo SVG, upstream GitHub/website URLs, `aionui-open-update-modal`, and source license headers.

Use the same constant on the remaining hardcoded display fallbacks:

```tsx
// ChannelConflictWarning.tsx
<Text bold>OpenClaw is handling {platformName} messages, not {AI_PRODUCT_NAME}.</Text>
<Text type='error'>✗ Switching agents in {AI_PRODUCT_NAME} will have no effect</Text>
<Text bold>To use {AI_PRODUCT_NAME} Channels and switch agents:</Text>
<>Then restart OpenClaw and {AI_PRODUCT_NAME}.</>
<>Create a new {platformName} bot with different credentials for {AI_PRODUCT_NAME}.</>
<>Disable {platformName} in {AI_PRODUCT_NAME} Channels and continue using OpenClaw's integration.</>

// useTalkToButler.ts
defaultValue: `Enabled the ${AI_PRODUCT_NAME} Butler for you`,

// FeedbackReportModal.tsx
defaultValue: `I ran into a problem with ${AI_PRODUCT_NAME}, please help me diagnose it.\n\n[Module] {{module}}\n[Description] {{description}}\n[Attachments] see the screenshots in the input.\n\nPlease diagnose the cause and tell me how to fix it.`,

// WebuiModalContent.tsx
defaultValue: `Help me set up remote access so I can open ${AI_PRODUCT_NAME} from my phone or over the internet.`,

// ChannelModalContent.tsx
description: t('settings.channels.telegramDesc', `Chat with ${AI_PRODUCT_NAME} assistant via Telegram`),
description: t('settings.channels.larkDesc', `Chat with ${AI_PRODUCT_NAME} assistant via Lark or Feishu`),
description: t('settings.channels.dingtalkDesc', `Chat with ${AI_PRODUCT_NAME} assistant via DingTalk`),
description: t('settings.channels.weixinDesc', `Chat with ${AI_PRODUCT_NAME} assistant via WeChat`),
description: t('settings.channels.wecomDesc', `Chat with ${AI_PRODUCT_NAME} assistant via WeCom (Enterprise WeChat)`),
description: t('settings.channels.slackDesc', `Chat with ${AI_PRODUCT_NAME} assistant via Slack`),
description: t('settings.channels.discordDesc', `Chat with ${AI_PRODUCT_NAME} assistant via Discord`),
defaultValue: `Connect Telegram, Lark, and DingTalk to interact with ${AI_PRODUCT_NAME} from IM apps.`,
```

Do not change component comments, assistant manifest ID `aionui-assistant`, or upstream support URLs. The localized strings remain authoritative; these expressions only keep existing fallback behavior on the approved display brand.

- [ ] **Step 4: Update static HTML and all localized display values mechanically**

Change `index.html` metadata to:

```html
<meta name="application-name" content="链辽AI" />
<meta name="apple-mobile-web-app-title" content="链辽AI" />
<title>链辽AI</title>
```

Run this value-only JSON rewrite from the `AionUi` directory. It reads the supported languages/modules from the required config and never changes JSON keys:

```powershell
@'
const fs = require('node:fs');
const path = require('node:path');
const config = JSON.parse(fs.readFileSync('packages/desktop/src/common/config/i18n-config.json', 'utf8'));

const replaceValues = (value) => {
  if (typeof value === 'string') return value.replaceAll('AionUi', '链辽AI');
  if (Array.isArray(value)) return value.map(replaceValues);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceValues(child)]));
  }
  return value;
};

for (const language of config.supportedLanguages) {
  for (const moduleName of config.modules) {
    const file = path.join('packages/desktop/src/renderer/services/i18n/locales', language, `${moduleName}.json`);
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('AionUi')) continue;
    const updated = replaceValues(JSON.parse(source));
    fs.writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  }
}
'@ | node -
```

Do not replace uppercase `AIONUI_*`, lowercase `aionui`, URLs, keys, CSS classes, package scopes, event names, or copyright headers.

- [ ] **Step 5: Validate i18n and brand tests, then commit**

Run:

```powershell
npm run i18n:types
node scripts/check-i18n.js
npx vitest run tests/unit/common-config/brandDisplay.test.ts tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx tests/unit/settings/AboutModalContent.dom.test.tsx tests/unit/renderer/useBrowserNotification.dom.test.tsx --no-file-parallelism
```

Expected: i18n validation exits 0 and all four test files PASS. The locale-value scan finds no exact `AionUi` display values while technical keys remain intact.

Commit:

```powershell
git add packages/desktop/src/common/config/constants.ts packages/desktop/src/common/utils/appConfig.ts packages/desktop/src/renderer/components/layout/Layout.tsx packages/desktop/src/renderer/components/layout/Titlebar/index.tsx packages/desktop/src/renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx packages/desktop/src/renderer/components/agent/ChannelConflictWarning.tsx packages/desktop/src/renderer/hooks/assistant/useTalkToButler.ts packages/desktop/src/renderer/components/settings/SettingsModal/contents/FeedbackReportModal.tsx packages/desktop/src/renderer/components/settings/SettingsModal/contents/WebuiModalContent.tsx packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx packages/desktop/src/renderer/hooks/system/notification/useBrowserNotification.ts packages/desktop/src/process/utils/tray.ts packages/desktop/src/renderer/index.html packages/desktop/src/renderer/services/i18n/locales tests/unit/common-config/brandDisplay.test.ts tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx tests/unit/settings/AboutModalContent.dom.test.tsx tests/unit/renderer/useBrowserNotification.dom.test.tsx
git commit -m "feat(branding): present chain liao AI identity"
```

## Task 4: Preserve the legacy production user-data directory

**Files:**
- Create: `packages/desktop/src/common/platform/userDataPath.ts`
- Modify: `packages/desktop/src/common/platform/index.ts:1-80`
- Modify: `packages/desktop/src/process/utils/configureChromium.ts:7-30`
- Create: `tests/unit/process/userDataPath.test.ts`

- [ ] **Step 1: Write failing pure path and startup-order tests**

Create `tests/unit/process/userDataPath.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getDevAppName, resolveUserDataPath } from '@/common/platform/userDataPath';

describe('application userData compatibility', () => {
  const appDataRoot = path.resolve('test-app-data');
  const renamedDefault = path.join(appDataRoot, '链辽AI');

  it('keeps packaged builds on the legacy AionUi directory', () => {
    expect(resolveUserDataPath(renamedDefault, { isPackaged: true, isMultiInstance: false })).toBe(
      path.join(appDataRoot, 'AionUi')
    );
  });

  it('keeps normal and multi-instance development data isolated', () => {
    expect(resolveUserDataPath(renamedDefault, { isPackaged: false, isMultiInstance: false })).toBe(
      path.join(appDataRoot, 'AionUi-Dev')
    );
    expect(resolveUserDataPath(renamedDefault, { isPackaged: false, isMultiInstance: true })).toBe(
      path.join(appDataRoot, 'AionUi-Dev-2')
    );
    expect(getDevAppName(false)).toBe('AionUi-Dev');
    expect(getDevAppName(true)).toBe('AionUi-Dev-2');
  });

  it('rejects an empty Electron default path instead of silently choosing a new directory', () => {
    expect(() => resolveUserDataPath('  ', { isPackaged: true, isMultiInstance: false })).toThrow(
      'Electron userData path is required'
    );
  });

  it('loads Chromium path configuration before modules that can cache userData', () => {
    const entry = readFileSync(path.resolve('packages/desktop/src/index.ts'), 'utf8');
    const configureIndex = entry.indexOf("import './process/utils/configureChromium'");
    const sentryIndex = entry.indexOf("import { captureBackendStartupFailure");

    expect(configureIndex).toBeGreaterThanOrEqual(0);
    expect(configureIndex).toBeLessThan(sentryIndex);
  });
});
```

- [ ] **Step 2: Run the new test and verify the missing module failure**

Run:

```powershell
npx vitest run tests/unit/process/userDataPath.test.ts --no-file-parallelism
```

Expected: FAIL because `common/platform/userDataPath.ts` does not exist.

- [ ] **Step 3: Implement the pure resolver and re-export it**

Create `packages/desktop/src/common/platform/userDataPath.ts`:

```ts
import path from 'path';

const LEGACY_USER_DATA_DIRECTORY = 'AionUi';
const DEV_USER_DATA_DIRECTORY = 'AionUi-Dev';
const MULTI_INSTANCE_DEV_USER_DATA_DIRECTORY = 'AionUi-Dev-2';

export type UserDataPathOptions = {
  isPackaged: boolean;
  isMultiInstance: boolean;
};

/** Resolve the stable development app name without changing production display branding. */
export function getDevAppName(isMultiInstance = process.env.AIONUI_MULTI_INSTANCE === '1'): string {
  return isMultiInstance ? MULTI_INSTANCE_DEV_USER_DATA_DIRECTORY : DEV_USER_DATA_DIRECTORY;
}

/** Keep packaged upgrades on the pre-branding data directory and isolate development instances. */
export function resolveUserDataPath(defaultUserDataPath: string, options: UserDataPathOptions): string {
  if (!defaultUserDataPath.trim()) {
    throw new Error('Electron userData path is required');
  }

  const directoryName = options.isPackaged
    ? LEGACY_USER_DATA_DIRECTORY
    : getDevAppName(options.isMultiInstance);
  return path.join(path.dirname(defaultUserDataPath), directoryName);
}
```

Remove the old `getDevAppName` definition from `common/platform/index.ts`, import the two functions from `./userDataPath`, and re-export them:

```ts
import { getDevAppName, resolveUserDataPath } from './userDataPath';
export { getDevAppName, resolveUserDataPath } from './userDataPath';
```

Also remove the now-unused `import path from 'path'` from `common/platform/index.ts`; path operations belong only to the new pure resolver.

- [ ] **Step 4: Apply the resolver at both early Electron entry points**

In `configureChromium.ts`, replace the development-only block with:

```ts
import { getDevAppName, resolveUserDataPath } from '@/common/platform';

const isMultiInstance = process.env.AIONUI_MULTI_INSTANCE === '1';
const defaultUserDataPath = app.getPath('userData');
if (!app.isPackaged) {
  app.setName(getDevAppName(isMultiInstance));
}
app.setPath(
  'userData',
  resolveUserDataPath(defaultUserDataPath, {
    isPackaged: app.isPackaged,
    isMultiInstance,
  })
);
```

In the Electron browser branch of `common/platform/index.ts`, replace the development-only path block with the same order and an unconditional `app.setPath`:

```ts
const isMultiInstance = process.env.AIONUI_MULTI_INSTANCE === '1';
const defaultUserDataPath = app.getPath('userData');
if (!app.isPackaged) {
  app.setName(getDevAppName(isMultiInstance));
}
app.setPath(
  'userData',
  resolveUserDataPath(defaultUserDataPath, {
    isPackaged: app.isPackaged,
    isMultiInstance,
  })
);
```

The packaged branch must not call `app.setName('AionUi')`; only its storage path remains legacy.

- [ ] **Step 5: Run path, storage, and development-runtime regressions, then commit**

Run:

```powershell
npx vitest run tests/unit/process/userDataPath.test.ts tests/unit/enterprise/enterpriseSessionStore.test.ts tests/unit/enterprise/enterpriseRuntimeConfig.test.ts --no-file-parallelism
```

Expected: all three files PASS. Production resolves to `AionUi`, development resolves to `AionUi-Dev`, and the enterprise API runtime policy is unchanged.

Commit:

```powershell
git add packages/desktop/src/common/platform/userDataPath.ts packages/desktop/src/common/platform/index.ts packages/desktop/src/process/utils/configureChromium.ts tests/unit/process/userDataPath.test.ts
git commit -m "fix(branding): preserve legacy user data path"
```

## Task 5: Rename installed products and local desktop release assets

**Files:**
- Modify: `package.json:1-12,258-264`
- Modify: `packages/desktop/electron-builder.yml:1-10,118-184`
- Modify: `scripts/create-mock-release-artifacts.sh:1-85`
- Modify: `scripts/prepare-release-assets.sh:126-151`
- Modify: `scripts/verify-release-assets.sh:60-80`
- Modify: `tests/unit/releasePackagingConfig.test.ts:1-80`

- [ ] **Step 1: Write failing installed-identity and release-fixture tests**

Replace the stale workflow-only assertion in `releasePackagingConfig.test.ts` with a packaging identity contract that is present in this checkout:

```ts
it('brands installed desktop surfaces while retaining update and protocol identity', () => {
  const rootPackage = JSON.parse(readProjectFile('package.json')) as {
    name: string;
    productName: string;
  };
  const config = readProjectFile('packages/desktop/electron-builder.yml');

  expect(rootPackage.name).toBe('AionUi');
  expect(rootPackage.productName).toBe('链辽AI');
  expect(config).toContain('appId: com.aionui.app');
  expect(config).toContain('productName: 链辽AI');
  expect(config).toContain('executableName: 链辽AI');
  expect(config).toContain('shortcutName: ${productName}');
  expect(config).toContain('uninstallDisplayName: ${productName}');
  expect(config).toMatch(/schemes:\s*\n\s*- aionui/);
  expect(config).toContain('repo: AionUi');
});

it('uses the branded prefix in local desktop release validation only', () => {
  const prepare = readProjectFile('scripts/prepare-release-assets.sh');
  const verify = readProjectFile('scripts/verify-release-assets.sh');

  expect(prepare).toContain('asset="链辽AI-${VERSION}-mac-${arch}.${ext}"');
  expect(verify).toContain('链辽AI-1.0.0-win-x64.exe');
  expect(verify).toContain('aionui-web-1.0.0-${plat}.tar.gz');
});
```

Update the missing-zip test fixture path from `AionUi-1.0.0-mac-arm64.zip` to `链辽AI-1.0.0-mac-arm64.zip`.

- [ ] **Step 2: Run the release config test and verify it fails on the old installed name**

Run:

```powershell
npx vitest run tests/unit/releasePackagingConfig.test.ts --no-file-parallelism
```

Expected: FAIL on `productName`, `executableName`, Linux desktop name, and release artifact prefixes.

- [ ] **Step 3: Update builder and root product display metadata**

Apply these exact builder values:

```yaml
appId: com.aionui.app
productName: 链辽AI
executableName: 链辽AI
copyright: Copyright © 2024 AionUi

protocols:
  - name: 链辽AI Protocol
    schemes:
      - aionui
```

Set the Linux desktop entry to `Name: 链辽AI`. Keep `Icon: AionUi`, `maintainer: aionui`, `vendor: aionui`, `repo: AionUi`, all `${productName}` artifact templates, and `appId` unchanged. In root `package.json`, change only:

```json
"productName": "链辽AI"
```

- [ ] **Step 4: Rename local desktop release fixtures without changing updater service examples**

In `create-mock-release-artifacts.sh`, replace the exact desktop filename prefix `AionUi-1.0.0` with `链辽AI-1.0.0` in `touch`, `url`, and `path` entries. Do not alter `aionui-web-*` tarballs.

In `prepare-release-assets.sh`, use:

```bash
asset="链辽AI-${VERSION}-mac-${arch}.${ext}"
```

In `verify-release-assets.sh`, use:

```bash
for f in 链辽AI-1.0.0-win-x64.exe 链辽AI-1.0.0-win-arm64.exe 链辽AI-1.0.0-mac-x64.dmg 链辽AI-1.0.0-mac-arm64.dmg 链辽AI-1.0.0.deb 链辽AI-1.0.0-arm64.deb; do
```

Do not change updater/CDN unit fixtures that intentionally model existing upstream `AionUi-*` release assets, and do not change `scripts/install-ubuntu.sh`, which still targets the retained upstream update service.

- [ ] **Step 5: Run release-fixture tests, verify package metadata, and commit**

Run:

```powershell
npx vitest run tests/unit/releasePackagingConfig.test.ts --no-file-parallelism
```

Expected: PASS, including the deliberate missing macOS zip failure path.

Commit:

```powershell
git add package.json packages/desktop/electron-builder.yml scripts/create-mock-release-artifacts.sh scripts/prepare-release-assets.sh scripts/verify-release-assets.sh tests/unit/releasePackagingConfig.test.ts
git commit -m "build(branding): rename desktop distribution"
```

## Task 6: Run complete regression, package, and real Electron acceptance

**Files:**
- Verify only; no production file should be edited in this task unless a failing check reveals a defect in Tasks 1-5.

- [ ] **Step 1: Run formatting, i18n, and TypeScript checks**

Run:

```powershell
npx oxfmt --check packages/desktop/src/common/config/constants.ts packages/desktop/src/common/platform/userDataPath.ts packages/desktop/src/common/platform/index.ts packages/desktop/src/process/utils/configureChromium.ts packages/desktop/src/process/utils/tray.ts packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css packages/desktop/src/renderer/components/layout/Sider packages/desktop/src/renderer/components/layout/Layout.tsx packages/desktop/src/renderer/components/layout/Titlebar/index.tsx tests/unit/enterprise/enterpriseResponsiveShell.test.ts tests/unit/enterprise/EnterpriseRouter.dom.test.tsx tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx tests/unit/common-config/brandDisplay.test.ts tests/unit/process/userDataPath.test.ts tests/unit/releasePackagingConfig.test.ts
npm run i18n:types
node scripts/check-i18n.js
npm run typecheck:enterprise-tests
```

Expected: every command exits 0; i18n reports no missing or extra keys.

- [ ] **Step 2: Run the focused regression suite serially**

Run:

```powershell
npx vitest run tests/unit/enterprise tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx tests/unit/renderer/useBrowserNotification.dom.test.tsx tests/unit/settings/AboutModalContent.dom.test.tsx tests/unit/common-config/brandDisplay.test.ts tests/unit/process/userDataPath.test.ts tests/unit/releasePackagingConfig.test.ts --no-file-parallelism
```

Expected: all selected files PASS. Use the serial flag because this repository has a confirmed resource-sensitive parallel jsdom timeout unrelated to product behavior.

- [ ] **Step 3: Build the renderer/main bundles and Windows installer**

Run:

```powershell
npm run package
npm run dist:win
```

Expected: both commands exit 0; the configured `out` builder directory contains a Windows installer whose filename starts with `链辽AI-`, and the unpacked package still contains `resources/bundled-aioncore/win32-x64/aioncore.exe`.

- [ ] **Step 4: Verify actual desktop scroll and navigation behavior**

Start the development Electron app and verify these exact cases with F12/CDP:

1. At a normal desktop width, `.enterprise-shell` client height equals the viewport height.
2. On dashboard, company, product, project, and detail routes with more than one screen of content, `.enterprise-shell__main.scrollHeight` is greater than its `clientHeight` and the last row/card is reachable.
3. At a short window height, enterprise navigation and the assistant can scroll independently without stretching the shell.
4. At `780px` and below, the document scrolls naturally and `.enterprise-shell__main` does not create a second vertical scrollbar.
5. Changing from `/enterprise/companies` to `/enterprise/products` resets the main pane to `scrollTop === 0`; changing only `?page=` preserves it.
6. In AI routes and settings, the bottom entry remains visible both expanded and collapsed; clicking it enters `/enterprise/dashboard` or the existing enterprise login guard.
7. The enterprise AI action displays `进入链辽AI` and still routes to `/guid`.
8. F12 continues to open and close DevTools in development mode.

- [ ] **Step 5: Verify installed branding and data continuity**

Using a copy of an existing `%APPDATA%\AionUi` profile, install the new Windows package and verify:

1. Installer, executable, Start Menu shortcut, desktop shortcut, window, tray tooltip, About page, AI wordmark, and uninstall entry display `链辽AI`.
2. The existing login/session, model configuration, conversation history, window bounds, and enterprise openid session remain available.
3. No new `%APPDATA%\链辽AI` directory is used for application state.
4. Development mode continues to use `%APPDATA%\AionUi-Dev` (or `AionUi-Dev-2` for multi-instance mode).
5. `com.aionui.app`, `aionui://`, `@aionui/*`, `AIONUI_*`, and existing storage keys remain unchanged.

- [ ] **Step 6: Confirm repository state**

Run:

```powershell
git status --short
git log -6 --oneline
```

Expected: no uncommitted production/test changes remain; the five implementation commits appear after this plan commit. Do not push unless the user explicitly requests it.
