# 企业工作台 Ant Design 与 ECharts 全量迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将企业登录与企业工作台完整迁移到 Ant Design React，接入 ECharts，并完成搜索、图表、翻页定位和状态卡片布局优化。

**Architecture:** 非企业页面继续使用 Arco Design；企业路由通过专用 `ConfigProvider` 获得隔离的 Ant Design 主题。业务 hook、API、schema 和路由保持不变；ECharts 通过一个生命周期组件和纯 option 构建函数接入。

**Tech Stack:** React 19、TypeScript、Ant Design 6.5.1、ECharts 6.1.0、CSS Modules、Vitest、Testing Library、Electron Vite。

---

## 文件结构

新增文件：

- `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseAntdProvider.tsx`：企业 Ant Design 语言、主题和弹层容器边界。
- `packages/desktop/src/renderer/pages/enterprise/layout/useEnterprisePaginationScroll.ts`：分页后定位列表顶部的统一行为。
- `packages/desktop/src/renderer/pages/enterprise/charts/EnterpriseChart.tsx`：ECharts 初始化、更新、resize 和销毁。
- `packages/desktop/src/renderer/pages/enterprise/charts/projectChartOptions.ts`：把已校验项目数据转换为 ECharts option。
- `tests/unit/enterprise/enterpriseAntdMigration.test.ts`：依赖、企业 Arco 清理和样式作用域契约。
- `tests/unit/enterprise/EnterpriseAntdProvider.dom.test.tsx`：Provider 主题与本地化契约。
- `tests/unit/enterprise/useEnterprisePaginationScroll.dom.test.tsx`：滚动行为与减少动态效果测试。
- `tests/unit/enterprise/EnterpriseChart.dom.test.tsx`：图表实例生命周期测试。
- `tests/unit/enterprise/projectChartOptions.test.ts`：图表数据映射和空数据测试。

主要修改文件：

- `package.json`、`bun.lock`
- `packages/desktop/src/renderer/styles/enterprise-theme.css`
- `packages/desktop/src/renderer/pages/enterprise/layout/*`
- `packages/desktop/src/renderer/pages/enterprise/login/*`
- `packages/desktop/src/renderer/pages/enterprise/companies/*Page.tsx`、`CompanyQuickView.tsx`、`company-catalog.module.css`
- `packages/desktop/src/renderer/pages/enterprise/products/*Page.tsx`、`ProductQuickView.tsx`、`product-catalog.module.css`
- `packages/desktop/src/renderer/pages/enterprise/projects/Project*.tsx`、`project-workspace.module.css`
- `packages/desktop/src/renderer/pages/enterprise/dashboard/*.tsx`、`dashboard-workbench.module.css`
- 对应 `tests/unit/enterprise/*.dom.test.tsx` 和 CSS 契约测试。

## Task 1：安装依赖并建立企业 Ant Design Provider

**Files:**

- Modify: `package.json`
- Modify: `bun.lock`
- Create: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseAntdProvider.tsx`
- Create: `tests/unit/enterprise/enterpriseAntdMigration.test.ts`
- Create: `tests/unit/enterprise/EnterpriseAntdProvider.dom.test.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/login/EnterpriseLoginPage.tsx`

- [ ] **Step 1：编写依赖和 Provider 失败测试**

```ts
// tests/unit/enterprise/enterpriseAntdMigration.test.ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
expect(packageJson.dependencies.antd).toBe('^6.5.1');
expect(packageJson.dependencies.echarts).toBe('^6.1.0');

const provider = readFileSync(
  resolve('packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseAntdProvider.tsx'),
  'utf8'
);
expect(provider).toContain("from 'antd'");
expect(provider).toContain("from 'antd/locale/zh_CN'");
expect(provider).not.toContain('reset.css');
```

```tsx
// tests/unit/enterprise/EnterpriseAntdProvider.dom.test.tsx
const configProviderProps = vi.fn();
vi.mock('antd', () => ({
  App: ({ children }: PropsWithChildren) => <>{children}</>,
  ConfigProvider: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => {
    configProviderProps(props);
    return <>{children}</>;
  },
}));

render(
  <EnterpriseAntdProvider>
    <button>child</button>
  </EnterpriseAntdProvider>
);
expect(screen.getByRole('button', { name: 'child' })).toBeVisible();
expect(configProviderProps).toHaveBeenCalledWith(
  expect.objectContaining({
    prefixCls: 'll-ant',
    theme: expect.objectContaining({
      token: expect.objectContaining({ fontFamily: expect.stringContaining('Microsoft YaHei') }),
    }),
  })
);
```

- [ ] **Step 2：运行测试并确认因依赖和 Provider 缺失而失败**

Run: `npx --no-install vitest run tests/unit/enterprise/enterpriseAntdMigration.test.ts tests/unit/enterprise/EnterpriseAntdProvider.dom.test.tsx --maxWorkers=1 --no-file-parallelism`

Expected: FAIL，提示 `antd`、`echarts` 依赖或 `EnterpriseAntdProvider.tsx` 缺失。

- [ ] **Step 3：安装锁定范围依赖**

Run: `bun add antd@^6.5.1 echarts@^6.1.0`

Expected: `package.json` 和 `bun.lock` 更新，安装过程无 peer dependency 错误。

- [ ] **Step 4：实现企业 Provider**

```tsx
import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { PropsWithChildren } from 'react';

const EnterpriseAntdProvider = ({ children }: PropsWithChildren) => (
  <ConfigProvider
    locale={zhCN}
    prefixCls='ll-ant'
    getPopupContainer={(trigger) =>
      (trigger?.closest('.enterprise-shell, .enterprise-login') as HTMLElement | null) ?? document.body
    }
    theme={{
      cssVar: { prefix: 'll-ant' },
      token: {
        colorPrimary: '#2878ff',
        colorText: '#102a43',
        colorTextSecondary: '#6b7f93',
        colorBorder: '#d8e6f5',
        colorBgContainer: '#ffffff',
        colorBgLayout: '#f4f8ff',
        borderRadius: 10,
        fontFamily: "'Microsoft YaHei', '微软雅黑', 'Segoe UI', Arial, sans-serif",
      },
      components: { Card: { borderRadiusLG: 15 }, Table: { headerBg: '#f8fbff' } },
    }}
  >
    <App>{children}</App>
  </ConfigProvider>
);

export default EnterpriseAntdProvider;
```

在 `EnterpriseShell` 和 `EnterpriseLoginPage` 的企业根节点外包裹 `EnterpriseAntdProvider`，不包裹 Router 里的非企业 fallback。

- [ ] **Step 5：运行测试并确认通过**

Run: `npx --no-install vitest run tests/unit/enterprise/enterpriseAntdMigration.test.ts tests/unit/enterprise/EnterpriseAntdProvider.dom.test.tsx --maxWorkers=1 --no-file-parallelism`

Expected: PASS。

- [ ] **Step 6：提交**

```bash
git add package.json bun.lock packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseAntdProvider.tsx packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx packages/desktop/src/renderer/pages/enterprise/login/EnterpriseLoginPage.tsx tests/unit/enterprise/enterpriseAntdMigration.test.ts tests/unit/enterprise/EnterpriseAntdProvider.dom.test.tsx
git commit -m "构建(企业工作台): 接入 Ant Design 与 ECharts"
```

## Task 2：迁移通用状态、头部和侧栏

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/EnterprisePageState.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseHeader.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseSider.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css`
- Modify: `tests/unit/enterprise/EnterprisePageState.dom.test.tsx`
- Modify: `tests/unit/enterprise/EnterpriseRouter.dom.test.tsx`

- [ ] **Step 1：把状态测试断言改为 Ant Design DOM 契约**

```tsx
expect(container.querySelector('.ll-ant-spin')).toBeInTheDocument();
expect(container.querySelector('.arco-spin')).not.toBeInTheDocument();
expect(screen.getByRole('alert')).toHaveTextContent('safe-error-description');
```

为路由测试增加企业壳内 `.ll-ant-btn` 存在、`.enterprise-shell .arco-btn` 不存在的断言。

- [ ] **Step 2：运行定向测试并确认失败**

Run: `npx --no-install vitest run tests/unit/enterprise/EnterprisePageState.dom.test.tsx tests/unit/enterprise/EnterpriseRouter.dom.test.tsx --maxWorkers=1 --no-file-parallelism`

Expected: FAIL，现有企业组件仍输出 `.arco-*`。

- [ ] **Step 3：迁移三个通用组件**

```tsx
// EnterprisePageState.tsx
import { Alert, Button, Empty, Spin } from 'antd';

if (state === 'loading') {
  return (
    <section className='enterprise-page-state enterprise-page-state--loading' role='status' aria-label={title}>
      <Spin size='large' />
      <p>{title}</p>
    </section>
  );
}
```

`EnterpriseHeader`、`EnterpriseSider` 的 Button 改为 `antd` 导入；保留现有 `aria-expanded`、退出错误和路由链接逻辑。CSS 中 `.enterprise-page-state--error .arco-alert` 改为 `.enterprise-page-state--error .ll-ant-alert`。

- [ ] **Step 4：运行测试并确认通过**

Run: `npx --no-install vitest run tests/unit/enterprise/EnterprisePageState.dom.test.tsx tests/unit/enterprise/EnterpriseRouter.dom.test.tsx --maxWorkers=1 --no-file-parallelism`

Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add packages/desktop/src/renderer/pages/enterprise/layout tests/unit/enterprise/EnterprisePageState.dom.test.tsx tests/unit/enterprise/EnterpriseRouter.dom.test.tsx
git commit -m "重构(企业工作台): 迁移通用布局到 Ant Design"
```

## Task 3：迁移扫码登录与注册提示

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/login/EnterpriseLoginPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/login/EnterpriseRegistrationPanel.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/login/enterprise-login.css`
- Modify: `tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx`
- Modify: `tests/unit/enterprise/enterpriseLoginCss.test.ts`

- [ ] **Step 1：增加登录页 Ant Design 与样式隔离断言**

```tsx
expect(container.querySelector('.enterprise-login .ll-ant-card')).toBeInTheDocument();
expect(container.querySelector('.enterprise-login .ll-ant-spin')).toBeInTheDocument();
expect(container.querySelector('.enterprise-login [class*="arco-"]')).not.toBeInTheDocument();
```

```ts
expect(loginCss).toContain('.ll-ant-card-body');
expect(loginCss).not.toMatch(/\.arco-/);
```

- [ ] **Step 2：运行登录测试并确认失败**

Run: `npx --no-install vitest run tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx tests/unit/enterprise/enterpriseLoginCss.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: FAIL，登录页仍使用 Arco Card、Alert、Button、Spin。

- [ ] **Step 3：迁移登录组件并保留登录状态机**

```tsx
import { Alert, Button, Card, Spin } from 'antd';

<Card className='enterprise-login__stage-card' bordered>
  <Spin spinning={status === 'creating' || status === 'checking'} size='large'>
    {qrCode}
  </Spin>
</Card>;
```

`EnterpriseRegistrationPanel` 使用 Ant Design Alert、Button、Spin；保留二维码注册链接、倒计时、重试、返回扫码和安全错误文案。CSS 选择器改为 `.ll-ant-card-body`、`.ll-ant-alert`。

- [ ] **Step 4：运行登录与认证回归测试**

Run: `npx --no-install vitest run tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx tests/unit/enterprise/EnterpriseAuthContext.dom.test.tsx tests/unit/enterprise/enterpriseLoginCss.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add packages/desktop/src/renderer/pages/enterprise/login tests/unit/enterprise/EnterpriseLoginPage.dom.test.tsx tests/unit/enterprise/enterpriseLoginCss.test.ts
git commit -m "重构(企业登录): 迁移扫码流程到 Ant Design"
```

## Task 4：实现分页后自动定位

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/layout/useEnterprisePaginationScroll.ts`
- Create: `tests/unit/enterprise/useEnterprisePaginationScroll.dom.test.tsx`

- [ ] **Step 1：编写滚动行为失败测试**

```tsx
const Probe = () => {
  const { targetRef, scrollToTarget } = useEnterprisePaginationScroll<HTMLDivElement>();
  return (
    <>
      <div ref={targetRef}>list-top</div>
      <button onClick={scrollToTarget}>page</button>
    </>
  );
};

await userEvent.click(screen.getByRole('button', { name: 'page' }));
expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
requestAnimationFrameMock.mock.calls[0][0](0);
expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
```

另加 `matchMedia('(prefers-reduced-motion: reduce)')` 为 true 时 `behavior: 'auto'` 的测试。

- [ ] **Step 2：运行测试并确认模块缺失失败**

Run: `npx --no-install vitest run tests/unit/enterprise/useEnterprisePaginationScroll.dom.test.tsx --maxWorkers=1 --no-file-parallelism`

Expected: FAIL，模块不存在。

- [ ] **Step 3：实现通用 hook**

```ts
import { useCallback, useRef } from 'react';

export const useEnterprisePaginationScroll = <T extends HTMLElement>() => {
  const targetRef = useRef<T>(null);
  const scrollToTarget = useCallback(() => {
    window.requestAnimationFrame(() => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      targetRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  }, []);
  return { targetRef, scrollToTarget };
};
```

- [ ] **Step 4：运行测试并确认通过**

Run: `npx --no-install vitest run tests/unit/enterprise/useEnterprisePaginationScroll.dom.test.tsx --maxWorkers=1 --no-file-parallelism`

Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add packages/desktop/src/renderer/pages/enterprise/layout/useEnterprisePaginationScroll.ts tests/unit/enterprise/useEnterprisePaginationScroll.dom.test.tsx
git commit -m "功能(企业列表): 增加分页自动定位"
```

## Task 5：迁移企业库列表、详情和快速预览

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyListPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyDetailPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/CompanyQuickView.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`
- Modify: `tests/unit/enterprise/CompanyListPage.dom.test.tsx`
- Modify: `tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts`

- [ ] **Step 1：增加 Ant 表格和分页定位失败测试**

```tsx
expect(container.querySelector('.ll-ant-table')).toBeInTheDocument();
expect(container.querySelector('.arco-table')).not.toBeInTheDocument();
await userEvent.click(screen.getByTitle('2'));
flushAnimationFrame();
expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
expect(request.mock.calls[1]?.[0]).toMatchObject({ payload: { pageNum: 2, pageSize: 20 } });
```

- [ ] **Step 2：运行企业库测试并确认失败**

Run: `npx --no-install vitest run tests/unit/enterprise/CompanyListPage.dom.test.tsx tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: FAIL，仍输出 Arco 表格或没有滚动调用。

- [ ] **Step 3：迁移企业库**

```tsx
import { Button, Form, Input, Pagination, Select, Table, type TableColumnsType } from 'antd';
import { useEnterprisePaginationScroll } from '../layout/useEnterprisePaginationScroll';

const { targetRef, scrollToTarget } = useEnterprisePaginationScroll<HTMLDivElement>();
const changePage = (pageNum: number, pageSize: number) => {
  setSelectedCompany(null);
  catalog.changePage(pageNum, pageSize);
  scrollToTarget();
};

<div ref={targetRef} className={styles.tablePanel}>
  <Table rowKey='companyId' columns={columns} dataSource={catalog.data.list} pagination={false} />
  <Pagination
    current={catalog.query.pageNum}
    pageSize={catalog.query.pageSize}
    total={catalog.data.total}
    showQuickJumper
    showSizeChanger
    pageSizeOptions={[10, 20, 50]}
    onChange={changePage}
  />
</div>;
```

表单使用 `onFinish`，Input 使用 `event.target.value`；详情和预览的 Card、Tag、Button 全部切换到 Ant Design。CSS 中企业库 `.arco-*` 全部替换为 `.ll-ant-*`。

- [ ] **Step 4：运行企业库测试并确认通过**

Run: `npx --no-install vitest run tests/unit/enterprise/CompanyListPage.dom.test.tsx tests/unit/enterprise/companyData.test.ts tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add packages/desktop/src/renderer/pages/enterprise/companies tests/unit/enterprise/CompanyListPage.dom.test.tsx tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts
git commit -m "重构(企业库): 全量迁移到 Ant Design"
```

## Task 6：迁移产品库列表、详情和快速预览

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/products/ProductListPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/ProductDetailPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/ProductQuickView.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css`
- Modify: `tests/unit/enterprise/ProductListPage.dom.test.tsx`
- Modify: `tests/unit/enterprise/productCatalogResponsiveCss.test.ts`

- [ ] **Step 1：增加 Ant 组件与卡片列表定位失败测试**

```tsx
expect(container.querySelector('.enterprise-product-list .ll-ant-pagination')).toBeInTheDocument();
await userEvent.click(screen.getByTitle('2'));
flushAnimationFrame();
expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
expect(screen.queryByText('selected-product-preview')).not.toBeInTheDocument();
```

- [ ] **Step 2：运行产品库测试并确认失败**

Run: `npx --no-install vitest run tests/unit/enterprise/ProductListPage.dom.test.tsx tests/unit/enterprise/productCatalogResponsiveCss.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: FAIL，分页仍为 Arco 或没有自动定位。

- [ ] **Step 3：迁移产品库**

```tsx
import { Button, Form, Input, Pagination, Tag } from 'antd';

const { targetRef, scrollToTarget } = useEnterprisePaginationScroll<HTMLDivElement>();
const changePage = (pageNum: number, pageSize: number) => {
  setSelectedProduct(null);
  catalog.changePage(pageNum, pageSize);
  scrollToTarget();
};

<div ref={targetRef} className={styles.gridPanel}>
  <div className={styles.productGrid}>{cards}</div>
  <Pagination showQuickJumper showSizeChanger onChange={changePage} />
</div>;
```

把产品列表筛选、详情、预览的 Button、Form、Input、Pagination、Card、Tag 替换为 Ant Design；图片安全解析与错误降级不变。CSS 删除产品目录全部 `.arco-*`。

- [ ] **Step 4：运行产品库测试并确认通过**

Run: `npx --no-install vitest run tests/unit/enterprise/ProductListPage.dom.test.tsx tests/unit/enterprise/productData.test.ts tests/unit/enterprise/productCatalogResponsiveCss.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add packages/desktop/src/renderer/pages/enterprise/products tests/unit/enterprise/ProductListPage.dom.test.tsx tests/unit/enterprise/productCatalogResponsiveCss.test.ts
git commit -m "重构(产品库): 全量迁移到 Ant Design"
```

## Task 7：迁移在建项目并修复状态卡片宽度

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectTable.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectDetailPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectQuickView.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css`
- Modify: `tests/unit/enterprise/ProjectPage.dom.test.tsx`
- Modify: `tests/unit/enterprise/enterpriseResponsiveShell.test.ts`

- [ ] **Step 1：增加项目 Ant 表格、分页定位和全宽状态断言**

```tsx
expect(container.querySelector('.ll-ant-table')).toBeInTheDocument();
await userEvent.click(screen.getByTitle('2'));
flushAnimationFrame();
expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
```

```ts
const stateRule = projectCss.match(/\.workspace\s*>\s*:global\(\.enterprise-page-state\)[^{]*\{([^}]*)\}/s)?.[1] ?? '';
expect(stateRule).toMatch(/width:\s*100%/);
expect(stateRule).toMatch(/box-sizing:\s*border-box/);
```

- [ ] **Step 2：运行项目测试并确认失败**

Run: `npx --no-install vitest run tests/unit/enterprise/ProjectPage.dom.test.tsx tests/unit/enterprise/enterpriseResponsiveShell.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: FAIL，项目组件仍是 Arco，状态规则没有 100% 宽度。

- [ ] **Step 3：迁移项目组件并接入滚动引用**

```tsx
// ProjectTable.tsx
import { Button, Pagination, Table, Tag, type TableColumnsType } from 'antd';

export type ProjectTableProps = {
  listTopRef: React.Ref<HTMLDivElement>;
  onPageChange: (pageNum: number, pageSize: number) => void;
  // 保留 page、loading、selected、onSelect、onViewDetails
};

<div ref={listTopRef} className={styles.tablePanel}>
  <Table rowKey='hpInfoId' columns={columns} dataSource={page.list} pagination={false} />
  <Pagination showQuickJumper showSizeChanger onChange={onPageChange} />
</div>;
```

`ProjectPage` 使用 Ant Form、Input、InputNumber、Button，并在 `changePage` 中清理预览、更新分页、调用 `scrollToTarget`。详情和快速预览迁移 Card、Tag、Alert、Button。

- [ ] **Step 4：修复状态卡片宽度**

```css
.workspace > :global(.enterprise-page-state),
.detailContent > :global(.enterprise-page-state) {
  width: 100%;
  box-sizing: border-box;
  min-height: min(430px, calc(100vh - 320px));
}
```

把项目 CSS 中 `.arco-*` 替换为 `.ll-ant-*`，保留表格可聚焦行和选中行样式。

- [ ] **Step 5：运行项目回归测试**

Run: `npx --no-install vitest run tests/unit/enterprise/ProjectPage.dom.test.tsx tests/unit/enterprise/projectData.test.ts tests/unit/enterprise/enterpriseResponsiveShell.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: PASS。

- [ ] **Step 6：提交**

```bash
git add packages/desktop/src/renderer/pages/enterprise/projects tests/unit/enterprise/ProjectPage.dom.test.tsx tests/unit/enterprise/enterpriseResponsiveShell.test.ts
git commit -m "重构(在建项目): 迁移 Ant Design 并统一列表状态"
```

## Task 8：使用 Ant Design AutoComplete 优化全局搜索

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/dashboard/GlobalSearch.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css`
- Modify: `tests/unit/enterprise/DashboardPage.dom.test.tsx`
- Modify: `tests/unit/enterprise/DashboardSearchStyles.test.ts`

- [ ] **Step 1：增加自动完成、键盘和独立滚动失败测试**

```tsx
expect(container.querySelector('.ll-ant-select-auto-complete')).toBeInTheDocument();
await user.type(screen.getByRole('combobox'), 'pump');
await user.keyboard('{ArrowDown}{Enter}');
expect(mockNavigate).toHaveBeenCalledWith('/enterprise/companies/11');
```

```ts
const resultRule = css.match(/\.searchResults\s*\{([^}]*)\}/s)?.[1] ?? '';
expect(resultRule).toMatch(/max-height:/);
expect(resultRule).toMatch(/overflow-y:\s*auto/);
```

- [ ] **Step 2：运行搜索测试并确认失败**

Run: `npx --no-install vitest run tests/unit/enterprise/DashboardPage.dom.test.tsx tests/unit/enterprise/DashboardSearchStyles.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: FAIL，没有 Ant AutoComplete 或结果面板滚动契约。

- [ ] **Step 3：实现分组 AutoComplete**

```tsx
import { Alert, AutoComplete, Button, Empty, Input, Spin } from 'antd';

const statusOptions = search.isLoading
  ? [
      {
        value: '__loading',
        disabled: true,
        label: <SearchStatus icon={<Spin />} text={t('enterprise.dashboard.search.loading')} />,
      },
    ]
  : search.result?.errorCode
    ? [{ value: '__error', disabled: true, label: <SearchTotalError onRetry={search.retry} /> }]
    : showEmpty
      ? [{ value: '__empty', disabled: true, label: <Empty description={t('enterprise.dashboard.search.empty')} /> }]
      : null;
const antOptions =
  statusOptions ??
  groups.map((group) => ({
    label: <SearchGroupTitle kind={group.kind} errorCode={group.errorCode} />,
    options: group.options.map((option) => ({
      value: option.path,
      label: <SearchOptionContent option={option} />,
      option,
    })),
  }));

<AutoComplete
  value={query}
  options={antOptions}
  open={resultsOpen}
  onSelect={(_value, item) => {
    if ('option' in item && item.option) choose(item.option);
  }}
  onChange={(value) => setQuery(value)}
  classNames={{ popup: { root: styles.searchResults } }}
>
  <Input.Search maxLength={100} aria-label={t('enterprise.dashboard.search.ariaLabel')} allowClear />
</AutoComplete>;
```

保留现有 `useDashboardSearch`、300ms 防抖、最小字符数、三个业务分组、局部错误和安全导航路径。加载、总错误和空结果使用 disabled 状态 option，保证 Ant Design 在没有业务结果时仍能显示受控弹层；单组错误显示在对应分组标题。结果面板设置 `max-height` 与 `overflow-y: auto`。

- [ ] **Step 4：运行搜索测试并确认通过**

Run: `npx --no-install vitest run tests/unit/enterprise/DashboardPage.dom.test.tsx tests/unit/enterprise/dashboardData.test.ts tests/unit/enterprise/DashboardSearchStyles.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add packages/desktop/src/renderer/pages/enterprise/dashboard/GlobalSearch.tsx packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css tests/unit/enterprise/DashboardPage.dom.test.tsx tests/unit/enterprise/DashboardSearchStyles.test.ts
git commit -m "功能(企业工作台): 优化全局搜索体验"
```

## Task 9：封装 ECharts 生命周期和项目 option

**Files:**

- Create: `packages/desktop/src/renderer/pages/enterprise/charts/EnterpriseChart.tsx`
- Create: `packages/desktop/src/renderer/pages/enterprise/charts/projectChartOptions.ts`
- Create: `tests/unit/enterprise/EnterpriseChart.dom.test.tsx`
- Create: `tests/unit/enterprise/projectChartOptions.test.ts`

- [ ] **Step 1：编写生命周期和 option 失败测试**

```tsx
render(
  <EnterpriseChart
    ariaLabel='regions'
    option={{ series: [] }}
    rows={[{ label: '沈阳', value: 12 }]}
    fallback='chart unavailable'
  />
);
expect(init).toHaveBeenCalledTimes(1);
expect(setOption).toHaveBeenCalledWith({ series: [] }, { notMerge: true });
resizeObserverCallback();
expect(resize).toHaveBeenCalledTimes(1);
unmount();
expect(dispose).toHaveBeenCalledTimes(1);
expect(screen.getByRole('table', { name: 'regions data' })).toHaveTextContent('沈阳12');

init.mockImplementationOnce(() => {
  throw new Error('canvas unavailable');
});
render(
  <EnterpriseChart
    ariaLabel='regions'
    option={{ series: [] }}
    rows={[{ label: '沈阳', value: 12 }]}
    fallback='chart unavailable'
  />
);
expect(await screen.findByRole('status')).toHaveTextContent('chart unavailable');
expect(screen.getAllByRole('table', { name: 'regions data' }).at(-1)).toHaveTextContent('沈阳12');
```

```ts
expect(buildDistributionBarOption([{ label: '沈阳', value: 12 }], false)).toMatchObject({
  tooltip: { renderMode: 'richText' },
  yAxis: { data: ['沈阳'] },
  series: [{ type: 'bar', data: [12] }],
});
expect(buildDistributionBarOption([], false)).toBeNull();
expect(buildCategoryComparisonOption([], false)).toBeNull();
```

- [ ] **Step 2：运行测试并确认模块缺失失败**

Run: `npx --no-install vitest run tests/unit/enterprise/EnterpriseChart.dom.test.tsx tests/unit/enterprise/projectChartOptions.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: FAIL，两个模块不存在。

- [ ] **Step 3：实现按需 ECharts 注册与生命周期**

```tsx
import { BarChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { init, use, type EChartsCoreOption, type EChartsType } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef, useState, type ReactNode } from 'react';

use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type EnterpriseChartProps = {
  ariaLabel: string;
  option: EChartsCoreOption;
  rows: Array<{ label: string; value: string | number }>;
  fallback: ReactNode;
};

const EnterpriseChart = ({ ariaLabel, option, rows, fallback }: EnterpriseChartProps) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!elementRef.current) return;
    let chart: EChartsType;
    try {
      chart = init(elementRef.current);
    } catch {
      setFailed(true);
      return;
    }
    chartRef.current = chart;
    const resize = () => chart.resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    if (observer) observer.observe(elementRef.current);
    else window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', resize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);
  useEffect(() => chartRef.current?.setOption(option, { notMerge: true }), [option]);
  const dataTable = (
    <table className='enterprise-chart__data' aria-label={`${ariaLabel} data`}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th>{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  if (failed)
    return (
      <>
        <div role='status'>{fallback}</div>
        {dataTable}
      </>
    );
  return (
    <>
      <div ref={elementRef} className='enterprise-chart' role='img' aria-label={ariaLabel} />
      {dataTable}
    </>
  );
};
```

option 构建函数按数值降序、最多取 8 项；`reducedMotion` 为 true 时返回 `animation: false`。Tooltip 固定使用 `renderMode: 'richText'`，formatter 只返回纯文本标签和值，不拼接 HTML。`.enterprise-chart__data` 使用视觉隐藏样式保留屏幕阅读器可访问的原始数据；初始化失败时显示 `fallback`，不阻断同页列表和筛选。

- [ ] **Step 4：运行测试并确认通过**

Run: `npx --no-install vitest run tests/unit/enterprise/EnterpriseChart.dom.test.tsx tests/unit/enterprise/projectChartOptions.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add packages/desktop/src/renderer/pages/enterprise/charts tests/unit/enterprise/EnterpriseChart.dom.test.tsx tests/unit/enterprise/projectChartOptions.test.ts
git commit -m "功能(企业图表): 封装 ECharts 生命周期与数据映射"
```

## Task 10：将项目雷达和工作台统计迁移到 ECharts

**Files:**

- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/ProjectDashboard.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/dashboard/DashboardPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css`
- Modify: `tests/unit/enterprise/ProjectPage.dom.test.tsx`
- Modify: `tests/unit/enterprise/DashboardPage.dom.test.tsx`

- [ ] **Step 1：增加真实图表和空数据失败测试**

```tsx
expect(screen.getByRole('img', { name: 'enterprise.projects.dashboard.regionTitle' })).toBeVisible();
expect(screen.getByRole('img', { name: 'enterprise.projects.dashboard.materialTitle' })).toBeVisible();
expect(screen.getByRole('img', { name: 'enterprise.projects.dashboard.categoryTitle' })).toBeVisible();
```

空数组用例断言对应图表 role 不存在，并显示 `enterprise.projects.dashboard.distributionEmpty`。

- [ ] **Step 2：运行页面测试并确认失败**

Run: `npx --no-install vitest run tests/unit/enterprise/ProjectPage.dom.test.tsx tests/unit/enterprise/DashboardPage.dom.test.tsx --maxWorkers=1 --no-file-parallelism`

Expected: FAIL，当前页面仍输出 Progress 分布。

- [ ] **Step 3：替换项目仪表盘分布**

```tsx
const reducedMotion = useReducedMotion();
const regionOption = buildDistributionBarOption(dashboard.regionDistribution, reducedMotion);
const materialOption = buildDistributionBarOption(dashboard.materialTop, reducedMotion);
const categoryOption = buildCategoryComparisonOption(drillItems, reducedMotion);

<Card title={t('enterprise.projects.dashboard.regionTitle')}>
  {regionOption ? (
    <EnterpriseChart
      ariaLabel={t('enterprise.projects.dashboard.regionTitle')}
      option={regionOption}
      rows={dashboard.regionDistribution}
      fallback={t('enterprise.projects.dashboard.distributionEmpty')}
    />
  ) : (
    <Empty />
  )}
</Card>;
```

材料和分类使用各自 option；KPI Statistic 保留 Ant Design 版本。DashboardPage 的项目雷达区复用相同构建函数，使用更紧凑的图表高度。

- [ ] **Step 4：增加响应式图表尺寸样式**

```css
.chartFrame,
:global(.enterprise-chart) {
  width: 100%;
  min-width: 0;
  height: 280px;
}

:global(.enterprise-chart__data) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 820px) {
  .insightGrid,
  .radarDistributions {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5：运行仪表盘测试并确认通过**

Run: `npx --no-install vitest run tests/unit/enterprise/ProjectPage.dom.test.tsx tests/unit/enterprise/DashboardPage.dom.test.tsx tests/unit/enterprise/projectChartOptions.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: PASS。

- [ ] **Step 6：提交**

```bash
git add packages/desktop/src/renderer/pages/enterprise/projects/ProjectDashboard.tsx packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css packages/desktop/src/renderer/pages/enterprise/dashboard/DashboardPage.tsx packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css tests/unit/enterprise/ProjectPage.dom.test.tsx tests/unit/enterprise/DashboardPage.dom.test.tsx
git commit -m "功能(企业工作台): 使用 ECharts 展示项目统计"
```

## Task 11：清理企业 Arco 痕迹并统一 Ant Design 主题样式

**Files:**

- Modify: `packages/desktop/src/renderer/styles/enterprise-theme.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/login/enterprise-login.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css`
- Modify: `packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css`
- Modify: `tests/unit/enterprise/enterpriseAntdMigration.test.ts`
- Modify: `tests/unit/enterprise/enterpriseVisualTheme.test.ts`

- [ ] **Step 1：强化企业零 Arco 契约测试**

```ts
const enterpriseRoot = resolve('packages/desktop/src/renderer/pages/enterprise');
const enterpriseSourceFiles = readdirSync(enterpriseRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(?:tsx|css)$/.test(entry.name))
  .map((entry) => resolve(entry.parentPath, entry.name));
for (const file of enterpriseSourceFiles) {
  const source = readFileSync(file, 'utf8');
  expect(source, file).not.toContain('@arco-design/web-react');
  if (file.endsWith('.css')) expect(source, file).not.toMatch(/\.arco-/);
}
expect(readFileSync(resolve('packages/desktop/src/renderer/main.tsx'), 'utf8')).not.toContain('antd/dist/reset.css');
```

- [ ] **Step 2：运行契约测试并列出所有残留**

Run: `npx --no-install vitest run tests/unit/enterprise/enterpriseAntdMigration.test.ts tests/unit/enterprise/enterpriseVisualTheme.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: 若有残留则 FAIL，并在断言消息中显示具体文件。

- [ ] **Step 3：清理残留并补齐企业 Ant 样式**

```css
.enterprise-shell,
.enterprise-login {
  --ll-ant-font-family: var(--enterprise-font-ui);
  color: var(--enterprise-text-primary);
}

.enterprise-shell :where(.ll-ant-btn, .ll-ant-input, .ll-ant-select, .ll-ant-table),
.enterprise-login :where(.ll-ant-btn, .ll-ant-card, .ll-ant-alert) {
  font-family: var(--enterprise-font-ui);
}
```

删除不再使用的 Arco 变量映射和选择器；保留非企业全局 Arco 导入与依赖。确认企业主区、侧栏、助手仍各自滚动，15px 卡片和亮色主题不变。

- [ ] **Step 4：运行所有 CSS 和迁移契约测试**

Run: `npx --no-install vitest run tests/unit/enterprise/enterpriseAntdMigration.test.ts tests/unit/enterprise/enterpriseVisualTheme.test.ts tests/unit/enterprise/enterpriseCatalogVisualCss.test.ts tests/unit/enterprise/enterpriseResponsiveShell.test.ts tests/unit/enterprise/DashboardSearchStyles.test.ts tests/unit/enterprise/enterpriseLoginCss.test.ts tests/unit/enterprise/productCatalogResponsiveCss.test.ts --maxWorkers=1 --no-file-parallelism`

Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add packages/desktop/src/renderer/styles/enterprise-theme.css packages/desktop/src/renderer/pages/enterprise tests/unit/enterprise
git commit -m "样式(企业工作台): 统一 Ant Design 品牌主题"
```

## Task 12：完整验证与实机验收

**Files:**

- Modify only if verification reveals a regression in the files already listed above.

- [ ] **Step 1：运行企业 TypeScript 检查**

Run: `node node_modules/.bun/typescript@5.9.3/node_modules/typescript/bin/tsc --noEmit`

Run: `node node_modules/.bun/typescript@5.9.3/node_modules/typescript/bin/tsc --noEmit --project tsconfig.enterprise-tests.json`

Expected: 两个命令均 exit 0。

- [ ] **Step 2：运行企业完整测试**

Run: `npx --no-install vitest run tests/unit/enterprise tests/integration/enterprise --maxWorkers=1 --no-file-parallelism`

Expected: 全部 PASS；若懒加载测试出现 5 秒资源抖动，先单文件复跑确认，再在无并行类型检查时复跑整套。

- [ ] **Step 3：运行格式、lint 与静态残留检查**

Run: `npx --no-install oxfmt --check packages/desktop/src/renderer/pages/enterprise packages/desktop/src/renderer/styles/enterprise-theme.css tests/unit/enterprise`

Run: `npx --no-install oxlint packages/desktop/src/renderer/pages/enterprise tests/unit/enterprise`

Run: `rg -n "@arco-design/web-react|\\.arco-" packages/desktop/src/renderer/pages/enterprise`

Expected: 格式和 lint exit 0；`rg` 无输出。

- [ ] **Step 4：启动 Electron 开发版并实机验收**

Run: `npm run start:multi`

检查：

- 扫码登录、无账号注册二维码和重试正常。
- 工作台搜索分组、键盘导航和独立滚动正常。
- 企业库、产品库、项目库筛选和详情正常。
- 三个列表翻页后只滚动中间业务区。
- 在建项目 loading、empty、error 卡片为全宽。
- ECharts 在窗口缩放、助手收起/展开和 760px 窄屏下自适应。
- 应用根主题切换为 dark 后企业页面仍保持亮色和可读对比度。
- 开发版 F12 可打开且控制台无新增 error。

- [ ] **Step 5：执行最终代码审查**

Review range: `git diff ddac99b..HEAD`

审查重点：企业零 Arco、Ant 弹层作用域、ECharts dispose、Tooltip 安全、分页滚动边界、登录与 ID 回归。修复所有 Critical/Important 后重新运行 Step 1-4。

- [ ] **Step 6：提交最终验证修复（仅在存在修复时）**

```bash
git add packages/desktop/src/renderer/pages/enterprise packages/desktop/src/renderer/styles/enterprise-theme.css tests/unit/enterprise
git commit -m "修复(企业工作台): 完成 Ant Design 迁移验收"
```

完成后工作区必须干净。本计划不自动推送远端。
