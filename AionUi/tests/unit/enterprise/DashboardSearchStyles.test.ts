import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const dashboardStyles = readFileSync(
  resolve(process.cwd(), 'packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css'),
  'utf8'
);

describe('enterprise dashboard search styles', () => {
  it('uses the shared bright card surface for the main dashboard panels', () => {
    const searchAndRadarRule = dashboardStyles.match(/\.searchSection,\s*\.radarSection\s*\{([^}]*)\}/s)?.[1] ?? '';
    const identityAndQuickRule = dashboardStyles.match(/\.identityCard,\s*\.quickCard\s*\{([^}]*)\}/s)?.[1] ?? '';

    [searchAndRadarRule, identityAndQuickRule].forEach((rule) => {
      expect(rule).toMatch(/background:\s*var\(--enterprise-surface\)/);
      expect(rule).toMatch(/border-radius:\s*var\(--enterprise-radius-card\)/);
      expect(rule).toMatch(/box-shadow:\s*var\(--enterprise-shadow-card\)/);
    });
  });

  it('keeps total search errors usable in narrow layouts', () => {
    expect(dashboardStyles).toMatch(/\.searchTotalError\s*\{[^}]*flex-wrap:\s*wrap;/s);
    expect(dashboardStyles).toMatch(
      /\.searchTotalError\s+:global\(\.ll-ant-alert\)\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s
    );
    expect(dashboardStyles).toMatch(
      /@media\s*\(max-width:\s*700px\)[\s\S]*?\.searchTotalError\s*\{[^}]*flex-direction:\s*column;/
    );
  });

  it('keeps autocomplete results independently scrollable', () => {
    const resultRule = dashboardStyles.match(/\.searchResults\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(resultRule).toMatch(/max-height:/);
    expect(resultRule).toMatch(/overflow-y:\s*auto/);
  });
});
