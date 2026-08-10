# Codex 依赖锁定与托管资源复用设计

## 背景

LianLiaoAICore 通过 `@agentclientprotocol/codex-acp` 安装 Codex ACP。该桥接包声明
`@openai/codex: ^0.144.0`，如果每次准备托管资源时重新生成 `package-lock.json`，npm 会按当时
仓库状态选择不同的 Codex 版本和平台包。结果是同一份 Core 源码可能产生不同资源，甚至出现
npm 返回成功、但目标平台 `codex` 可执行文件缺失的情况。

本地开发每次替换 `aioncore.exe` 也会重新下载 Node 与 ACP 资源，耗时长且放大网络、npm 镜像和
安全软件带来的不确定性。

## 目标

1. Core 对 Codex ACP 桥接包、Codex CLI 主包和六个平台包使用精确版本。
2. npm 安装前后校验锁文件版本和 SHA-512 完整性；校验失败立即中止。
3. 本地 Core 二进制更新时可复用当前已经验证的托管资源。
4. 复用过程采用“校验、复制到 staging、再次校验、原子切换”，不覆盖可用旧资源。
5. 正式 Release 不复用本地资源，继续从锁定 Core Release 全新准备并校验。

## 设计

### 单一依赖锁

在 `LianLiaoAICore/managed-acp-lock.json` 保存：

- Codex ACP 桥接包精确版本与 npm SHA-512；
- Codex CLI 主包精确版本与 npm SHA-512；
- `win32-x64`、`win32-arm64`、`darwin-x64`、`darwin-arm64`、`linux-x64`、
  `linux-arm64` 平台包精确版本、npm SHA-512 和预期可执行文件路径。

Core 编译时通过 `include_str!` 嵌入该文件，因此运行时不会读取可变的外部配置。

### Core 准备流程

1. `npm install --package-lock-only --save-exact` 同时安装固定版本的 Codex ACP 和 Codex CLI。
2. 读取生成的 `package-lock.json`，校验根依赖、桥接包、主包和目标平台包。
3. `npm ci` 依据 lockfile 自带的 integrity 校验下载内容。
4. 再校验安装后的三个 `package.json` 版本和目标平台可执行文件。
5. Core 激活缓存或随应用捆绑的 Codex ACP 时，也执行同样的锁与安装结果校验。

这样即使上游桥接包仍声明 `^0.144.0`，根项目的精确依赖也会覆盖其可变范围。

### AIPC 本地复用流程

仅当显式指定 `LIANLIAO_AICORE_LOCAL_BINARY` 且不是正式 Release 时启用：

1. 验证现有 `managed-resources` 的结构契约和必需文件。
2. 使用 Core 的依赖锁校验 Codex `package-lock.json` 与已安装版本。
3. 对资源契约、Node 可执行文件、ACP lockfile、入口脚本和平台可执行文件计算 SHA-256 清单。
4. 若外层 manifest 已有完整性清单，必须逐项匹配；旧资源可在通过依赖锁校验后安全升级清单。
5. 将资源复制到新的 staging，写入新 Core 二进制和完整性清单，再做一次完整校验。
6. 通过后原子替换目标目录；任一步失败则保留旧目录并回退到 Core 的重新准备流程。

正式构建、Actions artifact 构建和锁定 Release 构建不进入本地复用分支。

## 失败行为

- 版本或 integrity 不匹配：Core 准备失败，不允许降级为警告。
- 资源文件被修改或缺失：拒绝复用，尝试重新准备。
- staging 复制或校验失败：删除 staging，保留原有可用目录。
- 正式 Release 检测到本地二进制或信任本地资源标志：立即失败。

## 验证范围

- Core 单元测试：精确安装参数、合法 lockfile、版本漂移、integrity 漂移、平台不匹配。
- AIPC 单元测试：完整性清单生成/校验、本地复用成功、篡改后拒绝、正式构建拒绝。
- Windows 本机验证：替换 Core 后确认日志显示复用，且未执行耗时的
  `prepare-managed-resources` 下载流程。
