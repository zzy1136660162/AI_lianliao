# 测试、发布与验收门禁

## 1. 证据原则

- 只有本次实际执行的命令和结果才能写成“已通过”。
- 历史提交或旧报告只能说明曾经通过，不能替代当前验证。
- 聚焦测试用于快速反馈，完整测试/构建用于阶段交付，两者不可互相替代。
- 自动化无法覆盖真实微信、WSS、Windows 安装、Nacos/Redis/Oracle 连通性时，要明确标为“待真实验收”。
- 发现与当前改动无关的基线失败时记录命令、错误摘要和证据文件，不顺手改无关模块。

## 2. Electron 测试层级

工作目录：`E:\ZZY_PROJECT\AI_lianliao\AionUi`。

### 2.1 聚焦单元测试

企业模块：

```powershell
npm run test -- tests/unit/enterprise
```

客服接待与公共客服协议：

```powershell
npm run test -- tests/unit/customerService tests/unit/process/services/customer-service
```

企业集成测试：

```powershell
npm run test -- tests/integration/enterprise
```

新增普通用户咨询时至少增加并运行：

- 客户 Gateway/API/WS 测试；
- 客户 IPC/Preload 测试；
- 客户 reducer 或状态机测试；
- 普通用户页面 DOM 测试；
- 普通用户与 `roleId=19` 互斥菜单/路由测试；
- 客户通知、托盘未读和退出清理测试。

### 2.2 静态门禁

```powershell
npm run typecheck:enterprise-tests
npm run i18n:types
npm run format:check
npm run lint
```

`i18n:types` 可能生成文件。运行后检查 diff，只提交由本次新增 key 引起的预期内容。

### 2.3 完整测试与构建

```powershell
npm run test
npm run package
```

Windows 发布候选：

```powershell
npm run dist:win
```

`npm run package` 验证 Electron/Vite 编译，不等于安装包完整；`dist:win` 成功也不等于安装、升级和 AionCore 启动已通过。

## 3. H5 测试层级

工作目录：`E:\ZZY_PROJECT\lianshang_liaoning\vip_store`。

客服聚焦测试：

```powershell
npm run test:customer-service
```

类型与构建：

```powershell
npm run vue-tsc
npm run build
```

人工移动端检查至少包括：

- 微信内置浏览器和普通移动浏览器；
- 软键盘弹起/收起；
- iPhone 安全区和 Android 常见分辨率；
- 历史消息向上加载、最新消息自动定位；
- 刷新恢复、断网重连和重复消息；
- 文本、图片、失败重试和会话结束；
- 客服角色守卫与无权限反馈。

## 4. Java 后端测试层级

工作目录：`E:\ZZY_PROJECT\lianshang_liaoning\cloud-service`。

客服或桌面身份聚焦测试可从 `cloud-api` 模块执行，例如：

```powershell
mvn -pl cloud-api -Dtest=CustomerServiceControllerTest,CustomerServiceWebSocketHandlerTest,SignedIdCodecTest test
mvn -pl cloud-api -Dtest=DesktopEnterpriseControllerTest,DesktopEnterpriseServiceImplTest,CommonQrCodeServiceImplDesktopSessionTest test
```

完整 `cloud-api` 及依赖测试：

```powershell
mvn -pl cloud-api -am test
```

构建：

```powershell
mvn -pl cloud-api -am install -DskipTests
```

PowerShell/Maven 对 `-D` 解析异常时使用引号包裹整个属性，例如 `"-DskipTests"`。

后端新增功能必须覆盖：

- 参数格式和非零有符号 ID；
- 未登录、身份不匹配和越权；
- 重复请求与幂等；
- 事务成功、回滚和外部通知失败；
- Mapper/XML 契约；
- Redis 不可用、WebSocket 重连或消息补拉；
- 响应中不泄露敏感字段。

## 5. 数据库核验

客服现有结构的只读核验：

```powershell
Set-Location E:\ZZY_PROJECT\AI_lianliao
python -m unittest tools\test_oracle_readonly.py
python tools\oracle_readonly.py --json
```

数据库变更在任何执行前必须经过用户确认。获准后，验收至少包括：

1. 变更前对象与数据统计；
2. 测试/目标环境和数据库服务名确认；
3. DDL/DML 执行日志；
4. 表、列、索引、约束、序列核验；
5. 重复、空值和状态数据检查；
6. 业务接口回归；
7. 回滚脚本或可逆性验证。

不要在生产数据上用“尝试执行再看结果”的方式验证脚本。

## 6. 客服端到端验收矩阵

| 场景              | Electron 普通用户 | Electron 客服 |                      H5 普通用户 | H5 客服 |
| ----------------- | ----------------: | ------------: | -------------------------------: | ------: |
| 看见在线咨询      |                是 |            否 | 页面可直接访问；业务入口暂不要求 |      否 |
| 看见客服接待      |                否 |            是 |                               否 |      是 |
| 发起/恢复客户会话 |                是 |            否 |                               是 |      否 |
| 接收分配与回复    |                否 |            是 |                               否 |      是 |
| 文本与图片        |                是 |            是 |                               是 |      是 |
| 转接会话          |                否 |            是 |                               否 |      是 |
| 结束会话          |                是 |            是 |                               是 |      是 |

真实验收账号至少准备：

1. 已注册、已绑定企业、非 `roleId=19` 的普通账号；
2. 满足 `roleId=19 AND POST='客服'` 的客服账号；
3. 只有 `roleId=19` 但岗位不是客服的反例账号；
4. 未注册账号；
5. 已注册但未绑定企业的账号。

关键链路：

```text
Electron 客户发文本/图片
→ cloud-gateway 12580
→ cloud-api 12585 持久化 Oracle
→ Redis/WebSocket 推送
→ H5 客服收到、已读、回复
→ Electron 实时收到、未读更新、系统通知定位
```

还要反向验证 H5 客户与 Electron 客服接待，确保双端使用同一会话和消息事实。

## 7. 业务模块验收通则

列表型页面：

- 搜索项、搜索按钮对齐；
- loading、空态和错误态占满内容宽度；
- 分页总数、页码和条件变化正确；
- 翻页后滚到列表表头；
- 窄窗口不撑破页面，主内容可滚动；
- 详情不展示技术 ID，文案为业务语言。

写操作：

- 未登录与越权被后端拒绝；
- 连续点击、网络重试和重复回调保持幂等；
- 成功后列表、详情、首页指标同步；
- 失败不伪造成功状态；
- 有明确确认、loading、防重复提交和错误恢复。

图表：

- 只使用真实接口数据；
- 空数据和接口失败有明确信息；
- ResizeObserver 触发 resize；
- 离开页面销毁实例；
- 图例、单位、tooltip 和筛选条件一致。

## 8. Windows 安装与升级验收

在干净或接近真实用户的 Windows 环境验证：

- 安装路径和首次启动；
- bundled `aioncore.exe` 存在、架构正确且能启动；
- 杀毒软件拦截时错误说明可理解；
- 扫码登录、会话恢复与退出；
- F12 在发布版无效；
- 托盘、关闭行为、系统通知和通知点击；
- 在线更新检查、下载、重启安装和版本变化；
- 从上一正式版升级后用户配置仍可用；
- 卸载不会误删用户目录之外的数据。

## 9. 部署检查

后端/H5 发布前：

- Nginx/网关放行 WebSocket Upgrade，并维持合理超时；
- HTTPS 页面只连接 WSS，不出现 mixed content；
- `cloud-api`、gateway、Redis 和 Nacos 配置来自正确环境；
- 微信模板 `ID=5` 可用且跳转 URL 正确；
- 日志不含 token、ticket、完整 OpenID、手机号或聊天正文；
- 客服定时任务只有预期实例执行，重复实例不会重复推送；
- 数据库脚本版本、执行顺序和回滚说明明确；
- 前端静态资源和后端接口版本兼容。

## 10. 完成定义（Definition of Done）

一个阶段只有同时满足下列条件才可标记“已开发”：

- 需求边界和数据来源已确认；
- 行为有自动化测试且本次运行通过；
- 类型检查、聚焦构建和相关回归通过；
- loading、空态、错误、无权限和重试均已实现；
- Electron 安全边界、后端权限和 ID 规则未被破坏；
- 必要的人工/真实环境验收已记录；
- 文档、接口契约和配置说明同步更新；
- 只提交当前阶段文件，提交采用 Conventional Commit 格式和清晰中文主题；
- 用户未提交改动保持原样；
- 没有未经确认的数据库写入或远端推送。

若真实环境尚未验收，只能写“代码完成/待真实验收”，不能写“全部完成”。
