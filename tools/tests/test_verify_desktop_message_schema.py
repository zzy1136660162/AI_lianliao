"""Tests for the fixed, read-only desktop-message schema verifier."""

from __future__ import annotations

import unittest
from pathlib import Path
from typing import Any

from tools.database.oracle.oracle_readonly import ConnectionSettings
from tools.database.oracle.verify_desktop_message_schema import (
    EXPECTED_TABLES,
    build_expected_contract,
    validate_readonly_query,
    verify_desktop_message_schema,
)


class FakeCursor:
    """Return the expected dictionary rows while recording query order."""

    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple[str, ...]]] = []
        self._statement = ""
        self.closed = False

    def execute(self, statement: str, parameters: tuple[str, ...] = ()) -> None:
        self._statement = statement
        self.executed.append((statement, parameters))

    def fetchall(self) -> list[tuple[Any, ...]]:
        contract = build_expected_contract()
        if "FROM USER_TABLES" in self._statement:
            return [(name,) for name in sorted(contract.tables)]
        if "FROM USER_SEQUENCES" in self._statement:
            return [(name,) for name in sorted(contract.sequences)]
        if "FROM USER_INDEXES" in self._statement:
            return [
                (name, "UNIQUE" if name in contract.unique_indexes else "NONUNIQUE")
                for name in sorted(contract.indexes)
            ]
        if "FROM USER_CONSTRAINTS" in self._statement:
            return [(name, "ENABLED", "VALIDATED") for name in sorted(contract.constraints)]
        if "FROM USER_TAB_COLUMNS" in self._statement:
            return [
                (table, column)
                for table, columns in sorted(contract.columns.items())
                for column in sorted(columns)
            ]
        return []

    def close(self) -> None:
        self.closed = True


class FakeConnection:
    """Expose rollback/close counters and fail if production attempts a commit."""

    def __init__(self) -> None:
        self.fake_cursor = FakeCursor()
        self.rollback_count = 0
        self.close_count = 0
        self.commit_count = 0

    def cursor(self) -> FakeCursor:
        return self.fake_cursor

    def rollback(self) -> None:
        self.rollback_count += 1

    def close(self) -> None:
        self.close_count += 1

    def commit(self) -> None:
        self.commit_count += 1
        raise AssertionError("The read-only verifier must never commit.")


class DesktopMessageSchemaVerifierTest(unittest.TestCase):
    """Lock the validator and table scope before the verifier is implemented."""

    def test_validator_rejects_write_sql(self) -> None:
        with self.assertRaises(ValueError):
            validate_readonly_query("UPDATE J_CY_DESKTOP_MSG_TASK SET STATUS='PUBLISHED'")

    def test_expected_contract_contains_all_three_tables(self) -> None:
        self.assertEqual(
            EXPECTED_TABLES,
            {
                "J_CY_DESKTOP_MSG_TASK",
                "J_CY_DESKTOP_NOTIFICATION",
                "J_CY_DESKTOP_NTF_RECIPIENT",
            },
        )

    def test_expected_contract_checks_message_columns_and_unique_recipient_index(self) -> None:
        contract = build_expected_contract()

        self.assertIn("CONTENT_TYPE", contract.columns["J_CY_DESKTOP_NOTIFICATION"])
        self.assertIn("VERSION_NO", contract.columns["J_CY_DESKTOP_MSG_TASK"])
        self.assertIn("DESKTOP_NOTIFIED_AT", contract.columns["J_CY_DESKTOP_NTF_RECIPIENT"])
        self.assertEqual(contract.unique_indexes, frozenset({"UK_J_CY_DN_RECIPIENT"}))

    def test_verification_starts_read_only_and_always_rolls_back(self) -> None:
        connection = FakeConnection()
        settings = ConnectionSettings(
            jdbc_url="jdbc:oracle:thin:@example.invalid:1521:xe",
            username="readonly",
            password="secret",
        )

        _, _, comparison = verify_desktop_message_schema(
            settings,
            Path("unused-ojdbc.jar"),
            connector=lambda _settings, _jar: connection,
        )

        self.assertTrue(comparison.complete)
        self.assertEqual(connection.fake_cursor.executed[0][0], "SET TRANSACTION READ ONLY")
        self.assertEqual(connection.rollback_count, 1)
        self.assertEqual(connection.close_count, 1)
        self.assertEqual(connection.commit_count, 0)


if __name__ == "__main__":
    unittest.main()
