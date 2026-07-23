# 开发环境与本地运行

> 本文只记录当前项目已确认的运行方式。密码、私钥、数据库连接串和线上令牌不得复制到文档、测试或 Git 提交中。

## 1. 环境基线

| 部分               | 基线                                                        |
| ------------------ | ----------------------------------------------------------- |
| Windows            | 当前主要开发与打包平台                                      |
| Node.js            | `>=22 <25`，以 AionUi 根 `package.json` 为准                |
| npm                | 使用项目 `package-lock.json`，不要混用 pnpm/yarn 改写锁文件 |
| Electron           | `37.10.x`                                                   |
| React / TypeScript | React 19、TypeScript 5.8                                    |
| Java               | JDK 8，Maven 编译目标为 `1.8`                               |
| Maven              | 与现有私服、本地仓库配置兼容的 Maven 3.x                    |
| H5                 | Vue 3、Vite 3、TypeScript 4.9                               |
| 后端依赖           | Nacos、Oracle、Redis；地址与凭据沿用现有受控配置            |

## 2. 网络与代理

下载 npm、Electron 或 Maven 依赖时可使用本地代理：

```powershell
$env:HTTP_PROXY = 'http://127.0.0.1:7897'
$env:HTTPS_PROXY = 'http://127.0.0.1:7897'
$env:ALL_PROXY = 'http://127.0.0.1:7897'
$env:NO_PROXY = 'localhost,127.0.0.1'
```

`NO_PROXY` 必须包含 `localhost,127.0.0.1`。否则 Electron 访问本地 `12580` 时可能被送入代理，表现为登录轮询异常、客服连接失败或请求超时。

已确认的业务地址：

| 环境     | HTTP 基地址                 | WebSocket                                                               |
| -------- | --------------------------- | ----------------------------------------------------------------------- |
| 本地开发 | `http://127.0.0.1:12580/`   | 从同一基地址推导为 `ws://127.0.0.1:12580/cloud-api/customer-service/ws` |
| 生产     | `https://cloud.lslnii.com/` | `wss://cloud.lslnii.com/cloud-api/customer-service/ws`                  |

不要在业务组件里散落基地址。Electron 必须从主进程受控配置读取；H5 沿用项目的 Axios/Vite 环境配置。

## 3. Electron：AionUi / 链辽AI

工作目录：

```text
E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
```

首次安装与开发启动：

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC
node --version
npm install
npm run start
```

开发版支持按 `F12` 打开或关闭 DevTools。该行为只应在开发模式生效，发布版不能暴露调试入口。

常用命令：

```powershell
npm run test -- <测试文件>
npm run typecheck:enterprise-tests
npm run i18n:types
npm run lint
npm run format:check
npm run package
npm run dist:win
```

优先执行与改动直接相关的聚焦测试，阶段结束时再执行完整门禁。构建和打包的验收区别见 [08-testing-release-acceptance.md](./08-testing-release-acceptance.md)。

## 4. AionCore 本地资源

Windows x64 的已知资源位置：

```text
E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\resources\bundled-aioncore\win32-x64\aioncore.exe
```

开发时解析器应优先识别仓库中的 bundled 资源。确有需要时可显式覆盖：

```powershell
$env:AIONUI_BACKEND_BIN = 'E:\ZZY_PROJECT\AI_lianliao\LianLiaoAIPC\resources\bundled-aioncore\win32-x64\aioncore.exe'
npm run start
```

出现“AionUi 安装不完整”时按以下顺序排查：

1. 文件是否存在且可执行；
2. `AIONUI_BACKEND_BIN` 是否指向正确架构；
3. 当前运行的是开发资源目录还是打包后的 `resources`；
4. 安全软件是否隔离或阻止 `aioncore.exe`；
5. 查看主进程日志中的候选路径和启动异常；
6. 运行 `binaryResolver` 相关单元测试。

不要把“跳过 AionCore 启动”作为长期修复。打包验收还必须确认安装产物中包含正确平台的二进制文件。

## 5. Java 后端：cloud-api 与 cloud-gateway

工作目录：

```text
E:\ZZY_PROJECT\lianshang_liaoning\cloud-service
```

本地端口拓扑：

| 服务            |                  端口 | 作用                                             |
| --------------- | --------------------: | ------------------------------------------------ |
| `cloud-gateway` |               `12580` | Electron/H5 本地统一入口；转发 HTTP 和 WebSocket |
| `cloud-api`     |               `12585` | 业务服务自身端口，不是 Electron 配置的基地址     |
| Nacos           | 默认 `127.0.0.1:8848` | 服务注册与配置；可由 `NACOS_HOST` 覆盖           |

网关当前规则是 `/cloud-api/** -> lb://cloud-api`，并 `StripPrefix=1`。所以外部请求：

```text
http://127.0.0.1:12580/cloud-api/CustomerServiceController/customer/auth
```

会被转发到 `cloud-api` 的：

```text
/CustomerServiceController/customer/auth
```

推荐启动顺序：

1. 确认开发环境能够访问 Nacos、Oracle 与 Redis；
2. 启动 `cloud-api`，确认以服务名 `cloud-api` 注册；
3. 启动 `cloud-gateway`，确认监听 `12580`；
4. 通过 `12580/cloud-api/...` 做健康或只读接口验证；
5. 再启动 Electron 或 H5。

从多模块根目录执行：

```powershell
Set-Location E:\ZZY_PROJECT\lianshang_liaoning\cloud-service
mvn -pl cloud-api -am test
mvn -pl cloud-api -am install -DskipTests
mvn -f cloud-api\pom.xml spring-boot:run
```

另开终端启动网关：

```powershell
Set-Location E:\ZZY_PROJECT\lianshang_liaoning\cloud-service
mvn -f cloud-gateway\pom.xml spring-boot:run
```

若本机 Maven/PowerShell 对 `-D` 参数解析异常，可写成 `"-DskipTests"`。若服务启动失败，先检查 Nacos 配置与依赖连通性，不要为了启动而把真实依赖改成假数据。

## 6. H5：vip_store

工作目录：

```text
E:\ZZY_PROJECT\lianshang_liaoning\vip_store
```

启动与验证：

```powershell
Set-Location E:\ZZY_PROJECT\lianshang_liaoning\vip_store
npm install
npm run dev
npm run test:customer-service
npm run vue-tsc
npm run build
```

现有客服页面：

- 客户咨询：`/customer-service/chat`
- 客服接待：`/customer-service/reception`

客服入口是否对普通 H5 页面公开是产品决策；当前页面和路由已经存在，不代表必须增加全站入口。

## 7. Oracle 只读调查工具

工具目录：

```text
E:\ZZY_PROJECT\AI_lianliao\tools
```

使用前在本机安全环境中配置连接变量，具体变量和命令以工具自带 README/帮助为准。典型调用：

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao
python tools\oracle\oracle_readonly.py --json
python tools\oracle\oracle_readonly.py --help
```

当前工具专门对照客服 DDL 查询 Oracle `USER_*` 元数据，不提供任意 SQL 参数。该工具必须保持严格只读：禁止新增、修改、删除、DDL、PL/SQL、存储过程调用、锁表和多语句执行。若后续增加其他只读调查能力，应采用固定查询模板和参数白名单，不能开放任意 SQL。任何数据库写操作都必须先向用户展示 SQL、影响范围和回滚方案，并取得明确确认。

## 8. 联调前检查清单

- 三个仓库的当前工作区改动已记录且不会被覆盖；
- Node/JDK 版本符合基线；
- 本地代理未代理 `127.0.0.1`；
- Nacos 中能看到 `cloud-api`；
- `12580` 网关能够转发 `/cloud-api/**`；
- HTTP 与 WebSocket 使用同一环境，不混连本地和生产；
- Electron 扫码登录能取得用户上下文；
- 客服账号同时满足前端 `roleId=19` 与后端客服资格；
- AionCore 可以启动，F12 只在开发版可用。
