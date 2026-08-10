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
const {
  copyVerifiedManagedResourcesForLocalCore,
  createManagedResourcesIntegrity,
  verifyManagedResourcesIntegrity,
} = require('./managed-aioncore-resources.js');
const { verifyBundledAioncoreResources } = require('./verify-bundled-aioncore-resources.js');

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

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function generatedDirectoryPid(name) {
  const matches = [...name.matchAll(/-(\d+)(?=\.stale-|$)/g)];
  if (matches.length === 0) return null;
  const pid = Number(matches.at(-1)[1]);
  return Number.isInteger(pid) ? pid : null;
}

/**
 * Remove abandoned preparation/backup directories without touching a valid
 * runtime directory or another build process that is still using its staging
 * tree. These paths contain generated release assets only.
 */
function cleanupGeneratedRuntimeDirectories(rootDir, activePid = process.pid) {
  const resolvedRoot = path.resolve(rootDir);
  const generatedNamePattern = /^(?:darwin|linux|win32)-(?:x64|arm64|ia32|armv7l)\.(?:preparing-\d+|stale-.+)$/;
  const activeDirectoryMaxAgeMs = 24 * 60 * 60 * 1000;
  const result = { removed: [], skippedActive: [], failed: [] };

  if (!fs.existsSync(resolvedRoot)) return result;

  for (const entry of fs.readdirSync(resolvedRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !generatedNamePattern.test(entry.name)) continue;

    const candidatePath = path.resolve(resolvedRoot, entry.name);
    if (path.dirname(candidatePath) !== resolvedRoot) continue;

    const ownerPid = generatedDirectoryPid(entry.name);
    const directoryAgeMs = Date.now() - fs.statSync(candidatePath).mtimeMs;
    const belongsToActiveBuild =
      ownerPid && (ownerPid === activePid || (directoryAgeMs <= activeDirectoryMaxAgeMs && isProcessAlive(ownerPid)));
    if (belongsToActiveBuild) {
      result.skippedActive.push(entry.name);
      continue;
    }

    try {
      fs.rmSync(candidatePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      result.removed.push(entry.name);
    } catch (error) {
      result.failed.push({ name: entry.name, message: error.message });
    }
  }

  return result;
}

function getBinaryName(platform) {
  return platform === 'win32' ? 'aioncore.exe' : 'aioncore';
}

function normalizeSha256(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function matchesLockedReleaseSource(manifest, platform, arch, lock, asset) {
  const expectedSha256 = normalizeSha256(asset.sha256);
  return (
    manifest?.platform === platform &&
    manifest?.arch === arch &&
    manifest?.version === lock.version &&
    manifest?.sourceType === 'locked-release' &&
    manifest?.source?.repository === lock.repository &&
    manifest?.source?.releaseTag === lock.releaseTag &&
    manifest?.source?.assetName === asset.name &&
    normalizeSha256(manifest?.source?.expectedSha256) === expectedSha256 &&
    normalizeSha256(manifest?.source?.actualSha256) === expectedSha256
  );
}

function tryReusePreparedAioncore({
  targetDir,
  platform,
  arch,
  lock,
  asset,
  isReleaseBuild,
  localBinaryPath,
  actionsRunId,
}) {
  if (isReleaseBuild || localBinaryPath || actionsRunId) return null;

  const manifestPath = path.join(targetDir, 'manifest.json');
  const manifest = readJsonSafe(manifestPath);
  if (!matchesLockedReleaseSource(manifest, platform, arch, lock, asset)) return null;

  const binaryPath = path.join(targetDir, getBinaryName(platform));
  if (!fs.existsSync(binaryPath) || !fs.statSync(binaryPath).isFile()) return null;

  const resourcesDir = path.resolve(targetDir, '..', '..');
  const verification = verifyBundledAioncoreResources({
    resourcesDir,
    electronPlatformName: platform,
    targetArch: arch,
  });
  if (verification.missing.length > 0) return null;

  const binarySha256 = sha256File(binaryPath);
  const manifestBinarySha256 = normalizeSha256(manifest.binarySha256);
  if (manifestBinarySha256 && manifestBinarySha256 !== binarySha256.toLowerCase()) return null;

  let managedResourcesIntegrity = manifest.managedResourcesIntegrity;
  try {
    if (managedResourcesIntegrity) {
      verifyManagedResourcesIntegrity(targetDir, managedResourcesIntegrity);
    } else {
      managedResourcesIntegrity = createManagedResourcesIntegrity(targetDir);
    }
  } catch {
    return null;
  }

  if (!manifestBinarySha256 || !manifest.managedResourcesIntegrity) {
    writeJson(manifestPath, { ...manifest, binarySha256, managedResourcesIntegrity });
  }

  return {
    prepared: true,
    cached: true,
    dir: targetDir,
    sourceType: manifest.sourceType,
    binarySha256,
  };
}

function tryTrustLocalPreparedAioncore({ targetDir, platform, arch, enabled, isReleaseBuild }) {
  if (!enabled || isReleaseBuild) return null;

  const binaryPath = path.join(targetDir, getBinaryName(platform));
  const managedResourcesDir = path.join(targetDir, 'managed-resources');
  if (!fs.existsSync(binaryPath) || !fs.statSync(binaryPath).isFile()) return null;
  if (!fs.existsSync(managedResourcesDir) || !fs.statSync(managedResourcesDir).isDirectory()) return null;

  const manifest = readJsonSafe(path.join(targetDir, 'manifest.json'));
  if (!manifest?.managedResourcesIntegrity) return null;
  const binarySha256 = sha256File(binaryPath);
  if (normalizeSha256(manifest.binarySha256) !== binarySha256) return null;
  try {
    verifyManagedResourcesIntegrity(targetDir, manifest.managedResourcesIntegrity);
  } catch {
    return null;
  }
  const verification = verifyBundledAioncoreResources({
    resourcesDir: path.resolve(targetDir, '..', '..'),
    electronPlatformName: platform,
    targetArch: arch,
  });
  if (verification.missing.length > 0) return null;

  return {
    prepared: true,
    cached: true,
    trustedLocal: true,
    dir: targetDir,
    sourceType: 'trusted-local-resources',
    binarySha256,
  };
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

function getReleaseByTagApiPath(releaseTag) {
  return `repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${encodeURIComponent(releaseTag)}`;
}

function getReleaseAssetApiPath(assetId) {
  return `repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${assetId}`;
}

function getGitHubAuthenticationHint() {
  return [
    'The LianLiaoAICore release is stored in a private GitHub repository.',
    'Authenticate with `gh auth login`, or set GH_TOKEN/GITHUB_TOKEN in the current build environment.',
    'If GitHub requires a proxy, set HTTPS_PROXY/HTTP_PROXY before running the build.',
    'Never commit a GitHub token to the repository.',
  ].join(' ');
}

function escapeCurlConfigValue(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/**
 * Build curl configuration on stdin so a GitHub token never appears in the
 * process command line. GitHub tokens use a restricted character set, but the
 * escaping keeps this helper safe for future credential formats as well.
 */
function getGitHubCurlConfig(accept) {
  const lines = [`header = "Accept: ${escapeCurlConfigValue(accept)}"`, 'header = "X-GitHub-Api-Version: 2022-11-28"'];
  const token = getGitHubToken();
  if (token) {
    lines.push(`header = "Authorization: Bearer ${escapeCurlConfigValue(token)}"`);
  }
  return `${lines.join('\n')}\n`;
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

  const url = `https://api.github.com/${apiPath}`;
  const out = execFileSync('curl', ['--config', '-', '-fsSL', url], {
    encoding: 'utf-8',
    input: getGitHubCurlConfig('application/vnd.github+json'),
    timeout: 15000,
  });
  return JSON.parse(out);
}

/**
 * Download an authenticated GitHub API resource without exposing the token in
 * logs. curl is preferred on supported build platforms; an authenticated
 * GitHub CLI session is the fallback.
 */
function downloadFileWithAuth(url, outputPath, options = {}) {
  const token = getGitHubToken();
  const accept = options.accept || 'application/vnd.github+json';
  const ghApiPath = options.ghApiPath || url;

  try {
    execFileSync('curl', ['--config', '-', '-L', '--fail', '--silent', '--show-error', '-o', outputPath, url], {
      input: getGitHubCurlConfig(accept),
      timeout: 120000,
    });
    return;
  } catch {
    // curl may be unavailable in some local environments; try gh before failing.
  }

  let outputFd = null;
  try {
    outputFd = fs.openSync(outputPath, 'w');
    execFileSync('gh', ['api', ghApiPath, '-H', `Accept: ${accept}`], {
      timeout: 120000,
      stdio: ['ignore', outputFd, 'inherit'],
      env: {
        ...process.env,
        GH_TOKEN: token || process.env.GH_TOKEN,
      },
    });
  } catch (error) {
    if (outputFd !== null) {
      fs.closeSync(outputFd);
      outputFd = null;
    }
    fs.rmSync(outputPath, { force: true });
    throw new Error(`Unable to download the private GitHub asset. ${getGitHubAuthenticationHint()}`, {
      cause: error,
    });
  } finally {
    if (outputFd !== null) fs.closeSync(outputFd);
  }
}

/**
 * Resolve a release asset through the GitHub API. Private release assets cannot
 * be fetched reliably from browser_download_url because GitHub returns a
 * disguised 404 for anonymous requests.
 */
function resolveReleaseAsset(assetName, releaseTag) {
  let release;
  try {
    release = githubApiGetJson(getReleaseByTagApiPath(releaseTag));
  } catch (error) {
    throw new Error(
      `Unable to read LianLiaoAICore release ${releaseTag} from GitHub. ${getGitHubAuthenticationHint()}`,
      { cause: error }
    );
  }

  const asset = Array.isArray(release?.assets)
    ? release.assets.find((candidate) => candidate?.name === assetName)
    : null;
  if (!asset?.id) {
    const availableAssets = Array.isArray(release?.assets)
      ? release.assets
          .map((candidate) => candidate?.name)
          .filter(Boolean)
          .join(', ')
      : '';
    throw new Error(
      `LianLiaoAICore release ${releaseTag} does not contain asset ${assetName}. Available assets: ${availableAssets || '(none)'}.`
    );
  }
  return asset;
}

function downloadReleaseAsset(assetName, releaseTag, outputPath) {
  const asset = resolveReleaseAsset(assetName, releaseTag);
  const apiPath = getReleaseAssetApiPath(asset.id);
  const apiUrl = `https://api.github.com/${apiPath}`;

  console.log(`  Downloading LianLiaoAICore release ${releaseTag} asset ${assetName}`);
  downloadFileWithAuth(apiUrl, outputPath, {
    accept: 'application/octet-stream',
    ghApiPath: apiPath,
  });

  return asset.browser_download_url || getDownloadUrl(assetName, releaseTag);
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
  const tempDir = path.join(os.tmpdir(), 'aioncore-prepare', releaseTag, `${platform}-${arch}`);
  const archivePath = path.join(tempDir, assetName);
  const extractDir = path.join(tempDir, 'extracted');

  removeDirectorySafe(tempDir);
  ensureDirectory(tempDir);

  const url = downloadReleaseAsset(assetName, releaseTag, archivePath);
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
  const trustLocalPreparedResources = process.env.LIANLIAO_AICORE_TRUST_PREPARED === '1';
  if (isReleaseBuild && localBinaryPath) {
    throw new Error('LIANLIAO_AICORE_LOCAL_BINARY is not allowed in a release build');
  }
  if (isReleaseBuild && actionsRunId) {
    throw new Error('AIONUI_BACKEND_RUN_ID is not allowed in a release build; publish a locked Core release first');
  }
  if (isReleaseBuild && trustLocalPreparedResources) {
    throw new Error('LIANLIAO_AICORE_TRUST_PREPARED is not allowed in a release build');
  }

  const targetDir = path.join(projectRoot, 'resources', 'bundled-aioncore', runtimeKey);
  const stagingDir = `${targetDir}.preparing-${process.pid}`;
  const binaryName = getBinaryName(platform);
  const targetBinaryPath = path.join(stagingDir, binaryName);

  const generatedCleanup = cleanupGeneratedRuntimeDirectories(path.dirname(targetDir), process.pid);
  if (generatedCleanup.removed.length > 0) {
    console.log(`  Removed abandoned Core directories: ${generatedCleanup.removed.join(', ')}`);
  }
  if (generatedCleanup.failed.length > 0) {
    console.warn(
      `  Unable to remove ${generatedCleanup.failed.length} abandoned Core director${generatedCleanup.failed.length === 1 ? 'y' : 'ies'}; packaging filters will exclude them.`
    );
  }

  const trustedLocalResult = tryTrustLocalPreparedAioncore({
    targetDir,
    platform,
    arch,
    enabled: trustLocalPreparedResources,
    isReleaseBuild,
  });
  if (trustedLocalResult) {
    console.log(`Preparing LianLiaoAICore for ${runtimeKey} (trusted local resources)`);
    console.log(`  Reusing locally prepared Core after binary and managed-resource integrity validation: ${targetDir}`);
    return trustedLocalResult;
  }
  if (trustLocalPreparedResources) {
    console.log(`  Local Core resources are unavailable for ${runtimeKey}; falling back to the locked GitHub release.`);
  }

  const { lock, asset } = getLockedAsset(projectRoot, runtimeKey, {
    requireChecksum: !localBinaryPath && !actionsRunId,
  });

  if (version !== lock.version) {
    throw new Error(`LianLiaoAICore version ${version} does not match release lock ${lock.version}`);
  }

  console.log(
    `Preparing LianLiaoAICore for ${runtimeKey} (${localBinaryPath ? 'local development binary' : actionsRunId ? `actions run: ${actionsRunId}` : `release: ${lock.releaseTag}`})`
  );

  const cachedResult = tryReusePreparedAioncore({
    targetDir,
    platform,
    arch,
    lock,
    asset,
    isReleaseBuild,
    localBinaryPath,
    actionsRunId,
  });
  if (cachedResult) {
    console.log(`  Reusing verified bundled Core cache: resources/bundled-aioncore/${runtimeKey}`);
    return cachedResult;
  }

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
    let managedResourcesIntegrity = null;
    let reusedManagedResources = false;

    // A changed local Core binary does not imply that the large Node/ACP tree changed.
    // Reuse is allowed only after structural, dependency-lock and full tree-hash checks.
    if (localBinaryPath && fs.existsSync(targetDir)) {
      const existingVerification = verifyBundledAioncoreResources({
        resourcesDir: path.resolve(targetDir, '..', '..'),
        electronPlatformName: platform,
        targetArch: arch,
      });
      if (existingVerification.missing.length === 0) {
        try {
          const existingManifest = readJsonSafe(path.join(targetDir, 'manifest.json'));
          managedResourcesIntegrity = copyVerifiedManagedResourcesForLocalCore({
            projectRoot,
            targetDir,
            stagingDir,
            runtimeKey,
            existingIntegrity: existingManifest?.managedResourcesIntegrity,
          });
          reusedManagedResources = true;
          console.log(`  Reused verified managed resources from resources/bundled-aioncore/${runtimeKey}`);
        } catch (error) {
          removeDirectorySafe(path.join(stagingDir, 'managed-resources'));
          console.warn(`  Existing managed resources were not reusable: ${error.message}`);
        }
      }
    }

    if (!reusedManagedResources) {
      prepareManagedResources(targetBinaryPath, stagingDir);
      managedResourcesIntegrity = createManagedResourcesIntegrity(stagingDir);
    }

    const manifest = {
      platform,
      arch,
      version: lock.version,
      generatedAt: new Date().toISOString(),
      binarySha256: sha256File(targetBinaryPath),
      sourceType,
      source: sourceDetail,
      managedResourcesIntegrity,
      files: [binaryName, 'managed-resources/'],
    };

    writeJson(path.join(stagingDir, 'manifest.json'), manifest);

    const previousTargetDir = moveExistingDirectoryAside(targetDir);
    try {
      fs.renameSync(stagingDir, targetDir);
      verifyManagedResourcesIntegrity(targetDir, managedResourcesIntegrity);
      const finalVerification = verifyBundledAioncoreResources({
        resourcesDir: path.resolve(targetDir, '..', '..'),
        electronPlatformName: platform,
        targetArch: arch,
      });
      if (finalVerification.missing.length > 0) {
        throw new Error(`Prepared Core resources are incomplete: ${finalVerification.missing.join(', ')}`);
      }
      if (previousTargetDir) removeDirectorySafe(previousTargetDir);
    } catch (error) {
      removeDirectorySafe(targetDir);
      if (previousTargetDir && fs.existsSync(previousTargetDir)) fs.renameSync(previousTargetDir, targetDir);
      throw error;
    }

    console.log(
      `  Bundled aioncore prepared: resources/bundled-aioncore/${runtimeKey}/${binaryName} [source=${sourceType}]`
    );
    console.log(
      `  Bundled managed resources ${reusedManagedResources ? 'reused and verified' : 'prepared and verified'}: ${path.join(targetDir, 'managed-resources')}`
    );

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
  getGitHubAuthenticationHint,
  getReleaseAssetApiPath,
  getReleaseByTagApiPath,
  getActionsArtifactMissingMessage,
  getActionsArtifactName,
  cleanupGeneratedRuntimeDirectories,
  matchesLockedReleaseSource,
  moveExistingDirectoryAside,
  prepareAioncore,
  sha256File,
  tryReusePreparedAioncore,
  tryTrustLocalPreparedAioncore,
};
