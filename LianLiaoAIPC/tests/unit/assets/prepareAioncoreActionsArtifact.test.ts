import { describe, expect, it } from 'vitest';

const {
  getActionsArtifactName,
  getActionsArtifactMissingMessage,
} = require('../../../packages/shared-scripts/src/prepare-aioncore');

describe('prepare-aioncore GitHub Actions artifact resolver', () => {
  it.each([
    ['win32', 'x64', 'lianliao-aicore-x86_64-pc-windows-msvc'],
    ['win32', 'arm64', 'lianliao-aicore-aarch64-pc-windows-msvc'],
    ['darwin', 'x64', 'lianliao-aicore-x86_64-apple-darwin'],
    ['darwin', 'arm64', 'lianliao-aicore-aarch64-apple-darwin'],
    ['linux', 'x64', 'lianliao-aicore-x86_64-unknown-linux-gnu'],
    ['linux', 'arm64', 'lianliao-aicore-aarch64-unknown-linux-gnu'],
  ])('maps %s-%s to %s', (platform, arch, artifactName) => {
    expect(getActionsArtifactName(platform, arch)).toBe(artifactName);
  });

  it('explains which LianLiaoAICore artifact is missing for the requested platform', () => {
    expect(
      getActionsArtifactMissingMessage({
        runId: '27319522909',
        platform: 'win32',
        arch: 'x64',
        expectedArtifactName: 'lianliao-aicore-x86_64-pc-windows-msvc',
        availableArtifactNames: ['lianliao-aicore-aarch64-apple-darwin', 'lianliao-aicore-x86_64-unknown-linux-gnu'],
      })
    ).toBe(
      [
        'LianLiaoAICore run 27319522909 does not contain artifact [ lianliao-aicore-x86_64-pc-windows-msvc ] required for [ win32-x64 ].',
        'Available artifacts: lianliao-aicore-aarch64-apple-darwin, lianliao-aicore-x86_64-unknown-linux-gnu.',
        'Re-run the LianLiaoAICore release workflow for [ windows-x64 ] or all targets.',
      ].join(' ')
    );
  });
});
