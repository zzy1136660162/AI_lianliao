/**
 * Prepare aioncore binary for packaging.
 *
 * Resolution order:
 *  1. Explicit local development binary
 *  2. Current-repository Actions artifact for an explicit development run
 *  3. Locked LianLiaoAICore GitHub release asset with SHA256 verification
 *
 * Output: {projectRoot}/resources/bundled-aioncore/{platform}-{arch}/
 *   - aioncore[.exe]
 *   - manifest.json
 *   - managed-resources/...
 *
 * @module prepare-aioncore
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getLockedAsset } = require('../../../scripts/verifyAioncoreReleaseLock.js');

const GITHUB_OWNER = 'zzy1136660162';
const GITHUB_REPO = 'AI_lianliao';

const ACTIONS_ARTIFACT_TARGETS = {
  'darwin-arm64': {
    artifactName: 'lianliao-aicore-aarch64-apple-darwin',
    manualPlatform: 'macos-arm64',
  },
  'darwin-x64': {
    artifactName: 'lianliao-aicore-x86_64-apple-darwin',
    manualPlatform: 'macos-x64',
  },
  'linux-arm64': {
    artifactName: 'lianliao-aicore-aarch64-unknown-linux-gnu',
    manualPlatform: 'linux-arm64',
  },
  'linux-x64': {
    artifactName: 'lianliao-aicore-x86_64-unknown-linux-gnu',
    manualPlatform: 'linux-x64',
  },
  'win32-arm64': {
    artifactName: 'lianliao-aicore-aarch64-pc-windows-msvc',
    manualPlatform: 'windows-arm64',
  },
  'win32-x64': {
    artifactName: 'lianliao-aicore-x86_64-pc-windows-msvc',
    manualPlatform: 'windows-x64',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function moveExistingDirectoryAside(dirPath) {
  if (!fs.existsSync(dirPath)) return null;

  const backupPath = `${dirPath}.stale-${Date.now()}-${process.pid}`;
  fs.renameSync(dirPath, backupPath);
  return backupPath;
}

function removeDirectorySafe(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (error) {
    if (process.platform !== 'win32' || error?.code !== 'EPERM' || !fs.existsSync(dirPath)) {
      throw error;
    }

    // Windows can transiently deny recursive deletion of a just-used managed
    // resource tree. Moving it aside unblocks the replacement build safely.
    const backupPath = moveExistingDirectoryAside(dirPath);
    console.warn(`  Deferred cleanup for locked directory: ${backupPath}`);
  }
}

function copyFileSafe(sourcePath, targetPath) {
  ensureDirectory(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function ensureExecutableMode(filePath) {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {}
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
}

function getBinaryName(platform) {
  return platform === 'win32' ? 'aioncore.exe' : 'aioncore';
}

function getActionsTarget(platform, arch) {
  return ACTIONS_ARTIFACT_TARGETS[`${platform}-${arch}`] || null;
}

function getActionsArtifactName(platform, arch) {
  return getActionsTarget(platform, arch)?.artifactName || null;
}

function getActionsManualPlatform(platform, arch) {
  return getActionsTarget(platform, arch)?.manualPlatform || `${platform}-${arch}`;
}

function getActionsArtifactMissingMessage({ runId, platform, arch, expectedArtifactName, availableArtifactNames }) {
  const available =
    Array.isArray(availableArtifactNames) && availableArtifactNames.length > 0
      ? availableArtifactNames.join(', ')
      : '(none)';
  return [
    `LianLiaoAICore run ${runId} does not contain artifact [ ${expectedArtifactName} ] required for [ ${platform}-${arch} ].`,
    `Available artifacts: ${available}.`,
    `Re-run the LianLiaoAICore release workflow for [ ${getActionsManualPlatform(platform, arch)} ] or all targets.`,
  ].join(' ');
}

function prepareManagedResources(binaryPath, targetDir) {
  const bundleOut = path.join(targetDir, 'managed-resources');
  const dataDir = path.join(targetDir, '.prepare-data');

  removeDirectorySafe(bundleOut);
  removeDirectorySafe(dataDir);
  ensureDirectory(bundleOut);
  ensureDirectory(dataDir);

  console.log(`  Preparing managed resources under ${path.relative(process.cwd(), bundleOut)}`);
  execFileSync(binaryPath, ['--data-dir', dataDir, 'prepare-managed-resources', '--bundle-out', bundleOut], {
    stdio: 'inherit',
    env: {
      ...process.env,
      AIONUI_BUNDLED_MANAGED_RESOURCES: '',
    },
  });

  removeDirectorySafe(dataDir);
  return bundleOut;
}

// ---------------------------------------------------------------------------
// Source resolvers
// ---------------------------------------------------------------------------

/**
 * Build the release asset filename for the given platform/arch/tag.
 *
 * Expected asset naming convention:
 *   aioncore-v0.1.0-aarch64-apple-darwin.tar.gz
 */
function getAssetName(platform, arch, tag) {
  const archMap = { x64: 'x86_64', arm64: 'aarch64' };
  const platformMap = {
    darwin: 'apple-darwin',
    linux: 'unknown-linux-gnu',
    win32: 'pc-windows-msvc',
  };
  const normalizedArch = archMap[arch];
  const normalizedPlatform = platformMap[platform];
  if (!normalizedArch || !normalizedPlatform) return null;
  const ext = platform === 'win32' ? '.zip' : '.tar.gz';
  return `lianliao-aicore-${tag}-${normalizedArch}-${normalizedPlatform}${ext}`;
}

function getDownloadUrl(assetName, releaseTag) {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${releaseTag}/${assetName}`;
}

function downloadFile(url, outputPath) {
  console.log(`  Downloading LianLiaoAICore from ${url}`);
  if (process.platform === 'win32') {
    const ps = `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${outputPath.replace(/'/g, "''")}'`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      timeout: 120000,
    });
    return;
  }
  try {
    execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', '-o', outputPath, url], { timeout: 120000 });
  } catch {
    execFileSync('wget', ['-q', '-O', outputPath, url], { timeout: 120000 });
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function assertSha256(filePath, expectedSha256) {
  const actualSha256 = sha256File(filePath);
  if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(
      `LianLiaoAICore SHA256 mismatch: expected ${expectedSha256.toLowerCase()}, got ${actualSha256.toLowerCase()}`
    );
  }
  return actualSha256;
}

function extractArchive(archivePath, outputDir, platform) {
  ensureDirectory(outputDir);
  if (platform === 'win32' || archivePath.endsWith('.zip')) {
    if (platform === 'win32') {
      const ps = `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`;
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    } else {
      execFileSync('unzip', ['-o', archivePath, '-d', outputDir]);
    }
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', outputDir]);
  }
}

function findBinaryInDir(dir, binaryName) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === binaryName) return fullPath;
    if (entry.isDirectory()) {
      const found = findBinaryInDir(fullPath, binaryName);
      if (found) return found;
    }
  }
  return null;
}

function findAioncoreArchiveInDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (
      entry.isFile() &&
      (entry.name.startsWith('aioncore-') || entry.name.startsWith('lianliao-aicore-')) &&
      (entry.name.endsWith('.zip') || entry.name.endsWith('.tar.gz'))
    ) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = findAioncoreArchiveInDir(fullPath);
      if (found) return found;
    }
  }
  return null;
}

function getGitHubToken() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
}

function githubApiGetJson(apiPath) {
  const token = getGitHubToken();

  try {
    return JSON.parse(
      execFileSync('gh', ['api', apiPath], {
        encoding: 'utf-8',
        timeout: 15000,
        env: {
          ...process.env,
          GH_TOKEN: token || process.env.GH_TOKEN,
        },
      })
    );
  } catch {
    // gh CLI not available or failed — fall back to curl.
  }

  const headers = ['-H', 'Accept: application/vnd.github+json'];
  if (token) {
    headers.push('-H', `Authorization: Bearer ${token}`);
  }

  const url = `https://api.github.com/${apiPath}`;
  const out = execFileSync('curl', ['-fsSL', ...headers, url], {
    encoding: 'utf-8',
    timeout: 15000,
  });
  return JSON.parse(out);
}

function downloadFileWithAuth(url, outputPath) {
  const token = getGitHubToken();
  const headers = ['-H', 'Accept: application/vnd.github+json'];
  if (token) {
    headers.push('-H', `Authorization: Bearer ${token}`);
  }

  try {
    execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', ...headers, '-o', outputPath, url], {
      timeout: 120000,
    });
    return;
  } catch {
    // curl may be unavailable in some local environments; try gh before failing.
  }

  execFileSync('gh', ['api', url, '--output', outputPath], {
    timeout: 120000,
    env: {
      ...process.env,
      GH_TOKEN: token || process.env.GH_TOKEN,
    },
  });
}

function listActionsArtifacts(runId) {
  const response = githubApiGetJson(
    `repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts?per_page=100`
  );
  return Array.isArray(response?.artifacts) ? response.artifacts : [];
}

function downloadAndExtractActionsArtifact(platform, arch, runId) {
  const expectedArtifactName = getActionsArtifactName(platform, arch);
  if (!expectedArtifactName) {
    throw new Error(`Unsupported LianLiaoAICore Actions artifact target: ${platform}-${arch}`);
  }

  const artifacts = listActionsArtifacts(runId);
  const availableArtifactNames = artifacts
    .map((artifact) => artifact.name)
    .filter(Boolean)
    .toSorted();
  const artifact = artifacts.find((candidate) => candidate.name === expectedArtifactName);
  if (!artifact) {
    throw new Error(
      getActionsArtifactMissingMessage({
        runId,
        platform,
        arch,
        expectedArtifactName,
        availableArtifactNames,
      })
    );
  }

  const tempDir = path.join(os.tmpdir(), 'aioncore-prepare-actions', runId, `${platform}-${arch}`);
  const artifactZipPath = path.join(tempDir, `${expectedArtifactName}.zip`);
  const artifactExtractDir = path.join(tempDir, 'artifact');
  const binaryExtractDir = path.join(tempDir, 'binary');

  removeDirectorySafe(tempDir);
  ensureDirectory(tempDir);

  const downloadUrl =
    artifact.archive_download_url ||
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/artifacts/${artifact.id}/zip`;
  console.log(`  Downloading aioncore from LianLiaoAICore run ${runId} artifact ${expectedArtifactName}`);
  downloadFileWithAuth(downloadUrl, artifactZipPath);
  extractArchive(artifactZipPath, artifactExtractDir, platform);

  const archivePath = findAioncoreArchiveInDir(artifactExtractDir);
  if (!archivePath) {
    throw new Error(
      `LianLiaoAICore artifact ${expectedArtifactName} from run ${runId} does not contain an aioncore archive`
    );
  }

  extractArchive(archivePath, binaryExtractDir, platform);

  const binaryName = getBinaryName(platform);
  const binaryPath = findBinaryInDir(binaryExtractDir, binaryName);
  if (!binaryPath) {
    throw new Error(
      `Binary ${binaryName} not found in LianLiaoAICore artifact ${expectedArtifactName} from run ${runId}`
    );
  }

  return {
    binaryPath,
    tempDir,
    artifactName: expectedArtifactName,
    archivePath,
    url: downloadUrl,
  };
}

function downloadAndExtract(platform, arch, releaseTag, assetName, expectedSha256) {
  const url = getDownloadUrl(assetName, releaseTag);
  const tempDir = path.join(os.tmpdir(), 'aioncore-prepare', releaseTag, `${platform}-${arch}`);
  const archivePath = path.join(tempDir, assetName);
  const extractDir = path.join(tempDir, 'extracted');

  removeDirectorySafe(tempDir);
  ensureDirectory(tempDir);

  downloadFile(url, archivePath);
  const actualSha256 = assertSha256(archivePath, expectedSha256);
  extractArchive(archivePath, extractDir, platform);

  const binaryName = getBinaryName(platform);
  const binaryPath = findBinaryInDir(extractDir, binaryName);
  if (!binaryPath) {
    throw new Error(`Binary ${binaryName} not found in downloaded archive`);
  }

  return { binaryPath, tempDir, url, actualSha256 };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Prepare aioncore binary for packaging.
 *
 * @param {object} options - Configuration options
 * @param {string} options.projectRoot - Project root directory
 * @param {string} options.platform - Target platform (process.platform)
 * @param {string} options.arch - Target architecture (process.arch)
 * @param {string} options.version - Pinned backend version from the release lock
 * @returns {{ prepared: true; dir: string; sourceType: string }}
 */
function prepareAioncore(options) {
  const { projectRoot, platform, arch, version } = options;
  const runtimeKey = `${platform}-${arch}`;
  const actionsRunId = (process.env.AIONUI_BACKEND_RUN_ID || '').trim();
  const localBinaryPath = (process.env.LIANLIAO_AICORE_LOCAL_BINARY || '').trim();
  const isReleaseBuild = process.env.LIANLIAO_RELEASE_BUILD === '1';
  const { lock, asset } = getLockedAsset(projectRoot, runtimeKey, {
    requireChecksum: !localBinaryPath && !actionsRunId,
  });

  if (version !== lock.version) {
    throw new Error(`LianLiaoAICore version ${version} does not match release lock ${lock.version}`);
  }
  if (isReleaseBuild && localBinaryPath) {
    throw new Error('LIANLIAO_AICORE_LOCAL_BINARY is not allowed in a release build');
  }
  if (isReleaseBuild && actionsRunId) {
    throw new Error('AIONUI_BACKEND_RUN_ID is not allowed in a release build; publish a locked Core release first');
  }

  const targetDir = path.join(projectRoot, 'resources', 'bundled-aioncore', runtimeKey);
  const stagingDir = `${targetDir}.preparing-${process.pid}`;
  const binaryName = getBinaryName(platform);
  const targetBinaryPath = path.join(stagingDir, binaryName);

  console.log(
    `Preparing LianLiaoAICore for ${runtimeKey} (${localBinaryPath ? 'local development binary' : actionsRunId ? `actions run: ${actionsRunId}` : `release: ${lock.releaseTag}`})`
  );

  removeDirectorySafe(stagingDir);
  ensureDirectory(stagingDir);

  let sourcePath = null;
  let sourceType = 'none';
  let sourceDetail = {};
  let tempDir = null;

  // 1. Explicit local development binary. Never accepted in release builds.
  if (localBinaryPath) {
    const resolvedLocalPath = path.resolve(localBinaryPath);
    if (!fs.existsSync(resolvedLocalPath)) {
      throw new Error(`Local LianLiaoAICore binary not found: ${resolvedLocalPath}`);
    }
    sourcePath = resolvedLocalPath;
    sourceType = 'local-development';
    sourceDetail = { path: resolvedLocalPath };
  }

  // 2. Current repository Actions artifact for explicit development runs.
  if (!sourcePath && actionsRunId) {
    const result = downloadAndExtractActionsArtifact(platform, arch, actionsRunId);
    sourcePath = result.binaryPath;
    tempDir = result.tempDir;
    sourceType = 'actions-artifact';
    sourceDetail = {
      runId: actionsRunId,
      artifactName: result.artifactName,
      url: result.url,
    };
    console.log(`  Downloaded from GitHub Actions artifact`);
  }

  // 3. Locked LianLiaoAICore release. Download or checksum failure is fatal.
  if (!sourcePath) {
    const result = downloadAndExtract(platform, arch, lock.releaseTag, asset.name, asset.sha256);
    sourcePath = result.binaryPath;
    tempDir = result.tempDir;
    sourceType = 'locked-release';
    sourceDetail = {
      repository: lock.repository,
      releaseTag: lock.releaseTag,
      assetName: asset.name,
      url: result.url,
      expectedSha256: asset.sha256,
      actualSha256: result.actualSha256,
    };
    console.log('  Downloaded and verified from the LianLiaoAICore GitHub release');
  }

  try {
    copyFileSafe(sourcePath, targetBinaryPath);
    ensureExecutableMode(targetBinaryPath);
    const bundledManagedResourcesDir = prepareManagedResources(targetBinaryPath, stagingDir);

    const manifest = {
      platform,
      arch,
      version: lock.version,
      generatedAt: new Date().toISOString(),
      sourceType,
      source: sourceDetail,
      files: [binaryName, 'managed-resources/'],
    };

    writeJson(path.join(stagingDir, 'manifest.json'), manifest);

    const previousTargetDir = moveExistingDirectoryAside(targetDir);
    fs.renameSync(stagingDir, targetDir);
    if (previousTargetDir) removeDirectorySafe(previousTargetDir);

    console.log(
      `  Bundled aioncore prepared: resources/bundled-aioncore/${runtimeKey}/${binaryName} [source=${sourceType}]`
    );
    console.log(`  Bundled managed resources prepared: ${bundledManagedResourcesDir}`);

    if (tempDir) removeDirectorySafe(tempDir);
    return { prepared: true, dir: targetDir, sourceType };
  } catch (error) {
    if (tempDir) removeDirectorySafe(tempDir);
    removeDirectorySafe(stagingDir);
    throw error;
  }
}

module.exports = {
  assertSha256,
  getAssetName,
  getDownloadUrl,
  getActionsArtifactMissingMessage,
  getActionsArtifactName,
  moveExistingDirectoryAside,
  prepareAioncore,
  sha256File,
};
