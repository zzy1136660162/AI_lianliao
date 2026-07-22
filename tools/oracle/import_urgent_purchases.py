"""Guarded Excel importer for approved type-22 urgent-purchase demands."""

from __future__ import annotations

import argparse
import json
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
    Path(__file__).resolve().parents[3]
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


class DuplicateDemandError(ValueError):
    """Raised when an active target demand already exists."""


@dataclass(frozen=True)
class UrgentPurchaseRow:
    demand_name: str
    company_name: str
    city: str
    district: str
    address: str
    param3: str
    budget: str
    param5: str
    intro: str
    param6: str | None


_HEADER_TO_FIELD = dict(zip(EXPECTED_HEADERS, (field.name for field in fields(UrgentPurchaseRow))))
_REQUIRED_HEADERS = EXPECTED_HEADERS[:-1]
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
}


def _text(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def validate_headers(actual: Sequence[object]) -> None:
    normalized = tuple(str(value).strip() for value in actual)
    if normalized != EXPECTED_HEADERS:
        raise ValueError(f"Excel 表头不符合预期：期望 {EXPECTED_HEADERS}，实际 {normalized}")


def normalize_row(source: Mapping[str, object]) -> UrgentPurchaseRow:
    values = {field_name: _text(source.get(header)) for header, field_name in _HEADER_TO_FIELD.items()}
    for header in _REQUIRED_HEADERS:
        if not values[_HEADER_TO_FIELD[header]]:
            raise ValueError(f"必填字段为空：{header}")
    values["param6"] = values["param6"] or None
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
    if not rows:
        raise ValueError("Sheet1 没有可导入数据")
    keys = [(row.demand_name, row.company_name) for row in rows]
    if len(keys) != len(set(keys)):
        raise ValueError("Excel 中存在重复的紧急采购名称和企业名称")
    return rows


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
    IS_CHECK, TYPE, PARAM3, PARAM5, PARAM6, DEMAND_STATE, BUDGET,
    COMPANY_ID, GRAB_NUM, DEL_SIGN, INPUT_TIME, END_TIME
) VALUES (
    SEQ_DEMAND.NEXTVAL, ?, ?, ?, ?, ?, ?,
    1, 22, ?, ?, ?, 0, ?,
    400496, 0, 0,
    TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS'),
    TO_CHAR(SYSDATE + 30, 'YYYYMMDDHH24MISS')
)
"""


def execute_import(connection: Any, rows: Sequence[UrgentPurchaseRow]) -> list[int]:
    generated_ids: list[int] = []
    try:
        preflight_import(connection, rows)
        cursor = connection.cursor()
        try:
            for row in rows:
                cursor.execute(
                    _INSERT_SQL,
                    (
                        row.company_name,
                        row.city,
                        row.district,
                        row.address,
                        row.demand_name,
                        row.intro,
                        row.param3,
                        row.param5,
                        row.param6,
                        row.budget,
                    ),
                )
                cursor.execute("SELECT SEQ_DEMAND.CURRVAL FROM DUAL")
                current = cursor.fetchone()
                if current is None:
                    raise RuntimeError("未能读取 SEQ_DEMAND.CURRVAL")
                generated_ids.append(int(current[0]))
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
                "PARAM3, BUDGET, PARAM5, INTRO, PARAM6 FROM J_COMMON_DEMAND "
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
                )
                for demand_id, row in zip(generated_ids, rows)
            ]
            if actual_rows != expected_rows:
                raise RuntimeError("提交前验证失败：数据库业务字段与 Excel 不一致")
        finally:
            cursor.close()
        connection.commit()
        return generated_ids
    except Exception:
        connection.rollback()
        raise


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
