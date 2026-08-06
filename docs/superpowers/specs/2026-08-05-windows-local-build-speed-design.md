# Windows 本地打包加速设计

## 背景

`LianLiaoAIPC` 的增量构建已经可以跳过未变化的 Vite 输出，但每次 `build-win` 仍重新下载并展开锁定的 LianLiaoAICore、重新准备约 880 MB 的托管资源。准备失败或目录被占用时产生的 `.preparing-*`、`.stale-*` 目录也会被 `extraResources` 一并扫描、复制和压缩；当前该资源根目录已膨胀到约 3.03 GB、32,492 个文件。

## 目标

- 本地重复执行 `npm run build-win` 时复用来源一致且结构完整的 Core 资源。
- 打包输入只包含当前目标平台和架构的有效 Core 目录，不包含准备中或失效备份目录。
- 输出各阶段耗时和最终安装包绝对路径，便于继续定位瓶颈。
- 不降低正式发布的 Release 来源、版本锁和 SHA256 校验要求。

## 设计

1. Windows 本机执行常用的 `build-win` 时默认信赖已准备的目标架构 Core 资源；只检查 `aioncore.exe` 和 `managed-resources` 目录是否存在，不读取 Release manifest，也不计算 SHA256。`build-win:verified` 保留本机完整校验入口。
2. 本地资源缺失或结构不完整时回退到锁定 GitHub Release 的下载和 SHA256 校验流程。`LIANLIAO_RELEASE_BUILD=1` 禁止信赖本地资源，GitHub 正式构建始终执行完整校验。
3. 清理仅限 `resources/bundled-aioncore` 下符合 `.preparing-*`、`.stale-*` 命名的生成目录。仍属于活动构建进程的 `.preparing-<pid>` 不清理；清理失败直接排除于打包输入，不影响有效目标目录。
4. `electron-builder.yml` 的 Core `extraResources` 增加过滤器，防止临时或备份目录进入安装包。该过滤是清理失败时的第二道保护。
5. 本地信赖模式使用 `compression=store` 和 NSIS ZIP 载荷，消除 1.79 GB 解包内容的高压缩等待；`build-win:verified` 与 GitHub 正式构建保持压缩发布路径。
6. 构建脚本记录 Vite、MCP、Core、Hub 和 electron-builder 阶段耗时，并在成功后验证目标安装包存在，打印绝对路径、大小及总耗时。

## 失败处理

- 本地快速模式缺少 Core 二进制或托管资源目录时，回退到原有下载和完整准备流程，不打包部分资源。
- 正式发布不使用快速缓存捷径，继续由 `aioncore-release-lock.json` 和 Release 资产 SHA256 决定成败。
- 清理只触达已确认位于 Core 资源根目录内且名称匹配的生成目录，不删除有效平台目录或用户数据。

## 验证

- 为缓存命中、缓存失效、正式发布强制重建、临时目录识别和活动 PID 保护增加聚焦测试。
- 运行受影响测试、脚本语法检查、桌面端类型检查。
- 完整执行一次 Windows x64 打包；再次执行验证 Core 缓存命中、临时目录未进入包、安装包路径被正确报告，并比较两次耗时。
