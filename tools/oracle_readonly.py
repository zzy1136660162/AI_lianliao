"""Read-only Oracle schema verifier for the Chain Liaoning projects.

The command intentionally exposes one fixed report instead of accepting arbitrary SQL.
It starts an Oracle read-only transaction, reads USER_* data-dictionary views, rolls the
transaction back, and never calls commit.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import yaml


PROJECTS_ROOT = Path(__file__).resolve().parents[2]
CLOUD_SERVICE_ROOT = PROJECTS_ROOT / "lianshang_liaoning" / "cloud-service"
DEFAULT_CONFIG_PATH = CLOUD_SERVICE_ROOT / "cloud-api" / "src" / "main" / "resources" / "application.yml"
DEFAULT_DDL_PATH = CLOUD_SERVICE_ROOT / "cloud-api" / "src" / "main" / "resources" / "db" / "customer_service.sql"
DEFAULT_JDBC_JAR_PATH = (
    CLOUD_SERVICE_ROOT / "cloud-mbg" / "src" / "main" / "resources" / "lib" / "ojdbc6-11.2.0.4.jar"
)

_SPRING_PLACEHOLDER = re.compile(r"^\$\{([A-Za-z_][A-Za-z0-9_]*)(?::(.*))?\}$")
_FORBIDDEN_SQL = re.compile(
    r"\b(?:ALTER|BEGIN|CALL|COMMIT|CREATE|DECLARE|DELETE|DROP|EXECUTE|GRANT|"
    r"INSERT|LOCK|MERGE|REVOKE|ROLLBACK|TRUNCATE|UPDATE)\b|\bFOR\s+UPDATE\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ConnectionSettings:
    """Oracle connection values whose password is excluded from representations."""

    jdbc_url: str
    username: str
    password: str = field(repr=False)


@dataclass(frozen=True)
class SchemaContract:
    """Database objects expected by a DDL script."""

    tables: frozenset[str]
    indexes: frozenset[str]
    sequences: frozenset[str]
    constraints: frozenset[str]
    unique_indexes: frozenset[str] = field(default_factory=frozenset)
    columns: Mapping[str, frozenset[str]] = field(default_factory=dict)


@dataclass(frozen=True)
class SchemaInventory:
    """Actual objects read from the current Oracle schema."""

    tables: frozenset[str]
    indexes: frozenset[str]
    sequences: frozenset[str]
    constraints: frozenset[str]
    invalid_constraints: frozenset[str] = field(default_factory=frozenset)
    unique_indexes: frozenset[str] = field(default_factory=frozenset)
    columns: Mapping[str, frozenset[str]] = field(default_factory=dict)


@dataclass(frozen=True)
class SchemaComparison:
    """Missing or invalid objects; complete is true only when every tuple is empty."""

    missing_tables: tuple[str, ...]
    missing_indexes: tuple[str, ...]
    missing_sequences: tuple[str, ...]
    missing_constraints: tuple[str, ...]
    invalid_constraints: tuple[str, ...]
    non_unique_indexes: tuple[str, ...]
    missing_columns: Mapping[str, tuple[str, ...]]

    @property
    def complete(self) -> bool:
        return not any(
            (
                self.missing_tables,
                self.missing_indexes,
                self.missing_sequences,
                self.missing_constraints,
                self.invalid_constraints,
                self.non_unique_indexes,
                self.missing_columns,
            )
        )


def _resolve_spring_value(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    match = _SPRING_PLACEHOLDER.fullmatch(text)
    if not match:
        return text
    environment_name, default = match.groups()
    return os.environ.get(environment_name, default or "").strip()


def load_connection_settings(config_path: Path) -> ConnectionSettings:
    """Load Spring datasource settings, allowing explicit environment overrides."""

    document = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    datasource = document.get("spring", {}).get("datasource", {})
    jdbc_url = os.environ.get("ORACLE_JDBC_URL") or _resolve_spring_value(datasource.get("url"))
    username = os.environ.get("ORACLE_USERNAME") or _resolve_spring_value(datasource.get("username"))
    password = os.environ.get("ORACLE_PASSWORD") or _resolve_spring_value(datasource.get("password"))
    if not jdbc_url.startswith("jdbc:oracle:thin:@"):
        raise ValueError("Oracle JDBC URL is missing or unsupported.")
    if not username or not password:
        raise ValueError("Oracle username or password is missing.")
    return ConnectionSettings(jdbc_url=jdbc_url, username=username, password=password)


def validate_readonly_query(statement: str) -> str:
    """Reject anything outside a single comment-free SELECT/CTE query."""

    normalized = statement.strip()
    if not normalized or not re.match(r"^(?:SELECT|WITH)\b", normalized, re.IGNORECASE):
        raise ValueError("Only SELECT queries are allowed.")
    if ";" in normalized or "--" in normalized or "/*" in normalized or "*/" in normalized:
        raise ValueError("SQL comments and statement separators are not allowed.")
    if _FORBIDDEN_SQL.search(normalized):
        raise ValueError("The query contains a write, DDL, lock, or transaction keyword.")
    return normalized


def _extract_table_bodies(ddl: str) -> Mapping[str, str]:
    bodies: dict[str, str] = {}
    pattern = re.compile(r"\bCREATE\s+TABLE\s+([A-Z][A-Z0-9_]*)\s*\(", re.IGNORECASE)
    for match in pattern.finditer(ddl):
        depth = 1
        in_string = False
        index = match.end()
        body_start = index
        while index < len(ddl) and depth:
            character = ddl[index]
            if character == "'":
                if in_string and index + 1 < len(ddl) and ddl[index + 1] == "'":
                    index += 2
                    continue
                in_string = not in_string
            elif not in_string:
                if character == "(":
                    depth += 1
                elif character == ")":
                    depth -= 1
            index += 1
        if depth:
            raise ValueError(f"Unclosed CREATE TABLE statement: {match.group(1)}")
        bodies[match.group(1).upper()] = ddl[body_start : index - 1]
    return bodies


def _split_top_level_csv(value: str) -> list[str]:
    items: list[str] = []
    start = 0
    depth = 0
    in_string = False
    index = 0
    while index < len(value):
        character = value[index]
        if character == "'":
            if in_string and index + 1 < len(value) and value[index + 1] == "'":
                index += 2
                continue
            in_string = not in_string
        elif not in_string:
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
            elif character == "," and depth == 0:
                items.append(value[start:index].strip())
                start = index + 1
        index += 1
    tail = value[start:].strip()
    if tail:
        items.append(tail)
    return items


def _extract_columns(table_body: str) -> frozenset[str]:
    ignored_prefixes = ("CONSTRAINT", "PRIMARY", "FOREIGN", "UNIQUE", "CHECK")
    columns: set[str] = set()
    for definition in _split_top_level_csv(table_body):
        first_token = definition.split(None, 1)[0].strip('"').upper() if definition else ""
        if first_token and first_token not in ignored_prefixes:
            columns.add(first_token)
    return frozenset(columns)


def parse_schema_contract(ddl: str) -> SchemaContract:
    """Extract tables, indexes, sequences, constraints, and columns from Oracle DDL."""

    tables = frozenset(
        match.group(1).upper()
        for match in re.finditer(r"\bCREATE\s+TABLE\s+([A-Z][A-Z0-9_]*)", ddl, re.IGNORECASE)
    )
    index_matches = tuple(
        re.finditer(
            r"\bCREATE\s+(UNIQUE\s+)?INDEX\s+([A-Z][A-Z0-9_]*)",
            ddl,
            re.IGNORECASE,
        )
    )
    indexes = frozenset(match.group(2).upper() for match in index_matches)
    unique_indexes = frozenset(match.group(2).upper() for match in index_matches if match.group(1))
    sequences = frozenset(
        match.group(1).upper()
        for match in re.finditer(r"\bCREATE\s+SEQUENCE\s+([A-Z][A-Z0-9_]*)", ddl, re.IGNORECASE)
    )
    constraints = frozenset(
        match.group(1).upper()
        for match in re.finditer(r"\bCONSTRAINT\s+([A-Z][A-Z0-9_]*)", ddl, re.IGNORECASE)
    )
    table_bodies = _extract_table_bodies(ddl)
    columns = {table: _extract_columns(body) for table, body in table_bodies.items()}
    if not tables or not sequences:
        raise ValueError("DDL does not contain the expected tables and sequences.")
    return SchemaContract(
        tables=tables,
        indexes=indexes,
        sequences=sequences,
        constraints=constraints,
        unique_indexes=unique_indexes,
        columns=columns,
    )


def compare_schema(contract: SchemaContract, inventory: SchemaInventory) -> SchemaComparison:
    """Compare expected DDL objects with the current Oracle user schema."""

    missing_columns: dict[str, tuple[str, ...]] = {}
    for table, expected_columns in contract.columns.items():
        missing = tuple(sorted(expected_columns - inventory.columns.get(table, frozenset())))
        if missing:
            missing_columns[table] = missing
    return SchemaComparison(
        missing_tables=tuple(sorted(contract.tables - inventory.tables)),
        missing_indexes=tuple(sorted(contract.indexes - inventory.indexes)),
        missing_sequences=tuple(sorted(contract.sequences - inventory.sequences)),
        missing_constraints=tuple(sorted(contract.constraints - inventory.constraints)),
        invalid_constraints=tuple(sorted(contract.constraints & inventory.invalid_constraints)),
        non_unique_indexes=tuple(sorted(contract.unique_indexes - inventory.unique_indexes)),
        missing_columns=missing_columns,
    )


def _placeholders(size: int) -> str:
    return ", ".join("?" for _ in range(size))


def _fetch_names(cursor: Any, view: str, column: str, expected: frozenset[str]) -> frozenset[str]:
    if not expected:
        return frozenset()
    query = validate_readonly_query(
        f"SELECT {column} FROM {view} WHERE {column} IN ({_placeholders(len(expected))})"
    )
    cursor.execute(query, tuple(sorted(expected)))
    return frozenset(str(row[0]).upper() for row in cursor.fetchall())


def read_schema_inventory(connection: Any, contract: SchemaContract) -> SchemaInventory:
    """Read only the expected object names from Oracle USER_* dictionary views."""

    cursor = connection.cursor()
    try:
        cursor.execute("SET TRANSACTION READ ONLY")
        tables = _fetch_names(cursor, "USER_TABLES", "TABLE_NAME", contract.tables)
        sequences = _fetch_names(cursor, "USER_SEQUENCES", "SEQUENCE_NAME", contract.sequences)

        index_query = validate_readonly_query(
            "SELECT INDEX_NAME, UNIQUENESS FROM USER_INDEXES "
            f"WHERE INDEX_NAME IN ({_placeholders(len(contract.indexes))})"
        )
        cursor.execute(index_query, tuple(sorted(contract.indexes)))
        index_rows = cursor.fetchall()
        indexes = frozenset(str(row[0]).upper() for row in index_rows)
        unique_indexes = frozenset(
            str(row[0]).upper() for row in index_rows if str(row[1]).upper() == "UNIQUE"
        )

        constraint_query = validate_readonly_query(
            "SELECT CONSTRAINT_NAME, STATUS, VALIDATED FROM USER_CONSTRAINTS "
            f"WHERE CONSTRAINT_NAME IN ({_placeholders(len(contract.constraints))})"
        )
        cursor.execute(constraint_query, tuple(sorted(contract.constraints)))
        constraint_rows = cursor.fetchall()
        constraints = frozenset(str(row[0]).upper() for row in constraint_rows)
        invalid_constraints = frozenset(
            str(row[0]).upper()
            for row in constraint_rows
            if str(row[1]).upper() != "ENABLED" or str(row[2]).upper() != "VALIDATED"
        )

        column_query = validate_readonly_query(
            "SELECT TABLE_NAME, COLUMN_NAME FROM USER_TAB_COLUMNS "
            f"WHERE TABLE_NAME IN ({_placeholders(len(contract.tables))})"
        )
        cursor.execute(column_query, tuple(sorted(contract.tables)))
        column_sets: dict[str, set[str]] = {table: set() for table in contract.tables}
        for table_name, column_name in cursor.fetchall():
            column_sets.setdefault(str(table_name).upper(), set()).add(str(column_name).upper())
        columns = {table: frozenset(names) for table, names in column_sets.items()}

        return SchemaInventory(
            tables=tables,
            indexes=indexes,
            sequences=sequences,
            constraints=constraints,
            invalid_constraints=invalid_constraints,
            unique_indexes=unique_indexes,
            columns=columns,
        )
    finally:
        cursor.close()


def _connect(settings: ConnectionSettings, jdbc_jar_path: Path) -> Any:
    try:
        import jaydebeapi
    except ImportError as error:
        raise RuntimeError(
            "Missing Python Oracle bridge. Run: python -m pip install -r tools/requirements-oracle-readonly.txt"
        ) from error
    if not jdbc_jar_path.is_file():
        raise FileNotFoundError(f"Oracle JDBC driver was not found: {jdbc_jar_path}")
    return jaydebeapi.connect(
        "oracle.jdbc.OracleDriver",
        settings.jdbc_url,
        [settings.username, settings.password],
        str(jdbc_jar_path),
    )


def verify_customer_service_schema(
    settings: ConnectionSettings,
    ddl_path: Path,
    jdbc_jar_path: Path,
) -> tuple[SchemaContract, SchemaInventory, SchemaComparison]:
    """Run the fixed schema report and always roll back before closing the connection."""

    contract = parse_schema_contract(ddl_path.read_text(encoding="utf-8"))
    connection = _connect(settings, jdbc_jar_path)
    try:
        inventory = read_schema_inventory(connection, contract)
        comparison = compare_schema(contract, inventory)
        return contract, inventory, comparison
    finally:
        try:
            connection.rollback()
        finally:
            connection.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Verify the customer-service Oracle schema using read-only USER_* queries."
    )
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH, help="Spring application.yml path")
    parser.add_argument("--ddl", type=Path, default=DEFAULT_DDL_PATH, help="Customer-service DDL contract path")
    parser.add_argument("--jdbc-jar", type=Path, default=DEFAULT_JDBC_JAR_PATH, help="Oracle JDBC driver path")
    parser.add_argument("--json", action="store_true", help="Print the schema result as JSON")
    return parser


def _result_payload(
    contract: SchemaContract,
    inventory: SchemaInventory,
    comparison: SchemaComparison,
) -> dict[str, object]:
    return {
        "complete": comparison.complete,
        "expected": {
            "tables": len(contract.tables),
            "indexes": len(contract.indexes),
            "sequences": len(contract.sequences),
            "constraints": len(contract.constraints),
        },
        "found": {
            "tables": len(inventory.tables),
            "indexes": len(inventory.indexes),
            "sequences": len(inventory.sequences),
            "constraints": len(inventory.constraints),
        },
        "missing": {
            "tables": comparison.missing_tables,
            "indexes": comparison.missing_indexes,
            "sequences": comparison.missing_sequences,
            "constraints": comparison.missing_constraints,
            "columns": comparison.missing_columns,
        },
        "invalidConstraints": comparison.invalid_constraints,
        "nonUniqueIndexes": comparison.non_unique_indexes,
    }


def _print_text(payload: Mapping[str, object]) -> None:
    state = "PASS" if payload["complete"] else "FAIL"
    print(f"Customer-service schema verification: {state}")
    print(f"Expected: {payload['expected']}")
    print(f"Found:    {payload['found']}")
    if not payload["complete"]:
        print(f"Missing:  {payload['missing']}")
        print(f"Invalid constraints: {payload['invalidConstraints']}")
        print(f"Non-unique indexes: {payload['nonUniqueIndexes']}")


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings: ConnectionSettings | None = None
    try:
        settings = load_connection_settings(args.config)
        contract, inventory, comparison = verify_customer_service_schema(
            settings,
            args.ddl,
            args.jdbc_jar,
        )
        payload = _result_payload(contract, inventory, comparison)
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        else:
            _print_text(payload)
        return 0 if comparison.complete else 2
    except Exception as error:  # CLI boundary: sanitize configured secrets before reporting.
        message = str(error)
        if settings is not None:
            for secret in (settings.password, settings.jdbc_url):
                if secret:
                    message = message.replace(secret, "<redacted>")
        print(f"Read-only schema verification failed: {type(error).__name__}: {message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
