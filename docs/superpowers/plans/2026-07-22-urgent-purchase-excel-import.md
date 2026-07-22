# Urgent Purchase Excel Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import seven approved, public type-22 urgent-purchase rows from the supplied Excel workbook into `JJGC.J_COMMON_DEMAND` through a guarded, reusable Python command, while organizing the existing Oracle tools.

**Architecture:** Keep shared Oracle connection and schema-verification code in `tools/oracle`, and place tests in `tools/tests`. The importer has pure Excel normalization and validation functions covered by unit tests, plus a narrow database adapter that performs duplicate preflight and seven inserts in one transaction; dry-run is the default and `--execute` is the only write switch.

**Tech Stack:** Python 3.10, pandas/openpyxl, JayDeBeApi, Oracle JDBC, unittest, PowerShell.

---

### Task 1: Organize Existing Oracle Tools

**Files:**
- Move: `tools/oracle_readonly.py` → `tools/oracle/oracle_readonly.py`
- Move: `tools/verify_desktop_message_schema.py` → `tools/oracle/verify_desktop_message_schema.py`
- Move: `tools/requirements-oracle-readonly.txt` → `tools/oracle/requirements.txt`
- Move: `tools/test_oracle_readonly.py` → `tools/tests/test_oracle_readonly.py`
- Modify: `tools/tests/test_oracle_readonly.py`
- Modify: `tools/tests/test_verify_desktop_message_schema.py`
- Modify: `tools/oracle/oracle_readonly.py`
- Modify: `tools/README.md`
- Modify: repository documentation paths returned by `rg "tools[\\/]oracle_readonly"`

- [ ] **Step 1: Move tracked files into responsibility-based directories**

Use Git-aware moves so history is retained:

```powershell
New-Item -ItemType Directory -Force tools\oracle
git mv tools\oracle_readonly.py tools\oracle\oracle_readonly.py
git mv tools\verify_desktop_message_schema.py tools\oracle\verify_desktop_message_schema.py
git mv tools\requirements-oracle-readonly.txt tools\oracle\requirements.txt
git mv tools\test_oracle_readonly.py tools\tests\test_oracle_readonly.py
```

- [ ] **Step 2: Update imports and path calculations**

Change test imports to `tools.oracle.oracle_readonly` and `tools.oracle.verify_desktop_message_schema`. In `oracle_readonly.py`, calculate the projects root from the moved file using:

```python
PROJECTS_ROOT = Path(__file__).resolve().parents[3]
```

Change the dependency error to reference `tools/oracle/requirements.txt`.

- [ ] **Step 3: Run moved tests**

Run:

```powershell
python -m unittest tools.tests.test_oracle_readonly tools.tests.test_verify_desktop_message_schema -v
```

Expected: all existing tests pass from their new package paths.

- [ ] **Step 4: Update usage documentation**

Update `tools/README.md` commands to `python tools/oracle/oracle_readonly.py` and `python -m pip install -r tools/oracle/requirements.txt`. Update repository documentation references without changing unrelated content.

### Task 2: Add Importer Unit Tests

**Files:**
- Create: `tools/tests/test_import_urgent_purchases.py`
- Create: `tools/oracle/import_urgent_purchases.py`

- [ ] **Step 1: Write failing mapping and normalization tests**

Cover the exact ten headers and mapping:

```python
EXPECTED_HEADERS = (
    "紧急采购名称", "企业名称", "所在城市", "所在区县", "详细地址",
    "采购数量", "采购预算", "产品参数及要求", "其他详细说明", "照片附件",
)

def test_normalize_row_maps_type_22_columns(self):
    row = normalize_row(dict(zip(EXPECTED_HEADERS, [
        "需求 A", "企业 A", "沈阳市", "沈北新区", "地址 A",
        "1套", "5万元以内", "参数 A", "说明 A", "",
    ])))
    self.assertEqual("1套", row.param3)
    self.assertEqual("参数 A", row.param5)
    self.assertIsNone(row.param6)
```

Also test trimming, wrong headers, missing required fields, and Oracle byte-length overflow.

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
python -m unittest tools.tests.test_import_urgent_purchases -v
```

Expected: import failure because `tools.oracle.import_urgent_purchases` does not yet exist.

- [ ] **Step 3: Implement pure workbook validation**

Add immutable `UrgentPurchaseRow`, `load_workbook_rows`, `normalize_row`, `validate_headers`, and `validate_lengths`. Read only `Sheet1`, require the exact header order, reject blank required cells, convert blank attachments to `None`, and validate encoded UTF-8 byte lengths against target Oracle limits.

- [ ] **Step 4: Run pure tests to verify pass**

Run the importer unit-test module and expect all pure validation tests to pass.

### Task 3: Add Guarded Transaction Import

**Files:**
- Modify: `tools/oracle/import_urgent_purchases.py`
- Modify: `tools/tests/test_import_urgent_purchases.py`

- [ ] **Step 1: Write failing database-behavior tests**

Use fake connection/cursor objects to prove:

- dry-run 不分配 `MAX(NO)+1`，也不执行 `INSERT` 或调用 `commit`；
- active duplicates abort before ID allocation;
- execute inserts all rows with `TYPE=22`, `IS_CHECK=1`, `DEL_SIGN=0`, `COMPANY_ID=400496` and non-empty contact fields;
- any insert failure calls `rollback` and never calls `commit`;
- successful execute commits exactly once and returns seven generated `NO` values.

- [ ] **Step 2: Run tests to verify failure**

Run the focused database tests and expect missing `preflight_import` / `execute_import` failures.

- [ ] **Step 3: Implement preflight and execute functions**

Implement fixed SQL only. Duplicate detection must use bind parameters for `(TYPE, DEMAND_NAME, COMPANY_NAME, DEL_SIGN)`. Each insert must use:

```sql
INSERT INTO J_COMMON_DEMAND (
    NO, COMPANY_NAME, CITY, DISTRICT, ADDRESS, DEMAND_NAME, INTRO,
    CONTACT_PERSON, CONTACT_TEL,
    IS_CHECK, TYPE, PARAM3, PARAM5, PARAM6, DEMAND_STATE, BUDGET,
    COMPANY_ID, GRAB_NUM, DEL_SIGN, INPUT_TIME, END_TIME
) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?,
    1, 22, ?, ?, ?, 0, ?,
    400496, 0, 0,
    TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS'),
    TO_CHAR(SYSDATE + 30, 'YYYYMMDDHH24MISS')
)
```

显式关闭 JDBC 自动提交，读取 `MAX(NO)` 后连续分配 7 个编号。从“其他详细说明”提取联系人和手机号写入 `CONTACT_PERSON`、`CONTACT_TEL`；无法提取则终止。发生 `ORA-00001` 时整体回滚并重新读取最大值，初次执行后最多重试 3 次。提交前查询生成的 7 个编号并逐列核对业务字段与公开状态。

- [ ] **Step 4: Implement CLI safety boundary**

Provide `--input`, `--config`, `--jdbc-jar`, and mutually exclusive behavior where absence of `--execute` is dry-run. Log row counts, titles, and IDs only; never log connection secrets or the `INTRO` body.

- [ ] **Step 5: Run all tool tests**

Run:

```powershell
python -m unittest discover -s tools/tests -p "test_*.py" -v
```

Expected: all tool tests pass.

### Task 4: Dry-Run Against the Real Workbook and Oracle

**Files:**
- Read: `E:/ZZY_PROJECT/lianshang_liaoning/docs/附录文件/紧急采购需求字段1.xlsx`

- [ ] **Step 1: Record source checksum**

Run `Get-FileHash` and retain the SHA-256 for post-import verification.

- [ ] **Step 2: Run importer without execute flag**

Run:

```powershell
python tools/oracle/import_urgent_purchases.py --input "E:\ZZY_PROJECT\lianshang_liaoning\docs\附录文件\紧急采购需求字段1.xlsx"
```

Expected: `DRY RUN PASS`, 7 validated rows, company ID 400496, zero active duplicates, and no generated IDs.

- [ ] **Step 3: Confirm database remains unchanged**

Run a read-only count for the seven exact demand names and expect zero.

### Task 5: Execute and Verify the Import

**Files:**
- No file changes; database transaction only.

- [ ] **Step 1: Execute the guarded import**

Run:

```powershell
python tools/oracle/import_urgent_purchases.py --input "E:\ZZY_PROJECT\lianshang_liaoning\docs\附录文件\紧急采购需求字段1.xlsx" --execute
```

Expected: one committed transaction and seven generated `NO` values.

- [ ] **Step 2: Verify committed rows read-only**

Query only the returned IDs and require:

```text
row count = 7
TYPE = 22
IS_CHECK = 1
DEL_SIGN = 0
DEMAND_STATE = 0
COMPANY_ID = 400496
```

Compare the ten imported business columns with normalized Excel rows.

- [ ] **Step 3: Verify source workbook unchanged**

Re-run `Get-FileHash`; expected SHA-256 equals the pre-import checksum.

- [ ] **Step 4: Run final repository checks**

Run all tool unit tests, `git diff --check`, and `git status --short`. Confirm unrelated dirty-worktree changes were not modified or staged.

### Task 6: Document Result

**Files:**
- Modify: `tools/README.md`

- [ ] **Step 1: Document importer usage and safety flags**

Add dry-run and `--execute` examples, fixed mapping, duplicate behavior, rollback behavior, and the `MAX(NO)+1` ID allocation rule.

- [ ] **Step 2: Report import receipt**

Provide the seven generated `NO` values, verification result, Excel checksum preservation, tests run, and the list of moved/created files. Do not include contact phone numbers or database credentials.
