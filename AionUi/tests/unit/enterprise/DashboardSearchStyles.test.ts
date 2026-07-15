import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const dashboardStyles = readFileSync(
  resolve(process.cwd(), 'packages/desktop/src/renderer/pages/enterprise/dashboard/dashboard-workbench.module.css'),
  'utf8'
);

describe('enterprise dashboard search styles', () => {
  it('keeps total search errors usable in narrow layouts', () => {
    expect(dashboardStyles).toMatch(/\.searchTotalError\s*\{[^}]*flex-wrap:\s*wrap;/s);
    expect(dashboardStyles).toMatch(
      /\.searchTotalError\s+:global\(\.arco-alert\)\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s
    );
    expect(dashboardStyles).toMatch(
      /@media\s*\(max-width:\s*700px\)[\s\S]*?\.searchTotalError\s*\{[^}]*flex-direction:\s*column;/
    );
  });
});
