/**
 * Resolve the aioncore version tag to download for packaging.
 *
 * The release lock is authoritative. AIONUI_BACKEND_VERSION is retained only
 * as a compatibility input and must equal the locked version.
 *
 * Keep this file tiny and dependency-free — it's required from both
 * scripts/prepareAioncore.js and scripts/pack-web-cli.js before
 * any project-level install has necessarily completed.
 */

const fs = require('fs');
const path = require('path');

function resolveAioncoreVersion(projectRoot) {
  const lockPath = path.join(projectRoot, 'aioncore-release-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
  if (!lock || typeof lock.version !== 'string' || !lock.version.trim()) {
    throw new Error(`LianLiaoAICore release lock has no version: ${lockPath}`);
  }

  const envOverride = process.env.AIONUI_BACKEND_VERSION;
  if (envOverride && envOverride.trim()) {
    if (envOverride.trim() !== lock.version.trim()) {
      throw new Error(
        `AIONUI_BACKEND_VERSION ${envOverride.trim()} does not match LianLiaoAICore release lock ${lock.version.trim()}`
      );
    }
  }

  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  if (pkg.aioncoreVersion !== lock.version) {
    throw new Error(
      `package.json aioncoreVersion ${String(pkg.aioncoreVersion)} does not match release lock ${lock.version}`
    );
  }

  return lock.version.trim();
}

module.exports = { resolveAioncoreVersion };
