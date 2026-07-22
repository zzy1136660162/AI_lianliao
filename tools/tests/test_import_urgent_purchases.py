from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import pandas as pd

from tools.oracle.import_urgent_purchases import (
    COMPANY_ID,
    EXPECTED_HEADERS,
    DuplicateDemandError,
    execute_import,
    load_workbook_rows,
    normalize_row,
    preflight_import,
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
        "其他详细说明": "说明 A",
        "照片附件": "",
    }
    values.update(overrides)
    return values


class FakeCursor:
    def __init__(self, *, duplicate_count: int = 0, fail_insert_at: int | None = None) -> None:
        self.duplicate_count = duplicate_count
        self.fail_insert_at = fail_insert_at
        self.executed: list[tuple[str, tuple[Any, ...]]] = []
        self.statement = ""
        self.insert_count = 0
        self.current_sequence = 6017
        self.generated_ids: list[int] = []
        self.insert_parameters: list[tuple[Any, ...]] = []
        self.closed = False

    def execute(self, statement: str, parameters: tuple[Any, ...] = ()) -> None:
        self.statement = " ".join(statement.split()).upper()
        self.executed.append((self.statement, tuple(parameters)))
        if self.statement.startswith("INSERT INTO J_COMMON_DEMAND"):
            self.insert_count += 1
            if self.fail_insert_at == self.insert_count:
                raise RuntimeError("simulated insert failure")
            self.current_sequence += 1
            self.generated_ids.append(self.current_sequence)
            self.insert_parameters.append(tuple(parameters))

    def fetchone(self) -> tuple[Any, ...] | None:
        if "FROM J_CY_COMPANY" in self.statement:
            return (COMPANY_ID, "沈阳北软信息职业技术学院")
        if "COUNT(*)" in self.statement and "DEMAND_NAME" in self.statement:
            return (self.duplicate_count,)
        if "SEQ_DEMAND.CURRVAL" in self.statement:
            return (self.current_sequence,)
        if "COUNT(*)" in self.statement and "NO IN" in self.statement:
            return (len(self.generated_ids),)
        return None

    def fetchall(self) -> list[tuple[Any, ...]]:
        if self.statement.startswith("SELECT NO, DEMAND_NAME"):
            return [
                (
                    demand_id,
                    parameters[4],
                    parameters[0],
                    parameters[1],
                    parameters[2],
                    parameters[3],
                    parameters[6],
                    parameters[9],
                    parameters[7],
                    parameters[5],
                    parameters[8],
                )
                for demand_id, parameters in zip(self.generated_ids, self.insert_parameters)
            ]
        return []

    def close(self) -> None:
        self.closed = True


class FakeConnection:
    def __init__(self, *, duplicate_count: int = 0, fail_insert_at: int | None = None) -> None:
        self.cursor_instance = FakeCursor(duplicate_count=duplicate_count, fail_insert_at=fail_insert_at)
        self.commits = 0
        self.rollbacks = 0

    def cursor(self) -> FakeCursor:
        return self.cursor_instance

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1


class UrgentPurchaseWorkbookTest(unittest.TestCase):
    def test_normalize_row_maps_type_22_fields_and_blank_attachment(self) -> None:
        row = normalize_row(source_row())

        self.assertEqual("需求 A", row.demand_name)
        self.assertEqual("1套", row.param3)
        self.assertEqual("参数 A", row.param5)
        self.assertIsNone(row.param6)

    def test_normalize_row_trims_text(self) -> None:
        row = normalize_row(source_row(**{"紧急采购名称": " 需求 A ", "照片附件": " a.jpg,b.jpg "}))

        self.assertEqual("需求 A", row.demand_name)
        self.assertEqual("a.jpg,b.jpg", row.param6)

    def test_validate_headers_requires_exact_order(self) -> None:
        with self.assertRaisesRegex(ValueError, "表头"):
            validate_headers(tuple(reversed(EXPECTED_HEADERS)))

    def test_normalize_row_rejects_blank_required_value(self) -> None:
        with self.assertRaisesRegex(ValueError, "紧急采购名称"):
            normalize_row(source_row(**{"紧急采购名称": " "}))

    def test_validate_lengths_counts_utf8_bytes(self) -> None:
        with self.assertRaisesRegex(ValueError, "所在城市"):
            normalize_row(source_row(**{"所在城市": "沈" * 17}))

    def test_load_workbook_reads_only_sheet1(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "input.xlsx"
            with pd.ExcelWriter(path) as writer:
                pd.DataFrame([source_row()], columns=EXPECTED_HEADERS).to_excel(writer, sheet_name="Sheet1", index=False)
                pd.DataFrame([{"ignored": "value"}]).to_excel(writer, sheet_name="Sheet2", index=False)

            rows = load_workbook_rows(path)

        self.assertEqual(1, len(rows))
        self.assertEqual("需求 A", rows[0].demand_name)


class UrgentPurchaseDatabaseTest(unittest.TestCase):
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
        rows = [normalize_row(source_row(**{"紧急采购名称": f"需求 {index}"})) for index in range(1, 3)]

        generated_ids = execute_import(connection, rows)

        self.assertEqual([6018, 6019], generated_ids)
        inserts = [item for item in connection.cursor_instance.executed if item[0].startswith("INSERT")]
        self.assertEqual(2, len(inserts))
        self.assertTrue(all("SEQ_DEMAND.NEXTVAL" in statement for statement, _ in inserts))
        self.assertTrue(all("1, 22" in statement for statement, _ in inserts))
        self.assertTrue(
            any(statement.startswith("SELECT NO, DEMAND_NAME") for statement, _ in connection.cursor_instance.executed)
        )
        self.assertEqual(1, connection.commits)
        self.assertEqual(0, connection.rollbacks)

    def test_execute_import_rolls_back_all_rows_on_failure(self) -> None:
        connection = FakeConnection(fail_insert_at=2)
        rows = [normalize_row(source_row(**{"紧急采购名称": f"需求 {index}"})) for index in range(1, 3)]

        with self.assertRaisesRegex(RuntimeError, "simulated insert failure"):
            execute_import(connection, rows)

        self.assertEqual(0, connection.commits)
        self.assertEqual(1, connection.rollbacks)


if __name__ == "__main__":
    unittest.main()
