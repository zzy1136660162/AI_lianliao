#!/usr/bin/env node

/**
 * Simplified build script for AionUi
 * Coordinates electron-vite (bundling) and electron-builder (packaging)
 *
 * Features:
 * - Incremental builds: use --skip-vite to skip Vite compilation if out/ exists
 * - Skip native rebuild: use --skip-native to skip native module rebuilding
 * - Packaging only: use --pack-only to skip electron-builder distributable creation
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const buildStartedAt = performance.now();
const buildStartedAtEpochMs = Date.now();

// DMG retry logic for macOS: detects DMG creation failures by checking artifacts
// (.app exists but .dmg missing) and retries only the DMG step using
// electron-builder --prepackaged with the .app path (not the parent directory).
// This preserves full DMG styling (window size, icon positions, background)
// Background: GitHub Actions macos-14 runners occasionally suffer from transient
// "Device not configured" hdiutil errors (electron-builder#8415, actions/runner-images#12323).
const DMG_RETRY_MAX = 3;
const DMG_RETRY_DELAY_SEC = 30;

// Incremental build: hash of source files to detect changes
const INCREMENTAL_CACHE_FILE = 'out/.build-hash';

function formatDuration(durationMs) {
  if (durationMs >= 60_000) {
    const minutes = Math.floor(durationMs / 60_000);
    const seconds = ((durationMs % 60_000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function runTimedPhase(label, operation) {
  const startedAt = performance.now();
  try {
    return operation();
  } finally {
    console.log(`  [timing] ${label}: ${formatDuration(performance.now() - startedAt)}`);
  }
}

function reportWindowsArtifacts({ outDir, packageVersion, architectures, startedAtEpochMs }) {
  for (const architecture of architectures) {
    const artifactPath = path.join(outDir, `LianLiaoAIPC-${packageVersion}-win-${architecture}.exe`);
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Windows installer was not found after packaging: ${artifactPath}`);
    }

    const artifact = fs.statSync(artifactPath);
    if (artifact.mtimeMs + 1000 < startedAtEpochMs) {
      throw new Error(`Windows installer was not refreshed by this build: ${artifactPath}`);
    }

    console.log(`  Windows installer: ${artifactPath}`);
    console.log(`  Installer size: ${(artifact.size / 1024 / 1024).toFixed(1)} MB`);
  }
}

function walkFiles(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === '.git') continue;
      walkFiles(fullPath, acc);
    } else if (entry.isFile()) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function computeSourceHash() {
  const hash = crypto.createHash('md5');
  const rootDir = path.resolve(__dirname, '..');
  const filesToHash = [
    'package.json',
    'package-lock.json',
    'bun.lock',
    'tsconfig.json',
    'packages/desktop/electron.vite.config.ts',
  ];

  for (const file of filesToHash) {
    const filePath = path.resolve(rootDir, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      hash.update(file + ':');
      hash.update(content);
    }
  }

  // Packaging orchestration/configuration does not affect electron-vite output.
  // Keep this list limited to bundle inputs so local installer-only changes do
  // not trigger a full renderer rebuild.
  const hashDirs = ['packages/desktop/src', 'packages', 'public'];
  for (const dir of hashDirs) {
    const dirPath = path.resolve(rootDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = walkFiles(dirPath)
      .map((file) => path.relative(rootDir, file).replace(/\\/g, '/'))
      .sort();

    for (const relPath of files) {
      const absolutePath = path.resolve(rootDir, relPath);
      const stat = fs.statSync(absolutePath);
      hash.update(relPath + ':');
      hash.update(String(stat.size));
      hash.update(String(stat.mtimeMs));
    }
  }

  return hash.digest('hex');
}

function loadCachedHash() {
  try {
    const cacheFile = path.resolve(__dirname, '..', INCREMENTAL_CACHE_FILE);
    if (fs.existsSync(cacheFile)) {
      return fs.readFileSync(cacheFile, 'utf8').trim();
    }
  } catch {}
  return null;
}

function saveCurrentHash(hash) {
  try {
    const cacheFile = path.resolve(__dirname, '..', INCREMENTAL_CACHE_FILE);
    const viteDir = path.dirname(cacheFile);
    if (!fs.existsSync(viteDir)) {
      fs.mkdirSync(viteDir, { recursive: true });
    }
    fs.writeFileSync(cacheFile, hash);
  } catch {}
}

function viteBuildExists() {
  const outDir = path.resolve(__dirname, '../out');
  const mainDir = path.join(outDir, 'main');
  const rendererDir = path.join(outDir, 'renderer');

  return fs.existsSync(path.join(mainDir, 'index.js')) && fs.existsSync(path.join(rendererDir, 'index.html'));
}

function shouldSkipViteBuild(skipViteFlag, forceFlag) {
  if (forceFlag) return false;
  if (skipViteFlag) return true;

  // Auto-detect: skip if build exists and hash matches
  const currentHash = computeSourceHash();
  const cachedHash = loadCachedHash();

  if (cachedHash && currentHash === cachedHash && viteBuildExists()) {
    console.log('📦 Incremental build: Vite output unchanged, skipping compilation');
    return true;
  }

  return false;
}

function cleanupDiskImages() {
  try {
    // Detach all mounted disk images that may block subsequent DMG creation:
    // hdiutil info → grep device paths → force detach each
    const result = spawnSync(
      'sh',
      [
        '-c',
        "hdiutil info 2>/dev/null | grep /dev/disk | awk '{print $1}' | xargs -I {} hdiutil detach {} -force 2>/dev/null",
      ],
      { stdio: 'ignore' }
    );
    if (result.status !== 0) {
      console.log(`   ℹ️  Disk image cleanup exit code: ${result.status}`);
    }
    return result.status === 0;
  } catch (error) {
    console.log(`   ℹ️  Disk image cleanup failed: ${error.message}`);
    return false;
  }
}

// Find the .app directory from electron-builder output
function findAppDir(outDir) {
  const candidates = ['mac', 'mac-arm64', 'mac-x64', 'mac-universal'];
  for (const dir of candidates) {
    const fullPath = path.join(outDir, dir);
    if (fs.existsSync(fullPath)) {
      const hasApp = fs.readdirSync(fullPath).some((f) => f.endsWith('.app'));
      if (hasApp) return fullPath;
    }
  }
  return null;
}

// Check if DMG exists in output directory
function dmgExists(outDir) {
  try {
    return fs.readdirSync(outDir).some((f) => f.endsWith('.dmg'));
  } catch {
    return false;
  }
}

function tryRemoveDir(targetDir) {
  if (!fs.existsSync(targetDir)) return true;
  try {
    fs.rmSync(targetDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 300,
    });
    return true;
  } catch (error) {
    console.log(`❌ Failed to remove ${targetDir}: ${error.message}`);
    return false;
  }
}

function isProcessRunningWindows(imageName) {
  if (process.platform !== 'win32') return false;
  try {
    const result = execSync(`tasklist /FI "IMAGENAME eq ${imageName}"`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return result.toString().toLowerCase().includes(imageName.toLowerCase());
  } catch {
    return false;
  }
}

function killWindowsProcesses(imageNames) {
  if (process.platform !== 'win32') return;
  for (const name of imageNames) {
    try {
      execSync(`taskkill /F /IM ${name}`, { stdio: 'ignore' });
    } catch {}
  }
}

function formatExecError(error) {
  return [error?.message, error?.stdout?.toString?.(), error?.stderr?.toString?.()].filter(Boolean).join('\n').trim();
}

// Create macOS distributables using electron-builder --prepackaged with .app path.
// This preserves DMG styling and still emits the zip required by MacUpdater.
function createMacArtifactsWithPrepackaged(appDir, targetArch) {
  const appName = fs.readdirSync(appDir).find((f) => f.endsWith('.app'));
  if (!appName) throw new Error(`No .app found in ${appDir}`);
  const appPath = path.join(appDir, appName);

  execSync(
    `bunx electron-builder --config packages/desktop/electron-builder.yml --mac dmg zip --${targetArch} --prepackaged "${appPath}" --publish=never`,
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }
  );
}

function buildWithDmgRetry(cmd, targetArch) {
  const isMac = process.platform === 'darwin';
  const outDir = path.resolve(__dirname, '../out');

  try {
    execSync(cmd, { stdio: 'inherit', shell: process.platform === 'win32' });
    return;
  } catch (error) {
    // On non-macOS or if .app doesn't exist, just throw
    const appDir = isMac ? findAppDir(outDir) : null;
    if (!appDir || dmgExists(outDir)) throw error;

    // .app exists but no .dmg → DMG creation failed
    console.log('\n🔄 Build failed during DMG creation (.app exists, .dmg missing)');
    console.log('   Retrying macOS distributable creation with --prepackaged...');

    for (let attempt = 1; attempt <= DMG_RETRY_MAX; attempt++) {
      cleanupDiskImages();
      spawnSync('sleep', [String(DMG_RETRY_DELAY_SEC)]);

      try {
        console.log(`\n📀 DMG retry attempt ${attempt}/${DMG_RETRY_MAX}...`);
        createMacArtifactsWithPrepackaged(appDir, targetArch);
        console.log('✅ macOS distributables created successfully on retry');
        return;
      } catch (retryError) {
        console.log(`   ⚠️  DMG retry ${attempt}/${DMG_RETRY_MAX} failed`);
        cleanupDiskImages();
        if (attempt === DMG_RETRY_MAX) {
          console.log(`   ❌ DMG creation failed after ${DMG_RETRY_MAX} retries`);
          throw retryError;
        }
      }
    }
  }
}

// Clean stale Windows packaging directories. Keep the last successful installer
// visible while the next local build runs; retries can explicitly remove it.
function cleanupWindowsPackOutput({ removeArtifacts = false } = {}) {
  const outDir = path.resolve(__dirname, '../out');
  if (!fs.existsSync(outDir)) return;

  const removed = [];
  const winUnpackedDirRe = /^win(?:-[a-z0-9]+)?-unpacked$/i;
  const winArtifactFileRe = /-win-[^.]+\.(?:exe|msi|zip|7z)$/i;

  for (const entry of fs.readdirSync(outDir, { withFileTypes: true })) {
    const fullPath = path.join(outDir, entry.name);

    if (entry.isDirectory() && winUnpackedDirRe.test(entry.name)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      removed.push(entry.name);
      continue;
    }

    if (removeArtifacts && entry.isFile() && winArtifactFileRe.test(entry.name)) {
      fs.rmSync(fullPath, { force: true });
      removed.push(entry.name);
    }
  }

  if (removed.length > 0) {
    console.log(`🧹 Cleaned stale Windows outputs: ${removed.join(', ')}`);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const archList = ['x64', 'arm64', 'ia32', 'armv7l'];

// Check for special flags
const skipVite = args.includes('--skip-vite');
const skipNative = args.includes('--skip-native');
const packOnly = args.includes('--pack-only');
const forceBuild = args.includes('--force');

const builderArgs = args
  .filter((arg) => {
    // Filter out 'auto', architecture flags, and special flags
    if (arg === 'auto') return false;
    if (arg === '--skip-vite' || arg === '--skip-native' || arg === '--pack-only' || arg === '--force') return false;
    if (archList.includes(arg)) return false;
    if (arg.startsWith('--') && archList.includes(arg.slice(2))) return false;
    return true;
  })
  .join(' ');
const isWindowsBuild = builderArgs.includes('--win') || builderArgs.includes('--all');
const useTrustedLocalAioncore =
  process.platform === 'win32' &&
  isWindowsBuild &&
  process.env.LIANLIAO_RELEASE_BUILD !== '1' &&
  process.env.LIANLIAO_AICORE_VERIFY !== '1';

if (useTrustedLocalAioncore) {
  process.env.LIANLIAO_AICORE_TRUST_PREPARED = '1';
} else if (process.env.LIANLIAO_AICORE_VERIFY === '1') {
  delete process.env.LIANLIAO_AICORE_TRUST_PREPARED;
}

// Get target architecture from electron-builder.yml
function getTargetArchFromConfig(platform) {
  try {
    const configPath = path.resolve(__dirname, '../packages/desktop/electron-builder.yml');
    const content = fs.readFileSync(configPath, 'utf8');

    const platformRegex = new RegExp(`^${platform}:\\s*$`, 'm');
    const platformMatch = content.match(platformRegex);
    if (!platformMatch) return null;

    const platformStartIndex = platformMatch.index;
    const afterPlatform = content.slice(platformStartIndex + platformMatch[0].length);
    const nextPlatformMatch = afterPlatform.match(/^[a-zA-Z][a-zA-Z0-9]*:/m);
    const platformBlock = nextPlatformMatch
      ? content.slice(platformStartIndex, platformStartIndex + platformMatch[0].length + nextPlatformMatch.index)
      : content.slice(platformStartIndex);

    const archMatch = platformBlock.match(/arch:\s*\[\s*([a-z0-9_]+)/i);
    return archMatch ? archMatch[1].trim() : null;
  } catch (error) {
    return null;
  }
}

// Determine target architecture
const buildMachineArch = process.arch;
let targetArch;
let multiArch = false;

// Check if multiple architectures are specified (support both --x64 and x64 formats)
const rawArchArgs = args
  .filter((arg) => {
    if (archList.includes(arg)) return true;
    if (arg.startsWith('--') && archList.includes(arg.slice(2))) return true;
    return false;
  })
  .map((arg) => (arg.startsWith('--') ? arg.slice(2) : arg));

// Remove duplicates to avoid treating "x64 --x64" as multiple architectures
const archArgs = [...new Set(rawArchArgs)];

if (archArgs.length > 1) {
  // Multiple unique architectures specified - let electron-builder handle it
  multiArch = true;
  targetArch = archArgs[0]; // Use first arch for webpack build
  console.log(`🔨 Multi-architecture build detected: ${archArgs.join(', ')}`);
} else if (args[0] === 'auto') {
  if (archArgs.length === 1) {
    targetArch = archArgs[0];
  } else {
    // Auto mode: detect from electron-builder.yml
    let detectedPlatform = null;
    if (builderArgs.includes('--linux')) detectedPlatform = 'linux';
    else if (builderArgs.includes('--mac')) detectedPlatform = 'mac';
    else if (builderArgs.includes('--win')) detectedPlatform = 'win';

    const configArch = detectedPlatform ? getTargetArchFromConfig(detectedPlatform) : null;
    targetArch = configArch || buildMachineArch;
  }
} else {
  // Explicit architecture or default to build machine
  targetArch = archArgs[0] || buildMachineArch;
}

console.log(`🔨 Building for architecture: ${targetArch}`);
console.log(`📋 Builder arguments: ${builderArgs || '(none)'}`);
if (useTrustedLocalAioncore) console.log('⚡ Local Core mode: trust existing prepared resources');
if (skipVite) console.log('⚡ --skip-vite: Will skip Vite compilation if output exists');
if (skipNative) console.log('⚡ --skip-native: Will skip native module rebuilding');
if (packOnly) console.log('⚡ --pack-only: Will skip electron-builder distributable creation');
if (forceBuild) console.log('⚡ --force: Force full rebuild');

const packageJsonPath = path.resolve(__dirname, '../package.json');

try {
  // 1. Ensure package.json main entry is correct for electron-vite
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const productName = packageJson.productName || packageJson.name;
  const executableName = packageJson.executableName || productName;
  const windowsExecutableName = `${executableName}.exe`;
  const legacyWindowsExecutableName = 'AionUi.exe';
  const windowsExecutableNames = [...new Set([windowsExecutableName, legacyWindowsExecutableName])];
  if (packageJson.main !== './out/main/index.js') {
    packageJson.main = './out/main/index.js';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  }

  // 2. Check if we can skip Vite build (incremental build)
  const skipViteBuild = runTimedPhase('Vite cache check', () => shouldSkipViteBuild(skipVite, forceBuild));

  if (!skipViteBuild) {
    // Run electron-vite to build all bundles (main + preload + renderer)
    console.log(`📦 Building ${targetArch}...`);
    runTimedPhase('Vite build', () => {
      execSync(`bunx electron-vite build --config packages/desktop/electron.vite.config.ts`, {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          ELECTRON_BUILDER_ARCH: targetArch,
        },
      });

      // Save hash after successful build
      saveCurrentHash(computeSourceHash());
    });
  } else {
    console.log('📦 Using cached Vite build output');
  }

  // Re-bundle builtin MCP server as a fully self-contained CJS bundle so it can
  // be executed by an external `node` process (no Electron ASAR support available).
  // electron-vite's externalizeDepsPlugin leaves npm packages as require() calls
  // which the standalone node process cannot resolve from inside app.asar.unpacked.
  // Uses a dedicated script (build-mcp-servers.js) to avoid shell-quoting issues
  // with special characters in esbuild --define values.
  console.log('📦 Bundling builtin MCP servers (self-contained)...');
  runTimedPhase('Builtin MCP bundle', () => {
    execSync(`node "${path.join(__dirname, 'build-mcp-servers.js')}"`, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  });

  // 3. Verify electron-vite output
  const outDir = path.resolve(__dirname, '../out');
  if (!fs.existsSync(outDir)) {
    throw new Error('electron-vite did not generate out/ directory');
  }

  // 4. Validate output structure
  const mainIndex = path.join(outDir, 'main', 'index.js');
  const rendererIndex = path.join(outDir, 'renderer', 'index.html');

  if (!fs.existsSync(mainIndex)) {
    throw new Error('Missing main entry: out/main/index.js');
  }

  if (!fs.existsSync(rendererIndex)) {
    throw new Error('Missing renderer entry: out/renderer/index.html');
  }

  // If --pack-only, skip electron-builder distributable creation
  if (packOnly) {
    console.log('✅ Package completed! (skipped distributable creation)');
    console.log(`  [timing] Total: ${formatDuration(performance.now() - buildStartedAt)}`);
    return;
  }

  // 5. Prepare aioncore binary (for packaged runtime usage)
  const { prepareAioncore } = require('../packages/shared-scripts/src/prepare-aioncore.js');
  const { resolveAioncoreVersion } = require('./resolveAioncoreVersion.js');
  const projectRoot = path.resolve(__dirname, '..');
  runTimedPhase('LianLiaoAICore preparation', () => {
    prepareAioncore({
      projectRoot,
      platform: process.platform,
      arch: targetArch,
      version: useTrustedLocalAioncore ? packageJson.aioncoreVersion : resolveAioncoreVersion(projectRoot),
    });
  });

  // 6. Prepare hub resources (index.json + extension zips for offline fallback)
  runTimedPhase('Hub resource preparation', () => {
    execSync('node scripts/prepareHubResources.js', { stdio: 'inherit', env: process.env });
  });

  // 6. 运行 electron-builder 生成分发包（DMG/ZIP/EXE等）
  // Run electron-builder to create distributables (DMG/ZIP/EXE, etc.)
  // Always disable auto-publish to avoid electron-builder's implicit tag-based publishing
  // Publishing is handled by a separate release job in CI
  const publishArg = '--publish=never';

  // Set compression level based on environment
  // 7za -mx accepts numeric values: 0 (store) to 9 (ultra)
  // Trusted local builds use store mode for the fastest feedback loop.
  // Verified local and CI builds retain compressed release-like artifacts.
  const isCI = process.env.CI === 'true';
  if (!process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL) {
    process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL = useTrustedLocalAioncore ? '0' : isCI ? '9' : '7';
  }
  console.log(
    `📦 Compression level: ${process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL} (${useTrustedLocalAioncore ? 'trusted local build' : isCI ? 'CI build' : 'verified local build'})`
  );

  // 根据模式添加架构标志
  // Add arch flags based on mode
  let archFlag = '';
  if (multiArch) {
    // 多架构模式：将所有架构标志传递给 electron-builder
    // Multi-arch mode: pass all arch flags to electron-builder
    archFlag = archArgs.map((arch) => `--${arch}`).join(' ');
    console.log(`🚀 Packaging for multiple architectures: ${archArgs.join(', ')}...`);
  } else {
    // 单架构模式：使用确定的目标架构
    // Single arch mode: use the determined target arch
    archFlag = `--${targetArch}`;
    console.log(`🚀 Creating distributables for ${targetArch}...`);
  }

  // 为 Windows 构建添加架构检测脚本
  // Add architecture detection scripts for Windows builds
  // 使用 .onVerifyInstDir 避免与 electron-builder 冲突
  // Use .onVerifyInstDir to avoid conflicts with electron-builder
  let nsisInclude = '';
  if (builderArgs.includes('--win') || builderArgs.includes('--all')) {
    if (!multiArch) {
      // 单架构构建：添加对应架构的检测脚本
      // Single-arch build: Add architecture-specific detection script
      if (targetArch === 'arm64') {
        const arm64Script = 'resources/windows-installer-arm64.nsh';
        if (fs.existsSync(path.resolve(__dirname, '..', arm64Script))) {
          nsisInclude += ` --config.nsis.include="${arm64Script}"`;
          console.log(`📋 Including Windows ARM64 architecture check script`);
        }
        nsisInclude += ' --config.nsis.useZip=true';
        console.log('📋 Using ZIP payload for Windows ARM64 NSIS installer');
      } else if (targetArch === 'x64') {
        const x64Script = 'resources/windows-installer-x64.nsh';
        if (fs.existsSync(path.resolve(__dirname, '..', x64Script))) {
          nsisInclude += ` --config.nsis.include="${x64Script}"`;
          console.log(`📋 Including Windows x64 architecture check script`);
        }
      }
    }
    // 多架构构建：暂不支持架构检测脚本
    // Multi-arch builds: Architecture detection not supported yet
  }

  if (process.platform === 'win32' && builderArgs.includes('--win')) {
    const winUnpackedDir = path.join(outDir, 'win-unpacked');
    let cleaned = tryRemoveDir(winUnpackedDir);
    if (!cleaned) {
      const appRunning = isProcessRunningWindows(windowsExecutableName);
      const legacyAppRunning =
        legacyWindowsExecutableName !== windowsExecutableName && isProcessRunningWindows(legacyWindowsExecutableName);
      const electronRunning = isProcessRunningWindows('electron.exe');
      if (appRunning || legacyAppRunning || electronRunning) {
        console.log(`⚠️  Detected running ${productName}/Electron process. Attempting to close...`);
        killWindowsProcesses([...windowsExecutableNames, 'electron.exe']);
        cleaned = tryRemoveDir(winUnpackedDir);
        if (!cleaned) {
          console.log(
            `⚠️  Directory still locked. Please close any running ${productName}/Electron processes and retry.`
          );
        }
      }
    }
  }

  if (isWindowsBuild) {
    cleanupWindowsPackOutput();
  }

  const localFastBuilderConfig = useTrustedLocalAioncore ? ' --config.compression=store --config.nsis.useZip=true' : '';
  if (localFastBuilderConfig) {
    console.log('⚡ Local packaging mode: store compression with NSIS ZIP payload');
  }
  const builderCommand = `bunx electron-builder --config packages/desktop/electron-builder.yml ${builderArgs} ${archFlag} ${nsisInclude}${localFastBuilderConfig} ${publishArg}`;
  runTimedPhase('electron-builder', () => {
    try {
      buildWithDmgRetry(builderCommand, targetArch);
    } catch (error) {
      const winExePath = path.join(outDir, 'win-unpacked', windowsExecutableName);
      const legacyWinExePath = path.join(outDir, 'win-unpacked', legacyWindowsExecutableName);
      const windowsExecutableWasProduced =
        fs.existsSync(winExePath) || (legacyWinExePath !== winExePath && fs.existsSync(legacyWinExePath));
      const firstError = formatExecError(error);
      const canRetryWithoutExecutableEdit =
        process.platform === 'win32' && isWindowsBuild && process.env.CI !== 'true' && windowsExecutableWasProduced;

      if (!canRetryWithoutExecutableEdit) {
        throw error;
      }

      console.log(`⚠️  Windows local build failed after ${windowsExecutableName} was produced.`);
      if (firstError) {
        console.log('   First failure summary:');
        console.log(
          firstError
            .split(/\r?\n/)
            .slice(0, 6)
            .map((line) => `   ${line}`)
            .join('\n')
        );
      }
      console.log('   Retrying local build with win.signAndEditExecutable=false...');
      console.log('   This fallback is intended for transient rcedit / file-lock failures on developer machines.');
      killWindowsProcesses([...windowsExecutableNames, 'electron.exe']);
      cleanupWindowsPackOutput({ removeArtifacts: true });

      try {
        buildWithDmgRetry(`${builderCommand} --config.win.signAndEditExecutable=false`, targetArch);
      } catch (retryError) {
        const retryFailure = formatExecError(retryError);
        throw new Error(
          [
            'Windows local retry with win.signAndEditExecutable=false also failed.',
            'First failure:',
            firstError || String(error),
            'Retry failure:',
            retryFailure || String(retryError),
          ].join('\n')
        );
      }
    }
  });

  if (isWindowsBuild) {
    const builtArchitectures = multiArch ? archArgs : [targetArch];
    reportWindowsArtifacts({
      outDir,
      packageVersion: packageJson.version,
      architectures: builtArchitectures,
      startedAtEpochMs: buildStartedAtEpochMs,
    });
  }

  console.log('✅ Build completed!');
  console.log(`  [timing] Total: ${formatDuration(performance.now() - buildStartedAt)}`);
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
