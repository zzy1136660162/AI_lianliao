import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopRoot = resolve(__dirname, '../../..');
const repositoryRoot = resolve(desktopRoot, '..');

function readDesktopFile(path: string): string {
  return readFileSync(resolve(desktopRoot, path), 'utf-8');
}

describe('Sentry release CI configuration', () => {
  it('keeps formal desktop releases independent from optional Sentry credentials', () => {
    const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/lianliao-aipc-release.yml'), 'utf-8');

    expect(workflow).not.toContain('SENTRY_AUTH_TOKEN');
    expect(workflow).not.toContain('SENTRY_UPLOAD_SOURCE_MAPS=true');
  });

  it('keeps source-map uploads explicitly opt-in', () => {
    const viteConfig = readDesktopFile('packages/desktop/electron.vite.config.ts');

    expect(viteConfig).toContain("process.env.SENTRY_UPLOAD_SOURCE_MAPS === 'true'");
  });

  it('uses an explicit Sentry release name instead of plugin defaults', () => {
    const viteConfig = readDesktopFile('packages/desktop/electron.vite.config.ts');

    expect(viteConfig).toContain('const sentryReleaseName');
    expect(viteConfig).toContain('release:');
    expect(viteConfig).toContain('name: sentryReleaseName');
    expect(viteConfig).toContain('errorHandler:');
    expect(viteConfig).toContain('throw error');
  });
});
