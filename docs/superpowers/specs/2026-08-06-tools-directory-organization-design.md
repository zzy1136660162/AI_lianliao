# tools 工具目录分类整理设计

## 目标

将仓库根目录 `tools` 中混放的构建、认证、AI 联调和数据库脚本按职责归类，使目录可以直接表达用途，同时保证脚本行为、测试覆盖和文档命令保持有效。

本次只调整工具文件的位置和相关路径引用，不修改业务逻辑，不发布、不上传、不修改数据库。

## 目标目录

```text
tools/
├─ ai/
│  └─ catalog_ai_model_integration.py
├─ auth/
│  └─ enterprise_openid_login.py
├─ build/
│  └─ windows/
│     ├─ build_lianliao_aipc_windows.ps1
│     └─ build_lianliao_aipc_windows_fast.ps1
├─ database/
│  └─ oracle/
│     ├─ oracle_readonly.py
│     ├─ verify_desktop_message_schema.py
│     ├─ import_urgent_purchases.py
│     └─ requirements.txt
├─ tests/
├─ README.md
└─ .gitignore
```

测试文件继续集中保存在 `tools/tests`，避免为了目录镜像引入额外 Python 包层级；测试文件名已经能够明确对应被测工具。

## 文件迁移映射

| 原路径 | 新路径 |
| --- | --- |
| `tools/catalog_ai_model_integration.py` | `tools/ai/catalog_ai_model_integration.py` |
| `tools/enterprise_openid_login.py` | `tools/auth/enterprise_openid_login.py` |
| `tools/build_lianliao_aipc_windows.ps1` | `tools/build/windows/build_lianliao_aipc_windows.ps1` |
| `tools/build_lianliao_aipc_windows_fast.ps1` | `tools/build/windows/build_lianliao_aipc_windows_fast.ps1` |
| `tools/oracle/oracle_readonly.py` | `tools/database/oracle/oracle_readonly.py` |
| `tools/oracle/verify_desktop_message_schema.py` | `tools/database/oracle/verify_desktop_message_schema.py` |
| `tools/oracle/import_urgent_purchases.py` | `tools/database/oracle/import_urgent_purchases.py` |
| `tools/oracle/requirements.txt` | `tools/database/oracle/requirements.txt` |

## 路径兼容策略

采用彻底迁移方案，不在旧位置保留转发脚本或符号链接。仓库内所有可执行命令、Python 导入、报错提示和开发文档统一更新为新路径，避免长期维护两套入口。

Windows 完整构建脚本移动后不能继续假设 `$PSScriptRoot` 的父目录就是仓库根目录。脚本改为从自身目录向上查找同时包含 `LianLiaoAIPC` 与 `LianLiaoAICore` 的目录；找不到时明确失败。快速构建脚本继续通过同目录引用完整构建脚本。

快速构建入口在调用完整构建脚本前记录开始时间，并在 `finally` 中统一输出开始时间、结束时间和总耗时。总耗时使用“小时/分钟/秒”的中文可读格式；无论构建成功还是抛出异常都必须输出，且不得吞掉原始退出状态。完整构建入口不重复打印这一组计时信息。

Oracle 脚本移动后根据新的目录深度重新计算项目根目录。测试中的导入路径统一改为 `tools.database.oracle.*`，认证测试改为 `tools.auth.enterprise_openid_login`。

## 缓存与忽略规则

删除 `tools` 范围内现有的 Python `__pycache__` 和 `.pyc` 生成物，并确保 `tools/.gitignore` 递归忽略：

- `__pycache__/`
- `*.py[cod]`
- 本地生成的临时日志或查询输出（保留现有规则）

清理只覆盖可再生成的 Python 字节码缓存，不删除源码、测试数据或业务输出。

## 文档更新

更新以下范围内的有效命令和路径：

- `tools/README.md`
- `LianLiaoAIPC/docs/ai-development-handoff`
- `docs/superpowers/specs` 与 `docs/superpowers/plans` 中仍作为当前操作说明使用的路径

历史设计文档中的“迁移前路径”描述可以保留，但可直接复制执行的命令必须指向新路径。

## 验证标准

1. `tools` 根目录只保留分类目录、`README.md` 和 `.gitignore`。
2. 两个 PowerShell 构建脚本通过语法解析、UTF-8 BOM 和 `-WhatIf` 验证。
3. 快速构建仍能找到同目录完整构建脚本，完整构建仍能定位仓库根目录及默认 Core。
4. 快速构建成功和失败时均输出开始时间、结束时间和中文总耗时，失败时仍返回非零退出状态。
5. Python 文件全部通过 `py_compile`。
6. `tools.tests` 下现有四组单元测试全部通过。
7. 仓库搜索不存在仍需执行的旧工具路径。
8. `git diff --check` 通过，且不改动用户已有的无关修改。

## 失败处理

- 任一 Python 导入或脚本路径验证失败时，不宣称整理完成。
- 构建脚本找不到仓库根目录时给出明确中文错误，不回退到当前工作目录。
- 不通过复制保留新旧两份源码；迁移完成后每个工具只有一个权威位置。
