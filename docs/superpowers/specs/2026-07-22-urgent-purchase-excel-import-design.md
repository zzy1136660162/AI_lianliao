# 紧急采购 Excel 导入设计

## 目标

将 `E:\ZZY_PROJECT\lianshang_liaoning\docs\附录文件\紧急采购需求字段1.xlsx` 的 `Sheet1` 中 7 条紧急采购需求原子导入 Oracle `JJGC.J_COMMON_DEMAND`，并整理 `E:\ZZY_PROJECT\AI_lianliao\tools` 下现有 Oracle 工具。

## 已核验事实

- `Sheet1` 有 7 条有效数据，无整行重复；`Sheet2`、`Sheet3` 为空。
- 目标表没有 `ID` 列，主键为 `NO`。
- `SEQ_DEMAND` 存在，导入时以 `SEQ_DEMAND.NEXTVAL` 生成 `NO`。
- 7 个需求名称在当前未删除的 `TYPE=22` 数据中均不存在。
- 企业名称“沈阳北软信息职业技术学院”对应有效企业 `J_CY_COMPANY.ID=400496`；另一个同名档案 `ID=460704` 已删除，不使用。
- Excel 的“其他详细说明”包含联系人和手机号，按用户提供的原始业务文本写入 `INTRO`，不拆分到 `CONTACT_PERSON` 或 `CONTACT_TEL`。

## 字段映射

| Excel 列 | J_COMMON_DEMAND 列 | 规则 |
| --- | --- | --- |
| 紧急采购名称 | `DEMAND_NAME` | 必填，去除首尾空白 |
| 企业名称 | `COMPANY_NAME` | 必填，去除首尾空白 |
| 所在城市 | `CITY` | 去除首尾空白 |
| 所在区县 | `DISTRICT` | 去除首尾空白 |
| 详细地址 | `ADDRESS` | 去除首尾空白 |
| 采购数量 | `PARAM3` | 去除首尾空白 |
| 采购预算 | `BUDGET` | 去除首尾空白 |
| 产品参数及要求 | `PARAM5` | 去除首尾空白 |
| 其他详细说明 | `INTRO` | 去除首尾空白，保留正文中的联系人信息 |
| 照片附件 | `PARAM6` | 空单元格写入 `NULL`；非空值原样写入 |

固定字段：

- `NO = SEQ_DEMAND.NEXTVAL`
- `TYPE = 22`
- `COMPANY_ID = 400496`
- `DEL_SIGN = 0`
- `IS_CHECK = 1`
- `DEMAND_STATE = 0`
- `GRAB_NUM = 0`
- `INPUT_TIME = TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS')`
- `END_TIME = TO_CHAR(SYSDATE + 30, 'YYYYMMDDHH24MISS')`

未提供的可空身份与联系人字段保持 `NULL`；`OPEN_ID` 不显式写入，使用表默认值。

## 导入程序

新增 `tools/oracle/import_urgent_purchases.py`：

1. 从现有 Spring `application.yml` 或 `ORACLE_*` 环境变量读取连接配置，凭据不写入源码或日志。
2. 校验文件存在、工作表、精确表头、7 行有效数据、必填值、目标列长度和企业档案。
3. 按 `TYPE + DEMAND_NAME + COMPANY_NAME + DEL_SIGN=0` 检查目标库重复项。
4. 默认仅执行 `--dry-run` 校验；只有显式传入 `--execute` 才允许写入。
5. 正式执行时在一个事务内插入全部 7 条；任意校验或插入失败则回滚全部数据。
6. 提交前在同一事务中按生成的 `NO` 核对行数和固定字段；成功后提交。
7. 提交后重新只读查询 7 个 `NO`，输出不含敏感正文的验证摘要。

脚本不接受任意 SQL，不提供更新、删除或 DDL 能力。

## 幂等与失败处理

- 预检发现任意重复项时整体终止，不跳过、不覆盖，避免产生部分导入或掩盖源数据差异。
- Excel 表头、必填字段、长度、企业档案或数据库对象不符合预期时整体终止。
- 正式执行的任何异常都会回滚事务；Oracle 序列值即使回滚也可能产生空洞，这是 Oracle 序列的正常行为，不影响主键正确性。
- 已提交后的业务回滚不由导入脚本自动执行；如确需撤销，使用执行结果中的 7 个 `NO` 编写并人工确认独立回滚 SQL。

## 工具目录整理

整理后结构：

```text
tools/
├── oracle/
│   ├── oracle_readonly.py
│   ├── verify_desktop_message_schema.py
│   ├── import_urgent_purchases.py
│   └── requirements.txt
├── tests/
│   ├── test_oracle_readonly.py
│   └── test_verify_desktop_message_schema.py
├── README.md
└── .gitignore
```

移动文件时同步修改 Python 导入路径、默认路径计算、错误提示、README 命令和仓库内文档引用。保留根目录 `README.md` 与 `.gitignore` 作为工具入口说明和忽略规则。

## 验证

- 对导入脚本添加字段映射、空值、表头错误、长度超限、重复检测、默认 dry-run 和事务回滚测试。
- 更新并运行移动后的两个现有工具测试。
- 先运行导入脚本 dry-run，确认预期插入 7 条且无重复。
- 正式执行后确认返回 7 个新 `NO`。
- 按新 `NO` 查询 `TYPE=22`、`IS_CHECK=1`、`DEL_SIGN=0`，确认 7 条均可公开查询。
- 确认 Excel 原文件未被修改。

## 不在本次范围

- 不修改 Excel 内容或格式。
- 不修改其他供需类型数据。
- 不补写 `CONTACT_PERSON`、`CONTACT_TEL`、`OPEN_ID`、`USER_ID` 或 `UNION_ID`。
- 不清理、覆盖或提交工作区中与本任务无关的已有修改。
