# Enterprise Assistant Default-Collapsed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Chain Liaoning enterprise workbench assistant panel start collapsed on every entry while preserving the current-session toggle and forced hiding on realtime-service routes.

**Architecture:** Keep assistant visibility as component-local React state and change only its initial value. Update the existing router DOM test to assert the initial accessibility state, expansion behavior, re-collapse behavior, and reset after the enterprise shell remounts; no persistence layer is introduced.

**Tech Stack:** React 19, TypeScript, React Router, Ant Design, Vitest 4, Testing Library.

---

## File map

- Modify `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx`: initialize the assistant as closed.
- Modify `LianLiaoAIPC/tests/unit/enterprise/EnterpriseRouter.dom.test.tsx`: enforce default-close, toggle, remount reset, and realtime-route behavior.

### Task 1: Define the default-collapsed route behavior

**Files:**
- Modify: `LianLiaoAIPC/tests/unit/enterprise/EnterpriseRouter.dom.test.tsx`

- [ ] **Step 1: Replace the old default-open toggle test**

Replace `lets keyboard and pointer users collapse and restore the assistant slot` with:

```ts
it('starts with the assistant collapsed and lets users expand and collapse it for the current shell session', async () => {
  renderAt('/enterprise/dashboard');

  const showButton = await screen.findByRole(
    'button',
    { name: 'enterprise.assistant.actions.show' },
    ROUTE_WAIT_OPTIONS
  );
  const assistant = screen.getByRole('complementary', {
    name: 'enterprise.accessibility.assistant',
  });

  expect(showButton).toHaveAttribute('aria-expanded', 'false');
  expect(assistant).toHaveAttribute('aria-hidden', 'true');

  await userEvent.click(showButton);
  const hideButton = screen.getByRole('button', { name: 'enterprise.assistant.actions.hide' });
  expect(hideButton).toHaveAttribute('aria-expanded', 'true');
  expect(assistant).toHaveAttribute('aria-hidden', 'false');

  await userEvent.click(hideButton);
  expect(screen.getByRole('button', { name: 'enterprise.assistant.actions.show' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  expect(assistant).toHaveAttribute('aria-hidden', 'true');
});
```

- [ ] **Step 2: Add a remount reset test**

Add:

```ts
it('returns to the collapsed default after the enterprise shell is remounted', async () => {
  const view = renderAt('/enterprise/dashboard');
  await userEvent.click(
    await screen.findByRole(
      'button',
      { name: 'enterprise.assistant.actions.show' },
      ROUTE_WAIT_OPTIONS
    )
  );
  expect(screen.getByRole('button', { name: 'enterprise.assistant.actions.hide' })).toHaveAttribute(
    'aria-expanded',
    'true'
  );

  view.unmount();
  renderAt('/enterprise/dashboard');

  expect(
    await screen.findByRole(
      'button',
      { name: 'enterprise.assistant.actions.show' },
      ROUTE_WAIT_OPTIONS
    )
  ).toHaveAttribute('aria-expanded', 'false');
});
```

- [ ] **Step 3: Update the compact-window assertion**

Change:

```ts
expect(screen.getByRole('button', { name: 'enterprise.assistant.actions.hide' })).toBeVisible();
```

to:

```ts
expect(screen.getByRole('button', { name: 'enterprise.assistant.actions.show' })).toBeVisible();
```

- [ ] **Step 4: Run the focused test and verify it fails**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
bunx vitest run tests/unit/enterprise/EnterpriseRouter.dom.test.tsx
```

Expected: the new initial-state assertions fail because `assistantOpen` still initializes to `true`.

- [ ] **Step 5: Commit the failing UI contract**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao
git add -- LianLiaoAIPC/tests/unit/enterprise/EnterpriseRouter.dom.test.tsx
git commit -m "test(ui): 定义工作台助手默认收起行为"
```

### Task 2: Initialize the assistant panel as collapsed

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx`

- [ ] **Step 1: Change only the initial state**

Replace:

```ts
const [assistantOpen, setAssistantOpen] = useState(true);
```

with:

```ts
// Each enterprise-workbench entry starts with maximum space for business data.
// Users can expand the assistant for the current mounted session; the choice is intentionally not persisted.
const [assistantOpen, setAssistantOpen] = useState(false);
```

Do not add localStorage, a database preference, or a route effect that resets state during ordinary navigation inside the still-mounted enterprise shell.

- [ ] **Step 2: Run the focused DOM test**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
bunx vitest run tests/unit/enterprise/EnterpriseRouter.dom.test.tsx
```

Expected: all `EnterpriseRouter` DOM tests pass.

- [ ] **Step 3: Run enterprise type checking**

```powershell
bun run typecheck:enterprise-tests
```

Expected: exit 0.

- [ ] **Step 4: Run the related realtime-service integration test**

```powershell
bunx vitest run tests/integration/enterprise/customerServiceWorkbench.dom.test.tsx
```

Expected: all customer-service workbench tests pass, confirming the assistant remains unavailable on forced-hide routes.

- [ ] **Step 5: Commit the implementation**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao
git add -- `
  LianLiaoAIPC/packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx `
  LianLiaoAIPC/tests/unit/enterprise/EnterpriseRouter.dom.test.tsx
git commit -m "feat(ui): 工作台默认收起助手面板"
```

### Task 3: Verify the rendered workbench behavior

**Files:**
- No production file changes.

- [ ] **Step 1: Start the Electron development client**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
bun run dev
```

Expected: Electron starts with developer tools available according to the existing development configuration.

- [ ] **Step 2: Verify the initial workspace layout**

Log in and open `#/enterprise/dashboard`. Confirm:

```text
- The right assistant panel is not visible.
- The main work area uses the released horizontal space.
- The header shows the “展开助手面板” control.
- The page does not gain horizontal overflow.
```

- [ ] **Step 3: Verify current-session toggling**

Click “展开助手面板”, confirm the panel and “链辽AI” content appear, then click “收起助手面板” and confirm the main content expands again.

- [ ] **Step 4: Verify reset and forced-hide routes**

Leave the enterprise shell, re-enter the dashboard, and confirm the panel is collapsed again. Open online consultation or customer-service reception and confirm no assistant toggle or assistant panel appears.

- [ ] **Step 5: Run final focused verification**

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
bunx vitest run `
  tests/unit/enterprise/EnterpriseRouter.dom.test.tsx `
  tests/integration/enterprise/customerServiceWorkbench.dom.test.tsx
bun run typecheck:enterprise-tests
```

Expected: all commands pass.

