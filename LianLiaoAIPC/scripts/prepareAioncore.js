/**
 * CLI wrapper for prepare-aioncore.
 *
 * Reads environment variables and invokes the shared module.
 *
 * Environment variables:
 *  - LIANLIAO_AICORE_LOCAL_BINARY: explicit local development binary
 *  - LIANLIAO_RELEASE_BUILD=1: reject local and Actions sources
 *  - AIONUI_BACKEND_RUN_ID: compatible development-only Actions artifact input
 *  - AIONUI_BACKEND_VERSION: must match the release lock
 *  - AIONUI_BACKEND_ARCH: target architecture (default: process.arch)
 *  - GH_TOKEN / GITHUB_TOKEN: GitHub API token (for rate limiting)
 */

const path = require('path');
const { prepareAioncore } = require('../packages/shared-scripts/src/prepare-aioncore.js');
const { resolveAioncoreVersion } = require('./resolveAioncoreVersion.js');

const projectRoot = path.resolve(__dirname, '..');
const platform = process.platform;
// Support cross-compilation: AIONUI_BACKEND_ARCH > npm_config_target_arch > process.arch
const arch = process.env.AIONUI_BACKEND_ARCH || process.env.npm_config_target_arch || process.arch;
const version = resolveAioncoreVersion(projectRoot);

try {
  prepareAioncore({ projectRoot, platform, arch, version });
} catch (error) {
  console.error('❌ prepareAioncore failed:', error.message);
  process.exit(1);
}

module.exports = function () {
  try {
    return prepareAioncore({ projectRoot, platform, arch, version });
  } catch (error) {
    console.error('❌ prepareAioncore failed:', error.message);
    throw error;
  }
};
