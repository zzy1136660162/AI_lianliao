# Changelog

## [2.1.39](https://github.com/zzy1136660162/AI_lianliao/compare/desktop-v2.1.38...desktop-v2.1.39) (2026-09-03)

### Desktop

#### Bug Fixes

- **catalog:** 修复企业码关联产品、产品所属企业详情之间的返回路径，保留原列表筛选和滚动位置
- **enterprise:** 完善在建项目联系信息脱敏和供需详情相关图片展示
- **workbench:** 修复主操作按钮图标对比度，并统一工作台快捷入口图标颜色

#### Improvements

- **workbench:** 重点采购品类图表直接显示项目数与材料数，产业动态标签和标题调整为单行省略布局

#### Release

- 本次仅发布 Windows x64 安装包，并通过后台设置为强制更新版本

---

## [2.1.38](https://github.com/zzy1136660162/AI_lianliao/compare/desktop-v2.1.37...desktop-v2.1.38) (2026-09-02)

### Core ([aicore-v0.1.50](https://github.com/zzy1136660162/AI_lianliao/releases/tag/aicore-v0.1.50))

#### Bug Fixes

- **database:** 兼容历史 Windows Core 以 CRLF 记录的迁移校验和，修复升级正式版后误报“本地数据迁移失败”

#### Release

- 本次仅发布 Windows x64 安装包，并通过后台设置为强制更新版本

---

## [2.1.37](https://github.com/zzy1136660162/AI_lianliao/compare/desktop-v2.1.36...desktop-v2.1.37) (2026-09-02)

### Desktop

#### Bug Fixes

- **diagnostics:** 将新版桌面日志统一写入 `%APPDATA%\LianLiaoAIPC\logs`，同时保留旧品牌目录日志的兼容采集
- **desktop:** 保持中文应用名称与稳定日志目录相互独立，避免升级后产生多个新的日志位置
- **workbench:** 修正重点采购品类的同图例纵向连线，并让重点采购材料树图填满可用图表区域

### Core ([aicore-v0.1.49](https://github.com/zzy1136660162/AI_lianliao/releases/tag/aicore-v0.1.49))

#### Bug Fixes

- **database:** 随正式桌面包提供包含迁移 025 的 Core，修复旧 Core 无法识别新版本地数据库的问题

#### Release

- 本次仅发布 Windows x64 安装包，并通过后台设置为强制更新版本

---

## [2.1.36](https://github.com/zzy1136660162/AI_lianliao/compare/desktop-v2.1.35...desktop-v2.1.36) (2026-09-02)

### Desktop

#### Features

- **workbench:** 优化企业工作台信息架构，增加产业动态、统一检索和高密度产业机会图表
- **catalog:** 重点产品与供需对接筛选项和查询操作采用紧凑单行布局

#### Improvements

- **charts:** 地区机会热度改为柱状图，扩充重点采购材料并增加采购品类对比连线
- **ui:** 精简工作台标题区域，移除无实际业务含义的实时状态标识

#### Release

- 本次仅发布 Windows x64 安装包，并通过后台设置为强制更新版本

---

## [2.1.35](https://github.com/zzy1136660162/AI_lianliao/compare/desktop-v2.1.34...desktop-v2.1.35) (2026-09-01)

### Desktop

#### Features

- **assistant:** 产业检索助手接入独立的产业检索 MCP 工具，统一支持企业、产品、在建项目与供需信息检索
- **enterprise:** 完善产业数据详情跳转、返回状态与多语言工具展示

#### Bug Fixes

- **desktop:** 优化启动清理、后端迁移和内置 MCP 资源打包流程

#### Release

- 本次仅发布 Windows x64 安装包，并通过后台设置为强制更新版本

---

## [2.1.34](https://github.com/zzy1136660162/AI_lianliao/compare/desktop-v2.1.33...desktop-v2.1.34) (2026-08-10)

### Desktop

#### Release

- **update:** 发布 Windows x64 升级验证版本，继续强制校验文件大小与 SHA256，并允许当前未签名安装包由 2.1.33 客户端直接打开

---

## [2.1.33](https://github.com/zzy1136660162/AI_lianliao/compare/desktop-v2.1.32...desktop-v2.1.33) (2026-08-10)

### Desktop

#### Features

- **update:** 增加服务端最低支持版本策略、全局强制更新门禁及离线策略缓存
- **update:** 安装包下载强制校验文件大小与 SHA256，并兼容当前未配置代码签名证书的 Windows 发布链

#### Bug Fixes

- **enterprise:** 完善企业码、重点产品、在建项目、供需对接与产业检索助手的查询及展示体验
- **desktop:** 优化窄屏布局、客服咨询输入区、窗口工具栏和本地打包流程

---

## [2.1.32](https://github.com/zzy1136660162/AI_lianliao/compare/desktop-v2.1.31...desktop-v2.1.32) (2026-08-05)

### Desktop

#### Bug Fixes

- **customer-service:** 客户咨询消息区域独立滚动，确保输入框始终可见
- **notification:** 客服新回复的 Windows 桌面提醒固定显示中文文案

#### Release

- 本次仅发布 Windows x64 安装包；macOS、Linux 与 Windows ARM64 不参与构建

---

## [2.1.31](https://github.com/zzy1136660162/AI_lianliao/compare/desktop-v2.1.30...desktop-v2.1.31) (2026-08-05)

### Desktop

#### Bug Fixes

- **customer-service:** 发送确认超时后回查服务端消息，并按请求精确处理失败，避免已送达消息被误报失败

---

## [2.1.30](https://github.com/zzy1136660162/AI_lianliao/compare/desktop-v2.1.29...desktop-v2.1.30) (2026-08-05)

### Desktop

#### Features

- **enterprise:** 重新设计企业码与重点产品列表，增加辽宁省市区联动筛选与高密度信息卡片
- **assistant:** 增加可复用的产业检索助手，统一支持企业、产品和在建项目检索
- **model:** 桌面 AI 默认模型支持从受管业务模型配置中加载
- **service:** 完善客户在线咨询、客服接待、消息提醒与会话恢复流程
- **desktop:** 增加链辽品牌登录界面、中文托盘菜单、正式环境复制保护与渲染进程恢复

#### Bug Fixes

- **contact:** 联系方式权限改为实时向服务端校验，避免使用过期本地状态
- **catalog:** 增强企业、产品和项目详情的数据归一化与降级查询
- **customer-service:** 保持消息列表独立滚动，对话输入区始终可见
- **conversation:** 修复 AI 回答完成后仍显示“正在处理”的状态同步问题
- **security:** 清理企业介绍中的脚本和样式内容，防止非业务文本泄露到界面

---

## [2.1.29](https://github.com/zzy1136660162/AI_lianliao/compare/desktop-v2.1.28...desktop-v2.1.29) (2026-07-27)

### Desktop

#### Features

- **workspace:** add Chain Liaoning AI branding and a user-configurable global HTTP proxy

#### Bug Fixes

- **update:** route desktop update checks through the database-backed enterprise version center

### Core ([aicore-v0.1.48](https://github.com/zzy1136660162/AI_lianliao/releases/tag/aicore-v0.1.48))

#### Bug Fixes

- **proxy:** preserve the configured proxy for Agent, MCP, and model subprocesses

---

## [2.1.27](https://github.com/iOfficeAI/AionUi/compare/v2.1.26...v2.1.27) (2026-06-30)

### Desktop

#### Bug Fixes

- **team:** reconcile stale run state (#3480)
- **cron:** preserve scheduled task conversations (#3479)
- **cron:** restore scheduled conversations to history (#3478)
- **mcp:** isolate backend cwd for stdio tools (#3476)
- **agent:** show ACP model descriptions (#3463)

### Core ([v0.1.40](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.40))

#### Features

- **team:** add run state snapshot endpoint (#549)

#### Bug Fixes

- **acp:** preserve selectors for partial config snapshots (#548)
- **cron:** restore create command heading (#547)
- **cron:** run jobs through conversation service (#546)
- **skills:** repair butler endpoint drift + add cron scheduling (#550)
- **windows:** handle runtime process lifecycle

---

## [2.1.26](https://github.com/iOfficeAI/AionUi/compare/v2.1.25...v2.1.26) (2026-06-29)

### Desktop

#### Bug Fixes

- **agent:** tighten repair save and test flow (#3470)
- **guid:** remember last selected assistant (#3468)
- **assistant:** prefer runtime config options for defaults (#3466)
- **conversation:** restore team chat full width (#3464)
- **fs:** pass workspace roots to local fs routes (#3451)

#### Styling

- **settings:** clean up assistant card more-button

### Core ([v0.1.39](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.39))

#### Bug Fixes

- **agent:** adapt aionrs compat API (#528)
- **agent:** guard internal Aion CLI command overrides (#538)
- **app:** reuse conversation service for channel messages (#531)
- **assistant:** preserve builtin override selections (#535)
- **file:** trust local workspace roots for fs routes (#527)

---

## [2.1.25](https://github.com/iOfficeAI/AionUi/compare/v2.1.24...v2.1.25) (2026-06-26)

### Desktop

#### Features

- **assistant:** add TalkToButler entry-point infrastructure
- **cron:** add create-via-chat path to scheduled tasks page
- **cron:** use TalkToButlerButton for create + align button styles
- **feedback:** add "solve via chat" to bug report
- **settings:** wire "via chat" into create/add flows
- **web-host:** remove single-chat team upgrade path (#3441)

#### Bug Fixes

- **avatar:** prevent local avatar path rendering (#3439)
- **conversation:** make chat width fluid (#3436)
- **cron:** consume create-via-chat prefill only once per navigation
- **desktop:** classify agent metadata cache repair failures (#3450)
- **guid:** improve dark-mode contrast for inactive agent selector labels (#3430)
- **guid:** load runtime catalog from agent metadata (#3440)
- **guid:** remove static codex runtime catalog (#3443)
- **guid:** resolve assistant skill defaults from config (#3445)
- **guid:** stop showing stale Codex model fallback (#3432)
- **installer:** verify bundled resources (#3444)
- **linux:** align desktop icon name (#3449)
- **settings:** clarify custom agent acp requirement (#3448)

#### Refactoring

- **cron:** hide conversation header entry when no scheduled task exists

### Core ([v0.1.38](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.38))

#### Features

- remove single-chat team upgrade path (#524)

#### Bug Fixes

- **agent:** expose runtime catalogs from metadata (#523)
- **assistant:** expose auto-inject skills and preserve assistant rules (#525)
- repair invalid UTF-8 agent metadata cache fields (#526)
- **skills:** sync AionUi Butler skills + rule with current backend (#520)

---

## [2.1.24](https://github.com/iOfficeAI/AionUi/compare/v2.1.23...v2.1.24) (2026-06-25)

### Desktop

#### Features

- **agent:** connection testing and assistant availability surfacing (phase 2) (#3395)
- **conversation:** add cursor message pagination (#3422)

#### Bug Fixes

- **conversation:** localize structured agent errors (#3426)
- **desktop:** repair legacy database handoff startup (#3423)
- **release:** restore mac zip artifacts (#3415)
- **settings:** prevent capabilities tab flicker (#3414)

### Core ([v0.1.37](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.37))

#### Features

- **agent:** detect availability via session/new probe and assistant-first identity (#500)
- **conversation:** add cursor pagination for messages (#515)

#### Bug Fixes

- **agent:** classify ACP and provider errors (#518)
- **aionrs:** adapt runtime guard config (#510)
- **conversation:** recover dead ACP turns after agent process loss (#514)
- **db:** repair legacy handoff schema drift (#516)
- validate skill frontmatter as yaml (#512)

---

## [2.1.23](https://github.com/iOfficeAI/AionUi/compare/v2.1.22...v2.1.23) (2026-06-23)

### Desktop

#### Features

- **webui:** add browser notifications for permission requests and turn completion (#3401)

#### Bug Fixes

- **preview:** correct OfficeCLI repo slug casing and de-DE install hint (#3399)

### Core ([v0.1.36](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.36))

#### Bug Fixes

- **deps:** update quinn-proto for RustSec advisory (#508)
- load skills in custom workspaces (#506)
- **agent:** support aionrs 0.1.31 (#503)

---

## [2.1.22](https://github.com/iOfficeAI/AionUi/compare/v2.1.21...v2.1.22) (2026-06-22)

### Desktop

#### Features

- **acp:** preserve redacted raw error in AIONUI_INTERNAL_ERROR fallback (#3393)

#### Bug Fixes

- **markdown:** support local file hash line links (#3396)
- **conversation:** localize OpenClaw Gateway startup error (#3392)
- **mcp:** guard message calls against use-after-unmount crash (#3376)
- **preview:** improve file diffs and local file links (#3379)
- **installer:** harden win arm64 install (#3387)

### Core ([v0.1.34](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.34))

#### Bug Fixes

- **agent:** expose aionrs mode config option (#501)
- **agent:** surface OpenClaw Gateway unreachable errors (#498)
- **aionrs:** classify engine errors structurally (#494)
- **aionrs:** drop malformed tool-call events (#486)
- **channel:** reuse stored credentials when re-enabling a plugin (#458)

---

## [2.1.21](https://github.com/iOfficeAI/AionUi/compare/v2.1.20...v2.1.21) (2026-06-18)

### Desktop

#### Features

- **i18n:** add German (de-DE) locale (#3370)

#### Bug Fixes

- **preview:** restore local html and selected file reopen (#3369)
- **preview:** build valid file:// URL for PDF preview on Windows (#3366)
- **i18n:** wire pt-BR into language pickers and main-process loader (#3361)

### Core ([v0.1.32](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.32))

#### Features

- **team:** centralize team MCP prompt governance ([#490](https://github.com/iOfficeAI/AionCore/issues/490))

#### Bug Fixes

- **acp:** recover dead ACP connections ([#487](https://github.com/iOfficeAI/AionCore/issues/487))
- **conversation:** upsert streaming tool calls (AIO-30) ([#484](https://github.com/iOfficeAI/AionCore/issues/484))

#### Documentation

- **skills:** add cross-platform notes so Windows users translate shell examples ([#489](https://github.com/iOfficeAI/AionCore/issues/489))

---

## [2.1.20](https://github.com/iOfficeAI/AionUi/compare/v2.1.19...v2.1.20) (2026-06-17)

### Desktop

#### Features

- **agent:** combine header model thinking selector (#3358)
- **update:** add singleton update notification (#3351)
- **team:** handle queued team runtime metadata (#3349)

#### Bug Fixes

- **team:** wait for solo turn before handoff queue drain (#3353)
- **assistant:** remove leftover gap above assistant list (#3344)

### Core ([v0.1.31](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.31))

#### Features

- **assistant:** add built-in AionUi self-management assistant ([#474](https://github.com/iOfficeAI/AionCore/issues/474))
- **assistant:** expand AionUi assistant into a butler with remote-access ([#481](https://github.com/iOfficeAI/AionCore/issues/481))
- enforce TeamRun ownership for agent turns ([#483](https://github.com/iOfficeAI/AionCore/issues/483))
- **team:** support queued team_send_message semantics ([#479](https://github.com/iOfficeAI/AionCore/issues/479))

#### Bug Fixes

- **acp:** persist runtime model and mode into assistant preferences ([#482](https://github.com/iOfficeAI/AionCore/issues/482))
- harden ACP image path handling ([#477](https://github.com/iOfficeAI/AionCore/issues/477))
- **team:** retry handoff turns after runtime release ([#480](https://github.com/iOfficeAI/AionCore/issues/480))

---

## [2.1.19](https://github.com/iOfficeAI/AionUi/compare/v2.1.18...v2.1.19) (2026-06-15)

### Desktop

#### Features

- **team:** support slot-scoped stop controls (#3334)
- **desktop:** report installation integrity diagnostics (#3333)
- **update:** use CDN metadata for stable auto updates (#3244)
- **acp:** add observed config option selectors (#3324)
- **layout:** make sider wordmark a back-to-chat control in settings (#3320)
- **preview:** actionable server-side install guidance for officecli errors in web mode (#3310)

#### Bug Fixes

- align team workspace display fallback (#3340)
- **team:** prefer assistant avatars in team chats (#3338)
- repair assistant cron and guid metadata flows (#3336)
- **assistant:** remove star office ui remnants (#3329)
- **startup:** hydrate windows path for cli detection (#3308)
- **docker:** install libicu so officecli preview works on Linux server deployments (#3323)
- **agents:** keep disabled custom agents visible in settings (#3319)
- **stt:** keep recording when streaming fails before it establishes (#3317)

### Core ([v0.1.30](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.30))

#### Features

- **acp:** use observed config options for preferences ([#468](https://github.com/iOfficeAI/AionCore/issues/468))
- align team shared workspace resolution ([#475](https://github.com/iOfficeAI/AionCore/issues/475))
- **team:** support slot-scoped team pause and wake flow ([#472](https://github.com/iOfficeAI/AionCore/issues/472))

#### Bug Fixes

- **agent:** send non-empty clientInfo in ACP initialize handshake ([#471](https://github.com/iOfficeAI/AionCore/issues/471))
- **agent:** wait for task shutdown during clear ([#446](https://github.com/iOfficeAI/AionCore/issues/446))
- **assistant:** remove star office helper remnants ([#470](https://github.com/iOfficeAI/AionCore/issues/470))
- **office:** fetch officecli installer from official mirror before GitHub ([#463](https://github.com/iOfficeAI/AionCore/issues/463))
- preserve assistant snapshot and skill wiring for cron ([#473](https://github.com/iOfficeAI/AionCore/issues/473))
- **shell:** reveal file via FileManager1 D-Bus on Linux ([#466](https://github.com/iOfficeAI/AionCore/issues/466))

---

## [2.1.18](https://github.com/iOfficeAI/AionUi/compare/v2.1.17...v2.1.18) (2026-06-12)

### Desktop

#### Features

- **stt:** streaming voice input with live transcript (#3291)
- **assistant:** deliver phase-1 governance settings (#3277)
- stabilize team mode conversation runtime (#3309)

#### Bug Fixes

- **updater:** wait for backend shutdown before install (#3270)
- **windows-installer:** recover from long-path uninstall failures (#3296)
- **macos:** add audio-input entitlement so microphone works (#3294)
- **preview:** drop bare trailing slash from office watch proxy url (#3287)
- **workspace:** float directory picker above team/cron create modals
- **workspace:** enable clickable folder picker in webui

#### Styling

- **titlebar:** nudge feedback icon up to align with neighbors
- **markdown:** tighten desktop paragraph spacing
- **markdown:** tighten desktop chat body line-height
- **conversation:** show AI copy/timestamp row only at turn end
- **display:** tighten factory default font sizes and zoom

### Core ([v0.1.29](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.29))

#### Features

- converge team mode runtime architecture ([#464](https://github.com/iOfficeAI/AionCore/issues/464))
- **stt:** streaming transcription proxy over websocket ([#455](https://github.com/iOfficeAI/AionCore/issues/455))

#### Bug Fixes

- **agent:** validate managed ACP platform binaries ([#462](https://github.com/iOfficeAI/AionCore/issues/462))
- **cron:** retry busy jobs from runtime state ([#459](https://github.com/iOfficeAI/AionCore/issues/459))
- isolate ACP cancel turn completion ([#461](https://github.com/iOfficeAI/AionCore/issues/461))
- **office:** probe star-office preferred_url host as given ([#456](https://github.com/iOfficeAI/AionCore/issues/456))

#### Refactoring

- **assistant:** finalize unified governance storage ([#449](https://github.com/iOfficeAI/AionCore/issues/449))

---

## [2.1.17](https://github.com/iOfficeAI/AionUi/compare/v2.1.16...v2.1.17) (2026-06-11)

### Desktop

#### Features

- **settings:** voice input settings revamp and home page mic button (#3283)
- **titlebar:** add global feedback/report entry to toolbar
- **theme:** add Follow System theme mode to gallery (#3282)
- **settings:** support multi-select models when adding a model platform

#### Bug Fixes

- **webui:** normalize Windows verbatim paths from directory picker (#3286)
- **model-selector:** keep sticky platform title above scrolling items
- **settings:** allow editing Base URL when editing a model platform
- **stt:** send multipart request matching backend /api/stt contract (#3274)

#### Styling

- **model-selector:** sticky platform group titles in scrollable dropdown

### Core ([v0.1.28](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.28))

#### Bug Fixes

- **auth:** allow same-origin framing on office preview proxy routes ([#454](https://github.com/iOfficeAI/AionCore/issues/454))
- **file:** strip Windows verbatim prefix from /api/fs/browse paths ([#453](https://github.com/iOfficeAI/AionCore/issues/453))
- **stt:** STT compatibility fixes for Groq Whisper and AionUI web frontend ([#400](https://github.com/iOfficeAI/AionCore/issues/400))
- **stt:** treat blank base_url as unset and log malformed config ([#448](https://github.com/iOfficeAI/AionCore/issues/448))

---

## [2.1.16](https://github.com/iOfficeAI/AionUi/compare/v2.1.15...v2.1.16) (2026-06-10)

### Desktop

#### Bug Fixes

- **preview:** point OfficeCLI install help to official releases (#3264)
- **http:** read error response body once to avoid double consumption (#3262)
- **ci:** handle empty release prefix check (#3263)

### Core ([v0.1.27](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.27))

#### Bug Fixes

- **ai-agent:** auto approve team mcp permissions ([#447](https://github.com/iOfficeAI/AionCore/issues/447))
- **ai-agent:** trim stderr buffer at UTF-8 char boundary ([#443](https://github.com/iOfficeAI/AionCore/issues/443))
- **office:** resolve officecli shim from node_modules/.bin after npm prefix install ([#440](https://github.com/iOfficeAI/AionCore/issues/440))
- **office:** restore OfficeCLI installer resolution ([#444](https://github.com/iOfficeAI/AionCore/issues/444))

---

## [2.1.15](https://github.com/iOfficeAI/AionUi/compare/v2.1.14...v2.1.15) (2026-06-09)

### Desktop

#### Features

- enforce agent runtime policy and turn-aware UI state (#3253)
- render localized ACP empty-turn info tips (#3251)
- **conversation:** hide all conversation export UI entries
- make log directory configurable (#3233)

#### Bug Fixes

- **conversation:** align header model label with selector (#3257)
- **sendbox:** stop button glow clipped by mobile panel corner
- **login:** move mobile language selector to its own row to avoid logo overlap
- **desktop:** pass parent pid to bundled backend (#3250)

### Core ([v0.1.26](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.26))

#### Features

- enforce agent runtime policy and turn-aware state ([#436](https://github.com/iOfficeAI/AionCore/issues/436))

#### Bug Fixes

- **app:** use process synchronize access for parent watcher ([#438](https://github.com/iOfficeAI/AionCore/issues/438))
- **acp:** preserve confirmed model selection ([#437](https://github.com/iOfficeAI/AionCore/issues/437))
- **app:** stop backend when desktop exits ([#433](https://github.com/iOfficeAI/AionCore/issues/433))

---

## [2.1.14](https://github.com/iOfficeAI/AionUi/compare/v2.1.13...v2.1.14) (2026-06-08)

### Desktop

#### Bug Fixes

- **bootstrap:** block wrong macOS package architecture at startup (#3232)

### Core ([v0.1.24](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.24))

#### Bug Fixes

- **acp:** prefer config options catalogs ([#425](https://github.com/iOfficeAI/AionCore/issues/425))
- expose managed resource preparation failure details ([#430](https://github.com/iOfficeAI/AionCore/issues/430))
- handle Hermes yolo fallback correctly ([#428](https://github.com/iOfficeAI/AionCore/issues/428))
- harden managed ACP bundle preparation and builtin CLI availability ([#426](https://github.com/iOfficeAI/AionCore/issues/426))
- scope bundled ACP output under tool directories ([#431](https://github.com/iOfficeAI/AionCore/issues/431))
- **shell:** support UNC paths in Windows terminal ([#411](https://github.com/iOfficeAI/AionCore/issues/411))
- validate managed ACP packages via real entrypoints ([#429](https://github.com/iOfficeAI/AionCore/issues/429))

#### Refactoring

- **app:** organize CLI command boundaries ([#423](https://github.com/iOfficeAI/AionCore/issues/423))

---

## [2.1.13](https://github.com/iOfficeAI/AionUi/compare/v2.1.12...v2.1.13) (2026-06-07)

### Desktop

#### Features

- **appearance:** configurable font sizes & display→appearance rename (#3223)
- **theme:** unify theme system into a single Theme concept (#3219)

#### Bug Fixes

- **messages:** keep message list scrollbar flush to window edge (#3226)
- **preview:** default zoom to 100% and hide snapshot/history entry (#3222)
- **bootstrap:** preserve backend startup error codes (#3218)
- **runtime:** validate packaged node runtime layout (#3221)
- **runtime:** align installation integrity dialogs (#3220)
- **realtime:** canonicalize boundary errors (#3217)

#### Refactoring

- stabilize conversation runtime view contract (#3224)

### Core ([v0.1.23](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.23))

#### Features

- **cli:** canonicalize CLI and bootstrap boundary errors ([#417](https://github.com/iOfficeAI/AionCore/issues/417))

#### Bug Fixes

- **error:** canonicalize boundary errors ([#415](https://github.com/iOfficeAI/AionCore/issues/415))
- **runtime:** report bundled resource installation failures ([#420](https://github.com/iOfficeAI/AionCore/issues/420))
- **team:** inherit workspace for spawned agents ([#413](https://github.com/iOfficeAI/AionCore/issues/413))

#### Refactoring

- centralize agent runtime session context building ([#419](https://github.com/iOfficeAI/AionCore/issues/419))
- centralize runtime turn lifecycle ([#421](https://github.com/iOfficeAI/AionCore/issues/421))

---

## [2.1.12](https://github.com/iOfficeAI/AionUi/compare/v2.1.11...v2.1.12) (2026-06-05)

### Desktop

#### Features

- **i18n:** add Brazilian Portuguese (pt-BR) translation (#3209)
- **preview:** native Streamdown markdown rendering + full theming (#3204)

#### Bug Fixes

- **conversation:** align workspace path availability handling (#3207)
- **preview:** dedupe @codemirror/language so markdown source highlight survives (#3206)

### Core ([v0.1.22](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.22))

#### Bug Fixes

- **acp:** stabilize mode and model source of truth ([#409](https://github.com/iOfficeAI/AionCore/issues/409))
- **conversation:** align workspace path availability handling ([#410](https://github.com/iOfficeAI/AionCore/issues/410))
- **file:** lazy load browse roots ([#406](https://github.com/iOfficeAI/AionCore/issues/406))
- prepare managed acp tools locally without cdn ([#408](https://github.com/iOfficeAI/AionCore/issues/408))

#### Refactoring

- **error:** finish ApiError phase3 ([#398](https://github.com/iOfficeAI/AionCore/issues/398))

---

## [2.1.11](https://github.com/iOfficeAI/AionUi/compare/v2.1.10...v2.1.11) (2026-06-04)

### Desktop

#### Features

- **preview:** unify code viewing & editing on CodeMirror 6 (#3194)
- **preview:** unify code view font and fix view-mode/line-height regressions (#3185)
- **workspace:** VSCode-style file tree icons + smoother preview browsing (#3181)
- add managed acp artifact mirror workflow (#3182)

#### Bug Fixes

- **web-host:** use aioncore reported backend port (#3193)
- **settings:** apply UI scale only on slider release (#3190)

### Core ([v0.1.20](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.20))

#### Bug Fixes

- **app:** bind backend before startup services ([#397](https://github.com/iOfficeAI/AionCore/issues/397))
- stabilize agent runtime terminal lifecycle ([#396](https://github.com/iOfficeAI/AionCore/pull/396))

#### Refactoring

- **error:** ACP error classification ([#393](https://github.com/iOfficeAI/AionCore/issues/393))
- **error:** migrate phase2 service errors ([#395](https://github.com/iOfficeAI/AionCore/issues/395))

---

## [2.1.10](https://github.com/iOfficeAI/AionUi/compare/v2.1.9...v2.1.10) (2026-06-02)

### Desktop

#### Bug Fixes

- **runtime:** show runtime-specific MCP missing command hints (#3167)
- **startup:** add health polling diagnostics (#3168)
- **acp:** show model switch feedback
- **acp:** avoid duplicate runtime sync requests
- **acp:** wait for warmup before runtime sync
- **sentry:** split incomplete install diagnostics (#3164)
- normalize workspace path error handling (#3158)
- **acp:** fix model state sync after session recovery (#3162)
- **desktop:** persist close-to-tray setting (#3150)

### Core ([v0.1.19](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.19))

#### Bug Fixes

- **aionui-ai-agent:** classify aionrs API connection errors ([#389](https://github.com/iOfficeAI/AionCore/issues/389))
- classify missing MCP launcher runtimes ([#387](https://github.com/iOfficeAI/AionCore/issues/387))
- enforce workspace path whitespace errors across create and runtime ([#381](https://github.com/iOfficeAI/AionCore/issues/381))
- **startup:** add startup phase diagnostics ([#388](https://github.com/iOfficeAI/AionCore/issues/388))

---

## [2.1.9](https://github.com/iOfficeAI/AionUi/compare/v2.1.8...v2.1.9) (2026-06-01)

### Desktop

#### Bug Fixes

- **web-host:** skip fetch-blocked backend ports (#3146)
- **i18n:** clarify incomplete installation recovery (#3145)
- **conversation:** map 409 already-processing to CONVERSATION_BUSY (#3142)
- **i18n:** localize MCP check strings (#3141)

#### Features

- Allow importing skill folders and zip archives (#3144)

### Core ([v0.1.18](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.18))

#### Bug Fixes

- **agent:** classify Bedrock 'model identifier is invalid' as model-not-found (AIO-12) ([#377](https://github.com/iOfficeAI/AionCore/issues/377))
- **agent:** preserve process-group cleanup after leader exit ([#369](https://github.com/iOfficeAI/AionCore/issues/369))
- **agent:** tighten send_error classifier (AIO-87, AIO-89, AIO-90) ([#375](https://github.com/iOfficeAI/AionCore/issues/375))
- **aionui-ai-agent:** strip HTML body from sanitized error detail (AIO-13) ([#380](https://github.com/iOfficeAI/AionCore/issues/380))
- recover deleted conversation workspaces ([#379](https://github.com/iOfficeAI/AionCore/issues/379))

---

## [2.1.8](https://github.com/iOfficeAI/AionUi/compare/v2.1.7...v2.1.8) (2026-05-30)

### Desktop

#### Bug Fixes

- **desktop:** improve incomplete backend install diagnostics (#3121)
- **web-host:** enrich backend health timeout diagnostics (#3120)
- **feedback:** preserve structured live error tips (#3116)

### Core ([v0.1.17](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.17))

#### Bug Fixes

- **agent:** make codex sandbox sync non-fatal ([#370](https://github.com/iOfficeAI/AionCore/issues/370))

---

## [2.1.7](https://github.com/iOfficeAI/AionUi/compare/v2.1.6...v2.1.7) (2026-05-29)

### Desktop

#### Features

- **mcp:** move MCP management to conversation scope (#3109)

#### Bug Fixes

- **feedback:** tag agent error reports (#3113)
- **conversation:** render structured agent errors (#3093)
- **web-host:** reuse backend port after crash restart (#3111)
- **webui:** auto-open local url on startup (#3110)
- **startup:** ignore cancelled backend startup (#3108)
- **mcp:** validate json imports (#3106)
- **team:** avoid sidebar confirmation fan-out (#3105)
- **web-host:** add health timeout diagnostics (#3102)
- **settings:** avoid blue switch during image generation loading (#3091)

### Core ([v0.1.16](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.16))

#### Features

- **agent:** classify structured agent send errors ([#356](https://github.com/iOfficeAI/AionCore/issues/356))
- **mcp:** support session scoped MCP injection ([#363](https://github.com/iOfficeAI/AionCore/issues/363))

#### Bug Fixes

- channel reply stream cold start ([#366](https://github.com/iOfficeAI/AionCore/issues/366))
- **mcp:** clean up stdio test process trees ([#368](https://github.com/iOfficeAI/AionCore/issues/368))

---

## [2.1.6](https://github.com/iOfficeAI/AionUi/compare/v2.1.5...v2.1.6) (2026-05-28)

### Desktop

#### Bug Fixes

- **model-selector:** trust backend current model and persist preferences (#3084)
- **build:** align bundled aioncore target arch (#3092)
- **settings:** use provider health check probe (#3090)
- **settings:** use health check error message (#3080)
- **backend:** handle incomplete bundled aioncore installs (#3078)

#### Performance

- lazy-load full tool message content (#3086)
- improve message startup latency (#3082)

### Core ([v0.1.15](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.15))

#### Bug Fixes

- **agent:** add provider health check probe ([#358](https://github.com/iOfficeAI/AionCore/issues/358))

---

## [2.1.5](https://github.com/iOfficeAI/AionUi/compare/v2.1.4...v2.1.5) (2026-05-27)

### Desktop

#### Features

- **settings:** use backend MCP settings source (#3069)
- **settings:** rename capabilities tab + collapse speech/image-gen when disabled
- **settings:** clarify builtin assistant readonly state in editor
- **update:** add install warning on downloaded state in UpdateModal
- **tools:** allowlist image-gen models and document supported set

#### Bug Fixes

- **acp:** surface raw send errors (#3067)
- **guid:** use startsWith('custom:') to detect preset agent on New Chat reset
- **guid:** preserve CLI agent selection on New Chat, only reset preset agents
- **guid:** restore last selected agent on initial render without flash
- **guid:** include user skills in action-row Skills count
- **update:** polish downloaded state — remove desc text, drop icon from warning
- **startup:** show incompatible backend runtime (#3062)
- **image-gen:** strip response_format from gpt-image requests + remove double-save
- **tools:** use Form.Item tooltip prop for image model help icon
- **tools:** align help icon vertically with image model label
- **sendbox:** map workspace file paths for mentions (#3060)
- **settings:** route provider health check via aionrs (#3058)
- **settings:** localize sentence terminator on builtin readonly banner
- **electron:** tolerate pending backend startup (#3057)
- recover pending permission prompts (#3059)
- preserve timezone for scheduled tasks (#3056)

### Core ([v0.1.14](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.14))

#### Bug Fixes

- preserve cron timezone on legacy schedule updates ([#344](https://github.com/iOfficeAI/AionCore/issues/344))
- **startup:** add backend readiness diagnostics ([#346](https://github.com/iOfficeAI/AionCore/issues/346))

#### Refactoring

- four-layer architecture (connect / conv / biz) ([#349](https://github.com/iOfficeAI/AionCore/issues/349))

---

## [2.1.4](https://github.com/iOfficeAI/AionUi/compare/v2.1.3...v2.1.4) (2026-05-27)

### Desktop

#### Bug Fixes

- **messages:** ignore non-renderable stream events (#3053)
- **messages:** stabilize stream scrolling and initial loading (#3042)

---
