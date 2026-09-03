import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve('packages/desktop/src/renderer/pages/enterprise/layout/enterprise-shell.css'), 'utf8');
const windowChromeCss = readFileSync(
  resolve('packages/desktop/src/renderer/pages/enterprise/layout/enterprise-window-chrome.css'),
  'utf8'
);
const projectCss = readFileSync(
  resolve('packages/desktop/src/renderer/pages/enterprise/projects/project-workspace.module.css'),
  'utf8'
);
const catalogAssistantCss = readFileSync(
  resolve('packages/desktop/src/renderer/pages/enterprise/layout/catalog/assistant/catalog-ai-assistant.module.css'),
  'utf8'
);
const compactStart = css.indexOf('@media (max-width: 780px)');
const compactEnd = css.indexOf('@media (prefers-reduced-motion: reduce)');
const compactCss = css.slice(compactStart, compactEnd);

describe('enterprise desktop shell CSS contract', () => {
  it('aligns the menu, workspace, header, and page content to one 15px inset', () => {
    const shellRule = css.match(/\.enterprise-shell\s*\{([^}]*)\}/s)?.[1] ?? '';
    const siderRule =
      [...css.matchAll(/\.enterprise-sider\s*\{([^}]*)\}/gs)]
        .map((match) => match[1])
        .find((rule) => rule.includes('margin:')) ?? '';
    const workspaceRule =
      [...css.matchAll(/\.enterprise-shell__workspace\s*\{([^}]*)\}/gs)]
        .map((match) => match[1])
        .find((rule) => rule.includes('margin:')) ?? '';
    const headerRule = css.match(/\.enterprise-header\s*\{([^}]*)\}/s)?.[1] ?? '';
    const mainRule = css.match(/\.enterprise-shell__main\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(shellRule).toMatch(/--enterprise-layout-inset:\s*15px/);
    [siderRule, workspaceRule, headerRule, mainRule].forEach((rule) => {
      expect(rule).toContain('var(--enterprise-layout-inset)');
    });
  });

  it('uses stable semantic cursors instead of Chromium auto cursor inference', () => {
    const shellRule = css.match(/\.enterprise-shell\s*\{([^}]*)\}/s)?.[1] ?? '';
    const windowChromeRule = windowChromeCss.match(/\.enterprise-window-chrome\s*\{([^}]*)\}/s)?.[1] ?? '';
    const pointerRule =
      css.match(
        /\.enterprise-shell\s+:where\(a\[href\],\s*button:not\(:disabled\),\s*\[role='button'\]:not\(\[aria-disabled='true'\]\),\s*\[role='link'\]\)\s*\{([^}]*)\}/s
      )?.[1] ?? '';
    const textRule =
      css.match(
        /\.enterprise-shell\s+:where\(\s*input:not\(\[type\]\),[\s\S]*?\[contenteditable='true'\]\s*\)\s*\{([^}]*)\}/s
      )?.[1] ?? '';

    expect(shellRule).toMatch(/cursor:\s*default/);
    expect(windowChromeRule).toMatch(/cursor:\s*default/);
    expect(pointerRule).toMatch(/cursor:\s*pointer/);
    expect(textRule).toMatch(/cursor:\s*text/);
  });

  it('keeps project loading, empty, and error cards at the full workspace width', () => {
    const stateRule =
      projectCss.match(/\.workspace\s*>\s*:global\(\.enterprise-page-state\)[^{]*\{([^}]*)\}/s)?.[1] ?? '';

    expect(stateRule).toMatch(/width:\s*100%/);
    expect(stateRule).toMatch(/box-sizing:\s*border-box/);
  });

  it('constrains the shell to the viewport without allowing its grid to grow', () => {
    const shellRule = css.match(/\.enterprise-shell\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(shellRule).toMatch(/^\s*height:\s*100vh/m);
    expect(shellRule).toMatch(/^\s*height:\s*100dvh/m);
    expect(shellRule).toMatch(/^\s*min-height:\s*0/m);
    expect(shellRule).toMatch(/^\s*overflow:\s*hidden/m);
  });

  it('assigns business-content scrolling to the main pane', () => {
    const mainRule = css.match(/\.enterprise-shell__main\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(mainRule).toMatch(/overflow:\s*auto/);
    expect(mainRule).toMatch(/background:\s*var\(--enterprise-page-bg\)/);
  });

  it('keeps navigation and assistant content independently scrollable in short windows', () => {
    const navigationRule = css.match(/\.enterprise-sider__navigation\s*\{([^}]*)\}/s)?.[1] ?? '';
    const assistantShellRule = css.match(/\.enterprise-assistant\s*\{([^}]*)\}/s)?.[1] ?? '';
    const assistantPlaceholderRule = css.match(/\.enterprise-assistant__placeholder\s*\{([^}]*)\}/s)?.[1] ?? '';
    const catalogAssistantContentRule = catalogAssistantCss.match(/\.content\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(navigationRule).toMatch(/overflow-y:\s*auto/);
    expect(assistantShellRule).toMatch(/overflow:\s*hidden/);
    expect(assistantPlaceholderRule).toMatch(/overflow-y:\s*auto/);
    expect(catalogAssistantContentRule).toMatch(/overflow-y:\s*auto/);
  });

  it('presents navigation groups as one compact divided menu surface', () => {
    const groupRule = css.match(/\.enterprise-sider__nav-group\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(groupRule).toMatch(/border-bottom:\s*1px solid var\(--border-light\)/);
    expect(groupRule).toMatch(/box-shadow:\s*none/);
    expect(groupRule).not.toMatch(/border-radius:\s*var\(--enterprise-radius-card\)/);
  });

  it('uses the bright page background and independent white shell cards', () => {
    const shellRule = css.match(/\.enterprise-shell\s*\{([^}]*)\}/s)?.[1] ?? '';
    const siderRule =
      [...css.matchAll(/\.enterprise-sider\s*\{([^}]*)\}/gs)]
        .map((match) => match[1])
        .find((rule) => rule.includes('background')) ?? '';
    const workspaceRule =
      [...css.matchAll(/\.enterprise-shell__workspace\s*\{([^}]*)\}/gs)]
        .map((match) => match[1])
        .find((rule) => rule.includes('background')) ?? '';

    expect(shellRule).toMatch(/background:\s*var\(--enterprise-page-bg\)/);
    [siderRule, workspaceRule].forEach((rule) => {
      expect(rule).toMatch(/background:\s*var\(--enterprise-surface\)/);
      expect(rule).toMatch(/border-radius:\s*var\(--enterprise-radius-card\)/);
      expect(rule).toMatch(/box-shadow:\s*var\(--enterprise-shadow-card\)/);
    });
    expect(css).not.toContain('.enterprise-shell__blueprint');
  });
});

describe('enterprise compact shell CSS contract', () => {
  it('releases the document lock only around the enterprise shell', () => {
    const rootReleaseRule =
      compactCss.match(
        /html:has\(\.enterprise-shell\),\s*body:has\(\.enterprise-shell\),\s*#root:has\(\.enterprise-shell\)\s*\{([^}]*)\}/s
      )?.[1] ?? '';
    const shellRule = compactCss.match(/\.enterprise-shell\s*\{([^}]*)\}/s)?.[1] ?? '';
    const mainRule = compactCss.match(/\.enterprise-shell__main\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(rootReleaseRule).toMatch(/^\s*height:\s*auto/m);
    expect(rootReleaseRule).toMatch(/^\s*min-height:\s*100%/m);
    expect(rootReleaseRule).toMatch(/^\s*overflow:\s*visible/m);
    expect(shellRule).toMatch(/^\s*height:\s*auto/m);
    expect(shellRule).toMatch(/^\s*min-height:\s*100vh/m);
    expect(shellRule).toMatch(/^\s*overflow:\s*visible/m);
    expect(mainRule).toMatch(/overflow:\s*visible/);
  });

  it('does not permanently remove identity, assistant content, or its toggle at narrow widths', () => {
    expect(compactStart).toBeGreaterThanOrEqual(0);
    expect(compactCss).not.toMatch(/\.enterprise-sider__identity\s*\{[^}]*display:\s*none/s);
    expect(compactCss).not.toMatch(/\.enterprise-header__assistant-toggle\s*\{[^}]*display:\s*none/s);
    expect(compactCss).not.toMatch(/\.enterprise-assistant[^,{]*[,{][^}]*display:\s*none/s);
  });

  it('reduces navigation group chrome so long localized labels do not widen compact navigation', () => {
    const groupRule = compactCss.match(/\.enterprise-sider__nav-group\s*\{([^}]*)\}/s)?.[1] ?? '';
    const labelRule = compactCss.match(/\.enterprise-sider__nav-group-label\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(groupRule).toMatch(/padding:\s*0/);
    expect(groupRule).toMatch(/border:\s*0/);
    expect(groupRule).toMatch(/border-radius:\s*0/);
    expect(groupRule).toMatch(/box-shadow:\s*none/);
    expect(labelRule).toMatch(/display:\s*none/);
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
