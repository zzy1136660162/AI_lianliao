# Development AionCore Resolution Design

## Context

In desktop development, Electron sets `process.resourcesPath` to Electron's own resource directory under
`node_modules/electron/dist/resources`. The repository's prepared backend instead lives under
`resources/bundled-aioncore/<platform>-<arch>/`. The current desktop resolver checks only
`process.resourcesPath` and the inherited system `PATH`, so it cannot discover a valid repository-local
backend.

When resolution fails in an unpackaged build, the failure is classified as the generic
`backend_startup_failed`. The renderer currently presents that generic failure through the incomplete-installation
dialog, which incorrectly tells developers to reinstall AionUi.

The WebUI and reset-password entry points already support an explicit `AIONUI_BACKEND_BIN` override and a
repository-local bundled backend. The desktop application should provide equivalent development behavior without
changing packaged application resolution.

## Goals

- Discover the prepared repository-local AionCore automatically in desktop development.
- Support `AIONUI_BACKEND_BIN` as an explicit desktop override.
- Preserve packaged application resource resolution and its installation-integrity diagnostics.
- Distinguish an unpackaged missing-backend configuration from an incomplete packaged installation.
- Show an actionable development-specific error without an irrelevant AionUi download action.
- Cover resolution priority, failure classification, and user-facing behavior with focused tests.

## Non-goals

- Modifying or rebuilding AionCore.
- Changing the bundled AionCore layout or packaging pipeline.
- Refactoring all WebUI, reset-password, web CLI, and desktop resolvers into one shared module.
- Adding automatic network downloads during desktop startup.
- Changing unrelated backend startup, migration, or runtime-integrity behavior.

## Resolver Design

The desktop entry point will pass an explicit resolution context into `resolveBinaryPath`:

- `appPath`: `app.getAppPath()`
- `isPackaged`: `app.isPackaged`
- `resourcesPath`: `process.resourcesPath`

The resolver will use the following priority:

1. In unpackaged mode only, `AIONUI_BACKEND_BIN`, when configured.
2. `resourcesPath/bundled-aioncore/<runtimeKey>/<binaryName>`.
3. In unpackaged mode only, `appPath/resources/bundled-aioncore/<runtimeKey>/<binaryName>`.
4. The system `PATH` via `where aioncore` on Windows or `which aioncore` elsewhere.

An explicit development environment override is authoritative. If it is configured but does not point to an
existing file, resolution fails immediately with diagnostics instead of silently selecting a different backend.
This prevents a stale developer setting from being hidden by a PATH fallback.

The environment override and development repository path are never considered when `isPackaged` is true. Packaged
applications therefore continue to use only their installed resources and PATH fallback, preserving existing
production behavior and incomplete-installation detection.

The resolver diagnostics will record the relevant candidate paths and existence results so startup reports explain
which resolution source failed. Directory listings remain bounded as they are today.

## Failure Classification and UI

An error with `stage: 'resolve_binary'` and `isPackaged: false` will be classified as a dedicated
`backend_binary_not_found` reason. The existing `backend_incomplete_installation` classification remains restricted
to packaged applications with missing installed resources.

The dedicated development failure will display:

- A title explaining that AionCore was not found for development.
- A description listing the supported configuration sources: repository resources, `AIONUI_BACKEND_BIN`, or
  system `PATH`.
- The existing diagnostics-report action.
- No "Download latest AionUi" action.

All new user-facing text will use i18n keys. English and Simplified Chinese will contain native text; other locale
files will receive the English fallback text to keep locale key parity until translations are available.

Generic non-resolution startup failures will retain their existing generic classification. They will not be
reclassified as missing-backend errors.

## Data Flow

```text
Electron app metadata and process environment
                    |
                    v
          desktop binary resolver
      env -> packaged -> development -> PATH
                    |
          +---------+---------+
          |                   |
          v                   v
   resolved executable   resolution error
          |                   |
          v                   v
 BackendLifecycleManager   failure classifier
                              |
                              v
             development-specific renderer dialog
```

## Error Handling

- A missing explicit override reports the configured path in sanitized startup diagnostics and does not fall back.
- A missing repository candidate falls through to PATH in development.
- A packaged missing resource continues through the existing incomplete-installation classifier.
- A resolved binary that later exits, times out, or fails data initialization continues through the existing
  startup failure classifiers; successful path resolution does not imply backend health.
- No startup code copies, deletes, downloads, or mutates backend binaries.

## Testing Strategy

Resolver unit tests will prove:

- A valid `AIONUI_BACKEND_BIN` wins over every other development source.
- An invalid explicit override fails without falling through.
- A packaged bundled binary is preferred over development resources and PATH.
- An unpackaged build discovers `appPath/resources/bundled-aioncore`.
- A packaged build ignores both development-only override sources.
- PATH remains the final fallback.
- Failure diagnostics contain the attempted candidates.

Startup classification tests will prove:

- Unpackaged `resolve_binary` failures become `backend_binary_not_found`.
- Packaged missing resources remain `backend_incomplete_installation`.
- Other startup failures remain generic.

Renderer and i18n tests will prove:

- The development failure uses its dedicated title and description.
- The development dialog has diagnostics reporting but no download action.
- Every configured locale contains the new keys.

Verification will run the focused Vitest suites first, followed by type checking, i18n generation/checks, formatting
checks, and the relevant broader unit tests.

## Acceptance Criteria

- Starting desktop development from the repository works when a valid backend exists at
  `resources/bundled-aioncore/<runtimeKey>/aioncore[.exe]`, without modifying `PATH`.
- `AIONUI_BACKEND_BIN` can select a valid backend explicitly.
- Packaged resolution and incomplete-installation behavior are unchanged.
- A missing development backend produces an accurate configuration error and no reinstall/download instruction.
- Focused tests, type checking, formatting, and i18n validation pass.
