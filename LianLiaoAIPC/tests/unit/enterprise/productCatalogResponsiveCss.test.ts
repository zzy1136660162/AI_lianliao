import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const productCss = readFileSync(
  resolve('packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css'),
  'utf8'
);
const layoutCss = readFileSync(
  resolve('packages/desktop/src/renderer/pages/enterprise/layout/catalog/catalog-layout.module.css'),
  'utf8'
);
const compactStart = layoutCss.indexOf('@media (max-width: 820px)');
const compactEnd = layoutCss.indexOf('@media (max-width: 560px)');
const compactCss = layoutCss.slice(compactStart, compactEnd);

describe('product catalog compact CSS contract', () => {
  it('uses only the scoped Ant Design component selectors', () => {
    expect(productCss).toContain('.ll-ant-form-item');
    expect(productCss).not.toMatch(/\.arco-/);
  });

  it('places the quick view before the grid and gives focused previews a scroll target', () => {
    expect(compactStart).toBeGreaterThanOrEqual(0);
    const quickViewRule = compactCss.match(/\.quickView\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(quickViewRule).toMatch(/order:\s*-1/);
    expect(quickViewRule).toMatch(/scroll-margin(?:-top)?:\s*[^;]+/);
    expect(quickViewRule).not.toMatch(/display:\s*none/);
  });

  it('uses four visual cards on wide screens and the shared image ratio', () => {
    const gridRule = productCss.match(/\.productGrid\s*\{([^}]*)\}/s)?.[1] ?? '';
    const imageRule = productCss.match(/\.cardImage\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(gridRule).toMatch(/grid-template-columns:\s*repeat\(4,/);
    expect(imageRule).toMatch(/aspect-ratio:\s*var\(--enterprise-catalog-image-ratio\)/);
  });
});
