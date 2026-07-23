import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  resolve('packages/desktop/src/renderer/pages/enterprise/products/product-catalog.module.css'),
  'utf8'
);
const compactStart = css.indexOf('@media (max-width: 820px)');
const compactEnd = css.indexOf('@media (max-width: 520px)');
const compactCss = css.slice(compactStart, compactEnd);

describe('product catalog compact CSS contract', () => {
  it('uses only the scoped Ant Design component selectors', () => {
    expect(css).toContain('.ll-ant-form-item');
    expect(css).not.toMatch(/\.arco-/);
  });

  it('places the quick view before the grid and gives focused previews a scroll target', () => {
    expect(compactStart).toBeGreaterThanOrEqual(0);
    const quickViewRule = compactCss.match(/\.quickView\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(quickViewRule).toMatch(/order:\s*-1/);
    expect(quickViewRule).toMatch(/scroll-margin(?:-top)?:\s*[^;]+/);
    expect(quickViewRule).not.toMatch(/display:\s*none/);
  });
});
