import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readStyle = (path: string) => readFileSync(resolve(path), 'utf8');
const companyCss = readStyle('packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css');
const productCss = readStyle('packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css');
const projectCss = readStyle('packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css');
const catalogLayoutCss = readStyle(
  'packages/desktop/src/renderer/pages/enterprise/layout/catalog/catalog-layout.module.css'
);
const enterpriseThemeCss = readStyle('packages/desktop/src/renderer/styles/enterprise-theme.css');

const expectCardTokens = (rule: string) => {
  expect(rule).toMatch(/background:\s*var\(--enterprise-surface\)/);
  expect(rule).toMatch(/border-radius:\s*var\(--enterprise-radius-card\)/);
  expect(rule).toMatch(/box-shadow:\s*var\(--enterprise-shadow-card\)/);
};

describe('enterprise catalog visual contract', () => {
  it('owns the company and product filter surface in one shared layout rule', () => {
    const filterRule = catalogLayoutCss.match(/\.filterCard\s*\{([^}]*)\}/s)?.[1] ?? '';
    expectCardTokens(filterRule);
  });

  it('owns the company and product content surface in one shared layout rule', () => {
    const contentRule = catalogLayoutCss.match(/\.content\s*\{([^}]*)\}/s)?.[1] ?? '';
    expectCardTokens(contentRule);
  });

  it('keeps project filters on the same enterprise card tokens', () => {
    const filterRule = projectCss.match(/\.filterForm\s*\{([^}]*)\}/s)?.[1] ?? '';
    expectCardTokens(filterRule);
  });

  it('uses the shared card surface for project workspace sections', () => {
    const projectSurfaceRule =
      projectCss.match(/\.dashboard,\s*\.catalogSection,\s*\.detailContent\s*\{([^}]*)\}/s)?.[1] ?? '';
    expectCardTokens(projectSurfaceRule);
  });

  it('gives product cards rounded surfaces and a stronger hover shadow', () => {
    const productCardRule = productCss.match(/\.productCard\s*\{([^}]*)\}/s)?.[1] ?? '';
    const productCardHoverRule = productCss.match(/\.productCard:hover\s*\{([^}]*)\}/s)?.[1] ?? '';

    expectCardTokens(productCardRule);
    expect(productCardHoverRule).toMatch(/box-shadow:\s*var\(--enterprise-shadow-hover\)/);
  });

  it('styles the company catalog only through the scoped Ant Design prefix', () => {
    expect(companyCss).toContain('.ll-ant-table');
    expect(companyCss).not.toMatch(/\.arco-/);
  });

  it('declares reusable density, image and sticky-sidebar catalog tokens', () => {
    expect(enterpriseThemeCss).toContain('--enterprise-catalog-row-height: 54px');
    expect(enterpriseThemeCss).toContain('--enterprise-catalog-image-ratio: 4 / 3');
    expect(enterpriseThemeCss).toContain('--enterprise-detail-sidebar-width: 300px');
    expect(catalogLayoutCss).toMatch(/position:\s*sticky/);
  });
});
