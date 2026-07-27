# 链上辽宁·产业云城AI助手品牌与全局 HTTP 代理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 AI 工作区标题和 Logo，并为 Electron、生产 WebSocket、AICore、Agent、MCP 与模型请求提供一份用户可配置的全局 HTTP 代理。

**Architecture:** 代理配置存入 Electron 启动阶段可读的 `ProcessConfig`，由主进程的单一代理服务负责校验、运行时环境生成和 Electron session 配置。渲染进程只通过 application IPC 读写配置；两个 Node.js WebSocket 客户端从同一服务获取代理 agent；AICore 在启动前继承代理环境变量。

**Tech Stack:** Electron 39、React 19、TypeScript、Arco Design、Vitest、Node.js `ws`、`https-proxy-agent`

**Design:** `docs/superpowers/specs/2026-07-24-ai-brand-global-http-proxy-design.md`

---

## 文件结构

### 新增文件

- `LianLiaoAIPC/packages/desktop/src/common/networkProxy/contracts.ts`
  - 定义可跨 IPC 克隆的代理配置、保存请求和响应类型。
- `LianLiaoAIPC/packages/desktop/src/process/services/network-proxy/manualHttpProxy.ts`
  - 负责地址校验、标准化、环境变量和 WebSocket agent 生成。
- `LianLiaoAIPC/packages/desktop/src/process/services/network-proxy/manualHttpProxy.test.ts`
  - 覆盖代理地址、环境变量和本地直连规则。
- `LianLiaoAIPC/packages/desktop/src/process/services/network-proxy/manualHttpProxyRuntime.ts`
  - 保存本次进程的代理基线和当前生效配置，配置 Electron session。
- `LianLiaoAIPC/packages/desktop/src/process/services/network-proxy/manualHttpProxyRuntime.test.ts`
  - 覆盖启用、禁用和恢复环境基线。

### 修改文件

- `LianLiaoAIPC/packages/desktop/src/common/config/constants.ts`
- `LianLiaoAIPC/packages/desktop/src/common/config/storage.ts`
- `LianLiaoAIPC/packages/desktop/src/common/adapter/ipcBridge.ts`
- `LianLiaoAIPC/packages/desktop/src/renderer/components/layout/Layout.tsx`
- `LianLiaoAIPC/packages/desktop/src/renderer/styles/layout.css`
- `LianLiaoAIPC/packages/desktop/src/process/bridge/applicationBridge.ts`
- `LianLiaoAIPC/packages/desktop/src/index.ts`
- `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/desktop-notification/desktopNotificationSocketClient.ts`
- `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/customer-service/customerServiceSocketClient.ts`
- `LianLiaoAIPC/packages/desktop/src/renderer/components/settings/SettingsModal/contents/SystemModalContent/index.tsx`
- `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/*/settings.json`
- `LianLiaoAIPC/README.md`
- `LianLiaoAIPC/AGENTS.md`

---

### Task 1: 统一 AI 标题和工作台 Logo

**Files:**

- Modify: `LianLiaoAIPC/packages/desktop/src/common/config/constants.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/components/layout/Layout.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/styles/layout.css`

- [ ] **Step 1: 修改 AI 功能区统一标题**

将常量改为：

```ts
/** Short brand retained for login, browser notifications, and existing feature copy. */
export const AI_PRODUCT_NAME = "链辽AI";

/** AI workspace heading used by the desktop sidebar and mobile title bar. */
export const AI_WORKSPACE_TITLE = "链上辽宁·产业云城AI助手";
```

- [ ] **Step 2: 使用企业工作台品牌资源**

在 `Layout.tsx` 引入：

```ts
import enterpriseBrandMark from "@renderer/assets/logos/brand/app-mark.png";
```

将侧栏头部历史内联 SVG 替换为：

```tsx
<span
  className={classNames("ai-brand-mark shrink-0", {
    "ai-brand-mark--collapsed": collapsed,
  })}
  onClick={onClick}
  aria-hidden="true"
>
  <img src={enterpriseBrandMark} alt="" />
</span>
```

标题节点统一增加 `ai-brand-title`，并保留设置页返回聊天的键盘交互：

```tsx
<div className="ai-brand-title text-t-primary collapsed-hidden font-semibold">
  {AI_WORKSPACE_TITLE}
</div>
```

- [ ] **Step 3: 添加长标题和 Logo 样式**

在 `layout.css` 增加：

```css
.ai-brand-mark {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
}

.ai-brand-mark img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.ai-brand-mark--collapsed {
  width: 24px;
  height: 24px;
  flex-basis: 24px;
}

.ai-brand-title {
  min-width: 0;
  font-size: 14px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 4: 运行品牌相关静态检查**

Run:

```powershell
cd E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
npx oxfmt --check packages/desktop/src/common/config/constants.ts packages/desktop/src/renderer/components/layout/Layout.tsx
npx oxlint packages/desktop/src/common/config/constants.ts packages/desktop/src/renderer/components/layout/Layout.tsx
```

Expected: exit code `0`，无格式和 lint 错误。

---

### Task 2: 建立单一代理配置和校验边界

**Files:**

- Create: `LianLiaoAIPC/packages/desktop/src/common/networkProxy/contracts.ts`
- Create: `LianLiaoAIPC/packages/desktop/src/process/services/network-proxy/manualHttpProxy.ts`
- Create: `LianLiaoAIPC/packages/desktop/src/process/services/network-proxy/manualHttpProxy.test.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/common/config/storage.ts`

- [ ] **Step 1: 定义 IPC 安全类型**

创建 `contracts.ts`：

```ts
export type ManualHttpProxyConfig = {
  enabled: boolean;
  url: string;
};

export type SaveManualHttpProxyRequest = ManualHttpProxyConfig;

export type ManualHttpProxyResult =
  | { success: true; config: ManualHttpProxyConfig; restartRequired: true }
  | { success: false; code: "INVALID_PROXY_URL"; message: string };
```

- [ ] **Step 2: 将配置键加入本地配置类型**

在 `IConfigStorageRefer` 中增加：

```ts
/** Electron-local manual proxy, read before AICore starts. */
'system.httpProxy'?: ManualHttpProxyConfig;
```

并从 `@/common/networkProxy/contracts` 导入 `ManualHttpProxyConfig`。

- [ ] **Step 3: 实现严格校验和标准化**

创建 `manualHttpProxy.ts`，包含以下公开 API：

```ts
import { HttpsProxyAgent } from "https-proxy-agent";
import type { ManualHttpProxyConfig } from "@/common/networkProxy/contracts";

export const LOOPBACK_NO_PROXY = "localhost,127.0.0.1,127.0.0.0/8,::1";

export class ManualHttpProxyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualHttpProxyValidationError";
  }
}

export function normalizeManualHttpProxyConfig(
  input: ManualHttpProxyConfig,
): ManualHttpProxyConfig {
  const enabled = input.enabled === true;
  const rawUrl = input.url.trim();
  if (!rawUrl) {
    if (enabled) throw new ManualHttpProxyValidationError("请输入 HTTP 代理地址");
    return { enabled: false, url: "" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ManualHttpProxyValidationError("代理地址格式无效");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ManualHttpProxyValidationError("代理地址仅支持 http:// 或 https://");
  }
  if (!parsed.hostname || !parsed.port) {
    throw new ManualHttpProxyValidationError("代理地址必须包含主机和端口");
  }
  if (parsed.username || parsed.password) {
    throw new ManualHttpProxyValidationError("当前版本暂不支持需要账号密码的代理");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new ManualHttpProxyValidationError("代理地址不能包含路径、查询参数或片段");
  }

  return { enabled, url: `${parsed.protocol}//${parsed.hostname}:${parsed.port}` };
}

export function isLoopbackWebSocketUrl(value: string): boolean {
  const hostname = new URL(value).hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

export function createWebSocketProxyAgent(
  targetUrl: string,
  config: ManualHttpProxyConfig | undefined,
): HttpsProxyAgent<string> | undefined {
  if (!config?.enabled || isLoopbackWebSocketUrl(targetUrl)) return undefined;
  return new HttpsProxyAgent(config.url);
}

export function buildProxyEnvironment(
  baseline: NodeJS.ProcessEnv,
  config: ManualHttpProxyConfig | undefined,
): NodeJS.ProcessEnv {
  const next = { ...baseline };
  if (!config?.enabled) return next;
  for (const key of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ]) {
    next[key] = config.url;
  }
  next.NO_PROXY = LOOPBACK_NO_PROXY;
  next.no_proxy = LOOPBACK_NO_PROXY;
  return next;
}
```

- [ ] **Step 4: 添加验证测试**

测试至少覆盖：

```ts
it.each([
  "socks5://127.0.0.1:7897",
  "http://user:pass@127.0.0.1:7897",
  "http://127.0.0.1",
  "http://127.0.0.1:7897/path",
])("rejects unsupported proxy URL %s", (url) => {
  expect(() => normalizeManualHttpProxyConfig({ enabled: true, url })).toThrow(
    ManualHttpProxyValidationError,
  );
});

it("normalizes a supported HTTP proxy URL", () => {
  expect(
    normalizeManualHttpProxyConfig({ enabled: true, url: " http://127.0.0.1:7897/ " }),
  ).toEqual({
    enabled: true,
    url: "http://127.0.0.1:7897",
  });
});

it("never proxies loopback websocket targets", () => {
  expect(createWebSocketProxyAgent("ws://127.0.0.1:12580/socket", config)).toBeUndefined();
});
```

- [ ] **Step 5: 运行代理单元测试**

Run:

```powershell
npx vitest run packages/desktop/src/process/services/network-proxy/manualHttpProxy.test.ts
```

Expected: 全部测试通过。

---

### Task 3: 建立主进程代理运行时和启动环境

**Files:**

- Create: `LianLiaoAIPC/packages/desktop/src/process/services/network-proxy/manualHttpProxyRuntime.ts`
- Create: `LianLiaoAIPC/packages/desktop/src/process/services/network-proxy/manualHttpProxyRuntime.test.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/index.ts`

- [ ] **Step 1: 实现进程级运行时**

运行时只保存当前进程状态，不自行读写文件：

```ts
import type { Session } from "electron";
import type { ManualHttpProxyConfig } from "@/common/networkProxy/contracts";
import {
  buildProxyEnvironment,
  createWebSocketProxyAgent,
  normalizeManualHttpProxyConfig,
} from "./manualHttpProxy";

const environmentBaseline = { ...process.env };
const managedEnvironmentKeys = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "NO_PROXY",
  "no_proxy",
] as const;
let activeConfig: ManualHttpProxyConfig = { enabled: false, url: "" };

export function configureManualHttpProxy(config: ManualHttpProxyConfig | undefined): void {
  activeConfig = normalizeManualHttpProxyConfig(config ?? { enabled: false, url: "" });
  const nextEnvironment = buildProxyEnvironment(environmentBaseline, activeConfig);
  for (const key of managedEnvironmentKeys) {
    const value = nextEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

export function getActiveManualHttpProxyConfig(): ManualHttpProxyConfig {
  return { ...activeConfig };
}

export function getActiveWebSocketProxyAgent(targetUrl: string) {
  return createWebSocketProxyAgent(targetUrl, activeConfig);
}

export async function applyManualHttpProxyToSession(electronSession: Session): Promise<void> {
  if (!activeConfig.enabled) {
    await electronSession.setProxy({ mode: "system" });
    await electronSession.closeAllConnections();
    return;
  }
  await electronSession.setProxy({
    mode: "fixed_servers",
    proxyRules: activeConfig.url,
    proxyBypassRules: "<-loopback>;localhost;127.0.0.1;[::1]",
  });
  await electronSession.closeAllConnections();
}
```

- [ ] **Step 2: 在启动 AICore 前加载配置**

在 `src/index.ts` 的 `initializeProcess()` 完成后、`backendManager.start()` 之前：

```ts
const savedProxyConfig = await ProcessConfig.get("system.httpProxy");
try {
  configureManualHttpProxy(savedProxyConfig);
  await applyManualHttpProxyToSession(session.defaultSession);
} catch (error) {
  console.warn("[NetworkProxy] Invalid saved proxy configuration; using system network settings");
  configureManualHttpProxy(undefined);
  await applyManualHttpProxyToSession(session.defaultSession);
}
```

需要从 Electron 导入 `session`，从 `initStorage` 导入 `ProcessConfig`，并导入运行时函数。该代码必须位于 AICore 启动前，确保 `backendManager.start()` 读取到更新后的 `process.env`。

- [ ] **Step 3: 测试环境基线恢复**

覆盖以下行为：

```ts
it("applies manual proxy variables without removing unrelated environment values", () => {
  configureManualHttpProxy({ enabled: true, url: "http://127.0.0.1:7897" });
  expect(process.env.HTTPS_PROXY).toBe("http://127.0.0.1:7897");
  expect(process.env.NO_PROXY).toContain("127.0.0.1");
});

it("restores startup proxy variables after manual proxy is disabled", () => {
  configureManualHttpProxy({ enabled: true, url: "http://127.0.0.1:7897" });
  configureManualHttpProxy({ enabled: false, url: "http://127.0.0.1:7897" });
  expect(process.env.HTTPS_PROXY).toBe(environmentValueCapturedByFixture);
});
```

- [ ] **Step 4: 运行运行时测试**

Run:

```powershell
npx vitest run packages/desktop/src/process/services/network-proxy/manualHttpProxyRuntime.test.ts
```

Expected: 全部测试通过，并且测试结束后进程环境恢复。

---

### Task 4: 增加 application IPC 与系统设置界面

**Files:**

- Modify: `LianLiaoAIPC/packages/desktop/src/common/adapter/ipcBridge.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/bridge/applicationBridge.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/components/settings/SettingsModal/contents/SystemModalContent/index.tsx`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/de-DE/settings.json`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/en-US/settings.json`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/ja-JP/settings.json`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/ko-KR/settings.json`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/pt-BR/settings.json`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/ru-RU/settings.json`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/tr-TR/settings.json`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/uk-UA/settings.json`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/zh-CN/settings.json`
- Modify: `LianLiaoAIPC/packages/desktop/src/renderer/services/i18n/locales/zh-TW/settings.json`

- [ ] **Step 1: 增加 IPC 合约**

在 `application` 中增加：

```ts
getManualHttpProxy: bridge.buildProvider<ManualHttpProxyConfig, void>('app.get-manual-http-proxy'),
saveManualHttpProxy: bridge.buildProvider<ManualHttpProxyResult, SaveManualHttpProxyRequest>(
  'app.save-manual-http-proxy'
),
```

- [ ] **Step 2: 注册主进程 provider**

在 `initApplicationBridge()` 中增加：

```ts
ipcBridge.application.getManualHttpProxy.provider(async () => {
  return normalizeManualHttpProxyConfig(
    (await ProcessConfig.get("system.httpProxy")) ?? { enabled: false, url: "" },
  );
});

ipcBridge.application.saveManualHttpProxy.provider(async (request) => {
  try {
    const config = normalizeManualHttpProxyConfig(request);
    await ProcessConfig.set("system.httpProxy", config);
    return { success: true, config, restartRequired: true };
  } catch (error) {
    if (error instanceof ManualHttpProxyValidationError) {
      return { success: false, code: "INVALID_PROXY_URL", message: error.message };
    }
    throw error;
  }
});
```

- [ ] **Step 3: 增加系统设置状态和保存操作**

使用 Arco `Input`、`Button`、`Switch`，新增状态：

```ts
const [manualProxy, setManualProxy] = useState<ManualHttpProxyConfig>({ enabled: false, url: "" });
const [manualProxyLoading, setManualProxyLoading] = useState(isDesktop);
const [manualProxySaving, setManualProxySaving] = useState(false);
const [manualProxyError, setManualProxyError] = useState<string | null>(null);
```

桌面模式初始化：

```ts
useEffect(() => {
  if (!isDesktop) return;
  void ipcBridge.application.getManualHttpProxy
    .invoke()
    .then(setManualProxy)
    .catch(() => setManualProxyError(t("settings.manualHttpProxyLoadFailed")))
    .finally(() => setManualProxyLoading(false));
}, [isDesktop, t]);
```

保存：

```ts
const handleSaveManualProxy = useCallback(async () => {
  setManualProxySaving(true);
  setManualProxyError(null);
  try {
    const result = await ipcBridge.application.saveManualHttpProxy.invoke(manualProxy);
    if (!result.success) {
      setManualProxyError(result.message);
      return;
    }
    setManualProxy(result.config);
    const restartResult = await ipcBridge.application.restart.invoke();
    notifyManualRestartRequired(restartResult, t);
  } catch {
    setManualProxyError(t("settings.manualHttpProxySaveFailed"));
  } finally {
    setManualProxySaving(false);
  }
}, [manualProxy, t]);
```

- [ ] **Step 4: 添加代理设置区域**

只在 `isDesktop` 时显示：

```tsx
<section className="px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px">
  <div>
    <div className="text-16px font-semibold text-1">{t("settings.networkProxy")}</div>
    <div className="text-13px text-3 mt-4px">{t("settings.manualHttpProxyDesc")}</div>
  </div>
  <PreferenceRow label={t("settings.manualHttpProxyEnabled")}>
    <Switch
      checked={manualProxy.enabled}
      loading={manualProxyLoading}
      onChange={(enabled) => setManualProxy((current) => ({ ...current, enabled }))}
    />
  </PreferenceRow>
  <Input
    value={manualProxy.url}
    disabled={!manualProxy.enabled || manualProxyLoading}
    placeholder="http://127.0.0.1:7897"
    allowClear
    onChange={(url) => setManualProxy((current) => ({ ...current, url }))}
  />
  {manualProxyError ? <Alert type="error" content={manualProxyError} /> : null}
  <div className="flex justify-end">
    <Button type="primary" loading={manualProxySaving} onClick={() => void handleSaveManualProxy()}>
      {t("settings.saveManualHttpProxy")}
    </Button>
  </div>
</section>
```

- [ ] **Step 5: 增加所有语言的同构 i18n 键**

中文文案：

```json
"networkProxy": "网络代理",
"manualHttpProxyEnabled": "启用手动 HTTP 代理",
"manualHttpProxyDesc": "代理将用于桌面网络请求、实时消息、AI Core、Agent、MCP 和模型服务；保存后需要重启应用。",
"saveManualHttpProxy": "保存代理设置",
"manualHttpProxyLoadFailed": "代理配置读取失败，请稍后重试。",
"manualHttpProxySaveFailed": "代理配置保存失败，请稍后重试。"
```

英文文案：

```json
"networkProxy": "Network Proxy",
"manualHttpProxyEnabled": "Enable Manual HTTP Proxy",
"manualHttpProxyDesc": "The proxy applies to desktop networking, realtime messages, AI Core, agents, MCP, and model services. Restart after saving.",
"saveManualHttpProxy": "Save Proxy Settings",
"manualHttpProxyLoadFailed": "Failed to load proxy settings. Please try again.",
"manualHttpProxySaveFailed": "Failed to save proxy settings. Please try again."
```

其余语言使用以下确定文案；六个键按表格顺序分别为标题、开关、说明、保存、读取失败、保存失败：

| Locale  | 文案                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `de-DE` | `Netzwerkproxy`；`Manuellen HTTP-Proxy aktivieren`；`Der Proxy gilt für Desktop-Netzwerkzugriffe, Echtzeitnachrichten, AI Core, Agents, MCP und Modelldienste. Nach dem Speichern ist ein Neustart erforderlich.`；`Proxy-Einstellungen speichern`；`Die Proxy-Einstellungen konnten nicht geladen werden. Bitte erneut versuchen.`；`Die Proxy-Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen.` |
| `ja-JP` | `ネットワークプロキシ`；`手動 HTTP プロキシを有効にする`；`プロキシはデスクトップ通信、リアルタイムメッセージ、AI Core、Agent、MCP、モデルサービスに適用されます。保存後に再起動してください。`；`プロキシ設定を保存`；`プロキシ設定を読み込めませんでした。もう一度お試しください。`；`プロキシ設定を保存できませんでした。もう一度お試しください。`                                                                    |
| `ko-KR` | `네트워크 프록시`；`수동 HTTP 프록시 사용`；`프록시는 데스크톱 네트워크, 실시간 메시지, AI Core, Agent, MCP 및 모델 서비스에 적용됩니다. 저장 후 앱을 다시 시작하세요.`；`프록시 설정 저장`；`프록시 설정을 불러오지 못했습니다. 다시 시도하세요.`；`프록시 설정을 저장하지 못했습니다. 다시 시도하세요.`                                                                                                                |
| `pt-BR` | `Proxy de rede`；`Ativar proxy HTTP manual`；`O proxy será usado pela rede do desktop, mensagens em tempo real, AI Core, agentes, MCP e serviços de modelo. Reinicie após salvar.`；`Salvar configurações de proxy`；`Não foi possível carregar as configurações de proxy. Tente novamente.`；`Não foi possível salvar as configurações de proxy. Tente novamente.`                                                      |
| `ru-RU` | `Сетевой прокси`；`Включить ручной HTTP-прокси`；`Прокси применяется к сетевым запросам приложения, сообщениям в реальном времени, AI Core, агентам, MCP и сервисам моделей. После сохранения перезапустите приложение.`；`Сохранить настройки прокси`；`Не удалось загрузить настройки прокси. Повторите попытку.`；`Не удалось сохранить настройки прокси. Повторите попытку.`                                         |
| `tr-TR` | `Ağ proxy'si`；`El ile HTTP proxy kullan`；`Proxy; masaüstü ağı, gerçek zamanlı mesajlar, AI Core, Agent, MCP ve model hizmetleri için kullanılır. Kaydettikten sonra yeniden başlatın.`；`Proxy ayarlarını kaydet`；`Proxy ayarları yüklenemedi. Lütfen tekrar deneyin.`；`Proxy ayarları kaydedilemedi. Lütfen tekrar deneyin.`                                                                                        |
| `uk-UA` | `Мережевий проксі`；`Увімкнути ручний HTTP-проксі`；`Проксі застосовується до мережевих запитів застосунку, повідомлень у реальному часі, AI Core, агентів, MCP і сервісів моделей. Після збереження перезапустіть застосунок.`；`Зберегти налаштування проксі`；`Не вдалося завантажити налаштування проксі. Спробуйте ще раз.`；`Не вдалося зберегти налаштування проксі. Спробуйте ще раз.`                           |
| `zh-TW` | `網路代理`；`啟用手動 HTTP 代理`；`代理將用於桌面網路請求、即時訊息、AI Core、Agent、MCP 和模型服務；儲存後需要重新啟動應用程式。`；`儲存代理設定`；`代理設定讀取失敗，請稍後重試。`；`代理設定儲存失敗，請稍後重試。`                                                                                                                                                                                                   |

所有 locale 必须保留完全相同的键集合。

- [ ] **Step 6: 生成 i18n 类型并验证**

Run:

```powershell
npm run i18n:types
npm run test:packaged:i18n
```

Expected: i18n 类型生成成功，打包语言测试通过。

---

### Task 5: 让桌面通知和客服 WebSocket 使用全局代理

**Files:**

- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/desktop-notification/desktopNotificationSocketClient.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/desktop-notification/desktopNotificationSocketClient.test.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/customer-service/customerServiceSocketClient.ts`
- Modify: `LianLiaoAIPC/packages/desktop/src/process/services/enterprise/customer-service/customerServiceSocketClient.test.ts`

- [ ] **Step 1: 修改桌面通知默认 socket factory**

```ts
import { getActiveWebSocketProxyAgent } from "@process/services/network-proxy/manualHttpProxyRuntime";

const defaultSocketFactory = (url: string): DesktopNotificationSocketAdapter => {
  const agent = getActiveWebSocketProxyAgent(url);
  return new WebSocket(
    url,
    agent ? { agent } : undefined,
  ) as unknown as DesktopNotificationSocketAdapter;
};
```

- [ ] **Step 2: 修改客服默认 socket factory**

```ts
import { getActiveWebSocketProxyAgent } from "@process/services/network-proxy/manualHttpProxyRuntime";

const defaultSocketFactory = (url: string): CustomerServiceSocketAdapter => {
  const agent = getActiveWebSocketProxyAgent(url);
  return new WebSocket(
    url,
    agent ? { agent } : undefined,
  ) as unknown as CustomerServiceSocketAdapter;
};
```

- [ ] **Step 3: 保留现有 socketFactory 注入点**

不得移除两个客户端现有的测试注入能力。测试继续通过 `socketFactory` 提供假 socket，避免真实联网。

- [ ] **Step 4: 增加代理选择测试**

通过 mock `getActiveWebSocketProxyAgent` 或单独验证 `createWebSocketProxyAgent`，覆盖：

```ts
it("uses an HTTPS proxy agent for production WSS", () => {
  configureManualHttpProxy({ enabled: true, url: "http://127.0.0.1:7897" });
  expect(getActiveWebSocketProxyAgent("wss://cloud.lslnii.com/cloud-api/ws")).toBeDefined();
});

it("keeps local development WS direct", () => {
  configureManualHttpProxy({ enabled: true, url: "http://127.0.0.1:7897" });
  expect(getActiveWebSocketProxyAgent("ws://127.0.0.1:12580/cloud-api/ws")).toBeUndefined();
});
```

- [ ] **Step 5: 运行两个 WebSocket 测试集**

Run:

```powershell
npx vitest run packages/desktop/src/process/services/enterprise/desktop-notification/desktopNotificationSocketClient.test.ts packages/desktop/src/process/services/enterprise/customer-service/customerServiceSocketClient.test.ts packages/desktop/src/process/services/network-proxy/*.test.ts
```

Expected: 全部测试通过，无真实外部网络请求。

---

### Task 6: 补充项目约束和完整验证

**Files:**

- Modify: `LianLiaoAIPC/README.md`
- Modify: `LianLiaoAIPC/AGENTS.md`

- [ ] **Step 1: 补充 README 使用说明**

增加“手动 HTTP 代理”章节，明确：

```text
路径：设置 → 系统 → 网络代理
示例：http://127.0.0.1:7897
生效范围：Electron HTTP、生产 WebSocket、AICore、Agent、MCP、模型服务
本地地址：localhost、127.0.0.1、::1 始终直连
生效时机：保存并重启应用
限制：第一版不支持需要账号密码的代理
```

- [ ] **Step 2: 补充 AGENTS.md 维护规则**

写入以下约束：

```text
- 全局代理配置键固定为 system.httpProxy，只能由 Electron 主进程读写。
- 不得在业务 HTTP 或 WebSocket 模块中复制代理字符串解析逻辑。
- localhost、127.0.0.1 和 ::1 必须绕过代理。
- 日志不得输出带凭据的代理 URL、WebSocket ticket 或 openid。
```

- [ ] **Step 3: 运行受影响测试**

Run:

```powershell
cd E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
npx vitest run packages/desktop/src/process/services/network-proxy packages/desktop/src/process/services/enterprise/desktop-notification/desktopNotificationSocketClient.test.ts packages/desktop/src/process/services/enterprise/customer-service/customerServiceSocketClient.test.ts
npm run test:packaged:i18n
```

Expected: 全部通过。

- [ ] **Step 4: 运行格式、lint 和类型检查**

Run:

```powershell
npm run format:check
npm run lint
npm run typecheck:enterprise-tests
```

Expected: exit code 均为 `0`。

- [ ] **Step 5: 构建 Electron 产物**

Run:

```powershell
npm run package
```

Expected: exit code `0`，生成 `out/main/index.js`、preload 和 renderer 产物。

- [ ] **Step 6: 手工验证开发模式**

Run:

```powershell
npm run dev
```

检查：

1. AI 侧栏显示“链上辽宁·产业云城AI助手”。
2. AI 侧栏 Logo 与企业工作台一致。
3. “设置 → 系统”显示网络代理区域。
4. 输入非法地址时提示错误且不重启。
5. 保存 `http://127.0.0.1:7897` 后，开发模式提示手动重启。
6. 重启后配置仍存在。
7. 本地 AICore 页面与 `ws://127.0.0.1` 连接不受代理影响。

- [ ] **Step 7: 经用户授权后提交**

项目规则要求未经用户明确要求不得提交或推送。本任务完成后先展示 `git diff --stat` 和验证结果；只有用户明确要求时才执行：

```powershell
git add LianLiaoAIPC docs/superpowers/specs/2026-07-24-ai-brand-global-http-proxy-design.md docs/superpowers/plans/2026-07-24-ai-brand-global-http-proxy.md
git commit -m "新增全局代理设置并统一AI助手品牌"
git push origin master
```
