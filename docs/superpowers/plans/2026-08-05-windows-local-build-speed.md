# Windows Local Build Speed Implementation Plan

> **For agentic workers:** Execute inline in the current task. The user explicitly requested implementation before tests; do not use TDD and do not commit automatically.

**Goal:** Make repeated local Windows installer builds trust existing Core resources and exclude abandoned preparation directories while preserving full GitHub release verification.

**Architecture:** Keep cache validation and generated-directory cleanup in `prepare-aioncore.js`, where Core source identity is already known. Keep orchestration timing and artifact reporting in `build-with-builder.js`, and add an electron-builder filter as defense in depth. Release builds bypass the prepared-directory cache.

**Tech Stack:** Node.js CommonJS, Electron Builder YAML, Vitest 4, PowerShell/npm build verification.

---

### Task 1: Core cache and generated-directory cleanup

**Files:**
- Modify: `LianLiaoAIPC/packages/shared-scripts/src/prepare-aioncore.js`

- [ ] Export `cleanupGeneratedRuntimeDirectories(rootDir, activePid)` and restrict candidates to directories matching `/^[^.]+\.(?:preparing-\d+|stale-.+)$/`. Resolve every candidate and assert its parent is exactly `rootDir` before deletion. Preserve `.preparing-${activePid}`.
- [ ] Add a trusted-local helper used by ordinary Windows local builds. It checks only that the target Core binary and `managed-resources` directory exist; it does not read Release metadata or calculate SHA256.
- [ ] Preserve strict cache/source validation behind `build-win:verified`, and reject trusted-local mode whenever `LIANLIAO_RELEASE_BUILD=1`.
- [ ] Call cleanup before cache lookup, return `{ prepared: true, cached: true, ... }` on a valid cache, and add `binarySha256` to every newly generated manifest.

Core validation shape:

```js
function tryReusePreparedAioncore({ targetDir, platform, arch, lock, asset, isReleaseBuild, localBinaryPath, actionsRunId }) {
  if (isReleaseBuild || localBinaryPath || actionsRunId) return null;
  const manifest = readJsonSafe(path.join(targetDir, 'manifest.json'));
  if (!matchesLockedReleaseSource(manifest, platform, arch, lock, asset)) return null;
  const binaryPath = path.join(targetDir, getBinaryName(platform));
  if (!fs.existsSync(binaryPath) || !hasFiles(path.join(targetDir, 'managed-resources'))) return null;
  const binarySha256 = sha256File(binaryPath);
  if (manifest.binarySha256 && manifest.binarySha256 !== binarySha256) return null;
  if (!manifest.binarySha256) writeJson(path.join(targetDir, 'manifest.json'), { ...manifest, binarySha256 });
  return { prepared: true, cached: true, dir: targetDir, sourceType: manifest.sourceType };
}
```

### Task 2: Packaging defense and observability

**Files:**
- Modify: `LianLiaoAIPC/packages/desktop/electron-builder.yml`
- Modify: `LianLiaoAIPC/scripts/build-with-builder.js`

- [ ] Change the bundled Core `extraResources` file set to include `filter: ['**/*', '!*.preparing-*/**/*', '!*.stale-*/**/*']` so abandoned siblings cannot enter an installer even when deletion is blocked.
- [ ] Add a phase timer wrapper using `performance.now()` and apply it to Vite, MCP, Core, Hub and electron-builder calls without changing command semantics.
- [ ] After electron-builder succeeds, resolve the expected Windows artifact from package version, target architecture and `out` directory. Fail if a single-architecture Windows build does not produce it; otherwise print absolute path, size and total elapsed time.
- [ ] Use store compression and an NSIS ZIP payload only in trusted local mode; keep executable metadata editing, NSIS GUID, App ID and verified/release packaging behavior unchanged.

Timer shape:

```js
function runTimedPhase(label, operation) {
  const startedAt = performance.now();
  try {
    return operation();
  } finally {
    console.log(`  ${label}: ${formatDuration(performance.now() - startedAt)}`);
  }
}
```

### Task 3: Post-implementation tests

**Files:**
- Modify: `LianLiaoAIPC/tests/unit/assets/prepareAioncoreCleanup.test.ts`
- Modify: `LianLiaoAIPC/tests/unit/releasePackagingConfig.test.ts`
- Modify as needed: `LianLiaoAIPC/tests/unit/bootstrap/buildWithBuilder.test.ts`

- [ ] Add fixture-based tests showing stale directories are removed, the active preparation directory is retained, unrelated directories are untouched, matching legacy manifests are upgraded, matching caches are reused, hash mismatches miss the cache, and release builds bypass it.
- [ ] Add config assertions for both Core temporary-directory exclusion filters.
- [ ] Add build-script assertions for phase timing and final artifact reporting, preserving existing `--pack-only` behavior.
- [ ] Run `node --check scripts/build-with-builder.js` and `node --check packages/shared-scripts/src/prepare-aioncore.js`; expect exit code 0.
- [ ] Run `npm test -- --run tests/unit/assets/prepareAioncoreCleanup.test.ts tests/unit/releasePackagingConfig.test.ts tests/unit/bootstrap/buildWithBuilder.test.ts`; expect all selected tests to pass.
- [ ] Run `npm run typecheck:enterprise-tests`; expect exit code 0.

### Task 4: Generated-directory cleanup and build benchmark

**Files:**
- Generated only: `LianLiaoAIPC/resources/bundled-aioncore/*.preparing-*`
- Generated only: `LianLiaoAIPC/resources/bundled-aioncore/*.stale-*`
- Generated only: `LianLiaoAIPC/out/LianLiaoAIPC-<version>-win-x64.exe`

- [ ] Wait for the already-running build PID to exit before cleanup; never remove its active staging directory.
- [ ] Run the cleanup helper and verify the Core resource root contains only valid runtime directories and no stale/preparing siblings.
- [ ] Run `npm run build-win` once and record total/Core/electron-builder durations plus the reported artifact size and path.
- [ ] Run `npm run build-win` again and verify the log contains a Core cache hit, no Core download/preparation command, no temporary Core directories in `win-unpacked`, and a valid installer at the reported absolute path.
- [ ] Run the packaged-resource verification relevant to Windows x64 and confirm the installer remains present after build completion.
