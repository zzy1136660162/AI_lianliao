import { existsSync, readFileSync } from 'node:fs';
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
});
