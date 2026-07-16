import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readStyle = (path: string) => readFileSync(resolve(path), 'utf8');
const companyCss = readStyle('packages/desktop/src/renderer/pages/enterprise/companies/company-catalog.module.css');
const productCss = readStyle('packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css');
const projectCss = readStyle('packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css');

const expectCardTokens = (rule: string) => {
  expect(rule).toMatch(/background:\s*var\(--enterprise-surface\)/);
  expect(rule).toMatch(/border-radius:\s*var\(--enterprise-radius-card\)/);
  expect(rule).toMatch(/box-shadow:\s*var\(--enterprise-shadow-card\)/);
};

describe('enterprise catalog visual contract', () => {
  it.each([
    ['company', companyCss],
    ['product', productCss],
    ['project', projectCss],
  ])('uses the shared card surface for the %s filters', (_name, css) => {
    const filterRule = css.match(/\.filterForm\s*\{([^}]*)\}/s)?.[1] ?? '';
    expectCardTokens(filterRule);
  });

  it.each([
    ['company', companyCss],
    ['product', productCss],
  ])('uses the shared card surface for the %s catalog content', (_name, css) => {
    const contentRule = css.match(/\.content\s*\{([^}]*)\}/s)?.[1] ?? '';
    expectCardTokens(contentRule);
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
});
