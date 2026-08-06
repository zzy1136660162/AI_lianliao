"""Guarded Excel importer for approved type-22 urgent-purchase demands."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, fields
from pathlib import Path
from typing import Any, Mapping, Sequence

import pandas as pd

try:
    from .oracle_readonly import (
        DEFAULT_CONFIG_PATH,
        DEFAULT_JDBC_JAR_PATH,
        _connect,
        load_connection_settings,
    )
except ImportError:  # Direct execution adds this script directory to sys.path.
    from oracle_readonly import (
        DEFAULT_CONFIG_PATH,
        DEFAULT_JDBC_JAR_PATH,
        _connect,
        load_connection_settings,
    )


DEFAULT_INPUT_PATH = (
    Path(__file__).resolve().parents[4]
    / "lianshang_liaoning"
    / "docs"
    / "附录文件"
    / "紧急采购需求字段1.xlsx"
)
EXPECTED_HEADERS = (
    "紧急采购名称",
    "企业名称",
    "所在城市",
    "所在区县",
    "详细地址",
    "采购数量",
    "采购预算",
    "产品参数及要求",
    "其他详细说明",
    "照片附件",
)
COMPANY_ID = 400496
COMPANY_NAME = "沈阳北软信息职业技术学院"
TYPE_ID = 22
EXPECTED_ROW_COUNT = 7


class DuplicateDemandError(ValueError):
    """Raised when an active target demand already exists."""


@dataclass(frozen=True)
class UrgentPurchaseRow:
    demand_name: str
    company_name: str
    city: str | None
    district: str | None
    address: str | None
    param3: str | None
    budget: str | None
    param5: str | None
    intro: str
    param6: str | None
    contact_person: str
    contact_tel: str


_SOURCE_FIELDS = tuple(field.name for field in fields(UrgentPurchaseRow) if field.name not in {"contact_person", "contact_tel"})
_HEADER_TO_FIELD = dict(zip(EXPECTED_HEADERS, _SOURCE_FIELDS))
_REQUIRED_HEADERS = EXPECTED_HEADERS[:2]
_CONTACT_PATTERN = re.compile(r"(?:项目)?联系人\s*[：:]\s*(?P<person>.+?)\s*(?P<tel>(?<!\d)1[3-9]\d{9})(?!\d)")
_MAX_BYTES = {
    "demand_name": ("紧急采购名称", 255),
    "company_name": ("企业名称", 255),
    "city": ("所在城市", 50),
    "district": ("所在区县", 255),
    "address": ("详细地址", 255),
    "param3": ("采购数量", 255),
    "budget": ("采购预算", 255),
    "param5": ("产品参数及要求", 2550),
    "intro": ("其他详细说明", 4000),
    "param6": ("照片附件", 4000),
    "contact_person": ("联系人", 255),
    "contact_tel": ("联系电话", 255),
}


def _text(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def validate_headers(actual: Sequence[object]) -> None:
    normalized = tuple(str(value) for value in actual)
    if normalized != EXPECTED_HEADERS:
        raise ValueError(f"Excel 表头不符合预期：期望 {EXPECTED_HEADERS}，实际 {normalized}")


def normalize_row(source: Mapping[str, object]) -> UrgentPurchaseRow:
    values = {field_name: _text(source.get(header)) for header, field_name in _HEADER_TO_FIELD.items()}
    for header in _REQUIRED_HEADERS:
        if not values[_HEADER_TO_FIELD[header]]:
            raise ValueError(f"必填字段为空：{header}")
    for header in EXPECTED_HEADERS[2:]:
        field_name = _HEADER_TO_FIELD[header]
        values[field_name] = values[field_name] or None
    contact_match = _CONTACT_PATTERN.search(values["intro"] or "")
    if contact_match is None:
        raise ValueError("其他详细说明必须包含可识别的联系人和手机号")
    contact_person = contact_match.group("person").strip()
    if not contact_person:
        raise ValueError("其他详细说明必须包含可识别的联系人和手机号")
    values["contact_person"] = contact_person
    values["contact_tel"] = contact_match.group("tel")
    row = UrgentPurchaseRow(**values)
    validate_lengths(row)
    return row


def validate_lengths(row: UrgentPurchaseRow) -> None:
    for field_name, (label, maximum) in _MAX_BYTES.items():
        value = getattr(row, field_name)
        if value is not None and len(value.encode("utf-8")) > maximum:
            raise ValueError(f"{label} 超过 Oracle 字段长度上限 {maximum} 字节")


def load_workbook_rows(path: Path) -> list[UrgentPurchaseRow]:
    if not path.is_file():
        raise FileNotFoundError(f"Excel 文件不存在：{path}")
    frame = pd.read_excel(path, sheet_name="Sheet1", dtype=object, keep_default_na=False)
    validate_headers(frame.columns)
    rows = [normalize_row(record) for record in frame.to_dict(orient="records")]
    _validate_row_count(rows)
    keys = [(row.demand_name, row.company_name) for row in rows]
    if len(keys) != len(set(keys)):
        raise ValueError("Excel 中存在重复的紧急采购名称和企业名称")
    return rows


def _validate_row_count(rows: Sequence[UrgentPurchaseRow]) -> None:
    if len(rows) != EXPECTED_ROW_COUNT:
        raise ValueError(f"Sheet1 必须恰好包含 {EXPECTED_ROW_COUNT} 条有效数据，实际为 {len(rows)} 条")


def preflight_import(connection: Any, rows: Sequence[UrgentPurchaseRow]) -> None:
    cursor = connection.cursor()
    try:
        cursor.execute(
            "SELECT ID, NAME FROM J_CY_COMPANY "
            "WHERE ID = ? AND NAME = ? AND NVL(DEL_SIGN, 'N') = 'N'",
            (COMPANY_ID, COMPANY_NAME),
        )
        if cursor.fetchone() is None:
            raise ValueError(f"有效企业档案不存在：{COMPANY_ID} / {COMPANY_NAME}")
        for row in rows:
            if row.company_name != COMPANY_NAME:
                raise ValueError(f"企业名称无法绑定固定企业档案：{row.company_name}")
            cursor.execute(
                "SELECT COUNT(*) FROM J_COMMON_DEMAND "
                "WHERE TYPE = ? AND DEMAND_NAME = ? AND COMPANY_NAME = ? AND DEL_SIGN = 0",
                (TYPE_ID, row.demand_name, row.company_name),
            )
            result = cursor.fetchone()
            if result is None or int(result[0]) != 0:
                raise DuplicateDemandError(f"目标库已存在有效需求：{row.demand_name}")
    finally:
        cursor.close()


_INSERT_SQL = """
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
"""


def execute_import(connection: Any, rows: Sequence[UrgentPurchaseRow]) -> list[int]:
    _validate_row_count(rows)
    connection.jconn.setAutoCommit(False)
    for attempt in range(4):
        try:
            return _execute_import_attempt(connection, rows)
        except Exception as error:
            connection.rollback()
            if "ORA-00001" not in str(error).upper() or attempt == 3:
                raise
    raise RuntimeError("主键分配重试次数已耗尽")


def _execute_import_attempt(connection: Any, rows: Sequence[UrgentPurchaseRow]) -> list[int]:
    preflight_import(connection, rows)
    cursor = connection.cursor()
    try:
        cursor.execute("SELECT NVL(MAX(NO), 0) FROM J_COMMON_DEMAND")
        maximum = cursor.fetchone()
        if maximum is None:
            raise RuntimeError("未能读取 J_COMMON_DEMAND 最大 NO")
        generated_ids = [int(maximum[0]) + offset for offset in range(1, len(rows) + 1)]
        for demand_id, row in zip(generated_ids, rows):
            cursor.execute(
                _INSERT_SQL,
                (
                    demand_id,
                    row.company_name,
                    row.city,
                    row.district,
                    row.address,
                    row.demand_name,
                    row.intro,
                    row.contact_person,
                    row.contact_tel,
                    row.param3,
                    row.param5,
                    row.param6,
                    row.budget,
                ),
            )
        placeholders = ", ".join("?" for _ in generated_ids)
        cursor.execute(
            "SELECT COUNT(*) FROM J_COMMON_DEMAND "
            f"WHERE NO IN ({placeholders}) AND TYPE = 22 AND IS_CHECK = 1 "
            "AND DEL_SIGN = 0 AND DEMAND_STATE = 0 AND COMPANY_ID = 400496",
            tuple(generated_ids),
        )
        verified = cursor.fetchone()
        if verified is None or int(verified[0]) != len(rows):
            raise RuntimeError("提交前验证失败：插入行数或公开状态不符合预期")
        cursor.execute(
            "SELECT NO, DEMAND_NAME, COMPANY_NAME, CITY, DISTRICT, ADDRESS, "
            "PARAM3, BUDGET, PARAM5, INTRO, PARAM6, CONTACT_PERSON, CONTACT_TEL "
            "FROM J_COMMON_DEMAND "
            f"WHERE NO IN ({placeholders}) ORDER BY NO",
            tuple(generated_ids),
        )
        actual_rows = [
            (int(result[0]),) + tuple(None if value is None else str(value) for value in result[1:])
            for result in cursor.fetchall()
        ]
        expected_rows = [
            (
                demand_id,
                row.demand_name,
                row.company_name,
                row.city,
                row.district,
                row.address,
                row.param3,
                row.budget,
                row.param5,
                row.intro,
                row.param6,
                row.contact_person,
                row.contact_tel,
            )
            for demand_id, row in zip(generated_ids, rows)
        ]
        if actual_rows != expected_rows:
            raise RuntimeError("提交前验证失败：数据库业务字段与 Excel 不一致")
    finally:
        cursor.close()
    connection.commit()
    return generated_ids


def verify_committed_import(
    connection: Any,
    generated_ids: Sequence[int],
    rows: Sequence[UrgentPurchaseRow],
) -> None:
    _validate_row_count(rows)
    if len(generated_ids) != EXPECTED_ROW_COUNT:
        raise ValueError(f"提交后必须验证 {EXPECTED_ROW_COUNT} 个主键，实际为 {len(generated_ids)} 个")
    connection.jconn.setAutoCommit(False)
    cursor = connection.cursor()
    try:
        cursor.execute("SET TRANSACTION READ ONLY")
        placeholders = ", ".join("?" for _ in generated_ids)
        cursor.execute(
            "SELECT NO, DEMAND_NAME, COMPANY_NAME, CITY, DISTRICT, ADDRESS, "
            "PARAM3, BUDGET, PARAM5, INTRO, PARAM6, CONTACT_PERSON, CONTACT_TEL, "
            "TYPE, IS_CHECK, DEL_SIGN, "
            "DEMAND_STATE, COMPANY_ID FROM J_COMMON_DEMAND "
            f"WHERE NO IN ({placeholders}) ORDER BY NO",
            tuple(generated_ids),
        )
        actual = [
            (int(result[0]),)
            + tuple(None if value is None else str(value) for value in result[1:13])
            + tuple(int(value) for value in result[13:18])
            for result in cursor.fetchall()
        ]
        expected = [
            (
                demand_id,
                row.demand_name,
                row.company_name,
                row.city,
                row.district,
                row.address,
                row.param3,
                row.budget,
                row.param5,
                row.intro,
                row.param6,
                row.contact_person,
                row.contact_tel,
                TYPE_ID,
                1,
                0,
                0,
                COMPANY_ID,
            )
            for demand_id, row in zip(generated_ids, rows)
        ]
        if actual != expected:
            raise RuntimeError("提交后只读验证失败：数据库字段与 Excel 或公开状态不一致")
    finally:
        cursor.close()
        connection.rollback()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import approved type-22 urgent purchases from a fixed Excel schema.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT_PATH, help="Urgent-purchase Excel workbook")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH, help="Spring application.yml path")
    parser.add_argument("--jdbc-jar", type=Path, default=DEFAULT_JDBC_JAR_PATH, help="Oracle JDBC driver path")
    parser.add_argument("--execute", action="store_true", help="Commit inserts; omission performs a read-only dry-run")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = None
    connection = None
    try:
        rows = load_workbook_rows(args.input)
        settings = load_connection_settings(args.config)
        connection = _connect(settings, args.jdbc_jar)
        if args.execute:
            generated_ids = execute_import(connection, rows)
            connection.close()
            connection = None
            connection = _connect(settings, args.jdbc_jar)
            verify_committed_import(connection, generated_ids, rows)
            print(json.dumps({"status": "COMMITTED", "rows": len(rows), "ids": generated_ids}, ensure_ascii=False))
        else:
            cursor = connection.cursor()
            try:
                cursor.execute("SET TRANSACTION READ ONLY")
            finally:
                cursor.close()
            preflight_import(connection, rows)
            connection.rollback()
            print(json.dumps({"status": "DRY RUN PASS", "rows": len(rows), "companyId": COMPANY_ID}, ensure_ascii=False))
        return 0
    except Exception as error:
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                pass
        message = str(error)
        if settings is not None:
            for secret in (settings.password, settings.jdbc_url):
                if secret:
                    message = message.replace(secret, "<redacted>")
        print(f"Urgent-purchase import failed: {type(error).__name__}: {message}", file=sys.stderr)
        return 1
    finally:
        if connection is not None:
            connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
