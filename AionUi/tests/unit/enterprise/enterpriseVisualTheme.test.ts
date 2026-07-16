import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererMain = readFileSync(resolve('packages/desktop/src/renderer/main.tsx'), 'utf8');
const themePath = resolve('packages/desktop/src/renderer/styles/enterprise-theme.css');
const themeCss = existsSync(themePath) ? readFileSync(themePath, 'utf8') : '';

describe('enterprise visual theme contract', () => {
  it('loads the scoped enterprise theme after the shared color scheme', () => {
    const sharedThemeImport = rendererMain.indexOf("import './styles/themes/index.css';");
    const enterpriseThemeImport = rendererMain.indexOf("import './styles/enterprise-theme.css';");

    expect(sharedThemeImport).toBeGreaterThanOrEqual(0);
    expect(enterpriseThemeImport).toBeGreaterThan(sharedThemeImport);
  });

  it('defines the approved enterprise font, radius, surface, and shadow tokens', () => {
    expect(themeCss).toMatch(/\.enterprise-shell,\s*\.enterprise-login\s*\{/s);
    expect(themeCss).toMatch(/--enterprise-font-ui:\s*'Microsoft YaHei',\s*'微软雅黑'/);
    expect(themeCss).toMatch(/--enterprise-page-bg:\s*#[0-9a-f]{6}/i);
    expect(themeCss).toMatch(/--enterprise-surface:\s*#[0-9a-f]{6}/i);
    expect(themeCss).toMatch(/--enterprise-radius-card:\s*15px/);
    expect(themeCss).toMatch(/--enterprise-radius-control:\s*10px/);
    expect(themeCss).toMatch(/--enterprise-shadow-card:\s*0\s+8px\s+24px/);
  });

  it('does not apply the enterprise font to the global document', () => {
    expect(themeCss).not.toMatch(/(?:^|\n)\s*(?:html|body|:root)\s*\{/);
  });
});
