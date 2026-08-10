const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MANAGED_RESOURCES_INTEGRITY_SCHEMA = 1;

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label} ${filePath}: ${error.message}`, { cause: error });
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = fs.openSync(filePath, 'r');
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function listFiles(rootDir) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Managed resources must not contain symbolic links: ${fullPath}`);
      }
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  };
  visit(rootDir);
  return files.toSorted((left, right) => left.localeCompare(right, 'en'));
}

/**
 * Hash every managed resource without loading large executables into memory.
 * Only the aggregate fingerprint is persisted, keeping the outer manifest small.
 */
function createManagedResourcesIntegrity(targetDir) {
  const resourcesRoot = path.join(targetDir, 'managed-resources');
  if (!fs.existsSync(resourcesRoot) || !fs.statSync(resourcesRoot).isDirectory()) {
    throw new Error(`Managed resources directory is missing: ${resourcesRoot}`);
  }

  const aggregate = crypto.createHash('sha256');
  const files = listFiles(resourcesRoot);
  let totalBytes = 0;
  for (const filePath of files) {
    const stat = fs.statSync(filePath);
    const relativePath = path.relative(resourcesRoot, filePath).split(path.sep).join('/');
    const fileSha256 = hashFile(filePath);
    totalBytes += stat.size;
    aggregate.update(relativePath, 'utf8');
    aggregate.update('\0');
    aggregate.update(String(stat.size), 'utf8');
    aggregate.update('\0');
    aggregate.update(fileSha256, 'utf8');
    aggregate.update('\n');
  }

  return {
    schemaVersion: MANAGED_RESOURCES_INTEGRITY_SCHEMA,
    algorithm: 'sha256-tree-v1',
    fingerprint: aggregate.digest('hex'),
    fileCount: files.length,
    totalBytes,
  };
}

function matchesManagedResourcesIntegrity(actual, expected) {
  return (
    expected?.schemaVersion === MANAGED_RESOURCES_INTEGRITY_SCHEMA &&
    expected?.algorithm === 'sha256-tree-v1' &&
    typeof expected?.fingerprint === 'string' &&
    actual.fingerprint === expected.fingerprint.toLowerCase() &&
    actual.fileCount === expected.fileCount &&
    actual.totalBytes === expected.totalBytes
  );
}

function verifyManagedResourcesIntegrity(targetDir, expected) {
  const actual = createManagedResourcesIntegrity(targetDir);
  if (!matchesManagedResourcesIntegrity(actual, expected)) {
    throw new Error(
      `Managed resources integrity mismatch: expected ${expected?.fingerprint || '<missing>'}, got ${actual.fingerprint}`
    );
  }
  return actual;
}

function packageDirectory(root, packageName) {
  return path.join(root, 'node_modules', ...packageName.split('/'));
}

function requirePackageEntry(packages, packageName, expected, expectedName) {
  const key = `node_modules/${packageName}`;
  const actual = packages[key];
  if (!actual) throw new Error(`Managed Codex package lock is missing ${key}`);
  if (actual.version !== expected.version) {
    throw new Error(
      `Managed Codex ${packageName} version mismatch: expected ${expected.version}, got ${actual.version}`
    );
  }
  if (actual.integrity !== expected.integrity) {
    throw new Error(`Managed Codex ${packageName} integrity mismatch`);
  }
  if (expectedName && actual.name !== expectedName) {
    throw new Error(
      `Managed Codex ${packageName} package alias mismatch: expected ${expectedName}, got ${actual.name}`
    );
  }
}

function requireInstalledVersion(toolRoot, packageName, expectedVersion) {
  const manifestPath = path.join(packageDirectory(toolRoot, packageName), 'package.json');
  const manifest = readJson(manifestPath, `installed ${packageName} manifest`);
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `Installed managed Codex ${packageName} version mismatch: expected ${expectedVersion}, got ${manifest.version}`
    );
  }
}

/**
 * Validate a legacy Codex resource tree against the Core lock, then add the exact
 * root dependency metadata that newer Core versions require. No package content
 * is downloaded or replaced by this compatibility upgrade.
 */
function validateAndAdoptManagedCodexLock({ projectRoot, targetDir, runtimeKey, dependencyLockPath }) {
  const lockPath = dependencyLockPath || path.resolve(projectRoot, '..', 'LianLiaoAICore', 'managed-acp-lock.json');
  const dependencyLock = readJson(lockPath, 'managed ACP dependency lock');
  if (dependencyLock.schemaVersion !== 1) {
    throw new Error(`Unsupported managed ACP dependency lock schema: ${dependencyLock.schemaVersion}`);
  }

  const contractPath = path.join(targetDir, 'managed-resources', 'manifest.json');
  const contract = readJson(contractPath, 'managed resources contract');
  if (contract.runtimeKey !== runtimeKey) {
    throw new Error(`Managed resources runtime mismatch: expected ${runtimeKey}, got ${contract.runtimeKey}`);
  }
  const tool = contract.acpTools?.find((item) => item.slug === 'codex-acp');
  if (!tool) throw new Error('Managed resources contract is missing codex-acp');

  const codexLock = dependencyLock.codexAcp;
  const platformLock = codexLock?.platforms?.[runtimeKey];
  if (!codexLock?.bridge || !codexLock?.codexCli || !platformLock) {
    throw new Error(`Managed ACP dependency lock is incomplete for ${runtimeKey}`);
  }
  if (tool.version !== codexLock.bridge.version || tool.packageName !== codexLock.bridge.package) {
    throw new Error('Managed Codex ACP contract does not match the dependency lock');
  }
  if (tool.platformExecutable !== platformLock.executable) {
    throw new Error('Managed Codex platform executable path does not match the dependency lock');
  }

  const toolRoot = path.join(targetDir, 'managed-resources', tool.root);
  const packageJsonPath = path.join(toolRoot, 'package.json');
  const packageLockPath = path.join(toolRoot, 'package-lock.json');
  const packageJson = readJson(packageJsonPath, 'managed Codex package manifest');
  const packageLock = readJson(packageLockPath, 'managed Codex package lock');
  const packages = packageLock.packages;
  if (!packages || typeof packages !== 'object') throw new Error('Managed Codex package lock has no packages object');

  requirePackageEntry(packages, codexLock.bridge.package, codexLock.bridge);
  requirePackageEntry(packages, codexLock.codexCli.package, codexLock.codexCli);
  requirePackageEntry(packages, platformLock.aliasPackage, platformLock, platformLock.package);
  requireInstalledVersion(toolRoot, codexLock.bridge.package, codexLock.bridge.version);
  requireInstalledVersion(toolRoot, codexLock.codexCli.package, codexLock.codexCli.version);
  requireInstalledVersion(toolRoot, platformLock.aliasPackage, platformLock.version);

  const executablePath = path.join(toolRoot, ...platformLock.executable.split('/'));
  if (!fs.existsSync(executablePath) || !fs.statSync(executablePath).isFile()) {
    throw new Error(`Managed Codex platform executable is missing: ${executablePath}`);
  }

  const exactDependencies = {
    ...packageJson.dependencies,
    [codexLock.bridge.package]: codexLock.bridge.version,
    [codexLock.codexCli.package]: codexLock.codexCli.version,
  };
  const lockRoot = packages[''];
  if (!lockRoot || typeof lockRoot !== 'object') throw new Error('Managed Codex package lock has no root package');
  const exactLockDependencies = {
    ...lockRoot.dependencies,
    [codexLock.bridge.package]: codexLock.bridge.version,
    [codexLock.codexCli.package]: codexLock.codexCli.version,
  };

  packageJson.dependencies = exactDependencies;
  lockRoot.dependencies = exactLockDependencies;
  writeJson(packageJsonPath, packageJson);
  writeJson(packageLockPath, packageLock);
  return { dependencyLockPath: lockPath, codexVersion: codexLock.codexCli.version };
}

function copyVerifiedManagedResourcesForLocalCore({
  projectRoot,
  targetDir,
  stagingDir,
  runtimeKey,
  existingIntegrity,
  dependencyLockPath,
}) {
  if (existingIntegrity) verifyManagedResourcesIntegrity(targetDir, existingIntegrity);

  const sourceDir = path.join(targetDir, 'managed-resources');
  const destinationDir = path.join(stagingDir, 'managed-resources');
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`No existing managed resources to reuse: ${sourceDir}`);
  }
  fs.cpSync(sourceDir, destinationDir, { recursive: true, force: false, errorOnExist: true });
  validateAndAdoptManagedCodexLock({
    projectRoot,
    targetDir: stagingDir,
    runtimeKey,
    dependencyLockPath,
  });
  const integrity = createManagedResourcesIntegrity(stagingDir);
  verifyManagedResourcesIntegrity(stagingDir, integrity);
  return integrity;
}

module.exports = {
  copyVerifiedManagedResourcesForLocalCore,
  createManagedResourcesIntegrity,
  validateAndAdoptManagedCodexLock,
  verifyManagedResourcesIntegrity,
};
