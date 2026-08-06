"""Fixed-scope, read-only Oracle verifier for desktop-message database objects.

The command accepts connection configuration only. It never accepts arbitrary SQL,
never reads business rows, starts a read-only transaction and always rolls it back.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

try:
    from .oracle_readonly import (
        DEFAULT_CONFIG_PATH,
        DEFAULT_JDBC_JAR_PATH,
        ConnectionSettings,
        SchemaComparison,
        SchemaContract,
        SchemaInventory,
        _connect,
        compare_schema,
        load_connection_settings,
        read_schema_inventory,
        validate_readonly_query,
    )
except ImportError:  # Direct execution adds the tools directory, rather than its parent, to sys.path.
    from oracle_readonly import (
        DEFAULT_CONFIG_PATH,
        DEFAULT_JDBC_JAR_PATH,
        ConnectionSettings,
        SchemaComparison,
        SchemaContract,
        SchemaInventory,
        _connect,
        compare_schema,
        load_connection_settings,
        read_schema_inventory,
        validate_readonly_query,
    )


EXPECTED_TABLES = {
    "J_CY_DESKTOP_MSG_TASK",
    "J_CY_DESKTOP_NOTIFICATION",
    "J_CY_DESKTOP_NTF_RECIPIENT",
}

EXPECTED_INDEXES = {
    "IDX_J_CY_DMT_CREATED",
    "IDX_J_CY_DMT_NOTIFICATION",
    "IDX_J_CY_DMT_SCHEDULE",
    "IDX_J_CY_DN_CREATE_TIME",
    "IDX_J_CY_DN_RECIPIENT_UNREAD",
    "UK_J_CY_DN_RECIPIENT",
}

EXPECTED_SEQUENCES = {
    "SEQ_J_CY_DESKTOP_MSG_TASK",
    "SEQ_J_CY_DESKTOP_NOTIFICATION",
    "SEQ_J_CY_DN_RECIPIENT",
}

EXPECTED_CONSTRAINTS = {
    "CK_J_CY_DMT_CONTENT",
    "CK_J_CY_DMT_PRIORITY",
    "CK_J_CY_DMT_RETRY",
    "CK_J_CY_DMT_STATUS",
    "CK_J_CY_DMT_VERSION",
    "CK_J_CY_DN_ACTION",
    "CK_J_CY_DN_ATTEMPT_COUNT",
    "CK_J_CY_DN_CONTENT",
    "CK_J_CY_DN_DELIVERY_STATUS",
    "CK_J_CY_DN_PRIORITY",
    "CK_J_CY_DN_TYPE",
    "FK_J_CY_DMT_NOTIFICATION",
    "FK_J_CY_DN_RECIPIENT",
    "PK_J_CY_DESKTOP_MSG_TASK",
    "PK_J_CY_DESKTOP_NOTIFICATION",
    "PK_J_CY_DN_RECIPIENT",
    "UK_J_CY_DN_DEDUP_KEY",
}

EXPECTED_COLUMNS = {
    "J_CY_DESKTOP_NOTIFICATION": {
        "ACTION_TYPE",
        "BUSINESS_ID",
        "CONTENT",
        "CONTENT_TYPE",
        "CREATE_TIME",
        "DEDUP_KEY",
        "EXPIRES_AT",
        "EXTENSION_JSON",
        "ID",
        "PRIORITY",
        "SOURCE_ID",
        "SOURCE_TYPE",
        "TITLE",
        "TYPE",
    },
    "J_CY_DESKTOP_NTF_RECIPIENT": {
        "ATTEMPT_COUNT",
        "CREATE_TIME",
        "DELIVERED_AT",
        "DELIVERY_STATUS",
        "DESKTOP_NOTIFIED_AT",
        "FAILED_REASON",
        "ID",
        "LAST_ATTEMPT_AT",
        "NOTIFICATION_ID",
        "READ_AT",
        "RECIPIENT_OPEN_ID",
    },
    "J_CY_DESKTOP_MSG_TASK": {
        "CONTENT",
        "CONTENT_TYPE",
        "CREATED_BY",
        "CREATE_TIME",
        "EXPIRES_AT",
        "EXTENSION_JSON",
        "FAILURE_REASON",
        "ID",
        "NEXT_RETRY_AT",
        "NOTIFICATION_ID",
        "PRIORITY",
        "PUBLISHED_AT",
        "RETRY_COUNT",
        "REVOKED_AT",
        "SCHEDULED_AT",
        "STATUS",
        "TITLE",
        "UPDATED_BY",
        "UPDATE_TIME",
        "VERSION_NO",
    },
}


def build_expected_contract() -> SchemaContract:
    """Return the immutable three-table contract checked by this command."""

    return SchemaContract(
        tables=frozenset(EXPECTED_TABLES),
        indexes=frozenset(EXPECTED_INDEXES),
        sequences=frozenset(EXPECTED_SEQUENCES),
        constraints=frozenset(EXPECTED_CONSTRAINTS),
        unique_indexes=frozenset({"UK_J_CY_DN_RECIPIENT"}),
        columns={table: frozenset(columns) for table, columns in EXPECTED_COLUMNS.items()},
    )


Connector = Callable[[ConnectionSettings, Path], Any]


def verify_desktop_message_schema(
    settings: ConnectionSettings,
    jdbc_jar_path: Path,
    *,
    connector: Connector = _connect,
) -> tuple[SchemaContract, SchemaInventory, SchemaComparison]:
    """Read the fixed USER_* inventory and always roll back before closing."""

    contract = build_expected_contract()
    connection = connector(settings, jdbc_jar_path)
    try:
        inventory = read_schema_inventory(connection, contract)
        return contract, inventory, compare_schema(contract, inventory)
    finally:
        try:
            connection.rollback()
        finally:
            connection.close()


def build_result_payload(
    contract: SchemaContract,
    inventory: SchemaInventory,
    comparison: SchemaComparison,
) -> dict[str, object]:
    """Build a structure-only report without credentials or business data."""

    return {
        "complete": comparison.complete,
        "migrationComplete": comparison.complete,
        "tables": {
            "expected": sorted(contract.tables),
            "found": sorted(inventory.tables),
            "missing": list(comparison.missing_tables),
        },
        "columns": {table: list(columns) for table, columns in sorted(comparison.missing_columns.items())},
        "constraints": {
            "expected": sorted(contract.constraints),
            "found": sorted(inventory.constraints),
            "missing": list(comparison.missing_constraints),
            "invalid": list(comparison.invalid_constraints),
            "valid": not comparison.missing_constraints and not comparison.invalid_constraints,
        },
        "indexes": {
            "expected": sorted(contract.indexes),
            "found": sorted(inventory.indexes),
            "missing": list(comparison.missing_indexes),
            "nonUnique": list(comparison.non_unique_indexes),
            "unique": not comparison.non_unique_indexes,
        },
        "sequences": {
            "expected": sorted(contract.sequences),
            "found": sorted(inventory.sequences),
            "missing": list(comparison.missing_sequences),
        },
    }


def build_parser() -> argparse.ArgumentParser:
    """Create a CLI that cannot receive SQL or a database mutation option."""

    parser = argparse.ArgumentParser(description="Verify the desktop-message Oracle schema with fixed read-only queries.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH, help="Spring application.yml path")
    parser.add_argument("--jdbc-jar", type=Path, default=DEFAULT_JDBC_JAR_PATH, help="Oracle JDBC driver path")
    parser.add_argument("--json", action="store_true", help="Print the structure report as JSON")
    return parser


def _print_text(payload: Mapping[str, object]) -> None:
    state = "PASS" if payload["complete"] else "FAIL"
    print(f"Desktop-message schema verification: {state}")
    print(f"Tables:      {payload['tables']}")
    print(f"Columns:     {payload['columns']}")
    print(f"Constraints: {payload['constraints']}")
    print(f"Indexes:     {payload['indexes']}")
    print(f"Sequences:   {payload['sequences']}")


def main(argv: Sequence[str] | None = None) -> int:
    """Run the report and redact configured connection secrets from failures."""

    args = build_parser().parse_args(argv)
    settings: ConnectionSettings | None = None
    try:
        settings = load_connection_settings(args.config)
        contract, inventory, comparison = verify_desktop_message_schema(settings, args.jdbc_jar)
        payload = build_result_payload(contract, inventory, comparison)
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        else:
            _print_text(payload)
        return 0 if comparison.complete else 2
    except Exception as error:  # CLI boundary: configured secrets must never be printed.
        message = str(error)
        if settings is not None:
            for secret in (settings.password, settings.jdbc_url):
                if secret:
                    message = message.replace(secret, "<redacted>")
        print(f"Read-only schema verification failed: {type(error).__name__}: {message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
