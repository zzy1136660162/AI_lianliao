from __future__ import annotations

import unittest
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import pandas as pd

from tools.database.oracle.import_urgent_purchases import (
    COMPANY_ID,
    EXPECTED_HEADERS,
    EXPECTED_ROW_COUNT,
    DuplicateDemandError,
    execute_import,
    load_workbook_rows,
    main,
    normalize_row,
    preflight_import,
    verify_committed_import,
    validate_headers,
    validate_lengths,
)


def source_row(**overrides: str) -> dict[str, str]:
    values = {
        "紧急采购名称": "需求 A",
        "企业名称": "沈阳北软信息职业技术学院",
        "所在城市": "沈阳市",
        "所在区县": "沈北新区",
        "详细地址": "沈北路53号",
        "采购数量": "1套",
        "采购预算": "5万元以内",
        "产品参数及要求": "参数 A",
        "其他详细说明": "必须提前踏勘，项目联系人：赵老师13274226681",
        "照片附件": "",
    }
    values.update(overrides)
    return values


class FakeCursor:
    def __init__(
        self,
        *,
        duplicate_count: int = 0,
        fail_insert_at: int | None = None,
        current_max: int = 7000,
        unique_conflicts: int = 0,
    ) -> None:
        self.duplicate_count = duplicate_count
        self.fail_insert_at = fail_insert_at
        self.executed: list[tuple[str, tuple[Any, ...]]] = []
        self.statement = ""
        self.insert_count = 0
        self.current_max = current_max
        self.unique_conflicts = unique_conflicts
        self.conflicts_raised = 0
        self.generated_ids: list[int] = []
        self.insert_parameters: list[tuple[Any, ...]] = []
        self.closed = False

    def execute(self, statement: str, parameters: tuple[Any, ...] = ()) -> None:
        self.statement = " ".join(statement.split()).upper()
        self.executed.append((self.statement, tuple(parameters)))
        if self.statement.startswith("INSERT INTO J_COMMON_DEMAND"):
            self.insert_count += 1
            if self.conflicts_raised < self.unique_conflicts:
                self.conflicts_raised += 1
                raise RuntimeError("ORA-00001: unique constraint violated")
            if self.fail_insert_at == self.insert_count:
                raise RuntimeError("simulated insert failure")
            self.generated_ids.append(int(parameters[0]))
            self.insert_parameters.append(tuple(parameters))

    def fetchone(self) -> tuple[Any, ...] | None:
        if "FROM J_CY_COMPANY" in self.statement:
            return (COMPANY_ID, "沈阳北软信息职业技术学院")
        if "COUNT(*)" in self.statement and "DEMAND_NAME" in self.statement:
            return (self.duplicate_count,)
        if "MAX(NO)" in self.statement:
            return (self.current_max,)
        if "COUNT(*)" in self.statement and "NO IN" in self.statement:
            return (len(self.generated_ids),)
        return None

    def fetchall(self) -> list[tuple[Any, ...]]:
        if self.statement.startswith("SELECT NO, DEMAND_NAME"):
            business_rows = [
                (
                    demand_id,
                    parameters[5],
                    parameters[1],
                    parameters[2],
                    parameters[3],
                    parameters[4],
                    parameters[9],
                    parameters[12],
                    parameters[10],
                    parameters[6],
                    parameters[11],
                    parameters[7],
                    parameters[8],
                )
                for demand_id, parameters in zip(self.generated_ids, self.insert_parameters)
            ]
            if "COMPANY_ID" in self.statement:
                return [row + (22, 1, 0, 0, COMPANY_ID) for row in business_rows]
            return business_rows
        return []

    def close(self) -> None:
        self.closed = True


class FakeConnection:
    def __init__(
        self,
        *,
        duplicate_count: int = 0,
        fail_insert_at: int | None = None,
        unique_conflicts: int = 0,
    ) -> None:
        self.cursor_instance = FakeCursor(
            duplicate_count=duplicate_count,
            fail_insert_at=fail_insert_at,
            unique_conflicts=unique_conflicts,
        )
        self.commits = 0
        self.rollbacks = 0
        self.close_calls = 0
        self.jconn = FakeJdbcConnection()

    def cursor(self) -> FakeCursor:
        return self.cursor_instance

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1
        if self.cursor_instance.conflicts_raised:
            self.cursor_instance.current_max = 8000

    def close(self) -> None:
        self.close_calls += 1


class FakeJdbcConnection:
    def __init__(self) -> None:
        self.auto_commit_values: list[bool] = []

    def setAutoCommit(self, value: bool) -> None:
        self.auto_commit_values.append(value)


class UrgentPurchaseWorkbookTest(unittest.TestCase):
    def test_normalize_row_maps_type_22_fields_and_blank_attachment(self) -> None:
        row = normalize_row(source_row())

        self.assertEqual("需求 A", row.demand_name)
        self.assertEqual("1套", row.param3)
        self.assertEqual("参数 A", row.param5)
        self.assertIsNone(row.param6)
        self.assertEqual("赵老师", row.contact_person)
        self.assertEqual("13274226681", row.contact_tel)

    def test_normalize_row_trims_text(self) -> None:
        row = normalize_row(source_row(**{"紧急采购名称": " 需求 A ", "照片附件": " a.jpg,b.jpg "}))

        self.assertEqual("需求 A", row.demand_name)
        self.assertEqual("a.jpg,b.jpg", row.param6)

    def test_validate_headers_requires_exact_order(self) -> None:
        with self.assertRaisesRegex(ValueError, "表头"):
            validate_headers(tuple(reversed(EXPECTED_HEADERS)))

    def test_validate_headers_rejects_surrounding_whitespace(self) -> None:
        headers = list(EXPECTED_HEADERS)
        headers[2] = f" {headers[2]} "

        with self.assertRaisesRegex(ValueError, "表头"):
            validate_headers(headers)

    def test_normalize_row_rejects_blank_required_value(self) -> None:
        with self.assertRaisesRegex(ValueError, "紧急采购名称"):
            normalize_row(source_row(**{"紧急采购名称": " "}))

    def test_normalize_row_allows_blank_optional_values(self) -> None:
        row = normalize_row(
            source_row(
                **{
                    "所在城市": "",
                    "所在区县": "",
                    "详细地址": "",
                    "采购数量": "",
                    "采购预算": "",
                    "产品参数及要求": "",
                }
            )
        )

        self.assertIsNone(row.city)

    def test_normalize_row_rejects_missing_contact_person_or_tel(self) -> None:
        with self.assertRaisesRegex(ValueError, "联系人和手机号"):
            normalize_row(source_row(**{"其他详细说明": "必须提前踏勘"}))

    def test_normalize_row_rejects_blank_contact_person_before_phone(self) -> None:
        with self.assertRaisesRegex(ValueError, "联系人和手机号"):
            normalize_row(source_row(**{"其他详细说明": "项目联系人： 13274226681"}))

    def test_normalize_row_rejects_phone_embedded_in_longer_digit_string(self) -> None:
        with self.assertRaisesRegex(ValueError, "联系人和手机号"):
            normalize_row(source_row(**{"其他详细说明": "项目联系人：赵老师113274226681"}))

    def test_validate_lengths_counts_utf8_bytes(self) -> None:
        with self.assertRaisesRegex(ValueError, "所在城市"):
            normalize_row(source_row(**{"所在城市": "沈" * 17}))

    def test_load_workbook_reads_only_sheet1(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "input.xlsx"
            with pd.ExcelWriter(path) as writer:
                records = [source_row(**{"紧急采购名称": f"需求 {index}"}) for index in range(EXPECTED_ROW_COUNT)]
                pd.DataFrame(records, columns=EXPECTED_HEADERS).to_excel(writer, sheet_name="Sheet1", index=False)
                pd.DataFrame([{"ignored": "value"}]).to_excel(writer, sheet_name="Sheet2", index=False)

            rows = load_workbook_rows(path)

        self.assertEqual(EXPECTED_ROW_COUNT, len(rows))
        self.assertEqual("需求 0", rows[0].demand_name)

    def test_load_workbook_rejects_any_count_other_than_seven(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "input.xlsx"
            pd.DataFrame([source_row()], columns=EXPECTED_HEADERS).to_excel(path, sheet_name="Sheet1", index=False)

            with self.assertRaisesRegex(ValueError, "7"):
                load_workbook_rows(path)


class UrgentPurchaseDatabaseTest(unittest.TestCase):
    def test_execute_import_rejects_non_seven_rows_before_id_allocation(self) -> None:
        connection = FakeConnection()

        with self.assertRaisesRegex(ValueError, "7"):
            execute_import(connection, [normalize_row(source_row())])

        self.assertFalse(any("MAX(NO)" in statement for statement, _ in connection.cursor_instance.executed))

    def test_preflight_does_not_use_sequence_insert_or_commit(self) -> None:
        connection = FakeConnection()

        preflight_import(connection, [normalize_row(source_row())])

        statements = [statement for statement, _ in connection.cursor_instance.executed]
        self.assertFalse(any("SEQ_DEMAND" in statement for statement in statements))
        self.assertFalse(any(statement.startswith("INSERT") for statement in statements))
        self.assertEqual(0, connection.commits)

    def test_preflight_rejects_active_duplicate(self) -> None:
        connection = FakeConnection(duplicate_count=1)

        with self.assertRaises(DuplicateDemandError):
            preflight_import(connection, [normalize_row(source_row())])

    def test_execute_import_commits_public_rows_and_returns_ids(self) -> None:
        connection = FakeConnection()
        rows = [normalize_row(source_row(**{"紧急采购名称": f"需求 {index}"})) for index in range(EXPECTED_ROW_COUNT)]

        generated_ids = execute_import(connection, rows)

        self.assertEqual([7001, 7002, 7003, 7004, 7005, 7006, 7007], generated_ids)
        inserts = [item for item in connection.cursor_instance.executed if item[0].startswith("INSERT")]
        self.assertEqual(EXPECTED_ROW_COUNT, len(inserts))
        self.assertTrue(all("SEQ_DEMAND" not in statement for statement, _ in inserts))
        self.assertTrue(all("CONTACT_PERSON" in statement and "CONTACT_TEL" in statement for statement, _ in inserts))
        self.assertTrue(all(parameters[7:9] == ("赵老师", "13274226681") for _, parameters in inserts))
        self.assertTrue(any("MAX(NO)" in statement for statement, _ in connection.cursor_instance.executed))
        self.assertTrue(all("1, 22" in statement for statement, _ in inserts))
        self.assertTrue(
            any(statement.startswith("SELECT NO, DEMAND_NAME") for statement, _ in connection.cursor_instance.executed)
        )
        self.assertEqual(1, connection.commits)
        self.assertEqual(0, connection.rollbacks)
        self.assertEqual([False], connection.jconn.auto_commit_values)

    def test_post_commit_verification_checks_business_and_public_fields(self) -> None:
        connection = FakeConnection()
        rows = [normalize_row(source_row(**{"紧急采购名称": f"需求 {index}"})) for index in range(EXPECTED_ROW_COUNT)]
        generated_ids = execute_import(connection, rows)
        connection.jconn.auto_commit_values.clear()

        verify_committed_import(connection, generated_ids, rows)

        statements = [statement for statement, _ in connection.cursor_instance.executed]
        self.assertIn("SET TRANSACTION READ ONLY", statements)
        self.assertTrue(any("COMPANY_ID" in statement and statement.startswith("SELECT NO") for statement in statements))
        self.assertEqual([False], connection.jconn.auto_commit_values)

    def test_execute_import_rolls_back_all_rows_on_failure(self) -> None:
        connection = FakeConnection(fail_insert_at=2)
        rows = [normalize_row(source_row(**{"紧急采购名称": f"需求 {index}"})) for index in range(EXPECTED_ROW_COUNT)]

        with self.assertRaisesRegex(RuntimeError, "simulated insert failure"):
            execute_import(connection, rows)

        self.assertEqual(0, connection.commits)
        self.assertEqual(1, connection.rollbacks)

    def test_execute_import_retries_after_concurrent_primary_key_conflict(self) -> None:
        connection = FakeConnection(unique_conflicts=1)
        rows = [normalize_row(source_row(**{"紧急采购名称": f"需求 {index}"})) for index in range(EXPECTED_ROW_COUNT)]

        generated_ids = execute_import(connection, rows)

        self.assertEqual([8001, 8002, 8003, 8004, 8005, 8006, 8007], generated_ids)
        self.assertEqual(1, connection.rollbacks)
        self.assertEqual(1, connection.commits)

    def test_execute_import_allows_three_retries_after_unique_conflicts(self) -> None:
        connection = FakeConnection(unique_conflicts=3)
        rows = [normalize_row(source_row(**{"紧急采购名称": f"需求 {index}"})) for index in range(EXPECTED_ROW_COUNT)]

        generated_ids = execute_import(connection, rows)

        self.assertEqual([8001, 8002, 8003, 8004, 8005, 8006, 8007], generated_ids)
        self.assertEqual(3, connection.rollbacks)
        self.assertEqual(1, connection.commits)

    def test_execute_import_raises_after_three_retries_are_exhausted(self) -> None:
        connection = FakeConnection(unique_conflicts=4)
        rows = [normalize_row(source_row(**{"紧急采购名称": f"需求 {index}"})) for index in range(EXPECTED_ROW_COUNT)]

        with self.assertRaisesRegex(RuntimeError, "ORA-00001"):
            execute_import(connection, rows)

        self.assertEqual(4, connection.rollbacks)
        self.assertEqual(0, connection.commits)

    def test_main_does_not_close_committed_connection_twice_when_reconnect_fails(self) -> None:
        connection = FakeConnection()
        rows = [normalize_row(source_row(**{"紧急采购名称": f"需求 {index}"})) for index in range(EXPECTED_ROW_COUNT)]
        settings = SimpleNamespace(password="secret", jdbc_url="jdbc:oracle:thin:@example")

        with (
            patch("tools.database.oracle.import_urgent_purchases.load_workbook_rows", return_value=rows),
            patch("tools.database.oracle.import_urgent_purchases.load_connection_settings", return_value=settings),
            patch("tools.database.oracle.import_urgent_purchases._connect", side_effect=[connection, RuntimeError("reconnect failed")]),
        ):
            with redirect_stderr(StringIO()):
                result = main(["--execute"])

        self.assertEqual(1, result)
        self.assertEqual(1, connection.close_calls)


if __name__ == "__main__":
    unittest.main()
