# 企业功能开发运行时设计

> 日期：2026-07-15  
> 状态：已确认，待实施

## 目标

修正 Electron 开发版错误请求线上企业服务的问题，并明确开发版与生产版的调试边界。

## 已确认需求

- Electron 开发版的企业接口基础地址固定为 `http://127.0.0.1:12580/`。
- 企业路由继续使用现有的 `cloud-api/...` 相对路径，因此开发版完整请求形如 `http://127.0.0.1:12580/cloud-api/CommonWxGZHQrCodeLogIn/desktop/create`。
- 生产版企业接口固定使用 `https://cloud.lslnii.com/`，不允许通过环境变量切换到本地或其他主机。
- 开发版按 `F12` 可以打开或关闭主窗口 DevTools，并继续保留现有 CDP 调试能力。
- 生产版完全禁止 DevTools，包括键盘、菜单和主进程 IPC 入口；生产版继续禁用 CDP。

## 方案选择

采用主进程统一运行策略。企业 API 配置和 DevTools 权限都由 `app.isPackaged` 决定，并通过可独立测试的纯函数或小型适配器表达。

未采用以下方案：

- 不在多个现有文件中分别内联 `app.isPackaged` 判断，避免生产安全边界分散。
- 不使用构建环境变量决定企业服务地址，避免错误的构建环境把本地地址带入生产包。
- 不注册系统级 `globalShortcut`，避免应用未聚焦时抢占系统 `F12`。
- 不只在渲染器监听键盘事件，避免焦点位于 `webview` 或页面异常时快捷键失效。

## 企业 API 配置

新增一个主进程侧的运行时配置解析单元，输入为是否已打包，输出为 `EnterpriseApiClient` 的受控配置：

| 运行模式 | `environment` | `baseUrl` |
| --- | --- | --- |
| 开发版 | `development` | `http://127.0.0.1:12580/` |
| 生产版 | `production` | `https://cloud.lslnii.com/` |

`enterpriseBridge` 只从该解析单元创建默认客户端。测试注入的 `apiClient` 继续优先，不改变现有 IPC 测试方式。

现有 `EnterpriseApiClient` 的 URL 白名单保持不变：开发环境允许 `localhost` 和 `127.0.0.1`，生产环境只允许 `https://cloud.lslnii.com/`。

## DevTools 策略

主窗口创建时显式设置 `webPreferences.devTools`：开发版为 `true`，生产版为 `false`。这构成生产版的最终强制边界。

开发版在主窗口的 `webContents.before-input-event` 上监听 `F12` 的按下事件：

- 仅处理 `keyDown`，忽略输入法组合状态和自动重复产生的非目标事件。
- 命中后阻止默认行为，并调用 `webContents.openDevTools()` 或 `closeDevTools()` 完成切换。
- 仅影响当前应用主窗口，不注册系统级快捷键。

生产版还会移除应用菜单中的 `toggleDevTools` 项，并让现有 `open-dev-tools` IPC 返回关闭状态，不执行打开操作。渲染器中已有的设置或隐藏入口即使被触发，也无法越过主进程限制。

开发版现有 CDP 默认开启、生产版默认关闭的策略保持不变。

## 错误处理与安全边界

- 本地服务未启动时继续返回现有 `NETWORK` 或 `TIMEOUT` 错误，不静默回退到线上服务。
- 本地服务返回非 2xx 时继续返回 `HTTP` 错误，不使用线上服务兜底。
- 生产版不会读取开发企业服务地址环境变量。
- 本次不修改二维码登录协议、`openid` 传递方式、企业接口路径或后端实现。

## 测试与验收

实施采用 TDD，先增加失败测试，再编写生产代码。

自动化测试至少覆盖：

1. 开发模式解析为 `http://127.0.0.1:12580/` 和 `development`。
2. 生产模式解析为 `https://cloud.lslnii.com/` 和 `production`。
3. 开发模式 `F12` 能打开和关闭 DevTools，并阻止默认事件。
4. 生产模式 `F12` 不触发 DevTools。
5. 生产模式的 IPC 调试入口不能打开 DevTools。
6. 应用菜单仅在开发模式包含 `toggleDevTools`。

开发联调验收：

- 启动 `http://127.0.0.1:12580/` 对应后端后，企业登录创建请求必须命中本地 `cloud-api`。
- 在开发版主窗口连续按 `F12`，DevTools 能打开和关闭。
- 构建检查和相关企业、主进程单元测试通过。

## 范围外事项

- 不为本地服务增加自动启动能力。
- 不新增环境切换 UI。
- 不修改生产域名、网关或后端部署流程。
- 不开放生产版远程调试。
