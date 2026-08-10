# Codex Lock and Managed Resource Reuse Implementation Plan

> Scope: LianLiaoAICore managed Codex ACP preparation and LianLiaoAIPC local Core packaging only.

## Task 1: Add the canonical Codex dependency lock

- Add `LianLiaoAICore/managed-acp-lock.json` with exact npm versions, SHA-512 values and platform executable paths.
- Add a focused Rust module that parses the embedded lock and exposes exact install specs.
- Validate schema and supported platform coverage in unit tests.

## Task 2: Enforce the lock in Core

- Add the exact `@openai/codex` package alongside `@agentclientprotocol/codex-acp` during lock generation.
- Validate the generated package lock before `npm ci`.
- Validate installed package versions and the target platform executable after `npm ci`.
- Apply the validation when existing managed Codex resources are activated.
- Run `cargo fmt`, focused `cargo test` and focused `cargo clippy`.

## Task 3: Add reusable integrity metadata in AIPC

- Add pure helpers to collect critical managed-resource files and calculate deterministic SHA-256 metadata.
- Verify existing metadata when present.
- For legacy resources, require Core lock validation before adopting them.
- Keep the metadata in the outer bundled Core manifest.

## Task 4: Reuse verified resources for local Core updates

- In the explicit local-binary path, copy verified resources into staging instead of regenerating them.
- Re-verify the copied staging tree before the atomic directory swap.
- Fall back to normal Core preparation when reuse is unavailable or invalid.
- Keep formal Release behavior unchanged and reject local reuse there.

## Task 5: Test and verify

- Extend AIPC unit tests for valid reuse, tampering, legacy adoption and Release rejection.
- Run the focused Vitest file and formatting/lint checks for changed scripts.
- Build the changed Core and execute one local AIPC preparation to confirm the reuse path.
- Record the verification commands and results without committing or publishing.
