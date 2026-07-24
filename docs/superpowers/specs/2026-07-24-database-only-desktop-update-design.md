# 链辽桌面端数据库唯一更新通道设计

## 目标

链辽桌面端只使用 `J_CY_DESKTOP_VERSION` 与
`J_CY_DESKTOP_VERSION_PACKAGE` 提供的版本数据。客户端自动检查是否存在新版本，
但安装包必须经用户确认后下载到系统“下载”目录；下载完成后校验文件大小与
SHA256，再由用户决定是否打开安装包。客户端不静默安装，也不再查询 AionUi
上游更新源。

首批正式发布运行目标共五个：

1. Windows x64 EXE
2. Windows ARM64 EXE
3. macOS Intel DMG
4. macOS Apple Silicon DMG
5. Ubuntu x64 DEB

Windows 32 位不属于正式支持范围，不写入版本数据。

## 架构

### 版本元数据

- `J_CY_DESKTOP_VERSION` 保存版本号、版本代码、更新说明、强制更新标记与发布状态。
- `J_CY_DESKTOP_VERSION_PACKAGE` 保存每个系统和架构唯一的下载地址、SHA256 与文件大小。
- 安装包本体放在链辽文件服务器
  `/mnt/web/beiruan_ai/desktop_lianliao`。
- 对外下载前缀固定为
  `https://cloud.lslnii.com/cloud-beiruan-ai/desktop_lianliao/`。

### 客户端数据流

1. Electron 企业工作台启动后，通过 `DesktopVersionController/getLatest` 查询当前运行目标的最新包。
2. 主进程使用 `process.platform` 与 `process.arch` 映射数据库的
   `platform + architecture`，只接收当前运行目标的包。
3. 若服务端版本高于 `app.getVersion()`，普通版本在版本中心提示；强制版本展示不可绕过的下载提示。
4. 用户确认后，主进程将文件写入系统“下载”目录。
5. 下载完成后严格比对 `sizeBytes` 与 `sha256`。任一不一致即删除临时文件并报告失败。
6. 校验成功后保留文件，提示用户打开。是否执行安装始终由用户决定。

### 旧更新通道处置

- 删除应用启动后三秒调用 `electron-updater` 的逻辑。
- 托盘“检查更新”和 AI 设置页“检查更新”统一导航到
  `/enterprise/version-update`。
- 不再挂载旧的右下角 AionUi 更新卡片。
- 旧模块暂时保留，避免一次性删除大量共享类型和历史测试；生产界面与启动流程不再调用它。
- 将遗留下载源常量改为链辽自有域名，作为防御性兜底，代码中不再保留
  `static.aionui.com` 更新源。

## 发布流程

1. GitHub Actions 构建并产生五个目标安装包。
2. 将包下载到服务器版本专用临时目录。
3. 在服务器执行 SHA256 与文件大小校验。
4. 校验全部通过后原子移动到正式目录。
5. 对五个公网 URL 进行 HTTP 可访问性和 Content-Length 检查。
6. 调用 `DesktopVersionAdminController/publish` 一次性写入版本头和五个包。
7. 查询管理接口与数据库，确认版本状态为 `PUBLISHED` 且包记录完整。

数据库发布必须最后执行。上传或校验过程中任一包失败，都不得创建版本记录。

## 失败与回滚

- 上传失败：删除临时目录，不改变正式文件和数据库。
- 公网检查失败：保留已上传文件用于排查，但不发布数据库版本。
- 数据库发布失败：不重复使用新的版本代码盲目重试；先查询是否已成功提交。
- 已发布版本发现问题：通过管理接口撤销版本。安装包可暂时保留，避免正在下载的客户端突然断流。
- 客户端校验失败：删除 `.part` 临时文件，不提供“打开安装包”操作。

## 验收标准

- 应用启动、托盘检查更新、AI 设置页检查更新均不访问 AionUi 更新源。
- 五个安装包的服务器文件大小和 SHA256 与构建产物一致。
- 五个公网 URL 可下载，且数据库 URL 完全使用链辽服务器前缀。
- `getLatest` 能针对五个运行目标返回相应包。
- 当前 2.1.27 客户端能看到 2.1.28，下载后完成大小和 SHA256 校验。
- 普通更新不会静默安装。

