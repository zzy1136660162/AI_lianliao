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
});
