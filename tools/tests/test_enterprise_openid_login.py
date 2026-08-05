from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tools.enterprise_openid_login import (
    ToolError,
    clear_session,
    read_session,
    resolve_environment,
    validate_user_context,
    write_session,
)


OPEN_ID = "test-openid-registered-user"


def successful_response(**data_overrides: object) -> dict[str, object]:
    data: dict[str, object] = {
        "registered": True,
        "openId": OPEN_ID,
        "userId": "-60",
        "userName": "测试用户",
        "companyId": "-8",
        "companyName": "测试企业",
        "companyLevel": 5,
        "roleId": "1",
    }
    data.update(data_overrides)
    return {
        "code": 2000,
        "success": True,
        "data": data,
    }


class EnvironmentResolutionTest(unittest.TestCase):
    def test_dev_and_prod_use_isolated_profiles_and_fixed_api_origins(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dev = resolve_environment("dev", root)
            prod = resolve_environment("prod", root)

        self.assertEqual("http://127.0.0.1:12580/", dev.base_url)
        self.assertEqual(root / "LianLiaoAIPC-Dev" / "enterprise-session.json", dev.session_path)
        self.assertEqual("https://cloud.lslnii.com/", prod.base_url)
        self.assertEqual(root / "LianLiaoAIPC" / "enterprise-session.json", prod.session_path)


class UserContextValidationTest(unittest.TestCase):
    def test_accepts_registered_identity_with_negative_non_zero_ids(self) -> None:
        context = validate_user_context(successful_response(), OPEN_ID)

        self.assertEqual("-60", context.user_id)
        self.assertEqual("-8", context.company_id)
        self.assertEqual("1", context.role_id)

    def test_rejects_unregistered_or_mismatched_identity(self) -> None:
        invalid_responses = (
            successful_response(registered=False),
            successful_response(openId="different-openid"),
            successful_response(userId="0"),
            successful_response(companyId="not-an-id"),
        )

        for response in invalid_responses:
            with self.subTest(response=response):
                with self.assertRaises(ToolError):
                    validate_user_context(response, OPEN_ID)


class SessionFileTest(unittest.TestCase):
    def test_writes_the_electron_contract_and_reads_it_back(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            session_path = Path(directory) / "profile" / "enterprise-session.json"

            write_session(session_path, OPEN_ID)
            session = read_session(session_path)
            raw = json.loads(session_path.read_text(encoding="utf-8"))

        self.assertEqual({"version": 1, "openId": OPEN_ID}, raw)
        self.assertEqual(OPEN_ID, session.open_id)

    def test_validation_failure_does_not_overwrite_existing_session(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            session_path = Path(directory) / "enterprise-session.json"
            write_session(session_path, "existing-openid")

            with self.assertRaises(ToolError):
                validate_user_context(successful_response(registered=False), OPEN_ID)

            current = read_session(session_path)

        self.assertEqual("existing-openid", current.open_id)

    def test_logout_is_idempotent_and_does_not_remove_sibling_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            profile = Path(directory)
            session_path = profile / "enterprise-session.json"
            sibling = profile / "Preferences"
            write_session(session_path, OPEN_ID)
            sibling.write_text("keep", encoding="utf-8")

            self.assertTrue(clear_session(session_path))
            self.assertFalse(clear_session(session_path))

            self.assertFalse(session_path.exists())
            self.assertEqual("keep", sibling.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
