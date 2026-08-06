import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const dashboardStyles = readFileSync(
  resolve(process.cwd(), 'packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css'),
  'utf8'
);
const unifiedSearchStyles = readFileSync(
  resolve(process.cwd(), 'packages/desktop/src/renderer/pages/enterprise/search/unified-search.module.css'),
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

  it('aligns the actual Ant search container, input and button to one control height', () => {
    const searchContainerRule =
      dashboardStyles.match(/\.searchControl\s+:global\(\.ll-ant-input-search\)\s*\{([^}]*)\}/s)?.[1] ?? '';
    const alignedControlsRule =
      dashboardStyles.match(
        /\.searchControl\s+:global\(\.ll-ant-input-affix-wrapper\),\s*\.searchControl\s+:global\(\.ll-ant-input-search-btn\)\s*\{([^}]*)\}/s
      )?.[1] ?? '';
    const searchButtonRule =
      dashboardStyles.match(
        /\.searchControl\s+:global\(\.ll-ant-input-search-btn\)\s*\{(?=[^}]*min-width)([^}]*)\}/s
      )?.[1] ?? '';

    expect(searchContainerRule).toMatch(/height:\s*46px/);
    expect(alignedControlsRule).toMatch(/height:\s*46px/);
    expect(searchButtonRule).toMatch(/min-width:\s*46px/);
    expect(searchButtonRule).toMatch(/border-start-end-radius:\s*10px/);
    expect(searchButtonRule).toMatch(/border-end-end-radius:\s*10px/);
  });

  it('keeps the dashboard and unified-search inputs visually aligned without a native focus outline', () => {
    [
      { styles: dashboardStyles, scope: 'searchControl' },
      { styles: unifiedSearchStyles, scope: 'searchCard' },
    ].forEach(({ styles, scope }) => {
      expect(styles).toMatch(
        new RegExp(`\\.${scope}\\s+:global\\(\\.ll-ant-input-search\\)\\s*\\{[^}]*height:\\s*46px`, 's')
      );
      expect(styles).toMatch(
        new RegExp(`\\.${scope}\\s+:global\\(\\.ll-ant-input-affix-wrapper\\)\\s*\\{[^}]*border-radius:\\s*10px`, 's')
      );
      expect(styles).toMatch(new RegExp(`\\.${scope}\\s+input:focus-visible\\s*\\{[^}]*outline:\\s*none`, 's'));
    });
  });
});
