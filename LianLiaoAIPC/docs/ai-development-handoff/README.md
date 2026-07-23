# 链辽企业桌面项目 AI 开发交接入口

> 更新日期：2026-07-20<br>
> 目标读者：没有本次聊天上下文、能够读取本机三个仓库并执行命令的开发 AI<br>
> 当前开发分支：三个仓库均按用户要求直接在 `master` 开发

## 1. 交接目标

本目录是“链上辽宁·产业云城 + 链辽AI + 链辽真人客服”的当前权威开发交接包。读者应能据此：

1. 理解三个仓库的职责和数据流；
2. 判断哪些能力已经开发，避免重复实现；
3. 找到企业、产品、项目、登录和客服的真实接口；
4. 按依赖顺序继续开发在线咨询、收藏、商机、供需、会员、发布、消息和桌面工具；
5. 遵守数据库、身份、ID、UI、测试和 Git 边界；
6. 在缺少业务依据时先做只读调查，再向用户提出具体问题。

## 2. 文档阅读顺序

| 顺序 | 文档                                                                   | 用途                                                |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| 1    | [01-project-overview.md](./01-project-overview.md)                     | 产品目标、仓库、术语和范围                          |
| 2    | [02-system-architecture.md](./02-system-architecture.md)               | Electron、H5、后端、Oracle、Redis 和 WebSocket 架构 |
| 3    | [03-current-status.md](./03-current-status.md)                         | 当前已开发、部分开发和未开发能力                    |
| 4    | [04-data-and-api-contracts.md](./04-data-and-api-contracts.md)         | 接口、角色、ID、数据库和数据来源                    |
| 5    | [05-development-environment.md](./05-development-environment.md)       | 本地运行、代理、F12、AionCore 和构建命令            |
| 6    | [06-engineering-standards.md](./06-engineering-standards.md)           | TDD、TypeScript、Java、UI、注释、安全和 Git 规范    |
| 7    | [07-implementation-roadmap.md](./07-implementation-roadmap.md)         | 推荐的完整开发阶段、依赖和验收                      |
| 8    | [08-testing-release-acceptance.md](./08-testing-release-acceptance.md) | 自动化、联调、数据库核验和发布门禁                  |
| 9    | [AI_EXECUTION_PROMPT.md](./AI_EXECUTION_PROMPT.md)                     | 可直接复制给开发 AI 的总提示词                      |

## 3. 信息权威优先级

遇到冲突时按以下优先级判断：

1. 用户在当前任务中的最新明确指令；
2. 本交接目录；
3. 当前源码、自动化测试和已提交 Git 历史；
4. 已确认的专项设计规格；
5. 历史实施计划和旧任务清单。

专项设计仍是实现细节的重要来源：

- [Electron 企业用户在线咨询设计](../superpowers/specs/2026-07-20-electron-customer-consultation-design.md)
- [链辽真人客服系统设计](../superpowers/specs/2026-07-17-chain-liaoning-customer-service-design.md)
- [企业工作台扩展设计](../superpowers/specs/2026-07-16-liaoning-industrial-cloud-workbench-expansion-design.md)
- [Ant Design 与 ECharts 迁移设计](../superpowers/specs/2026-07-16-enterprise-antd-echarts-migration-design.md)
- [企业桌面初始设计](../specs/enterprise-code-desktop/design.md)

以下旧文档只能作为历史背景，不能直接代表当前状态：

- `docs/specs/enterprise-code-desktop/remaining-tasks.md` 的客服和 AionCore部分已被后续实现覆盖；
- `2026-07-16-liaoning-industrial-cloud-workbench-expansion-design.md` 中“客服使用 HTTP 轮询、H5 不接入”的旧边界已失效；当前客服使用自建 WebSocket，H5 客户页和 H5 客服接待页已经开发。

## 4. 开发 AI 的启动动作

每次开始工作必须先执行：

```powershell
git -C E:\ZZY_PROJECT\AI_lianliao status --short
git -C E:\ZZY_PROJECT\lianshang_liaoning status --short
```

然后：

1. 阅读本目录和当前阶段对应的专项规格；
2. 检查相关文件是否有用户未提交修改；
3. 运行该模块现有聚焦测试，建立基线；
4. 为新行为先写失败测试，确认失败原因后再实现；
5. 每个可独立验证的阶段使用 Conventional Commit 格式和中文主题提交；
6. 不自动推送远端，除非用户再次明确要求。

## 5. 绝对禁止事项

- 不清理、还原、覆盖或混入用户的未提交修改；
- 不使用 `git reset --hard`、`git checkout --` 清理工作区；
- 不在 Renderer 中直接访问 Node、文件系统、任意 URL 或客服令牌；既有展示上下文可包含明文 `openId`，但新增特权请求不能让 Renderer 自选身份；
- 不把 64 位业务 ID 转换为 JavaScript `number`；
- 不用虚构指标、Mock 成功结果或线上回退掩盖接口失败；
- 不执行数据库新增、修改、删除、DDL、存储过程或锁表，除非用户明确确认；
- 不在没有真实权益、价格、支付和审核规则的情况下自行猜测业务逻辑；
- 不把“入口隐藏”当成后端权限校验。

## 6. 当前必须保留的工作区修改

截至 2026-07-20，`AI_lianliao` 中存在一组未提交品牌图标修改：

```text
M  AionUi/packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseSider.tsx
M  AionUi/packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css
M  AionUi/tests/unit/enterprise/EnterpriseLogout.dom.test.tsx
?? AionUi/packages/desktop/src/renderer/assets/logos/brand/app-mark.png
```

后续 AI 如需修改 `EnterpriseSider.tsx`，必须在这些内容上追加最小改动，不能恢复到 `HEAD`。`cloud-service` 和 `vip_store` 也有与当前主线客服无关的用户改动，详见 [03-current-status.md](./03-current-status.md)。
