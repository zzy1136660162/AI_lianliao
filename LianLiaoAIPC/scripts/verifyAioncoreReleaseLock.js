const fs = require('fs');
const path = require('path');

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const EXPECTED_REPOSITORY = 'zzy1136660162/AI_lianliao';

function loadReleaseLock(projectRoot) {
  const lockPath = path.join(projectRoot, 'aioncore-release-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

  if (lock.schemaVersion !== 1) {
    throw new Error(`Unsupported LianLiaoAICore release lock schema: ${String(lock.schemaVersion)}`);
  }
  if (lock.repository !== EXPECTED_REPOSITORY) {
    throw new Error(`LianLiaoAICore repository must be ${EXPECTED_REPOSITORY}`);
  }
  if (typeof lock.version !== 'string' || !/^v\d+\.\d+\.\d+$/.test(lock.version)) {
    throw new Error(`Invalid LianLiaoAICore version: ${String(lock.version)}`);
  }
  if (lock.releaseTag !== `aicore-${lock.version}`) {
    throw new Error(`LianLiaoAICore releaseTag must be aicore-${lock.version}`);
  }
  if (!lock.assets || typeof lock.assets !== 'object') {
    throw new Error('LianLiaoAICore release lock assets are required');
  }

  return { lockPath, lock };
}

function getLockedAsset(projectRoot, runtimeKey, options = {}) {
  const { requireChecksum = true } = options;
  const { lockPath, lock } = loadReleaseLock(projectRoot);
  const asset = lock.assets[runtimeKey];

  if (!asset || typeof asset.name !== 'string' || !asset.name.startsWith(`lianliao-aicore-${lock.version}-`)) {
    throw new Error(`LianLiaoAICore release lock has no valid asset for ${runtimeKey}`);
  }
  if (requireChecksum && !SHA256_PATTERN.test(asset.sha256 || '')) {
    throw new Error(
      `LianLiaoAICore SHA256 is not published for ${runtimeKey}. Publish ${asset.name}, then update ${lockPath}.`
    );
  }

  return { lock, asset };
}

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..');
  const runtimeKey = process.argv[2];
  if (runtimeKey) {
    const { lock, asset } = getLockedAsset(projectRoot, runtimeKey);
    console.log(`${lock.releaseTag} ${runtimeKey} ${asset.name} ${asset.sha256}`);
  } else {
    const { lock } = loadReleaseLock(projectRoot);
    for (const key of Object.keys(lock.assets)) {
      getLockedAsset(projectRoot, key);
    }
    console.log(`LianLiaoAICore release lock is complete for ${Object.keys(lock.assets).length} targets.`);
  }
}

module.exports = {
  EXPECTED_REPOSITORY,
  SHA256_PATTERN,
  getLockedAsset,
  loadReleaseLock,
};
