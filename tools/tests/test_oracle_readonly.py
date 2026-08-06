import io
import os
import tempfile
import textwrap
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import MagicMock, patch

from tools.database.oracle.oracle_readonly import (
    ConnectionSettings,
    SchemaInventory,
    build_parser,
    compare_schema,
    load_connection_settings,
    parse_schema_contract,
    validate_readonly_query,
    verify_customer_service_schema,
)


class OracleReadonlyToolTest(unittest.TestCase):
    def test_connection_settings_do_not_expose_password(self) -> None:
        settings = ConnectionSettings(
            jdbc_url="jdbc:oracle:thin:@127.0.0.1:1521:TEST",
            username="readonly_user",
            password="do-not-print-this",
        )

        self.assertNotIn("do-not-print-this", repr(settings))

    def test_loads_datasource_without_logging_credentials(self) -> None:
        config = textwrap.dedent(
            """
            spring:
              datasource:
                url: jdbc:oracle:thin:@127.0.0.1:1521:TEST
                username: readonly_user
                password: secret
            """
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "application.yml"
            path.write_text(config, encoding="utf-8")
            with patch.dict(os.environ, {}, clear=True):
                settings = load_connection_settings(path)

        self.assertEqual("jdbc:oracle:thin:@127.0.0.1:1521:TEST", settings.jdbc_url)
        self.assertEqual("readonly_user", settings.username)
        self.assertEqual("secret", settings.password)
        self.assertNotIn("secret", repr(settings))

    def test_rejects_non_select_and_locking_queries(self) -> None:
        rejected = (
            "UPDATE J_CY_CS_CONVERSATION SET STATUS = 'CLOSED'",
            "DELETE FROM J_CY_CS_MESSAGE",
            "CREATE TABLE UNSAFE_TABLE (ID NUMBER)",
            "SELECT * FROM J_CY_CS_CONVERSATION FOR UPDATE",
            "SELECT * FROM USER_TABLES; DELETE FROM J_CY_CS_MESSAGE",
            "SELECT /* unsafe comment */ * FROM USER_TABLES",
        )

        for statement in rejected:
            with self.subTest(statement=statement):
                with self.assertRaises(ValueError):
                    validate_readonly_query(statement)

        self.assertEqual(
            "SELECT TABLE_NAME FROM USER_TABLES",
            validate_readonly_query("SELECT TABLE_NAME FROM USER_TABLES"),
        )

    def test_cli_does_not_accept_arbitrary_sql(self) -> None:
        parser = build_parser()

        # argparse 会把预期中的参数拒绝信息写入 stderr；测试只关心退出行为，
        # 因此在这里捕获输出，避免干扰正常的测试结果。
        with redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                parser.parse_args(["--sql", "SELECT * FROM USER_TABLES"])

    def test_parses_expected_objects_from_customer_service_ddl(self) -> None:
        ddl = textwrap.dedent(
            """
            CREATE TABLE J_CY_CS_CONVERSATION (
                ID NUMBER(19) CONSTRAINT PK_J_CY_CS_CONVERSATION PRIMARY KEY,
                STATUS VARCHAR2(16) CONSTRAINT CK_J_CY_CS_CONV_STATUS CHECK (STATUS IN ('WAITING'))
            );
            CREATE UNIQUE INDEX UK_J_CY_CS_CONV_OPEN ON J_CY_CS_CONVERSATION (ID);
            CREATE SEQUENCE SEQ_J_CY_CS_CONVERSATION START WITH 1;
            """
        )

        contract = parse_schema_contract(ddl)

        self.assertEqual(frozenset({"J_CY_CS_CONVERSATION"}), contract.tables)
        self.assertEqual(frozenset({"UK_J_CY_CS_CONV_OPEN"}), contract.indexes)
        self.assertEqual(frozenset({"SEQ_J_CY_CS_CONVERSATION"}), contract.sequences)
        self.assertEqual(
            frozenset({"PK_J_CY_CS_CONVERSATION", "CK_J_CY_CS_CONV_STATUS"}),
            contract.constraints,
        )

    def test_reports_missing_and_invalid_schema_objects(self) -> None:
        contract = parse_schema_contract(
            """
            CREATE TABLE J_CY_CS_CONVERSATION (ID NUMBER CONSTRAINT PK_J_CY_CS_CONVERSATION PRIMARY KEY);
            CREATE INDEX IDX_J_CY_CS_CONV_STAFF ON J_CY_CS_CONVERSATION (ID);
            CREATE SEQUENCE SEQ_J_CY_CS_CONVERSATION;
            """
        )
        inventory = SchemaInventory(
            tables=frozenset({"J_CY_CS_CONVERSATION"}),
            indexes=frozenset(),
            sequences=frozenset({"SEQ_J_CY_CS_CONVERSATION"}),
            constraints=frozenset({"PK_J_CY_CS_CONVERSATION"}),
            invalid_constraints=frozenset({"PK_J_CY_CS_CONVERSATION"}),
        )

        result = compare_schema(contract, inventory)

        self.assertFalse(result.complete)
        self.assertEqual(("IDX_J_CY_CS_CONV_STAFF",), result.missing_indexes)
        self.assertEqual(("PK_J_CY_CS_CONVERSATION",), result.invalid_constraints)

    def test_verifier_rolls_back_and_never_commits(self) -> None:
        ddl = """
        CREATE TABLE J_CY_CS_CONVERSATION (ID NUMBER);
        CREATE SEQUENCE SEQ_J_CY_CS_CONVERSATION;
        """
        inventory = SchemaInventory(
            tables=frozenset({"J_CY_CS_CONVERSATION"}),
            indexes=frozenset(),
            sequences=frozenset({"SEQ_J_CY_CS_CONVERSATION"}),
            constraints=frozenset(),
            columns={"J_CY_CS_CONVERSATION": frozenset({"ID"})},
        )
        connection = MagicMock()

        with tempfile.TemporaryDirectory() as directory:
            ddl_path = Path(directory) / "customer_service.sql"
            ddl_path.write_text(ddl, encoding="utf-8")
            with (
                patch("tools.database.oracle.oracle_readonly._connect", return_value=connection),
                patch("tools.database.oracle.oracle_readonly.read_schema_inventory", return_value=inventory),
            ):
                verify_customer_service_schema(
                    ConnectionSettings(
                        jdbc_url="jdbc:oracle:thin:@127.0.0.1:1521:TEST",
                        username="readonly_user",
                        password="secret",
                    ),
                    ddl_path,
                    Path(directory) / "ojdbc.jar",
                )

        connection.rollback.assert_called_once_with()
        connection.close.assert_called_once_with()
        connection.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
