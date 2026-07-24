import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const desktopSourceRoot = path.resolve(__dirname, '../../../packages/desktop/src');

const readSource = (relativePath: string): string =>
  fs.readFileSync(path.join(desktopSourceRoot, relativePath), 'utf8');

describe('database-only desktop update channel', () => {
  it('does not initialize the legacy updater during app startup', () => {
    const source = readSource('index.ts');

    expect(source).not.toContain('checkForUpdatesAndNotify()');
    expect(source).not.toContain("import('./process/services/autoUpdaterService')");
  });

  it('routes tray and settings checks to the enterprise version center', () => {
    const layoutSource = readSource('renderer/components/layout/Layout.tsx');
    const aboutSource = readSource(
      'renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx'
    );

    expect(layoutSource).toContain("navigate('/enterprise/version-update')");
    expect(aboutSource).toContain("navigate('/enterprise/version-update')");
    expect(layoutSource).not.toContain('<UpdateModal');
  });

  it('keeps the compatibility feed away from the upstream AionUi domain', () => {
    const feedSource = readSource('process/services/updateFeed.ts');

    expect(feedSource).toContain('https://cloud.lslnii.com/cloud-beiruan-ai/desktop_lianliao');
    expect(feedSource).not.toContain('static.aionui.com');
  });
});
