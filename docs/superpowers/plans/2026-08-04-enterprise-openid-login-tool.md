# Enterprise openid Login Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python CLI that validates a registered openid against the selected cloud-api and atomically injects or removes the matching Electron enterprise session for dev or production profiles.

**Architecture:** Keep all behavior in one standard-library Python module under `tools`, with pure helpers for environment resolution, response validation and session parsing plus a thin CLI layer. The tool writes only `enterprise-session.json`; it never changes Electron, cloud-api, Redis or Oracle.

**Tech Stack:** Python 3 standard library (`argparse`, `json`, `pathlib`, `urllib`, `tempfile`-style atomic replacement), `unittest`.

---

### Task 1: Implement the CLI and focused regression tests

**Files:**
- Create: `tools/enterprise_openid_login.py`
- Create: `tools/tests/test_enterprise_openid_login.py`

- [ ] **Step 1: Add focused tests for environment isolation and response validation**

Cover these public helpers and outcomes:

```python
resolve_environment("dev", app_data_root)
resolve_environment("prod", app_data_root)
validate_user_context(payload, expected_openid)
read_session(session_path)
write_session(session_path, openid)
clear_session(session_path)
```

The tests must verify dev/prod paths, signed non-zero IDs, openid equality, rejection of unregistered responses, atomic preservation on validation failure, and idempotent logout.

- [ ] **Step 2: Implement standard-library CLI behavior**

Expose the commands:

```text
login --env {dev,prod} --openid OPENID
status --env {dev,prod}
logout --env {dev,prod}
```

Use fixed environment mappings, POST JSON to `cloud-api/DesktopEnterpriseController/userContext`, validate `code == 2000`, `success == true`, `registered == true`, matching openid and signed non-zero user/company IDs, then write exactly:

```json
{"version":1,"openId":"..."}
```

Write to a same-directory temporary file, flush and `fsync`, apply owner-only permissions where supported, then call `os.replace`. Never overwrite the session before remote validation succeeds.

- [ ] **Step 3: Run focused tests and CLI syntax checks**

Run:

```powershell
python -m unittest tools.tests.test_enterprise_openid_login -v
python tools/enterprise_openid_login.py --help
python tools/enterprise_openid_login.py login --help
python -m py_compile tools/enterprise_openid_login.py
```

Expected: all tests pass, both help commands exit `0`, and compilation produces no error.

### Task 2: Document operator usage

**Files:**
- Modify: `tools/README.md`

- [ ] **Step 1: Add dev/prod examples and operating constraints**

Document the three commands, fixed API/profile mappings, the requirement to fully quit Electron before login/logout, the fact that only registered users are accepted, and that the tool does not modify databases.

- [ ] **Step 2: Verify documentation commands match the parser**

Compare every documented flag with `python tools/enterprise_openid_login.py --help`; no undocumented required arguments or stale command names may remain.

### Task 3: Final scoped verification

**Files:**
- Verify only: `tools/enterprise_openid_login.py`
- Verify only: `tools/tests/test_enterprise_openid_login.py`
- Verify only: `tools/README.md`

- [ ] **Step 1: Re-run the focused suite**

```powershell
python -m unittest tools.tests.test_enterprise_openid_login -v
```

Expected: PASS.

- [ ] **Step 2: Inspect the scoped diff**

```powershell
git diff -- tools/enterprise_openid_login.py tools/tests/test_enterprise_openid_login.py tools/README.md
```

Expected: no credentials, real openids, database writes, Redis writes, Electron changes or cloud-api changes.

No commit or push is performed without an explicit user request.
