import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readStyle = (path: string) => readFileSync(resolve(path), 'utf8');
const companyCss = readStyle('packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css');
const productCss = readStyle('packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css');
const supplyDemandCss = readStyle(
  'packages/desktop/src/renderer/pages/enterprise/supplyDemand/supply-demand.module.css'
);
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

  it('keeps the four linked project dimensions on one desktop row', () => {
    const linkedFilterRule = projectCss.match(/\.linkedFilterRow\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(linkedFilterRule).toMatch(/grid-column:\s*1\s*\/\s*-1/);
    expect(linkedFilterRule).toMatch(/grid-template-columns:\s*repeat\(4,/);
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

  it('keeps the company catalog on its dense card layout without legacy Arco selectors', () => {
    expect(companyCss).toContain('.catalogRow');
    expect(companyCss).not.toMatch(/\.arco-/);
  });

  it('keeps company filters and their actions on one dense desktop row', () => {
    const filterRule = companyCss.match(/\.filterForm\s*\{([^}]*)\}/s)?.[1] ?? '';
    const actionsRule = companyCss.match(/\.filterActions\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(filterRule).toMatch(/grid-template-columns:[^;]*auto/);
    expect(actionsRule).not.toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('keeps product and supply-demand filters with their actions on one desktop row', () => {
    [productCss, supplyDemandCss].forEach((css) => {
      const filterRule = css.match(/\.filterForm\s*\{([^}]*)\}/s)?.[1] ?? '';
      const actionsRule = css.match(/\.filterActions\s*\{([^}]*)\}/s)?.[1] ?? '';

      expect(filterRule).toMatch(/grid-template-columns:[^;]*auto/);
      expect(actionsRule).not.toMatch(/grid-column:\s*1\s*\/\s*-1/);
      expect(actionsRule).toMatch(/white-space:\s*nowrap/);
    });
  });

  it('presents company results as separated high-density cards', () => {
    const listRule = companyCss.match(/\.catalogList\s*\{([^}]*)\}/s)?.[1] ?? '';
    const rowRule = companyCss.match(/\.catalogRow\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(listRule).toMatch(/gap:\s*8px/);
    expect(listRule).toMatch(/padding:\s*0\s+12px\s+12px/);
    expect(rowRule).toMatch(/border:\s*1px\s+solid\s+var\(--enterprise-border-soft\)/);
    expect(rowRule).toMatch(/border-radius:\s*var\(--enterprise-radius-control\)/);
  });

  it('declares reusable density, image and sticky-sidebar catalog tokens', () => {
    expect(enterpriseThemeCss).toContain('--enterprise-catalog-row-height: 54px');
    expect(enterpriseThemeCss).toContain('--enterprise-catalog-image-ratio: 4 / 3');
    expect(enterpriseThemeCss).toContain('--enterprise-detail-sidebar-width: 300px');
    expect(catalogLayoutCss).toMatch(/position:\s*sticky/);
  });

  it('provides a dedicated hero column for product contact access', () => {
    const heroAsideRule = catalogLayoutCss.match(/\.detailHeroWithAside\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(heroAsideRule).toMatch(/grid-template-columns:\s*minmax\(160px,\s*240px\)/);
    expect(catalogLayoutCss).toContain('.detailHeroAside');
  });
});
