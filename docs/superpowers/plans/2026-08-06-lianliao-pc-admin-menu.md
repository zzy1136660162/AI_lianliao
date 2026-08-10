# 链辽 PC 端后台菜单实施计划

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有“桌面消息中心”和“桌面端版本管理”页面注册到 Oracle 后台菜单，并把菜单授权给角色 ID 19。

**Architecture:** 使用一份可重复执行的 Oracle PL/SQL 脚本维护 `JJGC.J_MENU` 和 `JJGC.J_ROLE_MENU`。脚本以父菜单 ID 1025 和页面 URL 为稳定定位条件，在单一事务内创建或校准菜单、补齐角色授权；出现重复活动数据或父级不一致时整笔回滚。

**Tech Stack:** Oracle 11g PL/SQL、`J_MENU`、`J_ROLE_MENU`、链商 JSP 后台。

---

### Task 1: 固化菜单迁移脚本

**Files:**
- Create: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/document/sql/lianliao_pc_admin_menu.sql`

**Step 1:** 校验父菜单 `J_MENU.ID=1025`、名称为“云平台管理”且处于启用状态。

**Step 2:** 以页面 URL 为唯一业务定位条件，创建或校准以下菜单：
- `桌面消息中心` → `/backstage/desktop_notification/desktop_notification_list.jsp`，排序 11。
- `桌面端版本管理` → `/backstage/desktop_version/desktop_version_list.jsp`，排序 12。

**Step 3:** 使用 `SEQ_J_MENU` 分配未占用的菜单 ID，字段遵循同级菜单约定：`T_TYPE=2`、`TYPE=0`、`CODE=P+ID`、`SUPPER_ID=1025`。

**Step 4:** 确认角色 19 已有父菜单授权，并通过 `SEQ_J_ROLE_MENU` 为两个子菜单各创建一条活动授权；若已经存在则复用。

**Step 5:** 所有检查和修改放在一个事务中，异常时回滚。

### Task 2: 执行生产数据库变更

**Files:**
- Read: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/cloud-admin/src/main/resources/application.yml`
- Read: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/document/sql/lianliao_pc_admin_menu.sql`

**Step 1:** 通过已配置公钥的 `10.2.202.23` 主机和现有 Oracle JDBC 驱动连接数据库，不输出或记录凭据。

**Step 2:** 执行迁移脚本中的匿名 PL/SQL 块。

**Step 3:** 回查两条菜单的 ID、父级、URL、排序、状态，以及角色 19 的活动授权数量。

### Task 3: 记录实施结果

**Files:**
- Modify: `E:/ZZY_PROJECT/lianshang_liaoning/README.md`

**Step 1:** 记录页面、父菜单、实际菜单 ID、角色授权结果和脚本路径。

**Step 2:** 记录幂等策略、验证 SQL 和软删除回滚步骤，明确不包含数据库凭据。

### Task 4: 最终验证和清理

**Files:**
- Verify: `E:/ZZY_PROJECT/lianshang_liaoning/cloud-service/document/sql/lianliao_pc_admin_menu.sql`
- Verify: `E:/ZZY_PROJECT/lianshang_liaoning/README.md`

**Step 1:** 确认两个 JSP 页面在源码中存在，数据库 URL 与文件路径一致。

**Step 2:** 确认每个菜单在 `J_MENU` 中只有一条活动记录，且角色 19 对每个菜单只有一条活动授权。

**Step 3:** 运行定向 diff 检查，清理本地和服务器上的临时 JDBC 执行文件。
