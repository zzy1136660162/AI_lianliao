import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererMain = readFileSync(resolve('packages/desktop/src/renderer/main.tsx'), 'utf8');
const themePath = resolve('packages/desktop/src/renderer/styles/enterprise-theme.css');
const themeCss = existsSync(themePath) ? readFileSync(themePath, 'utf8') : '';
const enterprisePageStyles = [
  'packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css',
  'packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css',
  'packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css',
  'packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css',
  'packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css',
  'packages/desktop/src/renderer/pages/enterprise/login/enterprise-login.css',
] as const;

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

  it('pins shared and Arco variables to the enterprise light palette', () => {
    const enterpriseScope = themeCss.match(/\.enterprise-shell,\s*\.enterprise-login\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(enterpriseScope).toMatch(/--bg-base:\s*var\(--enterprise-page-bg\)/);
    expect(enterpriseScope).toMatch(/--bg-1:\s*var\(--enterprise-surface\)/);
    expect(enterpriseScope).toMatch(/--bg-2:\s*var\(--enterprise-surface-soft\)/);
    expect(enterpriseScope).toMatch(/--bg-hover:\s*var\(--enterprise-primary-soft\)/);
    expect(enterpriseScope).toMatch(/--text-primary:\s*var\(--enterprise-text-primary\)/);
    expect(enterpriseScope).toMatch(/--text-secondary:\s*var\(--enterprise-text-secondary\)/);
    expect(enterpriseScope).toMatch(/--border-base:\s*var\(--enterprise-border\)/);
    expect(enterpriseScope).toMatch(/--primary:\s*var\(--enterprise-primary\)/);
    expect(enterpriseScope).toMatch(/--color-text-1:\s*var\(--enterprise-text-primary\)/);
    expect(enterpriseScope).toMatch(/--color-bg-1:\s*var\(--enterprise-surface\)/);
    expect(enterpriseScope).toMatch(/--color-fill-1:\s*var\(--enterprise-surface-soft\)/);
    expect(enterpriseScope).toMatch(/--color-border-2:\s*var\(--enterprise-border\)/);
  });

  it.each(enterprisePageStyles)('uses the shared enterprise typeface in %s', (stylePath) => {
    const css = readFileSync(resolve(stylePath), 'utf8');

    expect(css).not.toMatch(/Noto Serif SC|Source Han Serif SC|ui-monospace|SFMono-Regular|\bmonospace\b/);
  });
});
