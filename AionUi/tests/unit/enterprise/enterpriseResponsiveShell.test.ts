import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve('packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css'), 'utf8');
const compactStart = css.indexOf('@media (max-width: 780px)');
const compactEnd = css.indexOf('@media (prefers-reduced-motion: reduce)');
const compactCss = css.slice(compactStart, compactEnd);

describe('enterprise compact shell CSS contract', () => {
  it('does not permanently remove identity, assistant content, or its toggle at narrow widths', () => {
    expect(compactStart).toBeGreaterThanOrEqual(0);
    expect(compactCss).not.toMatch(/\.enterprise-sider__identity\s*\{[^}]*display:\s*none/s);
    expect(compactCss).not.toMatch(/\.enterprise-header__assistant-toggle\s*\{[^}]*display:\s*none/s);
    expect(compactCss).not.toMatch(/\.enterprise-assistant[^,{]*[,{][^}]*display:\s*none/s);
  });

  it('keeps compact assistant transitions covered by reduced-motion rules', () => {
    const reducedMotionCss = css.slice(compactEnd);
    expect(reducedMotionCss).toContain('.enterprise-assistant');
    expect(reducedMotionCss).toContain('transition: none');
  });

  it('lays out identity and utility actions as a discoverable two-row grid without footer scrolling', () => {
    const footerRule = compactCss.match(/\.enterprise-sider__footer\s*\{([^}]*)\}/s)?.[1] ?? '';
    const identityRule = compactCss.match(/\.enterprise-sider__identity\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(footerRule).toMatch(/display:\s*grid/);
    expect(footerRule).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    expect(footerRule).not.toMatch(/overflow(?:-x)?:\s*(?:auto|scroll)/);
    expect(identityRule).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });
});
