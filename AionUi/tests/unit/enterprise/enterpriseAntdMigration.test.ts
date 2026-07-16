import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('enterprise Ant Design and ECharts migration contract', () => {
  it('declares the approved Ant Design and ECharts dependency ranges', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.antd).toBe('^6.5.1');
    expect(packageJson.dependencies?.echarts).toBe('^6.1.0');
  });

  it('provides a dedicated enterprise Ant Design boundary', () => {
    const providerPath = resolve('packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseAntdProvider.tsx');

    expect(existsSync(providerPath), 'EnterpriseAntdProvider.tsx should exist').toBe(true);

    const providerSource = readFileSync(providerPath, 'utf8');
    expect(providerSource).toContain("from 'antd'");
    expect(providerSource).toContain("from 'antd/locale/zh_CN'");
    expect(providerSource).not.toContain('reset.css');
  });

  it('wraps only the enterprise shell and login roots with the enterprise provider', () => {
    const enterpriseRoots = [
      'packages/desktop/src/renderer/pages/enterprise/layout/EnterpriseShell.tsx',
      'packages/desktop/src/renderer/pages/enterprise/login/EnterpriseLoginPage.tsx',
    ];

    for (const root of enterpriseRoots) {
      const source = readFileSync(resolve(root), 'utf8');
      expect(source, root).toContain('EnterpriseAntdProvider');
    }

    const rendererEntry = readFileSync(resolve('packages/desktop/src/renderer/main.tsx'), 'utf8');
    expect(rendererEntry).not.toContain('antd/dist/reset.css');
  });

  it('provides the shared enterprise pagination scroll hook', () => {
    const hookPath = resolve('packages/desktop/src/renderer/pages/enterprise/layout/useEnterprisePaginationScroll.ts');

    expect(existsSync(hookPath), 'useEnterprisePaginationScroll.ts should exist').toBe(true);
  });

  it('keeps every enterprise source file free of Arco imports and selectors', () => {
    const enterpriseRoot = resolve('packages/desktop/src/renderer/pages/enterprise');
    const visit = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) return visit(path);
        return /\.(?:ts|tsx|css)$/.test(entry.name) ? [path] : [];
      });

    for (const file of visit(enterpriseRoot)) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toContain('@arco-design/web-react');
      if (file.endsWith('.css')) expect(source, file).not.toMatch(/\.arco-/);
    }

    const rendererEntry = readFileSync(resolve('packages/desktop/src/renderer/main.tsx'), 'utf8');
    expect(rendererEntry).not.toContain('antd/dist/reset.css');
  });
});
