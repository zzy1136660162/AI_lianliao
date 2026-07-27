# LianLiaoAIPC - Project Guide

## 链辽品牌与兼容规则

- 用户可见桌面名称固定为“链上辽宁·产业云城 AI桌面平台”；AI 功能区名称固定为“链上辽宁·产业云城AI助手”。
- Electron `appId` 和 Windows AUMID 固定为 `com.lianliao.app`。
- NSIS 必须保留 GUID `f3bfde38-8429-545c-a4e9-a078d87dee6c`，确保旧 `com.aionui.app` 安装可以覆盖升级。
- 正式、开发和第二开发实例数据目录分别为 `LianLiaoAIPC`、`LianLiaoAIPC-Dev`、`LianLiaoAIPC-Dev-2`。
- 数据迁移只复制和校验，禁止自动删除旧 `AionUi*` 目录。
- 新链接生成 `lianliao://`，但必须继续解析 `aionui://`。
- 正式构建只能使用 `zzy1136660162/AI_lianliao` Release 和 `aioncore-release-lock.json` 中的 SHA256；禁止上游和 `latest` 回退。
- 私有 Release 下载只允许通过已登录的 `gh` CLI 或进程环境中的 `GH_TOKEN` / `GITHUB_TOKEN` 鉴权；严禁把令牌写入源码、文档、日志或 Git 历史。
- `aioncore.exe`、`@aionui/*` 包名、存储键、REST/WS/MCP 契约属于内部兼容标识，不做品牌式批量重命名。

All contributors (human and AI) must follow [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR. ([Chinese version](CONTRIBUTING.zh.md))

## Code Conventions

### File & Directory Structure

- **Directory size limit**: Prefer ≤ **10** direct children per directory; new or substantially reorganized directories must satisfy this.

See [docs/contributing/file-structure.md](docs/contributing/file-structure.md) for complete rules. Agents must also follow the `architecture` skill (`.claude/skills/architecture/SKILL.md`) when creating files or modules.

### Naming

- **Components**: PascalCase (`Button.tsx`, `Modal.tsx`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Hooks**: camelCase with `use` prefix (`useTheme.ts`)
- **Constants files**: camelCase (`constants.ts`) — values inside use UPPER_SNAKE_CASE
- **Type files**: camelCase (`types.ts`)
- **Style files**: kebab-case or `ComponentName.module.css`
- **Unused params**: prefix with `_`

### UI Library & Icons

- **Components**: `@arco-design/web-react` — no raw interactive HTML (`<button>`, `<input>`, `<select>`, etc.)
- **Icons**: `@icon-park/react`

### CSS

- Prefer **UnoCSS utility classes**; complex styles use **CSS Modules** (`ComponentName.module.css`)
- Colors must use **semantic tokens** from `uno.config.ts` or CSS variables — no hardcoded values
- Arco theme overrides go in `packages/desktop/src/renderer/styles/arco-override.css`; component-scoped Arco overrides use CSS Module with `:global()`
- Global styles only in `packages/desktop/src/renderer/styles/`

Formatting rules (Oxfmt, Prettier-compatible):

- Single-element arrays that fit on one line → inline: `[{ id: 'a', value: 'b' }]`
- Trailing commas required in multi-line arrays/objects
- Single quotes for strings

### TypeScript

- Strict mode enabled — no `any`, no implicit returns
- Use path aliases: `@/*`, `@process/*`, `@renderer/*`
- Prefer `type` over `interface` (per Oxlint config)
- English for code comments; JSDoc for public functions

### Internationalization (i18n)

New or changed user-facing text must use i18n keys; do not introduce hardcoded strings. Languages and modules are defined in `packages/desktop/src/common/config/i18n-config.json`.

See the `i18n` skill (`.claude/skills/i18n/SKILL.md`) for complete workflow, key naming, and validation steps.

## Architecture

Two process types — never mix their APIs:

| Process  | Path                             | Restriction     |
| -------- | -------------------------------- | --------------- |
| Main     | `packages/desktop/src/process/`  | No DOM APIs     |
| Renderer | `packages/desktop/src/renderer/` | No Node.js APIs |

Cross-process communication must go through the IPC bridge (`packages/desktop/src/preload/`).
See [docs/architecture/overview.md](docs/architecture/overview.md) for details.

### 手动 HTTP 代理维护约束

- 配置键固定为 `system.httpProxy`，只能由主进程通过 `ProcessConfig` 和 IPC 读写；渲染进程或业务模块不得直接访问存储。
- 业务 HTTP/WS 调用不得复制代理 URL 的解析、校验或 Agent 创建逻辑，必须复用 `manualHttpProxy`、`manualHttpProxyRuntime` 和相应 factory。
- 主进程中的版本查询、安装包下载等 Electron 网络请求必须使用 `electron.net.fetch`，不得使用不会继承 `defaultSession` 代理的 Node 全局 `fetch`。
- `localhost`、整个 `127.0.0.0/8` IPv4 环回网段、`::1` 等环回目标必须绕过手动代理并保持直连。
- 日志和错误上报禁止输出完整 proxy URL、ticket、openid；需要诊断时只记录不含敏感值的状态和原因码。
- 新增 `ManualHttpProxyFailureReason` reason 时，必须同步更新 UI i18n 的穷尽映射、全部 10 个 locale 和对应测试，禁止依赖默认分支吞掉新原因。
- 保存操作只持久化配置，不得局部热应用；所有网络入口在用户确认重启后统一应用新配置。
- provider 的所有执行路径都必须以 fulfilled 状态返回纯数据，失败也要转换为可序列化结果；禁止 reject 或遗留未决 Promise 导致调用挂起。

## Testing

**Framework**: Vitest 4 (`vitest.config.ts`). Project coverage target is ≥ 80%; ordinary changes should add focused tests for changed behavior.

```bash
bun run test              # run all tests
bun run test:coverage     # with coverage report
```

See the `testing` skill (`.claude/skills/testing/SKILL.md`) for complete workflow and quality rules.

## Workflow

### 链辽 AI 桌面安装包发布

- 默认发布服务器：`10.2.202.23`
- 默认上传目录：`/mnt/web/beiruan_ai/desktop_lianliao`
- 当用户要求上传链辽 AI 的桌面安装包时，默认使用该 SSH 目标上传，不再重复询问服务器地址与目录。
- 上传后必须在远端执行 `sha256sum` 和文件大小校验，确认与本地构建产物一致后，才能将下载地址用于版本发布记录。
- 正式版本发布仍须使用 HTTPS 下载地址；该服务器目录的公网 HTTPS 映射需要在写入数据库前确认。

### Scope & Enforcement

- **Hard blockers**: process boundary violations, TypeScript errors, failing tests, unsafe IPC usage, missing i18n for new or changed user-facing text, and raw interactive HTML in new UI.
- **Current-change requirements**: naming, CSS, file placement, tests, docs, directory size, and single-file-directory rules apply to files created or meaningfully modified by the current change.
- **Ratchet rules**: existing directory size or single-file-directory violations do not require cleanup during ordinary feature work or bugfixes, but the current change must not make them worse.
- **No scope expansion**: implementation plans and reviews must not create extra tasks, phases, or acceptance criteria for cleanup unless the user asks for that scope.

### During Development

Auto-fix as you edit:

```bash
bun run lint:fix       # auto-fix lint issues (oxlint)
bun run format         # auto-format all files (oxfmt)
bunx tsc --noEmit      # verify no type errors
```

If your changes touch `packages/desktop/src/renderer/`, `locales/`, or `packages/desktop/src/common/config/i18n`, also run:

```bash
bun run i18n:types
node scripts/check-i18n.js
```

### Before Pushing

AI agents must not push unless explicitly asked. When pushing, use `just push`, never `git push`:

```bash
just push                          # lint → format-check → typecheck → test → git push
just push -u origin feat/branch    # same checks, with extra git push args
```

Any step that fails aborts the push. Fix the issue, commit, then retry.

> **Note for AI agents**: `just push` uses `--quiet` for lint — only errors cause failure. The project has many pre-existing lint _warnings_ which do NOT indicate failure. Judge success by exit code, not by output volume.

### Before PR (optional stricter check)

`prek` replicates the **exact CI pipeline** (includes end-of-file, trailing whitespace checks on all file types):

```bash
# One-time setup
npm install -g @j178/prek

# Run
prek run --from-ref origin/main --to-ref HEAD
```

> `prek` is read-only — it reports but does not fix. If it reports issues, run the auto-fix commands above, commit, then re-run.

### Commit & PR Format

Commits and PR titles must follow the Conventional Commit format defined in [CONTRIBUTING.md](CONTRIBUTING.md):

```text
<type>(<scope>): <subject>
```

Allowed types: `feat`, `fix`, `perf`, `refactor`, `docs`, `style`, `chore`, `test`, `ci`, `build`.

**NEVER add AI signatures** (Co-Authored-By, Generated with, etc.).

## Skills Index

| Skill            | Purpose                                                                     | Triggers                                                                                               |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **architecture** | File & directory structure conventions for all process types                | Creating files, adding modules, architectural decisions                                                |
| **i18n**         | Internationalization workflow and standards                                 | Adding or changing user-facing text, modifying `locales/` or `packages/desktop/src/common/config/i18n` |
| **testing**      | Testing workflow and quality standards                                      | Writing tests, changing runtime behavior, fixing bugs, or claiming behavior is verified                |
| **bump-version** | Version bump workflow: update package.json, checks, branch, PR, tag release | Bumping version, `/bump-version`                                                                       |

> Skills are located in `.claude/skills/` and contain project conventions that apply to **all** agents and contributors.
