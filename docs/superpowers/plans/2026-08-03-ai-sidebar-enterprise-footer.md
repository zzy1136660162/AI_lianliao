# AI 助手侧栏底部导航统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“返回链辽工作台”与“设置”统一为同一套侧栏底部导航视觉和交互。

**Architecture:** 保留 `SiderEnterpriseEntry` 的独立语义与路由职责，将其渲染位置并入 `sider-footer`，并使用与设置入口相同的行级布局类。新增独立国际化键表达“返回链辽工作台”，不改变现有企业品牌名称。

**Tech Stack:** React、TypeScript、Arco Design Tooltip、Icon Park、UnoCSS、i18next、Vitest/Testing Library

---

### Task 1: 统一底部导航结构与文案

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/components/layout/Sider/index.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/components/layout/Sider/SiderFooter.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/components/layout/Sider/SiderEnterpriseEntry.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/*/enterprise.json`
- Regenerate: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`

- [ ] **Step 1: 将工作台入口纳入 Footer 组件契约**

为 `SiderFooter` 增加 `onEnterpriseClick`，在统一的 `sider-footer` 容器中先渲染 `SiderEnterpriseEntry`，再渲染设置行；从 `Sider/index.tsx` 删除 Footer 外部的独立入口。

- [ ] **Step 2: 让工作台入口使用与设置一致的行级布局**

将工作台入口改为与设置入口一致的 34px 高度、8px 圆角、22px 图标槽、8px 间距和 10px/8px 横向内边距；保留 `button` 语义、折叠 Tooltip 和移动端行为。

- [ ] **Step 3: 增加明确的返回文案**

在全部 locale 的 `enterprise.shell` 下增加 `backToWorkbench`，中文值为“返回链辽工作台”；执行：

```powershell
bun run i18n:types
node scripts/check-i18n.js
```

预期：i18n 类型生成和 10 个 locale 一致性检查退出码均为 0。

### Task 2: 回归交互和构建

**Files:**
- Modify: `LianLiaoAIPC/tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx`

- [ ] **Step 1: 更新结构与可访问性断言**

断言工作台入口位于 `.sider-footer` 内、使用 `enterprise.shell.backToWorkbench` 标签，点击仍跳转 `/enterprise/dashboard`，折叠和移动端 Tooltip 行为保持不变。

- [ ] **Step 2: 运行侧栏关键测试**

```powershell
bunx vitest run tests/unit/renderer/LayoutSiderBrandHome.dom.test.tsx
```

预期：该测试文件全部通过，无失败用例。

- [ ] **Step 3: 运行类型和生产资源构建验证**

```powershell
bunx tsc --noEmit
bun run package
```

预期：类型检查和 Electron Vite 生产资源构建退出码均为 0；允许现有第三方包的 chunk 和 `use client` 警告。

> 仓库规则禁止未经用户明确要求提交，因此本计划不包含 commit、push 或发布步骤。
