"""Inject a validated enterprise openid into a LianLiaoAIPC local session.

The tool intentionally changes only Electron's ``enterprise-session.json``.
It never writes Oracle or Redis and never bypasses the cloud-api user-context
lookup that the desktop client performs again after startup.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence


SESSION_FILE_NAME = "enterprise-session.json"
SESSION_VERSION = 1
MAX_SESSION_BYTES = 4096
MAX_RESPONSE_BYTES = 1024 * 1024
MAX_OPEN_ID_LENGTH = 256
USER_CONTEXT_PATH = "cloud-api/DesktopEnterpriseController/userContext"
ENTITY_ID_PATTERN = re.compile(r"^-?[1-9][0-9]*$")


@dataclass(frozen=True)
class EnvironmentConfig:
    """Fixed cloud-api and Electron profile mapping for one runtime."""

    name: str
    base_url: str
    profile_name: str
    session_path: Path


@dataclass(frozen=True)
class SessionRecord:
    """The only enterprise identity persisted by Electron."""

    open_id: str


@dataclass(frozen=True)
class UserContext:
    """Validated identity returned by the real enterprise cloud service."""

    open_id: str
    user_id: str
    user_name: str
    company_id: str
    company_name: str
    company_level: object | None
    role_id: str | None


class ToolError(RuntimeError):
    """Expected operator-facing failure with a stable process exit code."""

    def __init__(self, message: str, exit_code: int = 2) -> None:
        super().__init__(message)
        self.exit_code = exit_code


def _configure_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8")


def normalize_openid(value: object) -> str:
    """Apply the same length and control-character boundary as Electron."""

    if not isinstance(value, str):
        raise ToolError("openid 必须是字符串。")
    normalized = value.strip()
    if not normalized:
        raise ToolError("openid 不能为空。")
    if len(normalized) > MAX_OPEN_ID_LENGTH:
        raise ToolError(f"openid 不能超过 {MAX_OPEN_ID_LENGTH} 个字符。")
    if any(unicodedata.category(character).startswith("C") for character in normalized):
        raise ToolError("openid 不能包含控制字符。")
    return normalized


def _default_app_data_root(
    platform_name: str | None = None,
    environment: Mapping[str, str] | None = None,
    home: Path | None = None,
) -> Path:
    platform_name = platform_name or sys.platform
    environment = environment or os.environ
    home = home or Path.home()

    if platform_name == "win32":
        app_data = environment.get("APPDATA", "").strip()
        if not app_data:
            raise ToolError("当前 Windows 环境缺少 APPDATA，无法定位 Electron 登录态。")
        return Path(app_data)
    if platform_name == "darwin":
        return home / "Library" / "Application Support"

    xdg_config_home = environment.get("XDG_CONFIG_HOME", "").strip()
    return Path(xdg_config_home) if xdg_config_home else home / ".config"


def resolve_environment(environment_name: str, app_data_root: Path | None = None) -> EnvironmentConfig:
    """Resolve a fixed API/profile pair without accepting arbitrary paths."""

    mappings = {
        "dev": ("http://127.0.0.1:12580/", "LianLiaoAIPC-Dev"),
        "prod": ("https://cloud.lslnii.com/", "LianLiaoAIPC"),
    }
    try:
        base_url, profile_name = mappings[environment_name]
    except KeyError as error:
        raise ToolError("环境只能是 dev 或 prod。") from error

    root = app_data_root or _default_app_data_root()
    if not root.is_absolute():
        raise ToolError("Electron appData 根目录必须是绝对路径。")
    return EnvironmentConfig(
        name=environment_name,
        base_url=base_url,
        profile_name=profile_name,
        session_path=root / profile_name / SESSION_FILE_NAME,
    )


def _normalize_entity_id(value: object, field_name: str) -> str:
    if isinstance(value, bool):
        raise ToolError(f"服务返回的 {field_name} 无效。")
    normalized = str(value).strip() if isinstance(value, (int, str)) else ""
    if not ENTITY_ID_PATTERN.fullmatch(normalized):
        raise ToolError(f"服务返回的 {field_name} 不是非零有符号整数。")
    return normalized


def _optional_text(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def validate_user_context(payload: object, expected_openid: str) -> UserContext:
    """Validate the public CommonResult and Electron identity contract."""

    expected = normalize_openid(expected_openid)
    if not isinstance(payload, dict):
        raise ToolError("企业服务返回的数据不是 JSON 对象。", exit_code=3)
    if payload.get("code") != 2000 or payload.get("success") is not True:
        message = _optional_text(payload.get("message")) or "企业服务返回了失败状态。"
        raise ToolError(message, exit_code=3)

    data = payload.get("data")
    if not isinstance(data, dict):
        raise ToolError("企业服务未返回用户上下文。", exit_code=3)
    if data.get("registered") is not True:
        raise ToolError("该 openid 尚未完成企业用户注册，未写入登录态。", exit_code=4)

    returned_openid = normalize_openid(data.get("openId"))
    if returned_openid != expected:
        raise ToolError("企业服务返回的 openid 与输入不一致，未写入登录态。", exit_code=3)

    user_id = _normalize_entity_id(data.get("userId"), "userId")
    company_id = _normalize_entity_id(data.get("companyId"), "companyId")
    raw_role_id = data.get("roleId")
    role_id = None
    if raw_role_id not in (None, ""):
        role_id = _normalize_entity_id(raw_role_id, "roleId")

    return UserContext(
        open_id=returned_openid,
        user_id=user_id,
        user_name=_optional_text(data.get("userName")),
        company_id=company_id,
        company_name=_optional_text(data.get("companyName")),
        company_level=data.get("companyLevel"),
        role_id=role_id,
    )


def _read_bounded_json(response: Any) -> object:
    raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ToolError("企业服务响应过大，已拒绝处理。", exit_code=3)
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ToolError("企业服务返回了无效 JSON。", exit_code=3) from error


def fetch_user_context(config: EnvironmentConfig, open_id: str, timeout_seconds: float = 10.0) -> object:
    """Query the selected real cloud-api without persisting response data."""

    url = config.base_url + USER_CONTEXT_PATH
    body = json.dumps({"openId": open_id}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "LianLiaoAIPC-openid-tool/1",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return _read_bounded_json(response)
    except urllib.error.HTTPError as error:
        raise ToolError(f"企业服务请求失败：HTTP {error.code}。", exit_code=3) from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        target = "本地 cloud-api" if config.name == "dev" else "线上 cloud-api"
        raise ToolError(f"无法连接{target}，请检查服务和网络后重试。", exit_code=3) from error


def write_session(session_path: Path, open_id: str) -> None:
    """Atomically replace the Electron session after all remote checks pass."""

    normalized = normalize_openid(open_id)
    profile_path = session_path.parent
    profile_path.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary_path = profile_path / f".{SESSION_FILE_NAME}.{os.getpid()}.tmp"
    contents = json.dumps(
        {"version": SESSION_VERSION, "openId": normalized},
        ensure_ascii=False,
        separators=(",", ":"),
    )

    try:
        descriptor = os.open(temporary_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as handle:
                handle.write(contents)
                handle.flush()
                os.fsync(handle.fileno())
        except Exception:
            # fdopen owns the descriptor after construction.
            raise
        try:
            os.chmod(temporary_path, 0o600)
        except OSError:
            # Windows ACLs remain authoritative when POSIX modes are unavailable.
            pass
        os.replace(temporary_path, session_path)
    except FileExistsError as error:
        raise ToolError("检测到未清理的临时登录态文件，请稍后重试。", exit_code=5) from error
    except OSError as error:
        raise ToolError("无法写入 Electron 登录态，请检查目录权限。", exit_code=5) from error
    finally:
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError:
            pass


def read_session(session_path: Path) -> SessionRecord:
    """Read and strictly validate an existing Electron session file."""

    try:
        stat = session_path.lstat()
    except FileNotFoundError as error:
        raise ToolError("当前环境没有模拟登录态。", exit_code=4) from error
    except OSError as error:
        raise ToolError("无法读取 Electron 登录态。", exit_code=5) from error

    if session_path.is_symlink() or not session_path.is_file() or not 0 < stat.st_size <= MAX_SESSION_BYTES:
        raise ToolError("Electron 登录态文件无效或大小异常。", exit_code=4)
    try:
        raw = session_path.read_bytes()
        payload = json.loads(raw.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ToolError("Electron 登录态文件已损坏。", exit_code=4) from error

    if not isinstance(payload, dict) or set(payload) != {"version", "openId"}:
        raise ToolError("Electron 登录态结构不受支持。", exit_code=4)
    if payload.get("version") != SESSION_VERSION or isinstance(payload.get("version"), bool):
        raise ToolError("Electron 登录态版本不受支持。", exit_code=4)
    return SessionRecord(open_id=normalize_openid(payload.get("openId")))


def clear_session(session_path: Path) -> bool:
    """Remove only the enterprise session and keep every sibling file intact."""

    try:
        session_path.unlink()
        return True
    except FileNotFoundError:
        return False
    except OSError as error:
        raise ToolError("无法删除 Electron 登录态，请检查目录权限。", exit_code=5) from error


def mask_openid(open_id: str) -> str:
    """Keep command output useful without printing the full persisted identity."""

    if len(open_id) <= 4:
        return "*" * len(open_id)
    if len(open_id) <= 10:
        return f"{open_id[:2]}***{open_id[-2:]}"
    return f"{open_id[:4]}***{open_id[-4:]}"


def _windows_running_processes(config: EnvironmentConfig) -> tuple[str, ...]:
    command = (
        "$items = Get-CimInstance Win32_Process | Where-Object { "
        "$_.Name -eq 'electron.exe' -or $_.Name -like '*LianLiao*' -or $_.Name -like '*产业云城*' }; "
        "$items | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"
    )
    try:
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
            capture_output=True,
            check=False,
            encoding="utf-8",
            errors="replace",
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return ()
    if completed.returncode != 0 or not completed.stdout.strip():
        return ()
    try:
        decoded = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return ()
    items = decoded if isinstance(decoded, list) else [decoded]
    matches: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = _optional_text(item.get("Name"))
        command_line = _optional_text(item.get("CommandLine"))
        combined = f"{name} {command_line}".lower()
        if config.name == "dev":
            is_match = name.lower() == "electron.exe" and "lianliao_aipc" in combined.replace("-", "_")
            if not is_match:
                is_match = name.lower() == "electron.exe" and "lianliaoaipc" in combined
        else:
            is_match = name.lower() != "electron.exe" and (
                "lianliao" in combined or "产业云城" in f"{name} {command_line}"
            )
        if is_match:
            matches.append(f"{name} (PID {item.get('ProcessId', '?')})")
    return tuple(matches)


def _posix_running_processes(config: EnvironmentConfig) -> tuple[str, ...]:
    try:
        completed = subprocess.run(
            ["ps", "-Ao", "pid=,comm=,args="],
            capture_output=True,
            check=False,
            encoding="utf-8",
            errors="replace",
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return ()
    if completed.returncode != 0:
        return ()
    matches = []
    for line in completed.stdout.splitlines():
        normalized = line.lower()
        if "enterprise_openid_login.py" in normalized:
            continue
        if config.name == "dev" and "electron" in normalized and "lianliaoaipc" in normalized.replace("_", ""):
            matches.append(line.strip())
        if config.name == "prod" and ("lianliaoaipc" in normalized.replace("_", "") or "产业云城" in line):
            matches.append(line.strip())
    return tuple(matches)


def find_running_client(config: EnvironmentConfig) -> tuple[str, ...]:
    """Best-effort detection; it never terminates an application process."""

    return _windows_running_processes(config) if sys.platform == "win32" else _posix_running_processes(config)


def ensure_client_stopped(config: EnvironmentConfig) -> None:
    running = find_running_client(config)
    if not running:
        return
    summary = "、".join(running[:3])
    raise ToolError(
        f"检测到对应客户端仍在运行：{summary}。请先从系统托盘完全退出后重试。",
        exit_code=6,
    )


def _print_environment(config: EnvironmentConfig) -> None:
    print(f"环境：{config.name}")
    print(f"服务：{config.base_url}")
    print(f"登录态：{config.session_path}")


def _run_login(config: EnvironmentConfig, open_id: str) -> None:
    normalized = normalize_openid(open_id)
    ensure_client_stopped(config)
    context = validate_user_context(fetch_user_context(config, normalized), normalized)
    write_session(config.session_path, context.open_id)

    print("模拟登录态写入成功。")
    _print_environment(config)
    print(f"openid：{mask_openid(context.open_id)}")
    print(f"用户：{context.user_name or '-'}（{context.user_id}）")
    print(f"企业：{context.company_name or '-'}（{context.company_id}）")
    print(f"角色：{context.role_id or '-'}")
    print("请重新启动链上辽宁·产业云城 AI桌面平台。")


def _run_status(config: EnvironmentConfig) -> None:
    session = read_session(config.session_path)
    print("当前环境存在有效的本地登录态。")
    _print_environment(config)
    print(f"openid：{mask_openid(session.open_id)}")


def _run_logout(config: EnvironmentConfig) -> None:
    ensure_client_stopped(config)
    removed = clear_session(config.session_path)
    print("已删除本地登录态。" if removed else "当前环境原本没有本地登录态。")
    _print_environment(config)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="校验已注册 openid，并模拟链辽 Electron 企业工作台登录。",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    login = subparsers.add_parser("login", help="校验 openid 并写入本地登录态")
    login.add_argument("--env", choices=("dev", "prod"), required=True, help="目标 Electron 环境")
    login.add_argument("--openid", required=True, help="已完成企业注册的微信 openid")

    status = subparsers.add_parser("status", help="查看本地登录态")
    status.add_argument("--env", choices=("dev", "prod"), required=True, help="目标 Electron 环境")

    logout = subparsers.add_parser("logout", help="删除本地登录态")
    logout.add_argument("--env", choices=("dev", "prod"), required=True, help="目标 Electron 环境")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    _configure_console()
    parser = build_parser()
    arguments = parser.parse_args(argv)
    try:
        config = resolve_environment(arguments.env)
        if arguments.command == "login":
            _run_login(config, arguments.openid)
        elif arguments.command == "status":
            _run_status(config)
        elif arguments.command == "logout":
            _run_logout(config)
        else:
            parser.error("未知命令。")
        return 0
    except ToolError as error:
        print(f"操作失败：{error}", file=sys.stderr)
        return error.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
